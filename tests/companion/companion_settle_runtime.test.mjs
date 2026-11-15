// Companion settle runtime: the settle engine owns the lifecycle trigger (a scheduler coalesced
// per animation frame that respects the typing window, and the 2800ms ladder). No DOM needed.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompanionSettleRuntime, SETTLE_LADDER_MS } from '../../src/companion/companionSettleRuntime.js';

function harness({ active = true, quiet = false, handleMutation = true } = {}) {
  let rafQueue = [];
  const requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  const flushRaf = () => { const q = rafQueue; rafQueue = []; q.forEach((fn) => fn()); };

  let timers = [];
  let seq = 1;
  const setTimeout = (fn, ms) => { const id = seq++; timers.push({ id, fn, ms }); return id; };
  const clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
  const fireTimers = () => { const due = timers; timers = []; due.forEach((t) => t.fn()); };

  const reapplied = [];
  const rt = createCompanionSettleRuntime({
    globalRef: {},
    documentRef: { addEventListener() {} },
    MutationObserver: function FakeMO(cb) { this.cb = cb; this.observe = () => {}; this.disconnect = () => {}; },
    requestAnimationFrame,
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    isActive: () => active,
    scheduleReapply: (reason) => reapplied.push(reason),
    isTypingQuiet: () => quiet,
    shouldHandleMutation: () => handleMutation,
    editDialogPresent: () => false,
    activeDialog: () => null,
    homeRoot: () => null,
  });
  return { rt, flushRaf, fireTimers, reapplied, pendingTimers: () => timers.length };
}

test('dormant: scheduleLifecycle and armSettleWindow do nothing (no re-apply, no timers)', () => {
  const h = harness({ active: false });
  h.rt.scheduleLifecycle('x');
  h.flushRaf();
  h.rt.armSettleWindow('x');
  assert.equal(h.reapplied.length, 0, 'dormant -> never re-applies');
  assert.equal(h.pendingTimers(), 0, 'dormant -> no settle ladder armed');
});

test('active: scheduleLifecycle coalesces per frame, many triggers give one re-apply', () => {
  const h = harness({ active: true });
  h.rt.scheduleLifecycle('a');
  h.rt.scheduleLifecycle('b');
  h.rt.scheduleLifecycle('c');
  assert.equal(h.reapplied.length, 0, 'nothing runs until the frame');
  h.flushRaf();
  assert.equal(h.reapplied.length, 1, 'coalesced to a single re-apply');
});

test('active while typing: a schedule caused by a mutation is deferred, any other reason applies', () => {
  const h = harness({ active: true, quiet: true });
  h.rt.scheduleLifecycle('dialog-shadow-mutation');
  h.flushRaf();
  assert.equal(h.reapplied.length, 0, 'mutation re-apply suppressed while typing (no-spam guard)');
  // A settle ladder rung is not a mutation reason, so it re-applies while the user types (the
  // editor must stay correctly sized).
  h.rt.scheduleLifecycle('boot-settle-220ms');
  h.flushRaf();
  assert.equal(h.reapplied.length, 1, 'non-mutation reason re-applies through the quiet window');
});

test('active while typing: a settle ladder armed by a mutation observer still fires', () => {
  // The home MutationObserver arms armSettleWindow('home-mutation-settle'); its rung reasons
  // contain 'mutation', but they must not be dropped like a direct mutation trigger, or the whole
  // ladder would be lost while the user types.
  const h = harness({ active: true, quiet: true });
  h.rt.armSettleWindow('home-mutation-settle');
  h.fireTimers();
  h.flushRaf();
  assert.ok(h.reapplied.length >= 1, 'the mutation-armed settle ladder still re-applies while typing');
  // A direct mutation trigger (not a ladder rung) is deferred while the user types.
  const d = harness({ active: true, quiet: true });
  d.rt.scheduleLifecycle('home-mutation');
  d.flushRaf();
  assert.equal(d.reapplied.length, 0, 'a direct mutation trigger still defers under the quiet window');
});

test('armSettleWindow schedules the full v17 2800ms ladder', () => {
  const h = harness({ active: true });
  h.rt.armSettleWindow('settle');
  assert.equal(h.pendingTimers(), SETTLE_LADDER_MS.length, `ladder has ${SETTLE_LADDER_MS.length} rungs`);
  assert.equal(SETTLE_LADDER_MS[SETTLE_LADDER_MS.length - 1], 2800, 'ladder reaches 2800ms');
  h.fireTimers();
  h.flushRaf();
  assert.equal(h.reapplied.length, 1, 'the rungs coalesce to a single re-apply when fired together');
});

test('onDialogOpen arms the ladder when active', () => {
  const h = harness({ active: true });
  h.rt.onDialogOpen('dialog-open');
  assert.equal(h.pendingTimers(), SETTLE_LADDER_MS.length, 'onDialogOpen arms the settle ladder');
});

test('snapshot reports the engine state', () => {
  const h = harness({ active: true });
  h.rt.scheduleLifecycle('a');
  h.flushRaf();
  const snap = h.rt.snapshot();
  assert.equal(snap.active, true);
  assert.equal(snap.applyCount, 1);
  assert.equal(typeof snap.settleArmCount, 'number');
});

test('observed roots whose host left the document are dropped while the dialog stays open', () => {
  const shadowHost = () => {
    const host = { isConnected: true, shadowRoot: null };
    host.shadowRoot = { host, querySelectorAll: () => [] };
    return host;
  };
  const first = shadowHost();
  const second = shadowHost();
  let hosts = [first];
  const dialog = { isConnected: true, shadowRoot: null };
  dialog.shadowRoot = { host: dialog, querySelectorAll: () => hosts };

  const rt = createCompanionSettleRuntime({
    globalRef: {},
    documentRef: { addEventListener() {} },
    MutationObserver: function FakeMO() { this.observe = () => {}; this.disconnect = () => {}; },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    isActive: () => true,
    scheduleReapply: () => {},
    editDialogPresent: () => true,
    activeDialog: () => dialog,
    homeRoot: () => null,
    shadowHostSelector: 'ha-code-editor',
  });

  rt.onDialogOpen('open');
  assert.equal(rt.snapshot().observedRoots, 2, 'dialog root + the first editor root');

  // The editor is re-created inside the same dialog (visual/code toggle, sub-card switch).
  first.isConnected = false;
  hosts = [second];
  rt.onDialogOpen('editor-swap');
  assert.equal(rt.snapshot().observedRoots, 2, 'the detached editor root is no longer referenced');
});
