import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxUnclip } from '../../src/ui/codebox/codeboxUnclip.js';

// The frame glow needs the wrappers around the editor unclipped: ha-code-editor, ha-yaml-editor,
// the element editor, and a plain wrapper that clips without really scrolling. Their overflow,
// contain, clip-path and mask were overwritten inline without a record of what was there, so the
// cleanup that hands the dialog body back left these wrappers as they were written: a wrapper
// with overflow:auto stayed at overflow:visible for as long as it lived, also after uninstall.

function styleStore(initial = {}) {
  const values = new Map(Object.entries(initial).map(([prop, value]) => [prop, { value, priority: '' }]));
  return {
    getPropertyValue: (prop) => values.get(prop)?.value || '',
    getPropertyPriority: (prop) => values.get(prop)?.priority || '',
    setProperty: (prop, value, priority = '') => values.set(prop, { value, priority }),
    removeProperty: (prop) => values.delete(prop),
    snapshot: () => Object.fromEntries(Array.from(values, ([prop, v]) => [prop, v.priority ? `${v.value} !${v.priority}` : v.value])),
  };
}

function node(localName, { parent = null, style = {}, computed = null, scroll = null } = {}) {
  return {
    nodeType: 1,
    localName,
    className: '',
    dataset: {},
    style: styleStore(style),
    isConnected: true,
    parent,
    computed,
    ...(scroll || { scrollWidth: 0, clientWidth: 0, scrollHeight: 0, clientHeight: 0 }),
    matches: (selector) => selector === localName,
  };
}

function harness() {
  // dialog > div.card-config (clips, content fits) > hui-card-element-editor > ha-yaml-editor > ha-code-editor > .cm-editor
  const dialog = node('ha-dialog');
  const cardConfig = node('div', {
    parent: dialog,
    style: { overflow: 'auto', color: 'red' },
    computed: { overflowX: 'auto', overflowY: 'auto' },
    scroll: { scrollWidth: 513, clientWidth: 500, scrollHeight: 400, clientHeight: 400 },
  });
  const elementEditor = node('hui-card-element-editor', { parent: cardConfig });
  const yamlEditor = node('ha-yaml-editor', { parent: elementEditor, style: { contain: 'layout' } });
  const codeEditor = node('ha-code-editor', { parent: yamlEditor });
  const editor = node('.cm-editor', { parent: codeEditor });
  const state = {};
  const unclip = createCodeboxUnclip({
    document: {
      documentElement: {},
      defaultView: { getComputedStyle: (n) => n.computed || { overflowX: 'visible', overflowY: 'visible' }, matchMedia: () => ({ matches: false }) },
    },
    MutationObserver: class { observe() {} disconnect() {} },
    state,
    recordPerformanceEvent: () => {},
    codeboxComposedParent: (n) => n?.parent || null,
    codeboxFrameHostForEditor: () => editor,
    isCodeMirrorInlineStyleTarget: (n) => n === editor,
    haCodeEditorHostForEditor: () => codeEditor,
  });
  return { unclip, editor, codeEditor, yamlEditor, elementEditor, cardConfig, dialog, state };
}

test('the wrappers are unclipped for the frame, as before', () => {
  const h = harness();
  h.unclip.allowCodeboxFrameOverflow(h.editor);
  for (const wrapper of [h.yamlEditor, h.elementEditor, h.cardConfig]) {
    assert.equal(wrapper.style.getPropertyValue('overflow'), 'visible', wrapper.localName);
    assert.equal(wrapper.style.getPropertyPriority('overflow'), 'important', wrapper.localName);
    assert.equal(wrapper.style.getPropertyValue('contain'), 'none', wrapper.localName);
    assert.ok(wrapper.dataset.nostrodomusCodeboxUnclip, wrapper.localName);
  }
  assert.deepEqual(h.editor.style.snapshot(), {}, 'the CodeMirror element is not written to');
});

test('cleanup puts back the inline styles the wrappers had', () => {
  const h = harness();
  h.unclip.allowCodeboxFrameOverflow(h.editor);
  h.unclip.allowCodeboxFrameOverflow(h.editor); // a second pass must not record the written values as originals
  h.unclip.cleanupCodeboxSlotUnclip('uninstall');
  assert.deepEqual(h.cardConfig.style.snapshot(), { overflow: 'auto', color: 'red' }, 'the wrapper can scroll again');
  assert.deepEqual(h.yamlEditor.style.snapshot(), { contain: 'layout' });
  assert.deepEqual(h.elementEditor.style.snapshot(), {});
  for (const wrapper of [h.yamlEditor, h.elementEditor, h.cardConfig]) {
    assert.equal(wrapper.dataset.nostrodomusCodeboxUnclip, undefined, `${wrapper.localName}: the mark is removed`);
  }
});

test('a wrapper stays unclipped across passes while its editor is styled', () => {
  const h = harness();
  h.unclip.allowCodeboxFrameOverflow(h.editor);
  // After the first pass the wrapper no longer clips, so the check that picked it does not pick it again.
  h.cardConfig.computed = { overflowX: 'visible', overflowY: 'visible' };
  h.unclip.allowCodeboxFrameOverflow(h.editor);
  assert.equal(h.cardConfig.style.getPropertyValue('overflow'), 'visible', 'not handed back between passes');
  h.unclip.cleanupCodeboxSlotUnclip('no-active-editor');
  assert.deepEqual(h.cardConfig.style.snapshot(), { overflow: 'auto', color: 'red' });
});

test('a wrapper that left the page is forgotten, not written to', () => {
  const h = harness();
  h.unclip.allowCodeboxFrameOverflow(h.editor);
  h.yamlEditor.isConnected = false;
  const written = h.yamlEditor.style.snapshot();
  h.unclip.cleanupCodeboxSlotUnclip('cleanup');
  assert.deepEqual(h.yamlEditor.style.snapshot(), written);
  assert.deepEqual(h.elementEditor.style.snapshot(), {}, 'the ones still on the page are restored');
});

test('after a cleanup the next pass unclips again and the next cleanup restores again', () => {
  const h = harness();
  h.unclip.allowCodeboxFrameOverflow(h.editor);
  h.unclip.cleanupCodeboxSlotUnclip('no-active-editor');
  h.unclip.allowCodeboxFrameOverflow(h.editor);
  assert.equal(h.cardConfig.style.getPropertyValue('overflow'), 'visible');
  h.unclip.cleanupCodeboxSlotUnclip('uninstall');
  assert.deepEqual(h.cardConfig.style.snapshot(), { overflow: 'auto', color: 'red' });
});
