// Completion scope in panel editors outside the card dialog.
//
// With no card dialog open, a key or a view is in scope only when it belongs to an editor surface
// inside one of the UNIVERSAL_PANEL_HOSTS. It stays out of scope on a dashboard, in a third-party
// card editor, and with style.universalCodebox or style.universalAutocomplete off.

import test from 'node:test';
import assert from 'node:assert/strict';

import { isScopedEditorEvent, isViewAllowed, viewFromEvent } from '../../src/editor/activeEditor.js';
import { UNIVERSAL_PANEL_HOSTS } from '../../src/editor/haSelectors.js';

const FLAGS_ON = { settings: { style: { universalCodebox: true, universalAutocomplete: true } } };
const AUTOCOMPLETE_OFF = { settings: { style: { universalCodebox: true, universalAutocomplete: false } } };
const CODEBOX_OFF = { settings: { style: { universalCodebox: false, universalAutocomplete: true } } };

// No card dialog anywhere (activeEditDialog() -> null), so only the universal arm can admit.
function installNoDialogDom() {
  global.Node = { ELEMENT_NODE: 1 };
  global.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  global.document = { querySelectorAll: () => [], querySelector: () => null };
}

// A host node that matches a selector list iff `tag` is one of its comma-separated entries
// (mirrors Element.matches for a tag-name selector list like UNIVERSAL_PANEL_HOSTS).
function hostNode(tag, extra = {}) {
  return {
    tagName: tag.toUpperCase(),
    matches: (sel) => String(sel).split(',').map((s) => s.trim()).includes(tag),
    ...extra,
  };
}
// A CodeMirror surface node (satisfies pathHasEditorSurface via CM_EDITOR_SURFACE).
function cmSurfaceNode(extra = {}) {
  return { tagName: 'DIV', matches: (sel) => String(sel).includes('.cm-'), ...extra };
}
function box() {
  return { nodeType: 1, getBoundingClientRect: () => ({ width: 300, height: 200 }) };
}
function cmView(dom) {
  return { state: {}, dispatch() {}, dom, coordsAtPos() {} };
}

test('isScopedEditorEvent admits a panel editor keystroke only with both flags on', () => {
  installNoDialogDom();
  const panelPath = [cmSurfaceNode(), hostNode('ha-automation-editor')];
  const ev = { composedPath: () => panelPath };

  assert.equal(isScopedEditorEvent(ev, { state: FLAGS_ON }), true, 'panel editor + flags on → scoped');
  assert.equal(isScopedEditorEvent(ev, { state: AUTOCOMPLETE_OFF }), false, 'universalAutocomplete off → not scoped');
  assert.equal(isScopedEditorEvent(ev, { state: CODEBOX_OFF }), false, 'universalCodebox off → not scoped');
  // No state (settings unloaded) → flags default on (`undefined !== false`), consistent with the
  // styling flag. The leak guard (editor surface + allowlisted host), not the flag, is what keeps
  // the dashboard out of scope — so a valid panel path is still scoped here, and a dashboard path
  // is still rejected (proven in the next test).
  assert.equal(isScopedEditorEvent(ev), true, 'no deps → flag defaults on; panel path still scoped via the leak guard');
});

test('isScopedEditorEvent keeps the dashboard and third-party editors out of scope', () => {
  installNoDialogDom();
  // Bare dashboard keydown: no editor surface in the path, only dashboard hosts.
  const dashboardPath = [{ tagName: 'DIV', matches: () => false }, hostNode('ha-panel-lovelace'), hostNode('hui-root')];
  assert.equal(isScopedEditorEvent({ composedPath: () => dashboardPath }, { state: FLAGS_ON }), false, 'dashboard (no editor surface) → never scoped');

  // Third-party card with its own CodeMirror on the dashboard: has an editor surface, but it is
  // not inside an allowlisted panel host (hui-card is not in UNIVERSAL_PANEL_HOSTS).
  const thirdPartyPath = [cmSurfaceNode(), hostNode('some-custom-card'), hostNode('hui-card'), hostNode('ha-panel-lovelace')];
  assert.equal(isScopedEditorEvent({ composedPath: () => thirdPartyPath }, { state: FLAGS_ON }), false, 'third-party editor not in an allowlisted host → never scoped');

  // Editor surface present but no host at all in the path → not scoped.
  assert.equal(isScopedEditorEvent({ composedPath: () => [cmSurfaceNode()] }, { state: FLAGS_ON }), false, 'editor surface without an allowlisted host → not scoped');
});

test('UNIVERSAL_PANEL_HOSTS covers each universal surface but not dashboard/card hosts', () => {
  for (const tag of ['ha-panel-developer-tools', 'developer-tools-template', 'hui-editor', 'ha-automation-editor', 'ha-script-editor']) {
    assert.ok(UNIVERSAL_PANEL_HOSTS.split(',').map((s) => s.trim()).includes(tag), `${tag} is allowlisted`);
  }
  for (const tag of ['ha-panel-lovelace', 'hui-root', 'hui-card', 'home-assistant']) {
    assert.equal(UNIVERSAL_PANEL_HOSTS.split(',').map((s) => s.trim()).includes(tag), false, `${tag} is not allowlisted (no dashboard leak)`);
  }
});

test('isViewAllowed admits a visible CM view inside an allowlisted panel host (flag-gated)', () => {
  installNoDialogDom();
  const dom = { ...box(), matches: () => false, getRootNode: () => ({ host: hostNode('ha-script-editor') }) };
  const view = cmView(dom);

  assert.equal(isViewAllowed(view, { state: FLAGS_ON }), true, 'view inside an allowlisted panel host → allowed');
  assert.equal(isViewAllowed(view, { state: AUTOCOMPLETE_OFF }), false, 'flag off → not allowed');

  // A view not inside an allowlisted host (dashboard card) is rejected even with flags on.
  const dashDom = { ...box(), matches: () => false, getRootNode: () => ({ host: hostNode('hui-card', { getRootNode: () => ({}) }) }) };
  assert.equal(isViewAllowed(cmView(dashDom), { state: FLAGS_ON }), false, 'view outside an allowlisted host → not allowed');

  // A non-view (fails looksLikeView/visible) is always rejected.
  assert.equal(isViewAllowed({ dom }, { state: FLAGS_ON }), false, 'non-CM-view → not allowed');
});

test('viewFromEvent binds a panel editor view from the path (flag-gated)', () => {
  installNoDialogDom();
  const dom = { ...box(), matches: () => false, getRootNode: () => ({ host: hostNode('ha-automation-editor') }) };
  const view = cmView(dom);
  // The ha-code-editor node carries the CM view (.codemirror) and satisfies pathHasEditorSurface
  // via its tagName; the ha-automation-editor node is the allowlisted host.
  const editorHost = { tagName: 'HA-CODE-EDITOR', matches: () => false, codemirror: view };
  const ev = { composedPath: () => [editorHost, hostNode('ha-automation-editor')] };

  assert.equal(viewFromEvent(ev, { state: FLAGS_ON }), view, 'panel editor view bound from the path');
  assert.equal(viewFromEvent(ev, { state: AUTOCOMPLETE_OFF }), null, 'flag off → no view bound');
  // Dashboard event (no allowlisted host) binds nothing.
  assert.equal(viewFromEvent({ composedPath: () => [editorHost, hostNode('hui-card')] }, { state: FLAGS_ON }), null, 'no allowlisted host → no view');
});
