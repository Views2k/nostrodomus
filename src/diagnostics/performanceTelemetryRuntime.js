// What resetPerformanceTelemetry clears in each stats object: the counters and the notes that
// go with them. The same objects also hold values the runtime is working with (the cached
// editor's key, a running no-editor backoff, the number of attached observers); a reset for
// before/after profiling leaves those alone, and does not cancel pending UI or frame timers.
const RESETTABLE_COUNTERS = {
  diagnosticsStats: ['refreshes', 'skippedClean', 'skippedHidden', 'settingsRefreshes', 'lastSkipReason'],
  activeEditorCache: ['hit', 'miss', 'invalidated', 'lastReason', 'stableSkips', 'lastStableSkipReason', 'noEditorSkips', 'lastNoEditorSkipReason', 'lastNoEditorMissReason'],
  observerStats: ['callbacks', 'styleMutationRecords', 'structuralRecords', 'ignoredRecords', 'ignoredCodeMirrorRecords', 'suppressedCodeMirrorCallbacks', 'suppressedIgnoredCallbacks', 'prunedStyleRootObservers', 'lastPruneReason', 'lastPruneAt', 'lastPrunePendingRecords'],
  settingsSaveStats: ['writes', 'skippedUnchanged', 'lastWriteAt', 'lastSkipAt', 'lastReason', 'lastSerializedLength'],
};

// The shortest time a per-minute rate is divided by.
const RATE_MIN_WINDOW_MS = 60000;

export function createPerformanceTelemetryRuntime(ctx = {}) {
  const {
    state,
    shouldQuietEditorDispatchTelemetryEvent,
    quietEditorDispatchTelemetryEvent,
    nostrodomusPerfMode,
    debugLoggingEnabled,
    shouldRecordPerformanceTelemetryDecision,
    measurePerformanceEventWithCallbacks,
    evaluatePerformanceBudgets,
    roundPerformanceMetric,
    diagnosticEventMetric,
    activeContextDiagnosticsSection,
    clientCapabilitySnapshot,
    observerLifecycleReadout,
    observerLifecycleCloseBindingReadiness,
    observerLifecycleCloseDryRunReadout,
    observerLifecycleCloseDryRunListenerReadout,
    editorLikelyOpeningWithoutMountedCodebox,
    looksLikeView,
    isViewAllowed,
  } = ctx;

  // The Diagnostics and Context sections of the open panel, looked up once per panel element,
  // since this gate is asked on every telemetry call. A panel keeps its section elements for as
  // long as it exists (a tab that is built late fills the same element), so each later call is two
  // class checks. A rebuilt or reopened panel is a new element and is looked up again.
  let diagnosticsSectionsPanel = null;
  let diagnosticsSections = [];

  function performanceTelemetryDiagnosticsActive() {
    const panel = state.settingsPanel;
    if (!panel?.isConnected) {
      diagnosticsSectionsPanel = null;
      diagnosticsSections = [];
      return false;
    }
    try {
      if (panel !== diagnosticsSectionsPanel) {
        diagnosticsSections = Array.from(panel.querySelectorAll?.('[data-section="diagnostics"],[data-section="context"]') || []);
        diagnosticsSectionsPanel = panel;
      }
      for (const section of diagnosticsSections) {
        if (section.classList?.contains?.("active")) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Events are only counted while the gate is open (legacy mode, debug logging, or the
  // Diagnostics or Context tab shown), so a per-minute rate has to be divided by the time the
  // gate was open, not by the age of the session. Each gate check notes a change of state:
  // recordingSince is the start of the open window, recordedMs the sum of the closed ones.
  // A check costs a clock read only when the state changes.
  function noteTelemetryGate(open, now = 0) {
    const telemetry = state.performanceTelemetry;
    if (!telemetry) return;
    if (open) {
      if (!telemetry.recordingSince) telemetry.recordingSince = now || Date.now();
    } else if (telemetry.recordingSince) {
      telemetry.recordedMs = (telemetry.recordedMs || 0) + Math.max(0, (now || Date.now()) - telemetry.recordingSince);
      telemetry.recordingSince = 0;
    }
  }

  function shouldRecordPerformanceTelemetry(name = '') {
    if (!name) return shouldRecordPerformanceTelemetryDecision({ name });
    const open = nostrodomusPerfMode() === 'legacy' || debugLoggingEnabled() || performanceTelemetryDiagnosticsActive();
    noteTelemetryGate(open);
    if (open) return true;
    return shouldRecordPerformanceTelemetryDecision({ name });
  }

  function noteSuppressedPerformanceEvent(name = '') {
    state.performanceTelemetrySuppressedTotal = (state.performanceTelemetrySuppressedTotal || 0) + 1;
    state.performanceTelemetrySuppressedLastName = String(name || '').slice(0, 72);
  }

  function bucketFor(name) {
    const telemetry = state.performanceTelemetry || (state.performanceTelemetry = { startedAt: Date.now(), events: Object.create(null), recent: [] });
    return telemetry.events[name] || (telemetry.events[name] = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, lastAt: 0, lastDetail: '' });
  }

  function recordPerformanceEvent(name, durationMs = 0, detail = '') {
    if (shouldQuietEditorDispatchTelemetryEvent(name, durationMs)) return quietEditorDispatchTelemetryEvent(name, detail);
    if (!shouldRecordPerformanceTelemetry(name)) {
      noteSuppressedPerformanceEvent(name);
      return null;
    }
    if (!name) return null;
    const telemetry = state.performanceTelemetry || (state.performanceTelemetry = { startedAt: Date.now(), events: Object.create(null), recent: [] });
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const rounded = Math.round(duration * 1000) / 1000;
    const bucket = bucketFor(name);
    bucket.count += 1;
    bucket.totalMs = Math.round((bucket.totalMs + duration) * 1000) / 1000;
    bucket.maxMs = Math.max(bucket.maxMs || 0, rounded);
    bucket.lastMs = rounded;
    bucket.lastAt = Date.now();
    bucket.lastDetail = String(detail || '').slice(0, 72);
    telemetry.recent.push({ name, at: bucket.lastAt, durationMs: rounded, detail: bucket.lastDetail });
    if (telemetry.recent.length > 24) telemetry.recent.splice(0, telemetry.recent.length - 24);
    return bucket;
  }

  function measurePerformanceEvent(name, detail, fn) {
    if (!shouldRecordPerformanceTelemetry(name)) {
      try { return fn(); } finally { noteSuppressedPerformanceEvent(name); }
    }
    return measurePerformanceEventWithCallbacks({
      name,
      detail,
      shouldRecord: true,
      run: fn,
      now: () => performance?.now?.() || Date.now(),
      record: (eventName, durationMs, eventDetail) => recordPerformanceEvent(eventName, durationMs, eventDetail),
    });
  }

  function performanceTelemetrySnapshot() {
    const telemetry = state.performanceTelemetry || { startedAt: Date.now(), events: {}, recent: [] };
    const now = Date.now();
    const ageMs = Math.max(1, now - (telemetry.startedAt || now));
    const mode = nostrodomusPerfMode();
    const diagnosticsActive = performanceTelemetryDiagnosticsActive();
    const debugEnabled = debugLoggingEnabled();
    noteTelemetryGate(mode === 'legacy' || debugEnabled || diagnosticsActive, now);
    const recordedMs = (telemetry.recordedMs || 0) + (telemetry.recordingSince ? Math.max(0, now - telemetry.recordingSince) : 0);
    // Less than a minute of recording gives the count so far: a few events in the first
    // milliseconds after the Diagnostics tab opens are not a rate of thousands a minute.
    const rateWindowMs = Math.max(RATE_MIN_WINDOW_MS, recordedMs);
    const events = {};
    for (const [name, bucket] of Object.entries(telemetry.events || {})) {
      const count = bucket.count || 0;
      events[name] = {
        count,
        perMinute: Math.round((count * 60000 / rateWindowMs) * 100) / 100,
        totalMs: Math.round((bucket.totalMs || 0) * 1000) / 1000,
        avgMs: count ? Math.round(((bucket.totalMs || 0) / count) * 1000) / 1000 : 0,
        maxMs: bucket.maxMs || 0,
        lastMs: bucket.lastMs || 0,
        lastAt: bucket.lastAt || 0,
        lastDetail: bucket.lastDetail || '',
      };
    }
    return {
      startedAt: telemetry.startedAt || now,
      ageMs,
      recordedMs,
      mode,
      gated: mode !== 'legacy',
      diagnosticsActive,
      debugEnabled,
      suppressed: { total: state.performanceTelemetrySuppressedTotal || 0, lastName: state.performanceTelemetrySuppressedLastName || '' },
      events,
      recent: (telemetry.recent || []).slice(-8),
    };
  }

  function resetPerformanceTelemetry() {
    state.performanceTelemetry = { startedAt: Date.now(), events: Object.create(null), recent: [] };
    state.performanceTelemetrySuppressedTotal = 0;
    state.performanceTelemetrySuppressedLastName = '';
    for (const [key, props] of Object.entries(RESETTABLE_COUNTERS)) {
      if (state[key] && typeof state[key] === 'object') {
        for (const prop of props) {
          if (typeof state[key][prop] === 'number') state[key][prop] = 0;
          else if (typeof state[key][prop] === 'string') state[key][prop] = '';
        }
      }
    }
    return performanceTelemetrySnapshot();
  }

  function performanceStatsSnapshot() {
    const telemetry = performanceTelemetrySnapshot();
    const events = Object.entries(telemetry.events || {}).map(([name, event]) => ({
      name,
      count: event.count || 0,
      perMinute: roundPerformanceMetric(event.perMinute || 0, 2),
      totalMs: roundPerformanceMetric(event.totalMs || 0, 3),
      avgMs: roundPerformanceMetric(event.avgMs || 0, 3),
      maxMs: roundPerformanceMetric(event.maxMs || 0, 3),
      lastMs: roundPerformanceMetric(event.lastMs || 0, 3),
      lastDetail: event.lastDetail || '',
    }));
    const byTotal = events.slice().sort((a, b) => b.totalMs - a.totalMs).slice(0, 8);
    const byRate = events.slice().sort((a, b) => b.perMinute - a.perMinute).slice(0, 8);
    const budget = evaluatePerformanceBudgets(telemetry);
    const activeCache = state.activeEditorCache || {};
    const observerStats = state.observerStats || {};
    return {
      localOnly: true,
      networkReporting: false,
      sampledAt: Date.now(),
      ageMs: telemetry.ageMs,
      telemetryMode: telemetry.mode || 'on',
      telemetryGated: telemetry.gated === true,
      telemetrySuppressed: telemetry.suppressed || { total: 0, lastName: '' },
      budgetStatus: budget.ok === false ? 'warning' : 'ok',
      budget,
      topByTotalMs: byTotal,
      topByAverageMs: events.slice().sort((a, b) => b.avgMs - a.avgMs).slice(0, 8),
      topByRate: byRate,
      metrics: {
        'completion.compute.ms': diagnosticEventMetric(telemetry.events, 'compute'),
        'popup.render.ms': diagnosticEventMetric(telemetry.events, 'popup-render'),
        'diagnostics.refresh.ms': diagnosticEventMetric(telemetry.events, 'diagnostics-refresh'),
        'style.apply.ms': diagnosticEventMetric(telemetry.events, 'codebox-style-apply'),
        'frame.sync.ms': diagnosticEventMetric(telemetry.events, 'codebox-frame-sync'),
        'root.scan.ms': diagnosticEventMetric(telemetry.events, 'style-root-scan'),
      },
      observer: {
        callbacks: observerStats.callbacks || 0,
        suppressedCodeMirrorCallbacks: observerStats.suppressedCodeMirrorCallbacks || 0,
        suppressedIgnoredCallbacks: observerStats.suppressedIgnoredCallbacks || 0,
        styleMutationGuardTargets: observerStats.styleMutationGuardTargets || 0,
        prunedStyleRootObservers: observerStats.prunedStyleRootObservers || 0,
        lastPruneReason: observerStats.lastPruneReason || '',
      },
      observerLifecycle: observerLifecycleReadout(),
      observerLifecycleCloseBindingReadiness: observerLifecycleCloseBindingReadiness(),
      observerLifecycleCloseDryRun: observerLifecycleCloseDryRunReadout(),
      observerLifecycleCloseDryRunListener: observerLifecycleCloseDryRunListenerReadout(),
      listeners: {
        persistentRemoved: state.listenerStats?.persistentRemoved || 0,
        activePersistent: state.persistentListeners?.length || 0,
      },
      editorSentinel: {
        ...(state.editorSentinelStats || {}),
        observedRoots: state.editorSentinelObservers?.size || 0,
        likelyOpening: editorLikelyOpeningWithoutMountedCodebox(),
      },
      scheduler: {
        diagnosticsRefreshQueued: !!state.diagnosticsRefreshRaf,
        diagnosticsPendingReasons: Array.from(state.diagnosticsPendingReasons || []).slice(0, 8),
        contextInspectorTimerActive: !!state.contextInspectorTimer,
        contextDiagnosticsVisible: !!activeContextDiagnosticsSection(),
        diagnosticsHeartbeatMs: state.diagnosticsHeartbeatMs || 0,
        skippedClean: state.diagnosticsStats?.skippedClean || 0,
        skippedHidden: state.diagnosticsStats?.skippedHidden || 0,
      },
      cache: {
        completionCacheEntries: state.completionCache?.size || 0,
        providerCount: Array.isArray(state.providers) ? state.providers.length : 0,
        styleRootObserverCount: state.styleRootObservers?.size || 0,
        hasCodeboxFrame: !!state.codeboxFrameEl,
        hasActiveEditor: looksLikeView(state.view),
        scopedEditor: isViewAllowed(state.view),
        activeEditor: {
          hit: activeCache.hit || 0,
          miss: activeCache.miss || 0,
          invalidated: activeCache.invalidated || 0,
          noEditorSkips: activeCache.noEditorSkips || 0,
          lastNoEditorSkipReason: activeCache.lastNoEditorSkipReason || '',
        },
      },
      clientCapabilities: clientCapabilitySnapshot('performance'),
      telemetry,
    };
  }

  return {
    performanceTelemetryDiagnosticsActive,
    shouldRecordPerformanceTelemetry,
    noteSuppressedPerformanceEvent,
    recordPerformanceEvent,
    measurePerformanceEvent,
    performanceTelemetrySnapshot,
    resetPerformanceTelemetry,
    performanceStatsSnapshot,
  };
}
