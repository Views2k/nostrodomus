import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompanionSettleRuntime, SETTLE_LADDER_MS } from '../../src/companion/companionSettleRuntime.js';

// On Home Assistant 2026.6 and later the edit-card dialog element is mounted outside the
// home-assistant shadow root (see editCardDialogElements), so the home observer never reports
// it. The open/close watcher must still be installed, or reopening the dialog arms no ladder.
test('a dialog element that mounts without a home mutation is watched from the next settle pass', () => {
  let timers = [];
  let seq = 1;
  const listeners = {};
  const observers = [];
  const rafQueue = [];
  const elements = [];
  let open = false;
  const rt = createCompanionSettleRuntime({
    globalRef: { addEventListener() {}, removeEventListener() {} },
    documentRef: { addEventListener: (type, handler) => { listeners[type] = handler; }, removeEventListener() {} },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
      observe(target, options) { this.targets.push({ target, options }); }
      disconnect() {}
    },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { const id = seq++; timers.push({ id, fn, ms }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
    isActive: () => true,
    scheduleReapply: () => {},
    editDialogPresent: () => open,
    editDialogElements: () => elements,
    editorKnown: () => false,
    now: () => 1000,
    activeDialog: () => null,
    homeRoot: () => ({ nodeType: 11 }),
  });
  const flushRaf = () => { const queue = rafQueue.splice(0); queue.forEach((fn) => fn()); };

  rt.boot('install');
  flushRaf();
  timers = [];
  assert.equal(rt.snapshot().openWatchers, 0);

  // The dialog opens for the first time. No home mutation is delivered for it.
  const dialog = { isConnected: true, shadowRoot: { childElementCount: 1 } };
  elements.push(dialog);
  open = true;
  listeners.click({ type: 'click' }); // any interaction inside the open dialog
  flushRaf();
  assert.equal(rt.snapshot().openWatchers, 1, 'the dialog shadow root is now watched');

  // Closed, then reopened by Home Assistant filling the same shadow root: the watcher arms a ladder.
  open = false;
  timers = [];
  const watcher = observers.find((observer) => observer.targets.some((entry) => entry.target === dialog.shadowRoot));
  open = true;
  watcher.callback([{ type: 'childList' }]);
  assert.equal(timers.length, SETTLE_LADDER_MS.length);
});
