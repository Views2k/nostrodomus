import test from 'node:test';
import assert from 'node:assert/strict';

import { createPerformanceTelemetryRuntime } from '../../src/diagnostics/performanceTelemetryRuntime.js';
import {
  measurePerformanceEventWithCallbacks,
  shouldRecordPerformanceTelemetryDecision,
} from '../../src/diagnostics/diagnosticsFastLaneHelpers.js';
import {
  diagnosticEventMetric,
  evaluatePerformanceBudgets,
  roundPerformanceMetric,
} from '../../src/diagnostics/performanceMetrics.js';

// A settings panel with the two sections whose visibility opens the telemetry gate. It counts
// selector lookups so a test can tell a per-call query from a per-panel one.
function fakePanel(activeSection = '') {
  const section = name => ({
    dataset: { section: name },
    active: name === activeSection,
    classList: { contains(cls) { return cls === 'active' && this.owner.active; }, owner: null },
  });
  const sections = ['general', 'context', 'diagnostics'].map(section);
  for (const item of sections) item.classList.owner = item;
  const wanted = selector => sections.filter(item => selector.includes(`[data-section="${item.dataset.section}"]`));
  const panel = {
    isConnected: true,
    lookups: 0,
    sections,
    activate(name) { for (const item of sections) item.active = item.dataset.section === name; },
    querySelector(selector) {
      panel.lookups += 1;
      return wanted(selector).find(item => !selector.includes('.active') || item.active) || null;
    },
    querySelectorAll(selector) {
      panel.lookups += 1;
      return wanted(selector).filter(item => !selector.includes('.active') || item.active);
    },
  };
  return panel;
}

function createHarness(overrides = {}) {
  const flags = { perfMode: 'on', debug: false };
  const calls = [];
  const state = {
    settingsPanel: null,
    performanceTelemetry: { startedAt: Date.now(), events: Object.create(null), recent: [] },
    ...overrides.state,
  };
  const timerClear = name => (reason) => { calls.push([name, reason]); };
  const runtime = createPerformanceTelemetryRuntime({
    state,
    shouldQuietEditorDispatchTelemetryEvent: () => false,
    quietEditorDispatchTelemetryEvent: () => null,
    nostrodomusPerfMode: () => flags.perfMode,
    debugLoggingEnabled: () => flags.debug,
    shouldRecordPerformanceTelemetryDecision,
    measurePerformanceEventWithCallbacks,
    evaluatePerformanceBudgets,
    roundPerformanceMetric,
    diagnosticEventMetric,
    clearSettingsFeedbackTimers: timerClear('clearSettingsFeedbackTimers'),
    clearSettingsInteractionRestoreTimers: timerClear('clearSettingsInteractionRestoreTimers'),
    clearPreservedScrollRestoreTimers: timerClear('clearPreservedScrollRestoreTimers'),
    clearCodeboxExternalFrameSettleTimers: timerClear('clearCodeboxExternalFrameSettleTimers'),
    activeContextDiagnosticsSection: () => null,
    clientCapabilitySnapshot: () => ({}),
    observerLifecycleReadout: () => ({}),
    observerLifecycleCloseBindingReadiness: () => ({}),
    observerLifecycleCloseDryRunReadout: () => ({}),
    observerLifecycleCloseDryRunListenerReadout: () => ({}),
    editorLikelyOpeningWithoutMountedCodebox: () => false,
    looksLikeView: () => false,
    isViewAllowed: () => false,
    ...overrides.deps,
  });
  return { state, flags, calls, runtime };
}

test('the telemetry gate looks the panel sections up once per panel, not on every call', () => {
  const { state, runtime } = createHarness();
  const panel = fakePanel('general');
  state.settingsPanel = panel;

  for (let i = 0; i < 200; i += 1) runtime.recordPerformanceEvent('observer-callback', 0, 'x');
  assert.equal(panel.lookups, 1, '200 gated calls with Settings open query the panel once');
  assert.equal(state.performanceTelemetry.events['observer-callback'], undefined, 'General tab: nothing is recorded');
  assert.equal(state.performanceTelemetrySuppressedTotal, 200);
});

test('a tab switch, a closed panel and a new panel change the gate on the next call', () => {
  const { state, runtime } = createHarness();
  const panel = fakePanel('general');
  state.settingsPanel = panel;
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), false);

  panel.activate('diagnostics');
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), true, 'Diagnostics tab opens the gate at once');
  panel.activate('context');
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), true, 'Context tab keeps it open');
  panel.activate('general');
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), false);
  assert.equal(panel.lookups, 1);

  panel.activate('diagnostics');
  panel.isConnected = false;
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), false, 'a panel removed from the page closes the gate');
  state.settingsPanel = null;
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), false);

  const reopened = fakePanel('context');
  state.settingsPanel = reopened;
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), true, 'a rebuilt panel is looked up again');
  assert.equal(reopened.lookups, 1);
  assert.equal(runtime.performanceTelemetryDiagnosticsActive(), true);
});

test('legacy perf mode and debug logging open the gate without touching the panel', () => {
  const { state, flags, runtime } = createHarness();
  const panel = fakePanel('general');
  state.settingsPanel = panel;
  flags.perfMode = 'legacy';
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), true);
  flags.perfMode = 'on';
  flags.debug = true;
  assert.equal(runtime.shouldRecordPerformanceTelemetry('compute'), true);
  assert.equal(panel.lookups, 0);
  assert.equal(runtime.shouldRecordPerformanceTelemetry(''), false, 'an unnamed event is never recorded');
});

// --- rates are per minute of recording, not per minute of session ---
const MINUTE = 60 * 1000;

test('gated telemetry divides counts by the time the gate was open', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { state, runtime } = createHarness();
  const panel = fakePanel('general');
  state.settingsPanel = panel;

  // Two hours with Settings on another tab: nothing is recorded.
  runtime.recordPerformanceEvent('compute', 1, 'suppressed');
  t.mock.timers.tick(120 * MINUTE);

  // Diagnostics tab open for two minutes, 100 events.
  panel.activate('diagnostics');
  for (let i = 0; i < 100; i += 1) runtime.recordPerformanceEvent('compute', 1, 'typed');
  t.mock.timers.tick(2 * MINUTE);

  const open = runtime.performanceTelemetrySnapshot();
  assert.equal(open.events.compute.count, 100);
  assert.equal(open.events.compute.perMinute, 50, '100 events over 2 recorded minutes, not over 122 session minutes');
  assert.equal(open.recordedMs, 2 * MINUTE);
  assert.equal(open.ageMs, 122 * MINUTE, 'the session age is still reported');

  // Back on General for an hour: the recorded time does not grow.
  panel.activate('general');
  runtime.recordPerformanceEvent('settings-tab-switch', 0, 'general');
  t.mock.timers.tick(60 * MINUTE);
  const closed = runtime.performanceTelemetrySnapshot();
  assert.equal(closed.recordedMs, 2 * MINUTE);
  assert.equal(closed.events.compute.perMinute, 50);

  // A second window adds to the first.
  panel.activate('context');
  for (let i = 0; i < 20; i += 1) runtime.recordPerformanceEvent('compute', 1, 'typed');
  t.mock.timers.tick(2 * MINUTE);
  const again = runtime.performanceTelemetrySnapshot();
  assert.equal(again.recordedMs, 4 * MINUTE);
  assert.equal(again.events.compute.perMinute, 30, '120 events over 4 recorded minutes');
});

test('a rate over less than a minute of recording is the count so far', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { state, runtime } = createHarness();
  state.settingsPanel = fakePanel('diagnostics');
  for (let i = 0; i < 3; i += 1) runtime.recordPerformanceEvent('diagnostics-refresh', 2, 'open');
  t.mock.timers.tick(5);

  const snapshot = runtime.performanceTelemetrySnapshot();
  assert.equal(snapshot.recordedMs, 5);
  assert.equal(snapshot.events['diagnostics-refresh'].perMinute, 3, 'not 3 events in 5 ms scaled up to 36000 a minute');
  const stats = runtime.performanceStatsSnapshot();
  assert.deepEqual(stats.budget.results['diagnostics-refresh'].issues, [], 'opening the tab does not trip the rate budget');
});

test('with legacy mode or debug logging the gate is always open and the rate covers the session', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { flags, runtime } = createHarness();
  flags.perfMode = 'legacy';
  for (let i = 0; i < 300; i += 1) runtime.recordPerformanceEvent('compute', 1, 'typed');
  t.mock.timers.tick(10 * MINUTE);
  const snapshot = runtime.performanceTelemetrySnapshot();
  assert.equal(snapshot.recordedMs, 10 * MINUTE);
  assert.equal(snapshot.events.compute.perMinute, 30);
});

test('resetting telemetry starts a new recording window', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { flags, runtime } = createHarness();
  flags.debug = true;
  runtime.recordPerformanceEvent('compute', 1, 'before');
  t.mock.timers.tick(30 * MINUTE);
  runtime.resetPerformanceTelemetry();
  for (let i = 0; i < 40; i += 1) runtime.recordPerformanceEvent('compute', 1, 'after');
  t.mock.timers.tick(2 * MINUTE);
  const snapshot = runtime.performanceTelemetrySnapshot();
  assert.equal(snapshot.recordedMs, 2 * MINUTE);
  assert.equal(snapshot.events.compute.perMinute, 20);
});

// --- a telemetry reset clears counters only ---
test('resetPerformanceTelemetry zeroes counters and leaves timers and live state alone', () => {
  const editor = { isConnected: true };
  const { state, calls, runtime } = createHarness({
    state: {
      diagnosticsStats: { refreshes: 4, skippedClean: 9, skippedHidden: 2, dirtyReasons: { typed: 3 }, settingsRefreshes: 1, lastSkipReason: 'clean' },
      activeEditorCache: {
        editor, key: 'editor-7', hit: 12, miss: 3, invalidated: 1, lastReason: 'focus', stableSkips: 5, lastStableSkipReason: 'stable',
        lastNoEditorAt: 1700000000000, noEditorBackoffMs: 180, noEditorBackoffUntil: 1700000000180, noEditorSkips: 6,
        lastNoEditorSkipReason: 'backoff', lastNoEditorMissReason: 'no-dialog',
      },
      observerStats: {
        callbacks: 40, styleMutationRecords: 8, structuralRecords: 2, ignoredRecords: 30, ignoredCodeMirrorRecords: 20,
        suppressedCodeMirrorCallbacks: 7, suppressedIgnoredCallbacks: 6, styleMutationGuardTargets: 3, prunedStyleRootObservers: 2,
        shallowStyleRootObservers: 4, deepStyleRootObservers: 1, lastPruneReason: 'settings-close', lastPruneAt: 1700000000000,
        lastPrunePendingRecords: 1, lastObserverMode: 'scoped',
      },
      settingsSaveStats: { writes: 5, skippedUnchanged: 2, lastWriteAt: 1700000000000, lastSkipAt: 1700000000001, lastReason: 'settings', lastSerializedLength: 900 },
      performanceTelemetrySuppressedTotal: 31,
      performanceTelemetrySuppressedLastName: 'compute',
    },
  });
  state.performanceTelemetry.events.compute = { count: 3, totalMs: 9, maxMs: 4, lastMs: 2, lastAt: 1, lastDetail: '' };

  const snapshot = runtime.resetPerformanceTelemetry();

  assert.deepEqual(calls, [], 'no pending UI or frame timer is cancelled');
  assert.deepEqual(snapshot.events, {});
  assert.equal(snapshot.suppressed.total, 0);

  // Counters and their last-reason notes are cleared.
  assert.deepEqual(
    { ...state.diagnosticsStats, dirtyReasons: undefined },
    { refreshes: 0, skippedClean: 0, skippedHidden: 0, dirtyReasons: undefined, settingsRefreshes: 0, lastSkipReason: '' },
  );
  assert.equal(state.activeEditorCache.hit, 0);
  assert.equal(state.activeEditorCache.miss, 0);
  assert.equal(state.activeEditorCache.invalidated, 0);
  assert.equal(state.activeEditorCache.stableSkips, 0);
  assert.equal(state.activeEditorCache.noEditorSkips, 0);
  assert.equal(state.activeEditorCache.lastNoEditorSkipReason, '');
  assert.equal(state.observerStats.callbacks, 0);
  assert.equal(state.observerStats.suppressedCodeMirrorCallbacks, 0);
  assert.equal(state.observerStats.prunedStyleRootObservers, 0);
  assert.equal(state.observerStats.lastPruneReason, '');
  assert.equal(state.settingsSaveStats.writes, 0);
  assert.equal(state.settingsSaveStats.skippedUnchanged, 0);

  // What the runtime is working with right now is not a counter.
  assert.equal(state.activeEditorCache.editor, editor);
  assert.equal(state.activeEditorCache.key, 'editor-7', 'the cached editor keeps its key');
  assert.equal(state.activeEditorCache.noEditorBackoffMs, 180);
  assert.equal(state.activeEditorCache.noEditorBackoffUntil, 1700000000180, 'a running no-editor backoff is not ended');
  assert.equal(state.activeEditorCache.lastNoEditorAt, 1700000000000);
  assert.equal(state.observerStats.styleMutationGuardTargets, 3, 'the number of guarded targets is a live count');
  assert.equal(state.observerStats.shallowStyleRootObservers, 4);
  assert.equal(state.observerStats.deepStyleRootObservers, 1);
  assert.equal(state.observerStats.lastObserverMode, 'scoped');
});
