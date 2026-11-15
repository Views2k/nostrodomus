export function createObserverLifecycleRuntime(ctx = {}) {
  const {
    W,
    state,
    observerLifecycleDisconnectGateKey = "nostrodomusObserverLifecycleDisconnect",
    observerLifecycleCloseDryRunGateKey = "nostrodomusObserverLifecycleCloseDryRun",
    observerLifecycleCloseDryRunListenerGateKey = "nostrodomusObserverLifecycleCloseDryRunListener",
    activeEditDialog,
    isOpen,
    editorLikelyOpeningWithoutMountedCodebox,
    recordPerformanceEvent,
    recordRuntimeErrorOnce,
    disconnectCodeboxPreflightObserver,
    cleanupCodeboxSlotUnclip,
    uninstallEditorLifecycleSentinel,
    cleanupInitialSyntaxPaintGate,
    disconnectCodeMirrorSyntaxContentObserver,
    disconnectSourceClassSmartSyntaxObserver,
    // The companion layer (settle engine, warning watchers, codebox layout watcher) keeps its
    // observers in its own modules, not in state. These two hooks let the readout count them
    // and the manual disconnect reach them: counts by registry name, and one disconnect.
    companionObserverCounts = () => ({}),
    disconnectCompanionObservers = () => {},
  } = ctx;

  const OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY = observerLifecycleDisconnectGateKey;
  const OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY = observerLifecycleCloseDryRunGateKey;
  const OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_LISTENER_GATE_KEY = observerLifecycleCloseDryRunListenerGateKey;

  function gateEnabledFor(key) {
    try {
      return W.localStorage?.getItem?.(key) === "enabled";
    } catch {
      return false;
    }
  }

  function observerLifecycleDisconnectGateEnabled() {
    return gateEnabledFor(OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY);
  }

  function observerLifecycleCloseDryRunGateEnabled() {
    return gateEnabledFor(OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY);
  }

  function observerLifecycleCloseDryRunListenerGateEnabled() {
    return gateEnabledFor(OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_LISTENER_GATE_KEY);
  }

  function companionRegistryCounts() {
    const counts = {};
    try {
      for (const [name, value] of Object.entries(companionObserverCounts() || {})) counts[name] = Number(value) || 0;
    } catch { /* a readout never fails on the companion layer */ }
    return counts;
  }

  function observerLifecycleRegistryCounts() {
    return {
      codeboxPreflightObserver: state.codeboxPreflightObserver ? 1 : 0,
      codeboxSlotUnclipObservers: state.codeboxSlotUnclipObservers?.size || 0,
      editorSentinelObservers: state.editorSentinelObservers?.size || 0,
      initialSyntaxGateObservers: state.initialSyntaxGateObservers?.size || 0,
      codeMirrorSyntaxContentObserver: state.codeMirrorSyntaxContentObserver ? 1 : 0,
      sourceClassSmartSyntaxObserver: state.sourceClassSmartSyntaxObserver ? 1 : 0,
      syntaxOwnerObserver: state.syntaxOwnerObserver ? 1 : 0,
      styleMutationObserver: state.styleMutationObserver ? 1 : 0,
      styleRootObserver: state.styleRootObserver ? 1 : 0,
      styleRootObservers: state.styleRootObservers?.size || 0,
      ...companionRegistryCounts(),
    };
  }

  function observerLifecycleCountTotal(counts) {
    return Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  function observerLifecycleCloseBindingReadiness() {
    return {
      localOnly: true,
      readOnly: true,
      stage: "close-binding-readiness",
      automaticTeardownBound: false,
      readyForAutomaticBinding: false,
      gateKey: OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY,
      gateEnabled: observerLifecycleDisconnectGateEnabled(),
      dryRunGateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY,
      dryRunGateEnabled: observerLifecycleCloseDryRunGateEnabled(),
      dryRunListenerGateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_LISTENER_GATE_KEY,
      dryRunListenerGateEnabled: observerLifecycleCloseDryRunListenerGateEnabled(),
      dryRunProbeBound: true,
      lastDryRunProbe: state.observerLifecycleLastCloseDryRunProbe || null,
      lastManualDisconnect: state.observerLifecycleLastDisconnect || null,
    };
  }

  function observerLifecycleCloseDryRunReadout() {
    return {
      localOnly: true,
      manualOnly: true,
      dryRunOnly: true,
      destructive: false,
      stage: "close-dry-run",
      gateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY,
      gateEnabled: observerLifecycleCloseDryRunGateEnabled(),
      disconnectGateKey: OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY,
      disconnectGateEnabled: observerLifecycleDisconnectGateEnabled(),
      probes: state.observerLifecycleCloseDryRunProbes || 0,
      blocked: state.observerLifecycleCloseDryRunBlocked || 0,
      lastProbe: state.observerLifecycleLastCloseDryRunProbe || null,
      listener: observerLifecycleCloseDryRunListenerReadout(),
      automaticTeardownBound: false,
      readyForDestructiveBinding: false,
    };
  }

  function observerLifecycleCloseDryRunListenerReadout() {
    return {
      localOnly: true,
      manualOnly: false,
      dryRunOnly: true,
      destructive: false,
      stage: "close-dry-run-listener",
      listenerGateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_LISTENER_GATE_KEY,
      listenerGateEnabled: observerLifecycleCloseDryRunListenerGateEnabled(),
      dryRunGateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY,
      dryRunGateEnabled: observerLifecycleCloseDryRunGateEnabled(),
      disconnectGateKey: OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY,
      disconnectGateEnabled: observerLifecycleDisconnectGateEnabled(),
      listenerEvents: state.observerLifecycleCloseDryRunListenerEvents || 0,
      listenerBlocked: state.observerLifecycleCloseDryRunListenerBlocked || 0,
      lastListener: state.observerLifecycleLastCloseDryRunListener || null,
      automaticTeardownBound: false,
      destructiveBinding: false,
      observerMutation: false,
    };
  }

  function observerLifecycleCloseDryRunListenerProbe(reason = "editor-focusout-close-lifecycle-dry-run-listener") {
    const cleanReason = String(reason || "editor-focusout-close-lifecycle-dry-run-listener").slice(0, 160);
    const listenerGateEnabled = observerLifecycleCloseDryRunListenerGateEnabled();
    const dryRunGateEnabled = observerLifecycleCloseDryRunGateEnabled();
    const summary = {
      ok: listenerGateEnabled && dryRunGateEnabled,
      blocked: !(listenerGateEnabled && dryRunGateEnabled),
      gated: !(listenerGateEnabled && dryRunGateEnabled),
      localOnly: true,
      manualOnly: false,
      dryRunOnly: true,
      destructive: false,
      observerMutation: false,
      stage: "close-dry-run-listener",
      reason: cleanReason,
      at: Date.now(),
      listenerGateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_LISTENER_GATE_KEY,
      listenerGateEnabled,
      dryRunGateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY,
      dryRunGateEnabled,
      disconnectGateKey: OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY,
      disconnectGateEnabled: observerLifecycleDisconnectGateEnabled(),
      probeCalled: false,
      probe: null,
      automaticTeardownBound: false,
      destructiveBinding: false,
    };

    if (!listenerGateEnabled || !dryRunGateEnabled) {
      state.observerLifecycleCloseDryRunListenerBlocked = (state.observerLifecycleCloseDryRunListenerBlocked || 0) + 1;
      state.observerLifecycleLastCloseDryRunListener = summary;
      return summary;
    }

    summary.probeCalled = true;
    summary.probe = observerLifecycleCloseDryRunProbe(`listener:${cleanReason}`);
    state.observerLifecycleCloseDryRunListenerEvents = (state.observerLifecycleCloseDryRunListenerEvents || 0) + 1;
    state.observerLifecycleLastCloseDryRunListener = summary;
    recordPerformanceEvent("observer-lifecycle-close-dry-run-listener", 0, cleanReason);
    return summary;
  }

  function observerLifecycleCloseDryRunWouldInspect(counts) {
    const rows = [
      ["codeboxPreflightObserver", "disconnectCodeboxPreflightObserver"],
      ["codeboxSlotUnclipObservers", "cleanupCodeboxSlotUnclip"],
      ["editorSentinelObservers", "uninstallEditorLifecycleSentinel"],
      ["initialSyntaxGateObservers", "cleanupInitialSyntaxPaintGate"],
      ["codeMirrorSyntaxContentObserver", "disconnectCodeMirrorSyntaxContentObserver"],
      ["sourceClassSmartSyntaxObserver", "disconnectSourceClassSmartSyntaxObserver"],
      ["syntaxOwnerObserver", "disconnectObserverLifecycleSingle"],
      ["styleMutationObserver", "disconnectObserverLifecycleSingle"],
      ["styleRootObserver", "disconnectObserverLifecycleSingle"],
      ["styleRootObservers", "disconnectObserverLifecycleMapValues"],
    ];
    // Any other registry in the counts is one of the companion layer's.
    for (const registry of Object.keys(counts || {})) {
      if (!rows.some(row => row[0] === registry)) rows.push([registry, "disconnectCompanionObservers"]);
    }
    return rows.map(([registry, helper]) => ({
      registry,
      helper,
      count: Number(counts?.[registry] || 0),
      wouldInspect: Number(counts?.[registry] || 0) > 0,
      wouldDisconnect: false,
      destructive: false,
    }));
  }

  function observerLifecycleCloseDryRunProbe(reason = "manual-close-lifecycle-dry-run") {
    const cleanReason = String(reason || "manual-close-lifecycle-dry-run").slice(0, 160);
    const gateEnabled = observerLifecycleCloseDryRunGateEnabled();
    const connected = observerLifecycleRegistryCounts();
    const wouldInspect = observerLifecycleCloseDryRunWouldInspect(connected);
    const activeDialog = activeEditDialog();
    const summary = {
      ok: gateEnabled,
      blocked: !gateEnabled,
      gated: !gateEnabled,
      localOnly: true,
      manualOnly: true,
      dryRunOnly: true,
      destructive: false,
      observerMutation: false,
      stage: "close-dry-run",
      gateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY,
      requiredGateValue: "enabled",
      disconnectGateKey: OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY,
      disconnectGateEnabled: observerLifecycleDisconnectGateEnabled(),
      reason: cleanReason,
      at: Date.now(),
      connected,
      connectedTotal: observerLifecycleCountTotal(connected),
      wouldInspect,
      wouldInspectTotal: wouldInspect.reduce((sum, item) => sum + (item.wouldInspect ? item.count : 0), 0),
      closeContext: {
        overlayOpen: isOpen(),
        settingsOpen: !!state.settingsPanel?.isConnected,
        activeEditDialog: !!activeDialog,
        hasView: !!state.view,
        hookedView: !!state.hookedView,
        cachedEditorConnected: !!state.activeEditorCache?.editor?.isConnected,
        editorSentinelLikelyOpening: editorLikelyOpeningWithoutMountedCodebox(),
      },
      automaticTeardownBound: false,
      readyForDestructiveBinding: false,
    };

    if (!gateEnabled) {
      state.observerLifecycleCloseDryRunBlocked = (state.observerLifecycleCloseDryRunBlocked || 0) + 1;
      state.observerLifecycleLastCloseDryRunProbe = summary;
      return summary;
    }

    state.observerLifecycleCloseDryRunProbes = (state.observerLifecycleCloseDryRunProbes || 0) + 1;
    state.observerLifecycleLastCloseDryRunProbe = summary;
    recordPerformanceEvent("observer-lifecycle-close-dry-run", 0, `${summary.connectedTotal}:${cleanReason}`);
    return summary;
  }

  function observerLifecycleReadout() {
    const connected = observerLifecycleRegistryCounts();
    return {
      localOnly: true,
      manualOnly: true,
      mutatesOnlyWhenManuallyInvoked: true,
      gateKey: OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY,
      gateEnabled: observerLifecycleDisconnectGateEnabled(),
      connected,
      connectedTotal: observerLifecycleCountTotal(connected),
      disconnects: state.observerLifecycleDisconnects || 0,
      blocked: state.observerLifecycleDisconnectBlocked || 0,
      lastDisconnect: state.observerLifecycleLastDisconnect || null,
      closeBindingReadiness: observerLifecycleCloseBindingReadiness(),
      closeDryRun: observerLifecycleCloseDryRunReadout(),
    };
  }

  function observerLifecycleRegistrySummary(name, beforeCounts, afterCounts, pendingRecords = 0) {
    const before = Number(beforeCounts?.[name] || 0);
    const after = Number(afterCounts?.[name] || 0);
    return {
      before,
      after,
      disconnected: Math.max(0, before - after),
      pendingRecords: Number(pendingRecords || 0),
    };
  }

  function disconnectObserverLifecycleMapValues(map, valueToObserver = item => item, clear = true) {
    let disconnected = 0;
    let pendingRecords = 0;
    try {
      for (const item of map?.values?.() || []) {
        const observer = valueToObserver(item);
        try { pendingRecords += observer?.takeRecords?.()?.length || 0; } catch { /* injected observer */ }
        try {
          if (observer?.disconnect) {
            observer.disconnect();
            disconnected += 1;
          }
        } catch { /* injected observer */ }
      }
      if (clear) map?.clear?.();
    } catch { /* teardown sweep */ }
    return { disconnected, pendingRecords };
  }

  function disconnectObserverLifecycleSingle(getObserver, clearObserver) {
    const observer = typeof getObserver === "function" ? getObserver() : null;
    let pendingRecords = 0;
    let disconnected = 0;
    try { pendingRecords += observer?.takeRecords?.()?.length || 0; } catch { /* injected observer */ }
    try {
      if (observer?.disconnect) {
        observer.disconnect();
        disconnected = 1;
      }
    } catch { /* injected observer */ }
    try { clearObserver?.(); } catch { /* injected delegate */ }
    return { disconnected, pendingRecords };
  }

  function disconnectAllNostrodomusObservers(reason = "manual-observer-lifecycle-disconnect") {
    const cleanReason = String(reason || "manual-observer-lifecycle-disconnect").slice(0, 160);
    const gateEnabled = observerLifecycleDisconnectGateEnabled();
    const before = observerLifecycleRegistryCounts();
    const summary = {
      ok: gateEnabled,
      gated: !gateEnabled,
      blocked: !gateEnabled,
      localOnly: true,
      manualOnly: true,
      gateKey: OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY,
      requiredGateValue: "enabled",
      reason: cleanReason,
      at: Date.now(),
      before,
      after: before,
      registries: {},
      disconnected: 0,
      pendingRecords: 0,
    };

    if (!gateEnabled) {
      state.observerLifecycleDisconnectBlocked = (state.observerLifecycleDisconnectBlocked || 0) + 1;
      state.observerLifecycleLastDisconnect = summary;
      return summary;
    }

    // Records taken from the observers disconnected here, by registry. The registries with an owner
    // that disconnects them report none.
    const pendingByRegistry = {};
    try {
      if (before.codeboxPreflightObserver) disconnectCodeboxPreflightObserver(`${cleanReason}-central`);
      if (before.codeboxSlotUnclipObservers) cleanupCodeboxSlotUnclip(`${cleanReason}-central`);
      if (before.editorSentinelObservers) uninstallEditorLifecycleSentinel(`${cleanReason}-central`);
      if (before.initialSyntaxGateObservers) cleanupInitialSyntaxPaintGate(`${cleanReason}-central`);
      if (before.codeMirrorSyntaxContentObserver) disconnectCodeMirrorSyntaxContentObserver(`${cleanReason}-central`);
      if (state.sourceClassSmartSyntaxObserver) disconnectSourceClassSmartSyntaxObserver(`${cleanReason}-central`);
      if (state.syntaxOwnerObserver && state.syntaxOwnerObserver !== state.codeMirrorSyntaxContentObserver) {
        pendingByRegistry.syntaxOwnerObserver = disconnectObserverLifecycleSingle(
          () => state.syntaxOwnerObserver,
          () => {
            state.syntaxOwnerObserver = null;
            state.syntaxOwnerEditorKey = "";
            state.syntaxOwnerContent = null;
          }
        ).pendingRecords;
      }
      if (state.styleMutationObserver) {
        pendingByRegistry.styleMutationObserver = disconnectObserverLifecycleSingle(
          () => state.styleMutationObserver,
          () => {
            state.styleMutationObserver = null;
            state.styleMutationEditor = null;
            if (state.observerStats) state.observerStats.styleMutationGuardTargets = 0;
          }
        ).pendingRecords;
      }
      if (state.styleRootObserver) {
        pendingByRegistry.styleRootObserver = disconnectObserverLifecycleSingle(
          () => state.styleRootObserver,
          () => { state.styleRootObserver = null; }
        ).pendingRecords;
      }
      if (state.styleRootObservers?.size) {
        pendingByRegistry.styleRootObservers = disconnectObserverLifecycleMapValues(state.styleRootObservers, item => item?.observer || item, true).pendingRecords;
        if (state.observerStats) {
          state.observerStats.shallowStyleRootObservers = 0;
          state.observerStats.deepStyleRootObservers = 0;
          state.observerStats.lastPruneReason = `${cleanReason}-central`;
          state.observerStats.lastPruneAt = Date.now();
        }
      }
      if (Object.keys(companionRegistryCounts()).some(name => before[name] > 0)) {
        disconnectCompanionObservers(`${cleanReason}-central`);
      }
    } catch (err) {
      recordRuntimeErrorOnce("observer-lifecycle:disconnect-all", err, { phase: "disconnectAllNostrodomusObservers", reason: cleanReason });
    }

    const after = observerLifecycleRegistryCounts();
    summary.after = after;
    for (const name of Object.keys(before)) {
      summary.registries[name] = observerLifecycleRegistrySummary(name, before, after, pendingByRegistry[name] || 0);
      summary.disconnected += summary.registries[name].disconnected;
    }
    summary.pendingRecords = Object.values(summary.registries).reduce((sum, item) => sum + (item.pendingRecords || 0), 0);
    state.observerLifecycleDisconnects = (state.observerLifecycleDisconnects || 0) + 1;
    state.observerLifecycleLastDisconnect = summary;
    recordPerformanceEvent("observer-lifecycle-disconnect", 0, `${summary.disconnected}:${cleanReason}`);
    return summary;
  }

  return {
    observerLifecycleDisconnectGateEnabled,
    observerLifecycleCloseDryRunGateEnabled,
    observerLifecycleCloseDryRunListenerGateEnabled,
    observerLifecycleRegistryCounts,
    observerLifecycleCountTotal,
    observerLifecycleCloseBindingReadiness,
    observerLifecycleCloseDryRunReadout,
    observerLifecycleCloseDryRunListenerReadout,
    observerLifecycleCloseDryRunListenerProbe,
    observerLifecycleCloseDryRunWouldInspect,
    observerLifecycleCloseDryRunProbe,
    observerLifecycleReadout,
    observerLifecycleRegistrySummary,
    disconnectObserverLifecycleMapValues,
    disconnectObserverLifecycleSingle,
    disconnectAllNostrodomusObservers,
  };
}
