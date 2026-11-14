import test from 'node:test';
import assert from 'node:assert/strict';

import { pageMayHaveEditor } from '../../src/editor/activeEditor.js';

// codebox#14, completion#17, editor#15, hotpaths#12: the check that tells a plain dashboard from
// a page where a style pass can still find, repaint or clean up after an editor.

function installDom({ dialogs = [], pathname = '/lovelace/0' } = {}) {
  global.Node = { ELEMENT_NODE: 1 };
  global.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  global.document = {
    querySelectorAll: (selector) => (String(selector).includes('hui-dialog-edit-card') ? dialogs : []),
    querySelector: () => null,
  };
  return { location: { pathname } };
}

function node(tag, extra = {}) {
  return {
    tagName: tag.toUpperCase(),
    matches: (selector) => String(selector).split(',').map((part) => part.trim()).includes(tag),
    ...extra,
  };
}
const cmSurface = () => ({ tagName: 'DIV', matches: (selector) => String(selector).includes('.cm-') });
const dashboardPath = () => [node('div'), node('hui-card'), node('hui-view'), node('hui-root'), node('ha-panel-lovelace'), node('home-assistant')];
const event = (path) => ({ composedPath: () => path });

test('a dashboard with no editor, no dialog and no editor panel cannot have an editor', () => {
  const window = installDom();
  assert.equal(pageMayHaveEditor(event(dashboardPath()), { state: {}, window }), false);
  assert.equal(pageMayHaveEditor(event(dashboardPath()), { state: { activeEditorCache: { editor: null }, view: null, hookedView: null, editorSentinelLikelyOpeningUntil: 0 }, window }), false);
  assert.equal(pageMayHaveEditor({}, { state: {}, window }), false, 'an event without a path');
});

test('a known editor or a bound view keeps the page in scope', () => {
  const window = installDom();
  const ev = event(dashboardPath());
  assert.equal(pageMayHaveEditor(ev, { state: { activeEditorCache: { editor: {} } }, window }), true, 'remembered editor');
  assert.equal(pageMayHaveEditor(ev, { state: { view: {} }, window }), true, 'bound view');
  assert.equal(pageMayHaveEditor(ev, { state: { hookedView: {} }, window }), true, 'hooked view');
});

test('an editor-opening window keeps the page in scope until it ends', () => {
  const window = installDom();
  const ev = event(dashboardPath());
  assert.equal(pageMayHaveEditor(ev, { state: { editorSentinelLikelyOpeningUntil: Date.now() + 5000 }, window }), true);
  assert.equal(pageMayHaveEditor(ev, { state: { editorSentinelLikelyOpeningUntil: Date.now() - 1 }, window }), false);
});

test('a pointer path through an editor, an editor panel or a dialog keeps the page in scope', () => {
  const window = installDom();
  assert.equal(pageMayHaveEditor(event([cmSurface(), node('some-custom-card'), node('hui-card')]), { state: {}, window }), true, 'an editor that is not in completion scope');
  assert.equal(pageMayHaveEditor(event([node('ha-code-editor'), node('hui-card')]), { state: {}, window }), true, 'ha-code-editor');
  for (const tag of ['hui-editor', 'ha-automation-editor', 'ha-script-editor', 'developer-tools-template', 'ha-panel-developer-tools', 'hui-dialog-edit-card', 'ha-dialog', 'ha-md-dialog', 'dialog']) {
    assert.equal(pageMayHaveEditor(event([node('div'), node(tag), node('home-assistant')]), { state: {}, window }), true, tag);
  }
});

test('a route with an editor panel keeps the page in scope', () => {
  for (const pathname of ['/config/automation/edit/1700000000000', '/config/script/edit/morning', '/developer-tools/template', '/developer-tools/action']) {
    const window = installDom({ pathname });
    assert.equal(pageMayHaveEditor(event(dashboardPath()), { state: {}, window }), true, pathname);
  }
  for (const pathname of ['/config/automation/dashboard', '/config/dashboard', '/developer-tools/state', '/lovelace/home']) {
    const window = installDom({ pathname });
    assert.equal(pageMayHaveEditor(event(dashboardPath()), { state: {}, window }), false, pathname);
  }
});

test('a card dialog in the document keeps the page in scope; an emptied one left behind does not', () => {
  const open = { shadowRoot: { childElementCount: 2, querySelector: () => null } };
  assert.equal(pageMayHaveEditor(event(dashboardPath()), { state: {}, window: installDom({ dialogs: [open] }) }), true, 'a dialog that is open or opening');

  const emptied = { shadowRoot: { childElementCount: 0, querySelector: () => null } };
  assert.equal(pageMayHaveEditor(event(dashboardPath()), { state: {}, window: installDom({ dialogs: [emptied] }) }), false, 'the element Home Assistant keeps after closing');
});
