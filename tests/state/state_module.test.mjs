import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeState } from '../../src/core/state.js';

test('createRuntimeState injects runtime version, settings, and timestamps', () => {
  const settings = { mode: 'both', nested: { ok: true } };
  const state = createRuntimeState({
    version: 'nostrodomus-test-version',
    settings,
    now: () => 12345,
    isoNow: () => '2026-05-30T00:00:00.000Z',
  });

  assert.equal(state.installed, true);
  assert.equal(state.enabled, true);
  assert.equal(state.version, 'nostrodomus-test-version');
  assert.equal(state.installedAt, '2026-05-30T00:00:00.000Z');
  assert.equal(state.settings, settings);
  assert.equal(state.performanceTelemetry.startedAt, 12345);
});

test('createRuntimeState preserves mutable collection and cache shape', () => {
  const a = createRuntimeState({ settings: {} });
  const b = createRuntimeState({ settings: {} });

  assert.ok(a.completionCache instanceof Map);
  assert.ok(a.editorSentinelObservers instanceof Map);
  assert.ok(a.diagnosticsPendingReasons instanceof Set);
  assert.ok(a.editorSentinelProbeTimers instanceof Set);
  assert.ok(a.initialSyntaxGateObservedRoots instanceof WeakSet);
  assert.ok(Array.isArray(a.runtimeErrors));
  assert.deepEqual(a.runtimeCache.entities, []);
  assert.deepEqual(a.items, []);
  assert.equal(a.codeboxStyleCacheInvalidated, true);
  assert.equal(a.idleReason, 'Click inside the editor, then start typing or press Ctrl+Space.');

  a.completionCache.set('x', 1);
  a.runtimeErrors.push({ message: 'x' });
  a.diagnosticsPendingReasons.add('x');

  assert.equal(b.completionCache.size, 0);
  assert.equal(b.runtimeErrors.length, 0);
  assert.equal(b.diagnosticsPendingReasons.size, 0);
});

test('createRuntimeState initializes object-map counters without prototype leakage', () => {
  const state = createRuntimeState({ settings: {} });
  assert.equal(Object.getPrototypeOf(state.runtimeErrorStats.byScope), null);
  assert.equal(Object.getPrototypeOf(state.diagnosticsStats.dirtyReasons), null);
  assert.equal(Object.getPrototypeOf(state.performanceTelemetry.events), null);
  assert.deepEqual(state.providerStats, {});
  assert.deepEqual(state.providers, []);
});
