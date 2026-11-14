import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxEnlargeRuntime } from '../../src/companion/codeboxEnlargeRuntime.js';

function buildDialog(layout) {
  const writes = [];
  const rect = (top, bottom, width = 100) => ({ top, bottom, width, height: bottom - top });
  const sink = (tag, read) => ({ style: { setProperty: (key, value) => writes.push([tag, key, value]) }, getBoundingClientRect: read });
  const footer = { getBoundingClientRect: () => rect(layout.footerTop, layout.footerTop + 68) };
  const haDialog = { getBoundingClientRect: () => rect(40, layout.dialogBottom), shadowRoot: null };
  const dialog = {
    matches: (selector) => selector === 'hui-dialog-edit-card',
    getBoundingClientRect: () => rect(40, layout.dialogBottom),
    shadowRoot: {
      querySelector: (selector) => (selector === 'ha-dialog-footer' ? footer : selector === 'ha-dialog' ? haDialog : null),
      querySelectorAll: () => [],
    },
  };
  const wrapper = sink('wrapper', () => rect(layout.editorTop, layout.editorTop + 500, layout.editorWidth));
  const cmEditor = sink('cm', () => rect(0, 0));
  const cmScroller = sink('scroller', () => rect(0, 0));
  const yamlHost = { matches: (selector) => selector === 'ha-yaml-editor', getRootNode: () => ({ host: dialog }) };
  const editor = {
    shadowRoot: { host: wrapper, querySelector: (selector) => (selector === '.cm-editor' ? cmEditor : selector === '.cm-scroller' ? cmScroller : null) },
    matches: () => false,
    getRootNode: () => ({ host: yamlHost }),
  };
  return { writes, editor };
}

const lastHeight = (writes, tag) => writes.filter(([t, key]) => t === tag && key === 'height').map(([, , value]) => value).pop();

test('a fit equal to the last one is written again after the formula fallback replaced it', () => {
  const layout = { editorTop: 116, footerTop: 1265, dialogBottom: 1317, editorWidth: 1184 };
  const { writes, editor } = buildDialog(layout);
  const rt = createCodeboxEnlargeRuntime({ isActive: () => true, visible: () => true, globalRef: { innerHeight: 1358 } });

  rt.applyForEditor(editor);
  assert.equal(lastHeight(writes, 'wrapper'), '1127px');

  layout.editorWidth = 0; // the editor is not laid out for a moment (hidden ancestor)
  rt.refitForEditor(editor);
  assert.equal(lastHeight(writes, 'wrapper'), 'calc(94vh - 150px)', 'the viewport formula took over');

  layout.editorWidth = 1184; // laid out again with the same geometry
  rt.refitForEditor(editor);
  assert.equal(lastHeight(writes, 'wrapper'), '1127px', 'the measured fit is restored');
  assert.equal(lastHeight(writes, 'cm'), '1113px');
});
