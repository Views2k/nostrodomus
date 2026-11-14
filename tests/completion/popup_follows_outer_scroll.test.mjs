import test from 'node:test';
import assert from 'node:assert/strict';

import { placeCompletionPopupAtCursor, removeCompletionOverlay } from '../../src/completion/popupRuntime.js';

// The open list followed only the editor's own scroller. A scroll of the dialog
// body or the panel around the editor, or a window resize, moved the editor and left the list
// where it was; a caret scrolled out of the editor left the list pinned to an edge.

function listenerTarget(name, extra = {}) {
  const target = {
    name,
    listeners: [],
    addEventListener(type, handler, options) { target.listeners.push({ type, handler, options }); },
    removeEventListener(type, handler) { target.listeners = target.listeners.filter(l => !(l.type === type && l.handler === handler)); },
    fire(type) { for (const l of target.listeners.filter(x => x.type === type)) l.handler(); },
    ...extra,
  };
  return target;
}

// The editor as Home Assistant nests it: the scroller inside ha-code-editor's shadow root, the
// editor element slotted into a dialog whose scrolling body is in the dialog's own shadow root.
function page() {
  const html = listenerTarget('html');
  const body = listenerTarget('body', { parentElement: html });
  const dialog = listenerTarget('ha-dialog', { parentElement: body });
  const dialogBody = listenerTarget('div.body', { getRootNode: () => ({ host: dialog }) });
  const slot = listenerTarget('slot', { parentElement: dialogBody });
  const codeEditor = listenerTarget('ha-code-editor', { parentElement: dialog, assignedSlot: slot });
  const cmEditor = listenerTarget('div.cm-editor', { getRootNode: () => ({ host: codeEditor }) });
  const scroller = listenerTarget('div.cm-scroller', {
    parentElement: cmEditor,
    getBoundingClientRect: () => ({ left: 100, right: 900, top: 200, bottom: 600, width: 800, height: 400 }),
  });
  const win = listenerTarget('window', { innerWidth: 1440, innerHeight: 900, requestAnimationFrame: fn => fn() });
  return { html, body, dialog, dialogBody, slot, codeEditor, cmEditor, scroller, win };
}

function harness(nodes = page()) {
  let caret = { top: 300, bottom: 316, left: 400 };
  const box = { dataset: {}, style: { display: 'block', left: '', top: '' }, getBoundingClientRect: () => ({ width: 280, height: 150 }) };
  const state = {
    overlay: box,
    lastExplicitOpen: true,
    view: { dom: { querySelector: selector => (selector === '.cm-scroller' ? nodes.scroller : null), closest: () => null }, coordsAtPos: () => caret },
  };
  const deps = { getPos: () => 5, ensureOverlay: () => box, windowRef: nodes.win };
  placeCompletionPopupAtCursor(state, deps);
  return { nodes, box, state, deps, moveCaret: next => { caret = next; } };
}

const scrollListeners = target => target.listeners.filter(l => l.type === 'scroll');

test('the list follows a scroll of the containers around the editor', () => {
  const { nodes, box, moveCaret } = harness();
  assert.equal(box.style.left, '400px');
  assert.equal(box.style.top, '318px');

  for (const target of [nodes.dialogBody, nodes.dialog, nodes.codeEditor, nodes.body]) {
    assert.equal(scrollListeners(target).length, 1, `${target.name} has one scroll listener`);
    assert.equal(scrollListeners(target)[0].options?.passive, true, `${target.name}: passive`);
  }
  assert.equal(scrollListeners(nodes.scroller).length, 1, 'the scroller keeps its single listener');

  // The dialog body scrolled by 60px: the editor, and the caret in it, moved up.
  moveCaret({ top: 240, bottom: 256, left: 400 });
  nodes.dialogBody.fire('scroll');
  assert.equal(box.style.top, '258px', 'the list moved with the caret');
});

test('the list follows a window resize', () => {
  const { nodes, box, moveCaret } = harness();
  assert.equal(nodes.win.listeners.filter(l => l.type === 'resize').length, 1);
  moveCaret({ top: 300, bottom: 316, left: 250 });
  nodes.win.fire('resize');
  assert.equal(box.style.left, '250px');
});

test('placing again, or another editor in the same dialog, adds no second listener', () => {
  const nodes = page();
  const first = harness(nodes);
  placeCompletionPopupAtCursor(first.state, first.deps);
  placeCompletionPopupAtCursor(first.state, first.deps);

  // A second editor in the same dialog body, bound to the same runtime state.
  const secondEditor = listenerTarget('ha-code-editor', { parentElement: nodes.dialog, assignedSlot: nodes.slot });
  const secondCm = listenerTarget('div.cm-editor', { getRootNode: () => ({ host: secondEditor }) });
  const secondScroller = listenerTarget('div.cm-scroller', { parentElement: secondCm, getBoundingClientRect: () => ({ left: 100, right: 900, top: 200, bottom: 600, width: 800, height: 400 }) });
  first.state.view = { dom: { querySelector: selector => (selector === '.cm-scroller' ? secondScroller : null), closest: () => null }, coordsAtPos: () => ({ top: 300, bottom: 316, left: 400 }) };
  placeCompletionPopupAtCursor(first.state, first.deps);

  assert.equal(scrollListeners(secondScroller).length, 1);
  for (const target of [nodes.dialogBody, nodes.dialog, nodes.body, nodes.scroller]) {
    assert.equal(scrollListeners(target).length, 1, `${target.name} still has one scroll listener`);
  }
  assert.equal(nodes.win.listeners.filter(l => l.type === 'resize').length, 1);
});

test('a hidden list is not moved by a scroll or a resize', () => {
  const { nodes, box, moveCaret } = harness();
  box.style.display = 'none';
  moveCaret({ top: 240, bottom: 256, left: 999 });
  nodes.dialogBody.fire('scroll');
  nodes.scroller.fire('scroll');
  nodes.win.fire('resize');
  assert.equal(box.style.left, '400px');
});

test('a caret scrolled out of the visible editor closes the list', () => {
  for (const [label, caret] of [
    ['above the editor', { top: 150, bottom: 166, left: 400 }],
    ['below the editor', { top: 620, bottom: 636, left: 400 }],
    ['left of the editor', { top: 300, bottom: 316, left: 60 }],
    ['right of the editor', { top: 300, bottom: 316, left: 950 }],
    ['not drawn by CodeMirror any more', null],
  ]) {
    const { nodes, box, state, moveCaret } = harness();
    moveCaret(caret);
    nodes.scroller.fire('scroll');
    assert.equal(box.style.display, 'none', label);
    assert.equal(state.lastExplicitOpen, false, `${label}: closed like any other close`);
    assert.equal(box.style.top, '318px', `${label}: not moved to an edge first`);
  }
});

test('a caret on a line that is partly visible keeps the list', () => {
  const { nodes, box, moveCaret } = harness();
  moveCaret({ top: 190, bottom: 206, left: 400 }); // the editor starts at 200
  nodes.scroller.fire('scroll');
  assert.equal(box.style.display, 'block');
  assert.equal(box.style.top, '208px');
});

test('an editor that is partly outside the window counts only its visible part', () => {
  const nodes = page();
  nodes.scroller.getBoundingClientRect = () => ({ left: 100, right: 900, top: 700, bottom: 1100, width: 800, height: 400 });
  const { box, moveCaret } = harness(nodes);
  moveCaret({ top: 950, bottom: 966, left: 400 }); // inside the editor, below the 900px window
  nodes.body.fire('scroll');
  assert.equal(box.style.display, 'none');
});

test('removing the list box takes the window listeners off again', () => {
  const { nodes, state } = harness();
  assert.equal(nodes.win.listeners.length > 0, true);
  removeCompletionOverlay(state);
  assert.deepEqual(nodes.win.listeners, []);
});
