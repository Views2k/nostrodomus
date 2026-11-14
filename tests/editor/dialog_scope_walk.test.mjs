import test from 'node:test';
import assert from 'node:assert/strict';

import { isScopedEditorEvent } from '../../src/editor/activeEditor.js';

// isScopedEditorEvent runs for every keydown, pointerdown and focusin on the page. Inside the
// card dialog, outside a code editor, it asked whether the dialog hosts a code editor, and that
// answer came from reading every element of every shadow root in the dialog. In the visual
// editor there is no code editor, so every key typed into a form field read the whole form and
// the whole card preview. The answer is now remembered per dialog: a found editor while it is
// still in the dialog, "no editor" for a short interval, and any event from the editor surface
// itself drops a remembered "no editor" at once.

const box = (extra = {}) => ({
  nodeType: 1,
  isConnected: true,
  matches: () => false,
  getBoundingClientRect: () => ({ width: 300, height: 200 }),
  ...extra,
});

// A host whose shadow root holds `children` (each may hold its own shadow root).
function host(tag, children = []) {
  const el = box({ tagName: tag.toUpperCase(), localName: tag });
  el.shadowRoot = {
    childElementCount: children.length,
    querySelector: () => null,
    querySelectorAll: (selector) => {
      if (selector === 'ha-code-editor') return children.filter((c) => c.localName === 'ha-code-editor');
      if (selector === '*') {
        walks.count += 1;
        return children;
      }
      return [];
    },
  };
  for (const child of children) child.getRootNode = () => ({ host: el });
  return el;
}

const walks = { count: 0 };

// A card dialog in the visual editor: a form with fields and a preview with nested cards,
// and no ha-code-editor anywhere.
function visualDialog() {
  const input = box({ tagName: 'INPUT', localName: 'input' });
  const textfield = host('ha-textfield');
  textfield.shadowRoot.querySelectorAll = (selector) => {
    if (selector === '*') { walks.count += 1; return [input]; }
    return [];
  };
  input.getRootNode = () => ({ host: textfield });
  const rows = Array.from({ length: 20 }, () => host('hui-simple-entity-row', [host('state-badge'), host('ha-icon')]));
  const preview = host('hui-entities-card', rows);
  const form = host('hui-entities-card-editor', [textfield, host('ha-entity-picker'), host('ha-icon-picker')]);
  const editorHost = host('hui-card-element-editor', [form]);
  const dialog = host('hui-dialog-edit-card', [editorHost, preview]);
  const content = box();
  dialog.shadowRoot.querySelector = (selector) => (selector === '.content' ? content : null);
  dialog.getRootNode = () => ({});
  return { dialog, editorHost, form, textfield, input };
}

function installDocument(dialog) {
  global.Node = { ELEMENT_NODE: 1 };
  global.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  global.document = {
    querySelectorAll: (selector) => (selector === 'hui-dialog-edit-card' ? [dialog] : []),
    querySelector: () => null,
  };
}

const keyIn = ({ input, textfield, form, editorHost, dialog }) => ({
  composedPath: () => [input, textfield, form, editorHost, dialog],
  target: input,
});

test('typing in a visual-editor field reads the dialog once, not on every key', () => {
  // What one full read of this dialog costs, counted in shadow roots read.
  const fresh = visualDialog();
  installDocument(fresh.dialog);
  walks.count = 0;
  assert.equal(isScopedEditorEvent(keyIn(fresh), { state: {}, now: () => 0 }), false, 'a form field is not editor scope');
  const oneRead = walks.count;
  assert.ok(oneRead > 60, `the fixture dialog has many shadow roots (${oneRead})`);

  // Ten keys, 50 ms apart: only the first one reads the dialog.
  const typing = visualDialog();
  installDocument(typing.dialog);
  let clock = 1000;
  const deps = { state: {}, now: () => clock };
  walks.count = 0;
  for (let i = 0; i < 10; i += 1) {
    assert.equal(isScopedEditorEvent(keyIn(typing), deps), false, 'a form field is not editor scope');
    clock += 50;
  }
  assert.equal(walks.count, oneRead, `ten keys read ${walks.count} shadow roots; one full read is ${oneRead}`);
});

test('a code editor that appears is seen after the recheck interval', () => {
  const visual = visualDialog();
  const { dialog } = visual;
  installDocument(dialog);
  let clock = 5000;
  const deps = { state: {}, now: () => clock };
  assert.equal(isScopedEditorEvent(keyIn(visual), deps), false);

  // The user switches to the code editor: hui-card-element-editor now holds ha-code-editor.
  const codeEditor = host('ha-code-editor');
  const yamlHost = host('hui-card-element-editor', [codeEditor]);
  dialog.shadowRoot.querySelectorAll = (selector) => {
    if (selector === 'ha-code-editor') return [];
    if (selector === '*') { walks.count += 1; return [yamlHost]; }
    return [];
  };
  yamlHost.getRootNode = () => ({ host: dialog });
  const button = box({ tagName: 'HA-BUTTON', localName: 'ha-button' });
  button.getRootNode = () => ({ host: dialog });
  const clickOnChrome = { composedPath: () => [button, dialog], target: button };

  clock += 1000;
  assert.equal(isScopedEditorEvent(clickOnChrome, deps), true, 'after the interval the dialog is read again and the editor is found');
});

test('an event from the editor surface drops a remembered "no editor" at once', () => {
  const visual = visualDialog();
  const { dialog } = visual;
  installDocument(dialog);
  const clock = 9000;
  const deps = { state: {}, now: () => clock };
  assert.equal(isScopedEditorEvent(keyIn(visual), deps), false);

  const cmContent = box({ matches: (selector) => String(selector).includes('.cm-content') });
  const codeEditor = host('ha-code-editor');
  cmContent.getRootNode = () => ({ host: codeEditor });
  const yamlHost = host('hui-card-element-editor', [codeEditor]);
  yamlHost.getRootNode = () => ({ host: dialog });
  dialog.shadowRoot.querySelectorAll = (selector) => {
    if (selector === 'ha-code-editor') return [];
    if (selector === '*') { walks.count += 1; return [yamlHost]; }
    return [];
  };

  const typed = { composedPath: () => [cmContent, codeEditor, yamlHost, dialog], target: cmContent };
  assert.equal(isScopedEditorEvent(typed, deps), true, 'typing in the editor is editor scope');
  // A retargeted keydown right after (only hosts above the editor in the path) is still scope,
  // at the same moment, without waiting for the recheck interval.
  const retargeted = { composedPath: () => [yamlHost, dialog], target: yamlHost };
  assert.equal(isScopedEditorEvent(retargeted, deps), true);
});

test('a remembered editor that left the dialog is not trusted', () => {
  const codeEditor = host('ha-code-editor');
  const yamlHost = host('hui-card-element-editor', [codeEditor]);
  const dialog = host('hui-dialog-edit-card', [yamlHost]);
  dialog.shadowRoot.querySelector = (selector) => (selector === '.content' ? box() : null);
  dialog.getRootNode = () => ({});
  installDocument(dialog);
  let clock = 20000;
  const deps = { state: {}, now: () => clock };
  const button = box({ tagName: 'HA-BUTTON', localName: 'ha-button' });
  button.getRootNode = () => ({ host: dialog });
  const click = { composedPath: () => [button, dialog], target: button };
  assert.equal(isScopedEditorEvent(click, deps), true, 'the dialog hosts a code editor');

  // Back to the visual editor: the code editor is removed.
  codeEditor.isConnected = false;
  yamlHost.shadowRoot.querySelectorAll = () => [];
  clock += 10;
  assert.equal(isScopedEditorEvent(click, deps), false, 'a removed editor does not keep the dialog in scope');
});
