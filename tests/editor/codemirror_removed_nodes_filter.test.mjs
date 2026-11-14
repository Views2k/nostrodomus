import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorLifecycleSentinelRuntime } from '../../src/editor/editorLifecycleSentinel.js';
import { createCompanionSettleRuntime } from '../../src/companion/companionSettleRuntime.js';

// CodeMirror replaces line content, gutter numbers, selection rectangles and the cursor while
// the user scrolls or selects. A removed node is detached by the time the observer callback
// runs, so it has no CodeMirror ancestor left to be recognized by, and the filter called it
// foreign. The companion dialog observer then ran a settle pass on every such update.

function el(className = '', { parent = null, localName = 'div' } = {}) {
  const classes = className.split(/\s+/).filter(Boolean);
  const node = {
    nodeType: 1,
    localName,
    className,
    parentElement: parent,
    matches(selector) {
      return String(selector).split(',').map((s) => s.trim()).some((s) => s.startsWith('.') && classes.includes(s.slice(1)));
    },
    closest(selector) {
      for (let n = node; n; n = n.parentElement) if (n.matches(selector)) return n;
      return null;
    },
  };
  return node;
}
const textNode = (parent = null) => ({ nodeType: 3, parentElement: parent });

function makeSentinel() {
  return createEditorLifecycleSentinelRuntime({
    document: { documentElement: {} },
    window: { addEventListener() {}, removeEventListener() {} },
    state: { editorSentinelStats: {}, editorSentinelObservers: new Map() },
    Node: { ELEMENT_NODE: 1, DOCUMENT_FRAGMENT_NODE: 11 },
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  });
}

// An attached CodeMirror tree: .cm-editor > .cm-scroller > .cm-content > .cm-line, plus a gutter.
function cmTree() {
  const editor = el('cm-editor');
  const scroller = el('cm-scroller', { parent: editor });
  const content = el('cm-content', { parent: scroller });
  const line = el('cm-line', { parent: content });
  const gutters = el('cm-gutters', { parent: scroller });
  const gutter = el('cm-gutter cm-lineNumbers', { parent: gutters });
  const selectionLayer = el('cm-selectionLayer', { parent: scroller });
  return { editor, scroller, content, line, gutter, selectionLayer };
}

test('nodes CodeMirror removed from its own tree are CodeMirror-only records', () => {
  const rt = makeSentinel();
  const { content, line, gutter, selectionLayer } = cmTree();
  const cases = {
    'a text node of a line': { target: line, addedNodes: [], removedNodes: [textNode(null)] },
    'a token span of a line': { target: line, addedNodes: [], removedNodes: [el('', { localName: 'span' })] },
    'a line number element': { target: gutter, addedNodes: [], removedNodes: [el('cm-gutterElement')] },
    'a selection rectangle': { target: selectionLayer, addedNodes: [], removedNodes: [el('cm-selectionBackground')] },
    'a line scrolled out of view': { target: content, addedNodes: [], removedNodes: [el('cm-line')] },
  };
  for (const [label, record] of Object.entries(cases)) {
    assert.equal(rt.mutationRecordsAreCodeMirrorOnly([record]), true, label);
  }
});

test('mutations outside the CodeMirror tree are still foreign', () => {
  const rt = makeSentinel();
  const { editor } = cmTree();
  const wrapper = el('code-wrapper');
  const cases = {
    'the editor removed from its wrapper': { target: wrapper, addedNodes: [], removedNodes: [editor] },
    'a node removed from a dialog element': { target: el('element-editor'), addedNodes: [], removedNodes: [el('yaml-editor')] },
    'a node added to a dialog element': { target: el('element-editor'), addedNodes: [el('gui-editor', { parent: wrapper })], removedNodes: [] },
    'an editor mounted in a wrapper': { target: wrapper, addedNodes: [el('cm-editor', { parent: wrapper })], removedNodes: [] },
  };
  for (const [label, record] of Object.entries(cases)) {
    assert.equal(rt.mutationRecordsAreCodeMirrorOnly([record]), false, label);
  }
  const { line } = cmTree();
  const mixed = [
    { target: line, addedNodes: [], removedNodes: [textNode(null)] },
    { target: el('element-editor'), addedNodes: [], removedNodes: [el('yaml-editor')] },
  ];
  assert.equal(rt.mutationRecordsAreCodeMirrorOnly(mixed), false, 'one foreign record makes the batch foreign');
});

test('the companion dialog observer runs no settle pass for CodeMirror removals, and one for a foreign change', () => {
  const sentinel = makeSentinel();
  const observers = [];
  let frames = [];
  const reapplied = [];
  const dialog = { shadowRoot: { querySelectorAll: () => [] }, isConnected: true };
  const settle = createCompanionSettleRuntime({
    globalRef: {},
    documentRef: { addEventListener() {} },
    MutationObserver: function FakeObserver(cb) { this.cb = cb; this.observe = () => {}; this.disconnect = () => {}; observers.push(this); },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    isActive: () => true,
    scheduleReapply: (reason) => reapplied.push(reason),
    shouldHandleMutation: (records) => !sentinel.mutationRecordsAreCodeMirrorOnly(records),
    editDialogPresent: () => true,
    activeDialog: () => dialog,
    homeRoot: () => null,
  });
  const flush = () => { const run = frames; frames = []; run.forEach((fn) => fn()); };
  settle.onDialogOpen('test-open');
  const dialogObserver = observers[observers.length - 1];
  assert.ok(dialogObserver, 'the dialog observer is attached');

  const { line, gutter } = cmTree();
  dialogObserver.cb([
    { target: line, addedNodes: [el('', { localName: 'span', parent: line })], removedNodes: [el('', { localName: 'span' }), textNode(null)] },
    { target: gutter, addedNodes: [], removedNodes: [el('cm-gutterElement')] },
  ]);
  flush();
  assert.deepEqual(reapplied, [], 'scrolling or selecting in the editor schedules no settle pass');
  assert.equal(settle.snapshot().mutationSkips, 1);

  dialogObserver.cb([{ target: el('element-editor'), addedNodes: [el('gui-editor')], removedNodes: [el('yaml-editor')] }]);
  flush();
  assert.equal(reapplied.length, 1, 'a change of the dialog content still schedules one');
  assert.match(reapplied[0], /dialog-shadow-mutation/);
});
