import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installRuntimeCoordinator } from '../../src/core/runtimeCoordinator.js';
import { unregisterRuntimeFromCoordinator } from '../../src/companion/coordinatorRuntime.js';

// What an uninstall must clean up besides the observers and styles: the timer of a pending
// frecency write (which would still write), pending frames of a settings slider, the popup's host
// layer in the editor's root, and the registration of this runtime in the shared coordinator.

// app.js is a composition root that cannot be run per test (precedent:
// tests/core/app_lifecycle_wiring.test.mjs), so its wiring is read from the source.
const main = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lifecycle = main.slice(main.indexOf('    lifecycle: {'), main.indexOf('  // Boot-cost probe: split the main-thread cost'));

// The frecency write block of main, run with stand-ins for what it reads from the composition root.
function frecencyBlock({ frecency = true } = {}) {
  const start = main.indexOf('  let frecencyFlushTimer = 0;');
  const endMarker = '"frecency-write-pagehide-flush");';
  const end = main.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, 'the frecency write block is found in app.js');
  const body = `${main.slice(start, end + endMarker.length)}\n  return { scheduleFrecencyWrite, flushPendingFrecencyWrite };`;
  const env = { writes: [], timers: new Map(), cleared: [], listeners: [], seq: 0 };
  const api = new Function(
    'state', 'setTimeout', 'clearTimeout', 'frecencyStorage', 'DEFAULT_RECENT_ACCEPT_STORE', 'FRECENCY_WRITE_KEY', 'recordRuntimeErrorOnce', 'addPersistentListener', 'W',
    body,
  )(
    { settings: { completions: { frecency } } },
    (fn, ms) => { env.seq += 1; env.timers.set(env.seq, { fn, ms }); return env.seq; },
    (id) => { env.cleared.push(id); env.timers.delete(id); },
    () => ({ setItem: (key, value) => env.writes.push([key, value]) }),
    { snapshot: () => ({ v: 1, entries: [['light.kitchen', 3]] }) },
    'frecency-key',
    () => {},
    (target, type, handler, options, reason) => env.listeners.push({ target, type, handler, reason }),
    'window',
  );
  const fireTimers = () => { for (const [id, timer] of Array.from(env.timers)) { env.timers.delete(id); timer.fn(); } };
  return { ...api, env, fireTimers };
}

test('a pending frecency write is made at once by the flush, and its timer is gone', () => {
  const f = frecencyBlock();
  f.scheduleFrecencyWrite();
  assert.equal(f.env.timers.size, 1, 'the write waits 1.5 s');
  assert.deepEqual(f.env.writes, []);
  f.flushPendingFrecencyWrite();
  assert.equal(f.env.writes.length, 1, 'written by the flush');
  assert.equal(f.env.writes[0][0], 'frecency-key');
  assert.equal(f.env.timers.size, 0, 'no timer outlives the flush');
  f.fireTimers();
  f.flushPendingFrecencyWrite();
  assert.equal(f.env.writes.length, 1, 'and it is written once');
});

test('the flush does nothing without a pending write, after the timer ran, or with frecency off', () => {
  const idle = frecencyBlock();
  idle.flushPendingFrecencyWrite();
  assert.deepEqual(idle.env.writes, []);

  const ran = frecencyBlock();
  ran.scheduleFrecencyWrite();
  ran.fireTimers();
  assert.equal(ran.env.writes.length, 1);
  ran.flushPendingFrecencyWrite();
  assert.equal(ran.env.writes.length, 1, 'no second write');

  const off = frecencyBlock({ frecency: false });
  off.scheduleFrecencyWrite();
  off.flushPendingFrecencyWrite();
  assert.deepEqual(off.env.writes, []);
  assert.equal(off.env.timers.size, 0);
});

test('the pending frecency write is flushed on pagehide and on uninstall', () => {
  const f = frecencyBlock();
  assert.deepEqual(f.env.listeners.map((l) => [l.target, l.type, l.reason]), [['window', 'pagehide', 'frecency-write-pagehide-flush']]);
  f.scheduleFrecencyWrite();
  f.env.listeners[0].handler({ type: 'pagehide' });
  assert.equal(f.env.writes.length, 1, 'the page going away writes it');

  const settle = lifecycle.slice(lifecycle.indexOf('settlePendingTimers: () => {'), lifecycle.indexOf('companionScrollbarTeardown'));
  assert.ok(settle.includes('flushPendingFrecencyWrite();'), 'uninstall flushes it');
  assert.ok(main.indexOf('persistentListenersRuntime = createPersistentListenersRuntime(') < main.indexOf('"frecency-write-pagehide-flush"'), 'the listener registry exists first');
});

test('uninstall cancels the pending frames of a settings slider', () => {
  const settle = lifecycle.slice(lifecycle.indexOf('settlePendingTimers: () => {'), lifecycle.indexOf('companionScrollbarTeardown'));
  assert.match(settle, /for \(const frame of \["settingsRangeLivePreviewRaf", "settingsRangeValueLabelRaf"\]\) \{/);
  assert.match(settle, /cancelAnimationFrame\(state\[frame\]\);[^\n]*\n\s+state\[frame\] = 0;/);
  // The two handles are the ones the settings interaction owner schedules.
  const interaction = readFileSync(new URL('../../src/ui/settingsInteractionRuntime.js', import.meta.url), 'utf8');
  assert.ok(interaction.includes('state.settingsRangeLivePreviewRaf = requestAnimationFrame('));
  assert.ok(interaction.includes('state.settingsRangeValueLabelRaf = requestAnimationFrame('));
});

test('uninstall removes the popup host layer and clears the styled roots of every owned node', () => {
  assert.match(lifecycle, /removeOverlay: \(\) => \{\s+const hostLayer = state\.overlayRoot;\s+removeOverlay\(\);\s+try \{ if \(hostLayer\?\.id === "nostrodomus-cm-root-overlay-host"\) hostLayer\.remove\(\); \}/);
  assert.ok(lifecycle.includes('removeCodeboxRootStylesFromAllRoots: (reason) => removeCodeboxRootStylesFromAllRoots(reason, { everyOwnedNode: true }),'));
  // state.overlayRoot is the host layer the popup was put in.
  const popup = readFileSync(new URL('../../src/completion/popupRuntime.js', import.meta.url), 'utf8');
  assert.ok(popup.includes('state.overlayRoot = root;'));
});

test('uninstall takes the runtime out of the shared coordinator', () => {
  assert.match(lifecycle, /companionInputQuietCleanup: \(\) => \{\s+companionInputQuietRuntime\.cleanup\(\);\s+unregisterRuntimeFromCoordinator\(\{ globalRef: W \}\);/);

  const g = {};
  const coordinator = installRuntimeCoordinator(g, { id: 'main-completion-runtime', role: 'completion-runtime' });
  coordinator.register({ id: 'picker-safe', role: 'picker-companion-runtime' });
  assert.equal(coordinator.snapshot().runtimes.length, 2);

  assert.equal(unregisterRuntimeFromCoordinator({ globalRef: g }), true);
  const after = coordinator.snapshot();
  assert.deepEqual(after.runtimes.map((r) => r.id), ['picker-safe'], 'only this runtime is removed');
  assert.equal(after.counters.registered, 1);
  assert.equal(g.__nostrodomusRuntimeCoordinatorV1, coordinator, 'the coordinator stays for the other runtimes');

  assert.equal(unregisterRuntimeFromCoordinator({ globalRef: g }), false, 'nothing left to remove');
  assert.equal(unregisterRuntimeFromCoordinator({ globalRef: {} }), false, 'no coordinator');

  // A later install registers again.
  installRuntimeCoordinator(g, { id: 'main-completion-runtime', role: 'completion-runtime' });
  assert.equal(coordinator.snapshot().runtimes.length, 2);
});
