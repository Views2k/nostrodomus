// The scan of the style roots (the document and the shadow roots of the active editor and its
// dialog): when it runs, and the pruning of the observers of roots that left the page. Styling
// and editor discovery are injected.

function call(fn, ...args) {
  return typeof fn === 'function' ? fn(...args) : undefined;
}

function nowMs(performanceRef) {
  try {
    if (performanceRef && typeof performanceRef.now === 'function') return performanceRef.now();
  } catch {
    // A performance object that throws: Date.now() below.
  }
  return Date.now();
}

// requestAnimationFrame fallback delay: ~1 frame at 60fps, used only when no rAF is injected.
const FRAME_MS = 16;

export function createStyleRootRuntime(options = {}) {
  const state = options.state || {};
  const documentRef = options.documentRef || globalThis.document;
  const NodeRef = options.NodeRef || globalThis.Node;
  const performanceRef = options.performanceRef || globalThis.performance;
  const requestAnimationFrameRef = typeof options.requestAnimationFrame === 'function'
    ? options.requestAnimationFrame
    : (callback) => setTimeout(callback, FRAME_MS);
  const cancelAnimationFrameRef = typeof options.cancelAnimationFrame === 'function'
    ? options.cancelAnimationFrame
    : (id) => clearTimeout(id);
  const setTimeoutRef = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimeoutRef = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;

  function appendStyleRootScanPendingReason(reason = 'style-root-scan', source = 'style-root-scan') {
    const clean = String(reason || 'style-root-scan');
    const parts = String(state.styleRootScanPendingReason || '').split('+').filter(Boolean);
    if (parts.includes(clean)) {
      state.styleRootScanReasonCoalesces = (state.styleRootScanReasonCoalesces || 0) + 1;
      state.lastStyleRootScanCoalescedReason = `${source}:${clean}`;
      state.styleRootScanPendingReasonCount = parts.length;
      call(options.recordPerformanceEvent, 'style-root-scan-reason-coalesced', 0, `${source}:${clean}`);
      return false;
    }
    parts.push(clean);
    state.styleRootScanPendingReason = parts.join('+');
    state.styleRootScanPendingReasonCount = parts.length;
    state.lastStyleRootScanPendingReason = clean;
    return true;
  }

  function forceStyleRootScanNextFrame(reason = 'editor-sentinel-detected') {
    if (state.styleRootScanTimer) {
      try { clearTimeoutRef(state.styleRootScanTimer); } catch { /* injected timer ref */ }
      state.styleRootScanTimer = 0;
    }
    if (state.styleRootRaf) return;
    appendStyleRootScanPendingReason(reason || 'editor-sentinel-detected', 'force-next-frame');
    runScheduledStyleRootScan(reason);
  }

  function isStyleRootObserverAlive(root) {
    if (root === documentRef) return true;
    try {
      if (root?.nodeType === NodeRef?.DOCUMENT_FRAGMENT_NODE) return !!root.host && !!root.host.isConnected;
      if (root?.isConnected === false) return false;
      return !!root && !!root.querySelectorAll;
    } catch {
      return false;
    }
  }

  function pruneStyleRootObservers(reason = 'style-root-prune') {
    const observers = state.styleRootObservers;
    if (!observers?.size) return 0;
    let pruned = 0;
    let pendingRecords = 0;
    for (const [root, item] of Array.from(observers.entries())) {
      if (isStyleRootObserverAlive(root)) continue;
      const observer = item?.observer || item;
      try { pendingRecords += observer?.takeRecords?.()?.length || 0; } catch { /* injected observer */ }
      try { observer?.disconnect?.(); } catch { /* injected observer */ }
      observers.delete(root);
      pruned += 1;
    }
    if (state.observerStats) {
      state.observerStats.prunedStyleRootObservers += pruned;
      state.observerStats.lastPruneReason = reason;
      state.observerStats.lastPruneAt = Date.now();
      state.observerStats.lastPrunePendingRecords = pendingRecords;
      state.observerStats.shallowStyleRootObservers = Array.from(observers.values()).filter(item => item?.mode === 'shallow').length;
      state.observerStats.deepStyleRootObservers = Array.from(observers.values()).filter(item => item?.mode === 'deep').length;
    }
    if (pruned || pendingRecords) call(options.recordPerformanceEvent, 'style-root-observer-prune', 0, `${pruned} pruned:${reason}`);
    return pruned;
  }

  function scanStyleRoots(reason = 'style-root-scan') {
    const run = () => {
      pruneStyleRootObservers(`before-${reason}`);
      state.styleRootScanLastAt = nowMs(performanceRef);
      const editor = call(options.activeCodeboxStyleEditor);
      if (!editor) {
        if (call(options.editorLikelyOpeningWithoutMountedCodebox)) {
          if (state.editorSentinelStats) {
            state.editorSentinelStats.noEditorRetries += 1;
            state.editorSentinelStats.lastNoEditorRetryReason = `scan-no-active-editor-${reason}`;
          }
          call(options.scheduleEditorPresenceProbe, `scan-no-active-editor-${reason}`, 60);
        } else {
          call(options.cleanupCodeboxSlotUnclip, `scan-no-active-editor-${reason}`);
          call(options.removeCodeboxRootStylesFromAllRoots, `scan-no-active-editor-${reason}`);
        }
        pruneStyleRootObservers(`after-no-editor-${reason}`);
        return;
      }
      let rootChanges = 0;
      const roots = call(options.discoverOpenStyleRoots, editor) || [];
      for (const root of roots) {
        if (call(options.attachStyleRootObserver, root)) rootChanges += 1;
      }
      const pruned = pruneStyleRootObservers(`after-${reason}`);
      const passiveRootScan = call(options.codeboxStyleReasonIsPassiveEditorSettle, reason);
      if (rootChanges || pruned || (call(options.codeboxStyleReasonRequiresFullApply, reason) && !passiveRootScan)) {
        call(options.scheduleCodeboxStyleReapply, `root-scan-${reason}`);
      } else {
        if (passiveRootScan) {
          state.codeboxStylePassiveRootScanSkips = (state.codeboxStylePassiveRootScanSkips || 0) + 1;
          call(options.recordPerformanceEvent, 'codebox-style-passive-root-scan-skipped', 0, reason);
        }
        if (state.schedulerStats) state.schedulerStats.skippedClean = (state.schedulerStats.skippedClean || 0) + 1;
      }
    };

    const measure = options.measurePerformanceEvent;
    if (typeof measure === 'function') return measure('style-root-scan', reason, run);
    return run();
  }

  function runScheduledStyleRootScan(reason = 'style-root-scan') {
    // A root scan leaves the active editor cache alone: the cached editor is checked for
    // visibility and connection on every read, and clearing it here would start an editor search
    // on every scan while the editor is open.
    state.styleRootRaf = requestAnimationFrameRef(() => {
      state.styleRootRaf = 0;
      const pendingReason = state.styleRootScanPendingReason || reason;
      state.styleRootScanPendingReason = '';
      scanStyleRoots(pendingReason);
    });
  }

  function scheduleStyleRootScan(reason = 'style-root-scan') {
    call(options.recordPerformanceEvent, 'style-root-scan-scheduled', 0, reason);
    appendStyleRootScanPendingReason(reason || 'style-root-scan', 'schedule');
    if (state.styleRootRaf || state.styleRootScanTimer) return;
    const elapsed = nowMs(performanceRef) - (state.styleRootScanLastAt || 0);
    const wait = elapsed > 900 ? 0 : Math.max(120, 900 - elapsed);
    if (!wait) {
      runScheduledStyleRootScan(reason);
      return;
    }
    state.styleRootScanTimer = setTimeoutRef(() => {
      state.styleRootScanTimer = 0;
      runScheduledStyleRootScan(reason);
    }, wait);
  }

  function installRootStyleRegistry() {
    // Nothing is injected into the dashboard's shadow roots at startup; the scan runs only once
    // an editor is present or an editor event marks the roots as changed.
    call(options.removeCodeboxRootStylesFromAllRoots, 'install-dashboard-containment');
    scheduleStyleRootScan('install-root-style-registry-editor-only');
    call(options.scheduleEditorPresenceProbe, 'install-root-style-registry-editor-only');
    call(options.scheduleEditorSettleProbes, 'install-root-style-registry-editor-only');
  }

  function uninstallStyleRootRegistry(reason = 'uninstall') {
    try { state.styleRootObserver?.disconnect?.(); } catch { /* injected observer */ }
    state.styleRootObserver = null;
    try {
      pruneStyleRootObservers(reason);
      for (const item of state.styleRootObservers?.values?.() || []) {
        const observer = item?.observer || item;
        try { observer?.takeRecords?.(); } catch { /* injected observer */ }
        try { observer?.disconnect?.(); } catch { /* injected observer */ }
      }
      state.styleRootObservers?.clear?.();
    } catch { /* teardown sweep */ }
    if (state.styleRootRaf) {
      try { cancelAnimationFrameRef(state.styleRootRaf); } catch { /* injected timer ref */ }
      state.styleRootRaf = 0;
    }
    if (state.styleRootScanTimer) {
      try { clearTimeoutRef(state.styleRootScanTimer); } catch { /* injected timer ref */ }
      state.styleRootScanTimer = 0;
    }
  }

  return {
    appendStyleRootScanPendingReason,
    forceStyleRootScanNextFrame,
    isStyleRootObserverAlive,
    pruneStyleRootObservers,
    scanStyleRoots,
    runScheduledStyleRootScan,
    scheduleStyleRootScan,
    installRootStyleRegistry,
    uninstallStyleRootRegistry,
  };
}
