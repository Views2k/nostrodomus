import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeErrorRuntime } from '../../src/diagnostics/runtimeErrorRuntime.js';

test('runtime error runtime records bounded errors and one-shot duplicates', () => {
  const state = {};
  const warnings = [];
  const runtime = createRuntimeErrorRuntime({
    state,
    logWarnOnce: (...args) => warnings.push(args),
  });

  const first = runtime.recordRuntimeError('scope:test', new TypeError('boom'), { phase: 'unit' });
  assert.equal(first.scope, 'scope:test');
  assert.equal(first.name, 'TypeError');
  assert.equal(state.runtimeErrorStats.total, 1);
  assert.equal(state.runtimeErrorStats.byScope['scope:test'], 1);
  assert.equal(warnings.length, 1);

  const onceA = runtime.recordRuntimeErrorOnce('scope:once', new Error('same'), { phase: 'a' });
  const onceB = runtime.recordRuntimeErrorOnce('scope:once', new Error('same'), { phase: 'b' });
  assert.ok(onceA);
  assert.equal(onceB, null);
  assert.equal(state.runtimeErrorStats.total, 2);

  const readout = runtime.runtimeErrorReadout(true);
  assert.equal(readout.ok, true);
  assert.equal(readout.debugEnabled, true);
  assert.equal(readout.items.length, 2);
});

test('recordRuntimeErrorOnce FIFO-bounds its dedup set at 500 keys (audit QW7)', () => {
  const runtime = createRuntimeErrorRuntime({ state: {}, logWarnOnce: () => {} });
  // The once-key embeds the (variable) error message, so a long session could otherwise grow the
  // dedup set without limit. Fill it to exactly the cap with distinct messages.
  for (let i = 0; i < 500; i += 1) {
    assert.ok(runtime.recordRuntimeErrorOnce('scope:bound', new Error(`e${i}`)), `first sighting e${i} must record`);
  }
  // At capacity, a recent key is still deduped and the very first key has not been evicted yet.
  assert.equal(runtime.recordRuntimeErrorOnce('scope:bound', new Error('e499')), null, 'recent key stays deduped');
  assert.equal(runtime.recordRuntimeErrorOnce('scope:bound', new Error('e0')), null, 'oldest still present at exactly cap');
  // One more distinct key pushes past the cap and evicts the oldest (e0) FIFO...
  assert.ok(runtime.recordRuntimeErrorOnce('scope:bound', new Error('e500')), 'new key records');
  assert.ok(runtime.recordRuntimeErrorOnce('scope:bound', new Error('e0')), 'evicted oldest re-records (set is bounded, not leaking)');
  // ...while a key that is still within the window remains deduped.
  assert.equal(runtime.recordRuntimeErrorOnce('scope:bound', new Error('e500')), null, 'in-window key stays deduped');
});

test('runtime error runtime clears state and returns diagnostics fallback payload', () => {
  const state = {};
  const runtime = createRuntimeErrorRuntime({ state, logWarnOnce: () => {} });

  const payload = runtime.diagnosticsRuntimeErrorFallback('diagnostics:test', new Error('fallback failed'), { phase: 'unit' }, { fallback: true });
  assert.equal(payload.ok, false);
  assert.equal(payload.fallback, true);
  assert.match(payload.error, /fallback failed/);
  assert.equal(state.runtimeErrorStats.total, 1);

  const clearReadout = runtime.clearRuntimeErrors();
  assert.equal(clearReadout.ok, true);
  assert.equal(clearReadout.items.length, 0);
  assert.equal(state.runtimeErrorStats.total, 0);
  assert.equal(state.lastError, null);
});
