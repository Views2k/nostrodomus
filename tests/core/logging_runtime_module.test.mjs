import test from 'node:test';
import assert from 'node:assert/strict';

import { createLoggingRuntime } from '../../src/core/loggingRuntime.js';

test('logging runtime gates debug logs and emits startup badge once per version', () => {
  const storage = new Map([['nostrodomusDebug', '1']]);
  const W = { localStorage: { getItem: key => storage.get(key) || null } };
  const calls = { debug: [], info: [], warn: [], error: [] };
  const original = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  console.debug = (...args) => calls.debug.push(args);
  console.info = (...args) => calls.info.push(args);
  console.warn = (...args) => calls.warn.push(args);
  console.error = (...args) => calls.error.push(args);
  try {
    const runtime = createLoggingRuntime({
      W,
      health: () => ({ ok: true }),
      startupBadgeStatusFromHealth: () => 'ready',
    });
    assert.equal(runtime.debugLoggingEnabled(), true);
    runtime.logDebug('hello');
    runtime.logInfoOnce('same', 'info');
    runtime.logInfoOnce('same', 'info again');
    runtime.logWarnOnce('warn', 'warn once');
    runtime.logWarnOnce('warn', 'warn twice');
    runtime.logErrorOnce('err', 'error once');
    runtime.emitStartupBadge();
    runtime.emitStartupBadge();

    assert.equal(calls.debug.length, 1);
    assert.equal(calls.info.length, 2);
    assert.equal(calls.warn.length, 1);
    assert.equal(calls.error.length, 1);
    assert.equal(W.__nostrodomus?.startupBadgeShown?.startsWith('nostrodomus-v'), true);
  } finally {
    console.debug = original.debug;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  }
});

test('logging runtime caches perf mode briefly and normalizes unsupported values', () => {
  let value = 'legacy';
  const W = { localStorage: { getItem: key => (key === 'nostrodomusPerf' ? value : null) } };
  const runtime = createLoggingRuntime({ W, health: () => null, startupBadgeStatusFromHealth: () => 'ready' });

  assert.equal(runtime.nostrodomusPerfMode(), 'legacy');
  value = 'bad';
  assert.equal(runtime.nostrodomusPerfMode(), 'legacy');
});

// --- appended: startup badge reads health lazily; the debugMode setting turns logging on ---
function captureConsole(run) {
  const calls = { debug: [], info: [], warn: [], error: [] };
  const original = { debug: console.debug, info: console.info, warn: console.warn, error: console.error };
  for (const level of Object.keys(calls)) console[level] = (...args) => calls[level].push(args);
  try { run(calls); } finally { Object.assign(console, original); }
  return calls;
}

test('startup badge reports degraded when the health reader says so', async () => {
  const { startupBadgeStatusFromHealth } = await import('../../src/diagnostics/diagnosticsReadoutHelpers.js');
  let reads = 0;
  const degraded = captureConsole(() => {
    createLoggingRuntime({ W: {}, health: () => { reads += 1; return { ok: false, requiredOk: false }; }, startupBadgeStatusFromHealth }).emitStartupBadge();
  });
  assert.equal(reads, 1, 'health is read once, by the badge helper');
  assert.equal(degraded.info.length, 0);
  assert.equal(degraded.warn.length, 1);
  assert.match(String(degraded.warn[0][0]), /degraded$/);

  const ready = captureConsole(() => {
    createLoggingRuntime({ W: {}, health: () => ({ ok: true, requiredOk: true }), startupBadgeStatusFromHealth }).emitStartupBadge();
  });
  assert.equal(ready.warn.length, 0);
  assert.match(String(ready.info[0][0]), /ready$/);

  const thrown = captureConsole(() => {
    createLoggingRuntime({ W: {}, health: () => { throw new Error('boom'); }, startupBadgeStatusFromHealth }).emitStartupBadge();
  });
  assert.match(String(thrown.warn[0][0]), /degraded$/);
});

test('the debugMode setting enables debug logging without the localStorage flag', () => {
  const W = { localStorage: { getItem: () => null } };
  let debugMode = false;
  const runtime = createLoggingRuntime({ W, debugModeEnabled: () => debugMode });
  const calls = captureConsole(() => {
    assert.equal(runtime.debugLoggingEnabled(), false);
    runtime.logDebug('off');
    debugMode = true;
    assert.equal(runtime.debugLoggingEnabled(), true);
    runtime.logDebug('on');
    runtime.logWarnOnce('w', 'warn');
    debugMode = false;
    runtime.logDebug('off again');
  });
  assert.equal(calls.debug.length, 1);
  assert.equal(calls.debug[0][1], 'on');
  assert.equal(calls.warn.length, 1);

  const throwing = createLoggingRuntime({ W, debugModeEnabled: () => { throw new ReferenceError('state not ready'); } });
  assert.equal(throwing.debugLoggingEnabled(), false, 'a reader that throws (state not created yet) reads as off');
});

// --- appended: the debug flag is read from storage at most once a second ---
test('the debug flag is cached for a second and re-read on a storage event', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let value = null;
  let reads = 0;
  const W = { localStorage: { getItem: key => { if (key === 'nostrodomusDebug') reads += 1; return key === 'nostrodomusDebug' ? value : null; } } };
  const runtime = createLoggingRuntime({ W });

  for (let i = 0; i < 50; i += 1) assert.equal(runtime.debugLoggingEnabled(), false);
  assert.equal(reads, 1, 'fifty calls inside a second read storage once');

  // Set from the browser console: no event reaches this tab, the next read is at most a second away.
  value = '1';
  t.mock.timers.tick(999);
  assert.equal(runtime.debugLoggingEnabled(), false);
  t.mock.timers.tick(1);
  assert.equal(runtime.debugLoggingEnabled(), true, 'a console change applies within a second');
  assert.equal(reads, 2);

  // Changed in another tab: the storage event drops the cached value at once.
  value = null;
  runtime.refreshStorageFlags({ key: 'unrelated' });
  assert.equal(runtime.debugLoggingEnabled(), true, 'an unrelated key keeps the cache');
  runtime.refreshStorageFlags({ key: 'nostrodomusDebug' });
  assert.equal(runtime.debugLoggingEnabled(), false);
  assert.equal(reads, 3);

  // localStorage.clear() in another tab arrives with a null key.
  value = '1';
  runtime.refreshStorageFlags({ key: null });
  assert.equal(runtime.debugLoggingEnabled(), true);
});

test('a storage event also drops the cached perf mode', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let value = 'legacy';
  const W = { localStorage: { getItem: key => (key === 'nostrodomusPerf' ? value : null) } };
  const runtime = createLoggingRuntime({ W });
  assert.equal(runtime.nostrodomusPerfMode(), 'legacy');
  value = 'on';
  assert.equal(runtime.nostrodomusPerfMode(), 'legacy');
  runtime.refreshStorageFlags({ key: 'nostrodomusPerf' });
  assert.equal(runtime.nostrodomusPerfMode(), 'on');
});

test('the debugMode setting is read live, with the storage flag cached', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let debugMode = false;
  const runtime = createLoggingRuntime({ W: { localStorage: { getItem: () => null } }, debugModeEnabled: () => debugMode });
  assert.equal(runtime.debugLoggingEnabled(), false);
  debugMode = true;
  assert.equal(runtime.debugLoggingEnabled(), true, 'the checkbox applies on the next call, without waiting for the cache');
});
