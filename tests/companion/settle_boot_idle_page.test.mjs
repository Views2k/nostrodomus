import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompanionSettleRuntime, SETTLE_LADDER_MS } from '../../src/companion/companionSettleRuntime.js';

// Every page load armed the thirteen rung boot ladder, and every rung ran a style pass: editor
// discovery over the page and the cleanup walks that follow when none is found. The ladder is
// there for an editor that mounts after the page loads (an automation opened by its address). On
// a dashboard with no card dialog and no editor there is nothing for those passes to find.

function harness({ pathname, dialogPresent = false, editorKnown = false } = {}) {
  const env = { dialogPresent, editorKnown, dialogWatches: 0 };
  let frames = [];
  let timers = [];
  let seq = 1;
  const reapplied = [];
  const globalRef = pathname === undefined ? {} : { location: { pathname } };
  const rt = createCompanionSettleRuntime({
    globalRef,
    documentRef: { addEventListener() {} },
    MutationObserver: function FakeObserver(cb) { this.cb = cb; this.observe = () => {}; this.disconnect = () => {}; },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { const id = seq++; timers.push({ id, fn, ms }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
    isActive: () => true,
    scheduleReapply: (reason) => reapplied.push(reason),
    editDialogPresent: () => env.dialogPresent,
    editDialogElements: () => { env.dialogWatches += 1; return []; },
    editorKnown: () => env.editorKnown,
    activeDialog: () => null,
    homeRoot: () => ({}),
  });
  const flushFrames = () => { const run = frames; frames = []; run.forEach((fn) => fn()); };
  // Fire the pending timers one rung at a time, in ladder order, each followed by its frame.
  const fireRungs = (count = Infinity) => {
    let fired = 0;
    while (timers.length && fired < count) {
      timers.sort((a, b) => a.ms - b.ms);
      const next = timers.shift();
      next.fn();
      flushFrames();
      fired += 1;
    }
    return fired;
  };
  return { rt, env, reapplied, flushFrames, fireRungs, pendingTimers: () => timers.length };
}

test('on a dashboard with no dialog and no editor the boot rungs run no style pass', () => {
  const h = harness({ pathname: '/lovelace/home' });
  assert.equal(h.rt.boot('install'), true);
  h.flushFrames();
  assert.deepEqual(h.reapplied, ['companion-settle-install'], 'the one pass at boot stays');
  assert.equal(h.pendingTimers(), SETTLE_LADDER_MS.length, 'the ladder is still armed');
  const watchesBefore = h.env.dialogWatches;
  assert.equal(h.fireRungs(), SETTLE_LADDER_MS.length);
  assert.deepEqual(h.reapplied, ['companion-settle-install'], 'no style pass from the rungs');
  assert.equal(h.rt.snapshot().bootIdleSkips, SETTLE_LADDER_MS.length);
  assert.equal(h.env.dialogWatches - watchesBefore, SETTLE_LADDER_MS.length, 'each rung still looks for a dialog element to watch');
});

test('a card dialog opened during the ladder is styled by the rungs that follow, as before', () => {
  const h = harness({ pathname: '/lovelace/home' });
  h.rt.boot('install');
  h.flushFrames();
  const before = SETTLE_LADDER_MS.filter((ms) => ms <= 780).length; // the rungs up to 780ms find nothing
  h.fireRungs(before);
  assert.equal(h.reapplied.length, 1);
  h.env.dialogPresent = true; // the user opens a card editor about one second after load
  h.fireRungs();
  const rungPasses = h.reapplied.slice(1);
  assert.deepEqual(rungPasses, ['1100', '1500', '2100', '2800'].map((ms) => `companion-settle-boot-settle-${ms}ms`), 'every later rung runs its pass at its own time');
});

test('an editor that becomes known during the ladder gets the remaining rungs', () => {
  const h = harness({ pathname: '/lovelace/home' });
  h.rt.boot('install');
  h.flushFrames();
  h.fireRungs(SETTLE_LADDER_MS.length - 2);
  h.env.editorKnown = true;
  h.fireRungs();
  assert.equal(h.reapplied.length, 3, 'the boot pass and the last two rungs');
});

test('on a Settings or Developer Tools page every boot rung runs its pass', () => {
  for (const pathname of ['/config/automation/edit/1700000000000', '/config/script/edit/morning', '/developer-tools/template', '/config/tools/template', '/config/dashboard']) {
    const h = harness({ pathname });
    h.rt.boot('install');
    h.flushFrames();
    h.fireRungs();
    assert.equal(h.reapplied.length, 1 + SETTLE_LADDER_MS.length, pathname);
    assert.equal(h.rt.snapshot().bootIdleSkips, 0, pathname);
  }
});

test('a page whose address cannot be read keeps every boot rung', () => {
  const h = harness({ pathname: undefined });
  h.rt.boot('install');
  h.flushFrames();
  h.fireRungs();
  assert.equal(h.reapplied.length, 1 + SETTLE_LADDER_MS.length);
});

test('the other ladders are not affected: a ladder armed on a dashboard runs every rung', () => {
  const h = harness({ pathname: '/lovelace/home' });
  h.rt.armSettleWindow('dialog-state-settle');
  h.fireRungs();
  assert.equal(h.reapplied.length, SETTLE_LADDER_MS.length);
  assert.equal(h.rt.snapshot().bootIdleSkips, 0);
});
