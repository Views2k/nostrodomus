import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompanionSettleRuntime, INTERACTION_LADDER_MS, SETTLE_BURST_MS, SETTLE_LADDER_MS } from '../../src/companion/companionSettleRuntime.js';
import { editCardDialogCandidates, editCardDialogElements } from '../../src/editor/activeEditor.js';

// Measured on a live instance: one click armed three 13-rung ladders (pointerdown, mousedown,
// click), and because Home Assistant keeps a closed edit-card dialog element attached, that
// held on every dashboard for the rest of the session. These tests pin the click cost.

function harness({ dialogPresent = () => false, editorKnown = () => false, dialogElements = () => [] } = {}) {
  let clock = 1000;
  let timers = [];
  let seq = 1;
  const listeners = { document: {}, window: {} };
  const observers = [];
  const reapplied = [];
  const rafQueue = [];
  const rt = createCompanionSettleRuntime({
    globalRef: { addEventListener: (type, handler) => { listeners.window[type] = handler; }, removeEventListener() {} },
    documentRef: { addEventListener: (type, handler) => { listeners.document[type] = handler; }, removeEventListener() {} },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
      observe(target, options) { this.targets.push({ target, options }); }
      disconnect() { this.disconnected = true; }
    },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { const id = seq++; timers.push({ id, fn, ms }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
    isActive: () => true,
    scheduleReapply: (reason) => reapplied.push(reason),
    editDialogPresent: () => dialogPresent(),
    editDialogElements: () => dialogElements(),
    editorKnown: () => editorKnown(),
    now: () => clock,
    activeDialog: () => null,
    homeRoot: () => ({ nodeType: 11 }),
  });
  return {
    rt,
    listeners,
    observers,
    reapplied,
    advance: (ms) => { clock += ms; },
    pendingTimers: () => timers.length,
    timerLabels: () => timers.map((t) => t.ms),
    clearTimers: () => { timers = []; },
    fireTimers: () => { const due = timers; timers = []; due.forEach((t) => t.fn()); },
    flushRaf: () => { const queue = rafQueue.splice(0); queue.forEach((fn) => fn()); },
  };
}

const click = (h) => { for (const type of ['pointerdown', 'mousedown', 'click']) h.listeners.document[type]({ type }); };

test('one physical click arms one ladder, not three', () => {
  const h = harness({ dialogPresent: () => true });
  h.rt.boot('install');
  h.clearTimers();
  const armedBefore = h.rt.snapshot().settleArmCount;

  click(h);
  assert.equal(h.rt.snapshot().settleArmCount - armedBefore, 1);
  assert.equal(h.pendingTimers(), INTERACTION_LADDER_MS.length, 'a click arms the short ladder');
  assert.ok(INTERACTION_LADDER_MS.length <= 4 && INTERACTION_LADDER_MS.length < SETTLE_LADDER_MS.length);

  h.advance(SETTLE_BURST_MS - 1);
  click(h);
  assert.equal(h.rt.snapshot().settleArmCount - armedBefore, 1, 'a second click inside the burst window adds no ladder');

  h.advance(2);
  click(h);
  assert.equal(h.rt.snapshot().settleArmCount - armedBefore, 2, 'a click after the window arms the next ladder');
});

test('with no dialog and no known editor a click schedules nothing', () => {
  const h = harness();
  h.rt.boot('install');
  h.flushRaf();
  h.clearTimers();
  const appliesBefore = h.reapplied.length;

  click(h);
  h.listeners.window.focus();
  h.flushRaf();
  assert.equal(h.pendingTimers(), 0, 'no ladder timers');
  assert.equal(h.reapplied.length, appliesBefore, 'no style re-apply');
});

test('with a known editor but no dialog a click re-applies once and arms no ladder', () => {
  const h = harness({ editorKnown: () => true });
  h.rt.boot('install');
  h.flushRaf();
  h.clearTimers();
  const appliesBefore = h.reapplied.length;

  click(h);
  h.flushRaf();
  assert.equal(h.pendingTimers(), 0);
  assert.equal(h.reapplied.length, appliesBefore + 1);
});

test('the boot ladder rungs are not labelled as install applies', () => {
  const h = harness();
  h.rt.boot('install');
  h.flushRaf();
  assert.deepEqual(h.reapplied, ['companion-settle-install'], 'one install apply at boot');

  assert.equal(h.pendingTimers(), SETTLE_LADDER_MS.length);
  h.fireTimers();
  h.flushRaf();
  const rungReasons = h.reapplied.slice(1);
  assert.ok(rungReasons.length >= 1);
  for (const reason of rungReasons) {
    assert.equal(/install|open|root|reset|restore|toggle/.test(reason), false, `"${reason}" must not match a full-apply rule`);
  }
});

test('a dialog element is watched for opening; opening arms a ladder without any click', () => {
  let open = false;
  const dialog = { isConnected: true, shadowRoot: { childElementCount: 0 } };
  const h = harness({ dialogPresent: () => open, dialogElements: () => [dialog] });
  h.rt.boot('install');
  h.flushRaf();
  h.clearTimers();

  const watcher = h.observers.find((observer) => observer.targets.some((entry) => entry.target === dialog.shadowRoot));
  assert.ok(watcher, 'the dialog element shadow root is observed');
  assert.deepEqual(watcher.targets[0].options, { childList: true }, 'direct children only');
  assert.equal(h.rt.snapshot().openWatchers, 1);

  // Clicking while it is closed does nothing (this is the click that will open it).
  click(h);
  assert.equal(h.pendingTimers(), 0);

  // Home Assistant fills the shadow root: the dialog is open.
  open = true;
  watcher.callback([{ type: 'childList' }]);
  assert.equal(h.pendingTimers(), SETTLE_LADDER_MS.length, 'opening arms the ladder');

  // Closing empties it again: one cleanup pass, no ladder.
  h.clearTimers();
  open = false;
  watcher.callback([{ type: 'childList' }]);
  assert.equal(h.pendingTimers(), 0);

  h.rt.cleanup();
  assert.equal(watcher.disconnected, true);
});

test('a closed edit-card dialog element (empty shadow root) is not a present dialog', () => {
  const openDialog = { shadowRoot: { childElementCount: 1 } };
  const closedDialog = { shadowRoot: { childElementCount: 0 } };
  const legacyDialog = {}; // no shadow root information: keep the old behavior
  const previous = globalThis.document;
  globalThis.document = {
    querySelectorAll: (selector) => (selector === 'hui-dialog-edit-card' ? [openDialog, closedDialog, legacyDialog] : []),
    querySelector: () => null,
  };
  try {
    assert.deepEqual(editCardDialogElements(), [openDialog, closedDialog, legacyDialog]);
    assert.deepEqual(editCardDialogCandidates(), [openDialog, legacyDialog]);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('the settle engine registers no input, beforeinput or compositionupdate listener', () => {
  // A script listener for those events makes the browser run CodeMirror's flush and Home
  // Assistant's preview rebuild synchronously inside every keystroke (measured: 810ms of blocked
  // main thread for 30 keystrokes with them, 68ms without). keydown marks the typing window.
  const h = harness();
  h.rt.boot('install');
  const types = Object.keys(h.listeners.document);
  for (const type of ['input', 'beforeinput', 'compositionupdate']) assert.equal(types.includes(type), false, `${type} listener must not be registered`);
  assert.equal(types.includes('keydown'), true);
});


// The plugin's own stylesheets are added to the dialog's shadow root while it is open. The
// open/close watcher took those records for the dialog opening and armed extra ladders.
test('the plugin style elements added to the dialog do not arm a ladder', () => {
  let open = true;
  const dialog = { isConnected: true, shadowRoot: { childElementCount: 3 } };
  const h = harness({ dialogPresent: () => open, dialogElements: () => [dialog] });
  h.rt.boot('install');
  h.flushRaf();
  h.clearTimers();
  const watcher = h.observers.find((observer) => observer.targets.some((entry) => entry.target === dialog.shadowRoot));
  const ownStyle = { localName: 'style', id: 'nostrodomus-editor-v17-2-learned-style-dialog-root' };
  watcher.callback([{ type: 'childList', addedNodes: [ownStyle], removedNodes: [] }]);
  assert.equal(h.pendingTimers(), 0, 'own style records are ignored');
  watcher.callback([{ type: 'childList', addedNodes: [{ localName: 'ha-dialog', id: '' }], removedNodes: [] }]);
  assert.equal(h.pendingTimers(), SETTLE_LADDER_MS.length, 'a real child change still arms the full ladder');
});