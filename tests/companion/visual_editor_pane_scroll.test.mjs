// The editor pane of the styled card dialog scrolls while the dialog does not show its code editor.
//
// The dialog-root sheet takes the pane's scrolling away to make room for the codebox glow, and it
// stays in the dialog when the code editor is replaced by a visual editor. A visual editor taller
// than the pane (a custom card with many controls) must still scroll to its lower controls.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCompanionStyleRuntime,
  DIALOG_ROOT_STYLE_ID,
  VISUAL_EDITOR_SCROLL_STYLE_ID,
  VISUAL_EDITOR_SCROLL_CSS,
} from '../../src/companion/companionStyleRuntime.js';

function fakeRoot() {
  const root = {
    children: [],
    querySelector(sel) {
      const id = sel.startsWith('#') ? sel.slice(1) : sel;
      return root.children.find((c) => c.id === id) || null;
    },
    appendChild(el) { el._parent = root; root.children.push(el); return el; },
  };
  return root;
}
const fakeDocument = () => ({
  createElement: () => ({
    id: '',
    textContent: '',
    remove() { const p = this._parent; if (p) p.children.splice(p.children.indexOf(this), 1); },
  }),
});
const has = (root, id) => root.children.some((c) => c.id === id);

function setup({ active = true } = {}) {
  const state = { active };
  const rt = createCompanionStyleRuntime({
    documentRef: fakeDocument(),
    isActive: () => state.active,
    hideEditorWarnings: () => false,
    onMainEditorLeft: () => { state.left = (state.left || 0) + 1; },
  });
  const dialog = { matches: (s) => s === 'hui-dialog-edit-card', shadowRoot: fakeRoot() };
  const yamlEditor = { matches: (s) => s === 'ha-yaml-editor', getRootNode: () => ({ host: dialog }) };
  const editor = {
    shadowRoot: fakeRoot(),
    isConnected: true,
    rects: 1,
    getClientRects() { return { length: this.rects }; },
    matches: () => false,
    getRootNode: () => ({ host: yamlEditor }),
  };
  return { rt, dialog, editor, state };
}

test('a dialog this layer has not styled is left alone', () => {
  const { rt, dialog } = setup();
  rt.applyEditorWarningHide(dialog);
  assert.equal(dialog.shadowRoot.children.length, 0, 'a saved card opened in its visual editor: nothing is added');
});

test('while the code editor is shown the pane keeps its glow room', () => {
  const { rt, dialog, editor } = setup();
  rt.applyForEditor(editor);
  assert.ok(has(dialog.shadowRoot, DIALOG_ROOT_STYLE_ID));
  rt.applyEditorWarningHide(dialog);
  assert.ok(!has(dialog.shadowRoot, VISUAL_EDITOR_SCROLL_STYLE_ID));
});

test('the code editor is replaced by a visual editor: the pane scrolls; back in the code editor: the sheet goes', () => {
  const { rt, dialog, editor, state } = setup();
  rt.applyForEditor(editor);
  editor.isConnected = false; // Home Assistant removed the YAML editor
  rt.applyEditorWarningHide(dialog);
  assert.ok(has(dialog.shadowRoot, VISUAL_EDITOR_SCROLL_STYLE_ID), 'the pane scroll sheet is in the dialog');
  const last = dialog.shadowRoot.children[dialog.shadowRoot.children.length - 1];
  assert.equal(last.id, VISUAL_EDITOR_SCROLL_STYLE_ID, 'after the dialog-root sheet, so it wins at equal specificity');

  assert.equal(state.left, 1, 'the composition root is told once');

  const count = dialog.shadowRoot.children.length;
  rt.applyEditorWarningHide(dialog);
  assert.equal(dialog.shadowRoot.children.length, count, 'a second reconcile adds nothing');
  assert.equal(state.left, 1, 'and is not told again');

  editor.isConnected = true; // the code editor is shown again
  rt.applyForEditor(editor);
  assert.ok(!has(dialog.shadowRoot, VISUAL_EDITOR_SCROLL_STYLE_ID), 'removed with the code editor back');
  rt.applyEditorWarningHide(dialog);
  assert.ok(!has(dialog.shadowRoot, VISUAL_EDITOR_SCROLL_STYLE_ID));
});

test('a code editor that is still in the dialog but not drawn (another tab) counts as not shown', () => {
  const { rt, dialog, editor } = setup();
  rt.applyForEditor(editor);
  editor.rects = 0;
  rt.applyEditorWarningHide(dialog);
  assert.ok(has(dialog.shadowRoot, VISUAL_EDITOR_SCROLL_STYLE_ID));
});

test('teardown and a dormant layer remove the sheet', () => {
  const a = setup();
  a.rt.applyForEditor(a.editor);
  a.editor.isConnected = false;
  a.rt.applyEditorWarningHide(a.dialog);
  a.rt.teardown();
  assert.equal(a.dialog.shadowRoot.children.length, 0);

  const b = setup();
  b.rt.applyForEditor(b.editor);
  b.editor.isConnected = false;
  b.rt.applyEditorWarningHide(b.dialog);
  b.state.active = false;
  b.rt.reconcileVisualEditorPane(b.dialog);
  assert.ok(!has(b.dialog.shadowRoot, VISUAL_EDITOR_SCROLL_STYLE_ID));
});

test('the sheet gives the pane vertical scrolling and nothing else', () => {
  const css = VISUAL_EDITOR_SCROLL_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.element-editor,\s*\.element-editor\.ha-scrollbar\s*\{/);
  assert.match(css, /overflow-y:\s*auto !important/);
  assert.match(css, /overflow-x:\s*hidden !important/);
  const declarations = css.split('{')[1].split('}')[0].split(';').map((d) => d.trim().split(':')[0]).filter(Boolean);
  assert.deepEqual(declarations.sort(), ['overflow-x', 'overflow-y', 'scrollbar-width']);
});
