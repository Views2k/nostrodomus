import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAST_ERROR_CURRENT_MS,
  health,
  providerSummary,
  runtimeSummary,
} from '../../src/diagnostics/diagnosticsHealth.js';

test('runtimeSummary counts each runtime cache list and reports the cache age', () => {
  const summary = runtimeSummary({
    runtimeCache: {
      hasHass: true,
      at: 100,
      entities: ['light.a', 'sensor.b'],
      services: ['light.turn_on'],
      themes: ['default'],
      cards: ['custom:button-card'],
      icons: ['mdi:lightbulb'],
      actions: ['more-info'],
    },
  }, { nowMs: 250 });

  assert.deepEqual(summary, {
    hasHass: true,
    ageMs: 150,
    entities: 2,
    services: 1,
    themes: 1,
    cards: 1,
    icons: 1,
    iconSets: 0,
    iconSetIcons: 0,
    actions: 1,
    customCards: 1,
    serviceFieldServices: 0,
  });
});

test('providerSummary lists the calls, last count and last time of each provider, with 0 for missing stats', () => {
  const summary = providerSummary({
    providers: [{ id: 'snippet' }, { id: 'runtime' }],
    providerStats: {
      snippet: { calls: 3, lastCount: 9, lastMs: 4.5 },
      runtime: { skipped: true },
    },
  });

  assert.deepEqual(summary, [
    { id: 'snippet', calls: 3, lastCount: 9, lastMs: 4.5 },
    { id: 'runtime', calls: 0, lastCount: 0, lastMs: 0 },
  ]);
});

test('health creates the current contextual warning health report shape', () => {
  const report = health({
    enabled: true,
    installedAt: 'install-time',
    library: { sources: [] },
    index: { byLang: {} },
    providers: [{ id: 'snippet' }],
    runtimeCache: { hasHass: false },
    completionCache: new Map([[1, 1]]),
    lastError: null,
  }, {
    apiInstalled: true,
    editorDetected: false,
    editDialogActive: false,
    editorScoped: false,
    maxCacheEntries: 10,
    version: 'test-version',
    checkedAt: 'checked-time',
    performanceTelemetry: { enabled: true },
    performanceStats: { budget: { warnings: ['slow-style'] } },
  });

  assert.equal(report.ok, true);
  assert.equal(report.status, 'warning');
  assert.equal(report.requiredOk, true);
  assert.equal(report.warningCount, 5);
  assert.equal(report.version, 'test-version');
  assert.equal(report.installedAt, 'install-time');
  assert.equal(report.checkedAt, 'checked-time');
  assert.equal(report.checks.find(c => c.name === 'api-installed')?.status, 'ok');
  assert.equal(report.checks.find(c => c.name === 'runtime-hass')?.severity, 'contextual');
  assert.deepEqual(report.performanceTelemetry, { enabled: true });
});

test('health fails required checks and bounds cache entries through injected limit', () => {
  const report = health({
    enabled: false,
    providers: [],
    completionCache: new Map([[1, 1], [2, 2]]),
    runtimeCache: { hasHass: true },
    lastError: new Error('boom'),
  }, {
    apiInstalled: false,
    editorDetected: true,
    editDialogActive: true,
    editorScoped: true,
    maxCacheEntries: 1,
    performanceStats: { budget: { warnings: [] } },
  });

  assert.equal(report.ok, false);
  assert.equal(report.status, 'error');
  assert.equal(report.checks.find(c => c.name === 'engine-enabled')?.status, 'fail');
  assert.equal(report.checks.find(c => c.name === 'cache-bounded')?.detail, '2 cache entries');
});

test('health counts a missing critical selector-seam as a contextual warning', () => {
  const base = {
    enabled: true, installedAt: 'i', library: { sources: [] }, index: { byLang: {} },
    providers: [{ id: 'snippet' }], runtimeCache: { hasHass: true },
    completionCache: new Map(), lastError: null,
  };
  const opts = { apiInstalled: true, editorDetected: true, editDialogActive: true, editorScoped: true, maxCacheEntries: 10 };
  // No seam probe yet -> the contextual check is deferred-ok.
  const noProbe = health({ ...base, selectorSeamStatus: { probeCount: 0, missingCritical: [] } }, opts);
  // A probe that found a missing critical seam -> the check fails and must be counted in the aggregate.
  const degraded = health({ ...base, selectorSeamStatus: { probeCount: 3, coverage: 80, missingCritical: ['ha-code-editor'] } }, opts);
  const seam = degraded.checks.find(c => c.name === 'selector-seam-coverage');
  assert.equal(seam.severity, 'contextual');
  assert.equal(seam.ok, false, 'missing critical seam fails the check');
  assert.equal(seam.status, 'warning');
  assert.ok(degraded.warningCount > noProbe.warningCount, 'the seam warning is counted');
  assert.equal(degraded.status, 'warning', 'aggregate status reflects the warning');
});

test('a recorded error fails health while it is current and becomes a warning once it is old', () => {
  const nowMs = Date.parse('2026-01-01T12:00:00.000Z');
  const base = {
    enabled: true, installedAt: 'i', library: { sources: [] }, index: { byLang: {} },
    providers: [{ id: 'snippet' }], runtimeCache: { hasHass: true },
    completionCache: new Map(),
  };
  const opts = { apiInstalled: true, editorDetected: true, editDialogActive: true, editorScoped: true, maxCacheEntries: 10, nowMs };
  const errorAt = ms => ({ at: new Date(nowMs - ms).toISOString(), scope: 'diagnostics:clipboard-write', message: 'write denied' });

  const recent = health({ ...base, lastError: errorAt(30 * 1000) }, opts);
  const recentCheck = recent.checks.find(c => c.name === 'no-last-error');
  assert.equal(recent.ok, false, 'an error from 30 s ago is a current failure');
  assert.equal(recent.status, 'error');
  assert.equal(recentCheck.status, 'fail');
  assert.equal(recentCheck.detail, 'write denied');

  const edge = health({ ...base, lastError: errorAt(LAST_ERROR_CURRENT_MS) }, opts);
  assert.equal(edge.ok, false, 'the window is inclusive');

  const old = health({ ...base, lastError: errorAt(LAST_ERROR_CURRENT_MS + 60 * 1000) }, opts);
  const oldCheck = old.checks.find(c => c.name === 'no-last-error');
  assert.equal(old.ok, true, 'an old error does not fail the session');
  assert.equal(old.requiredOk, true);
  assert.equal(old.status, 'warning', 'an old error is still reported');
  assert.equal(old.warningCount, 1);
  assert.equal(oldCheck.ok, false);
  assert.equal(oldCheck.status, 'warning');
  assert.equal(oldCheck.detail, 'write denied (6 min ago)');

  // No usable time: the age cannot be judged, so the error counts as current.
  const untimed = health({ ...base, lastError: new Error('boom') }, opts);
  assert.equal(untimed.ok, false);
  assert.equal(untimed.checks.find(c => c.name === 'no-last-error').status, 'fail');

  const numeric = health({ ...base, lastError: { at: nowMs - LAST_ERROR_CURRENT_MS - 1, message: 'old' } }, opts);
  assert.equal(numeric.ok, true, 'a numeric time is read as well');

  const none = health({ ...base, lastError: null }, opts);
  assert.equal(none.status, 'ok');
  assert.equal(none.checks.find(c => c.name === 'no-last-error').detail, 'no recorded error');
});
