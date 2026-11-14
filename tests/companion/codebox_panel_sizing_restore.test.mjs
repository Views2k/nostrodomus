import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxEnlargeRuntime, PANEL_MAX_HEIGHT, PANEL_MAX_WIDTH, PANEL_SIDE_ROOM } from '../../src/companion/codeboxEnlargeRuntime.js';

// A panel editor (automation or script YAML, the template tool, raw dashboard config) gets inline
// margins, a height cap and corner padding. Nothing recorded what was there before, so uninstall
// and the universal switch left them on the page; only the card dialog's codebox was handed back.

function inlineStyle(initial = {}) {
  const values = new Map(Object.entries(initial).map(([k, v]) => [k, { value: v, priority: '' }]));
  return {
    setProperty(name, value, priority = '') { values.set(name, { value, priority }); },
    getPropertyValue(name) { return values.get(name)?.value || ''; },
    getPropertyPriority(name) { return values.get(name)?.priority || ''; },
    removeProperty(name) { values.delete(name); },
    snapshot() { return Object.fromEntries(Array.from(values, ([k, v]) => [k, v.priority ? `${v.value} !${v.priority}` : v.value])); },
  };
}

function panelEditor({ wrapperStyle = {} } = {}) {
  const el = (style = {}) => ({ style: inlineStyle(style), isConnected: true });
  const wrapper = el(wrapperStyle);
  const cmEditor = el();
  const cmScroller = el();
  const cmContent = el();
  const byClass = { '.cm-editor': cmEditor, '.cm-scroller': cmScroller, '.cm-content': cmContent };
  wrapper.matches = () => false;
  wrapper.getRootNode = () => ({ host: null }); // no card dialog above: a panel editor
  const codeRoot = { host: wrapper, querySelector: (sel) => byClass[sel] || null };
  const editor = { matches: () => false, getRootNode: () => codeRoot, shadowRoot: null };
  return { editor, wrapper, cmEditor, cmScroller, cmContent };
}

function makeRuntime({ universal = () => true } = {}) {
  return createCodeboxEnlargeRuntime({ globalRef: {}, isActive: () => true, universalCodeboxEnabled: universal });
}

test('teardown hands a sized panel editor back with the inline styles it had before', () => {
  const rt = makeRuntime();
  const p = panelEditor({ wrapperStyle: { 'max-width': '800px', color: 'red' } });
  assert.equal(rt.applyForEditor(p.editor)?.panel, true);
  assert.equal(p.wrapper.style.getPropertyValue('max-width'), PANEL_MAX_WIDTH);
  assert.equal(p.wrapper.style.getPropertyValue('margin-left'), PANEL_SIDE_ROOM);
  assert.equal(p.cmScroller.style.getPropertyValue('max-height'), PANEL_MAX_HEIGHT);
  assert.notEqual(p.cmContent.style.getPropertyValue('padding'), '');

  rt.teardown();
  assert.deepEqual(p.wrapper.style.snapshot(), { 'max-width': '800px', color: 'red' }, 'the wrapper is as Home Assistant left it');
  assert.deepEqual(p.cmEditor.style.snapshot(), {});
  assert.deepEqual(p.cmScroller.style.snapshot(), {});
  assert.deepEqual(p.cmContent.style.snapshot(), {});
});

test('applying twice keeps the first inline values as the ones to restore', () => {
  const rt = makeRuntime();
  const p = panelEditor({ wrapperStyle: { 'max-width': '800px' } });
  rt.applyForEditor(p.editor);
  rt.applyForEditor(p.editor);
  rt.teardown();
  assert.deepEqual(p.wrapper.style.snapshot(), { 'max-width': '800px' });
});

test('turning universal styling off hands the panel editor back on the next apply, and on again sizes it again', () => {
  let universal = true;
  const rt = makeRuntime({ universal: () => universal });
  const p = panelEditor();
  rt.applyForEditor(p.editor);
  assert.equal(p.wrapper.style.getPropertyValue('margin-left'), PANEL_SIDE_ROOM);

  universal = false;
  assert.equal(rt.applyForEditor(p.editor), null);
  assert.deepEqual(p.wrapper.style.snapshot(), {}, 'margins and caps removed');
  assert.deepEqual(p.cmScroller.style.snapshot(), {});
  assert.deepEqual(p.cmContent.style.snapshot(), {});

  universal = true;
  assert.equal(rt.applyForEditor(p.editor)?.panel, true);
  assert.equal(p.wrapper.style.getPropertyValue('margin-left'), PANEL_SIDE_ROOM);
});

test('a panel editor that left the page is forgotten, not written to', () => {
  const rt = makeRuntime();
  const gone = panelEditor();
  rt.applyForEditor(gone.editor);
  for (const el of [gone.wrapper, gone.cmEditor, gone.cmScroller, gone.cmContent]) el.isConnected = false;
  const before = gone.wrapper.style.snapshot();
  const next = panelEditor();
  rt.applyForEditor(next.editor);
  assert.deepEqual(gone.wrapper.style.snapshot(), before, 'the detached editor is left as it is');
  rt.teardown();
  assert.deepEqual(next.wrapper.style.snapshot(), {}, 'the editor on the page is handed back');
  assert.deepEqual(gone.wrapper.style.snapshot(), before);
});

test('teardown with nothing sized, and a second teardown, do nothing', () => {
  const rt = makeRuntime();
  rt.teardown();
  const p = panelEditor();
  rt.applyForEditor(p.editor);
  rt.teardown();
  p.wrapper.style.setProperty('max-width', '640px'); // Home Assistant sets its own value afterwards
  rt.teardown();
  assert.deepEqual(p.wrapper.style.snapshot(), { 'max-width': '640px' });
});
