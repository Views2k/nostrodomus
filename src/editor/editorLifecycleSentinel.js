// Editor lifecycle sentinel: observes the roots an editor can appear in, runs presence probes when
// something editor-shaped is added, and ignores the mutations CodeMirror makes inside its own tree.

import { CM_CONTAINMENT_SURFACES, CM_EDITOR_TREE, EDITOR_LIFECYCLE_TARGETS, isPanelEditorRoute } from "./haSelectors.js";

// While a card dialog is opening but its codebox is not yet a visible candidate (from 2026.6 the
// wa-dialog opens at zero size and grows later), probes repeat every EDITOR_OPENING_RETRY_MS so the
// codebox is styled as soon as it has its size, not at the first click. EDITOR_OPENING_RETRY_WINDOW_MS
// ends the retries (longer than the 2800 ms settle ladder), so a visual tab without a codebox does
// not keep them running.
const EDITOR_OPENING_RETRY_MS = 120;
const EDITOR_OPENING_RETRY_WINDOW_MS = 4000;

export function createEditorLifecycleSentinelRuntime(deps = {}) {
  const {
    document: documentRef = globalThis.document,
    // The window for the page-change listeners (location-changed, popstate, hashchange). Home
    // Assistant fires `location-changed` on the window when it changes the route.
    window: windowRef = globalThis,
    // style.universalCodebox: panel editors outside the card dialog. When it is off, a page change
    // starts no probes.
    universalCodeboxEnabled = () => true,
    state,
    MutationObserver: MutationObserverRef = globalThis.MutationObserver,
    Node: NodeRef = globalThis.Node,
    requestAnimationFrame: requestAnimationFrameRef = globalThis.requestAnimationFrame?.bind?.(globalThis),
    cancelAnimationFrame: cancelAnimationFrameRef = globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout: setTimeoutRef = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: clearTimeoutRef = globalThis.clearTimeout?.bind?.(globalThis),
    activeEditDialog = () => null,
    // Every card dialog with content, visible or not. It keeps the retries going while the 2026.6
    // dialog is still at zero size: activeEditDialog() is null then, but the dialog is in the DOM.
    editCardDialogCandidates = () => [],
    activeCodeboxStyleEditor = () => null,
    codeboxEditorCacheKey = () => "",
    homeRoot = () => null,
    primeCodeboxPreflightForEditor = () => {},
    rememberActiveCodeboxEditor = () => {},
    scheduleCodeboxStyleReapply = () => {},
    forceStyleRootScanNextFrame = () => {},
    stableNativeFallbackLifecycleDecisionForEditor = () => ({ skip: false }),
    suppressStableNativeFallbackEditorLifecycle = () => {},
    recordPerformanceEvent = () => {},
    recordRuntimeErrorOnce = () => {},
    // Called once per new editor detection, for the selector self-check (selectorSeamProbe.js).
    onEditorSeamProbe = () => {},
    // The companion editor layers (scrollbar styling and codebox sizing) for a found editor. They
    // write nothing while the companion layer is dormant.
    applyCompanionEditorLayer = () => {},
    // The shadow roots, as {root, label}, to observe while an editor opens: on a panel editor route
    // those of the panel host, ha-yaml-editor and ha-code-editor, and in an open card dialog those
    // of its nested editor hosts, so the .cm-editor mount is seen across those boundaries before
    // the first paint. Empty with universalCodebox off.
    panelEditorObservationRoots = () => [],
    // "Hide editor warnings" for the open card dialog. Called by each probe that finds no editor,
    // which covers a dialog on the visual editor tab; with an editor, the companion layer runs it.
    applyEditorWarningHide = () => {},
  } = deps;

  const elementNode = NodeRef?.ELEMENT_NODE || 1;
  const documentFragmentNode = NodeRef?.DOCUMENT_FRAGMENT_NODE || 11;
  const requestFrame = typeof requestAnimationFrameRef === "function"
    ? requestAnimationFrameRef
    : (fn) => setTimeoutRef(fn, 16);
  const cancelFrame = typeof cancelAnimationFrameRef === "function"
    ? cancelAnimationFrameRef
    : (id) => clearTimeoutRef(id);

  function editorSentinelTargetForRoot(root) {
    if (!root) return null;
    if (root === documentRef) return documentRef.documentElement || documentRef;
    return root;
  }

  function editorSentinelLabel(root, fallback = "root") {
    try {
      if (root === documentRef) return "document";
      if (root?.host?.localName) return `shadow:${root.host.localName}`;
      if (root?.localName) return root.localName;
    } catch { /* cross-origin root */ }
    return fallback;
  }

  function editorSentinelRootAlive(root) {
    if (root === documentRef) return true;
    try {
      if (root?.nodeType === documentFragmentNode) return !!root.host && !!root.host.isConnected;
      if (root?.isConnected === false) return false;
      return !!root && !!root.querySelectorAll;
    } catch {
      return false;
    }
  }

  // Disconnects and drops the observers of roots that have left the DOM (a closed card dialog).
  // The map is keyed by root object, and a reopened dialog has new roots, so without this the map
  // would grow with every open and close. Like pruneStyleRootObservers.
  function pruneEditorSentinelObservers(_reason = "editor-sentinel-prune") {
    const observers = state?.editorSentinelObservers;
    if (!observers?.size) return 0;
    let pruned = 0;
    for (const [root, item] of Array.from(observers.entries())) {
      if (editorSentinelRootAlive(root)) continue;
      const observer = item?.observer || item;
      try { observer?.takeRecords?.(); } catch { /* injected observer */ }
      try { observer?.disconnect?.(); } catch { /* injected observer */ }
      observers.delete(root);
      pruned += 1;
    }
    if (pruned && state?.editorSentinelStats) state.editorSentinelStats.prunedRoots = (state.editorSentinelStats.prunedRoots || 0) + pruned;
    return pruned;
  }

  function refreshEditorSentinelRoots(reason = "editor-sentinel-refresh") {
    pruneEditorSentinelObservers(reason);
    const roots = [
      [documentRef, "document"],
      [homeRoot(), "home-assistant-shadow-root"],
    ];
    const dialog = activeEditDialog();
    if (dialog) roots.push([dialog, "active-edit-dialog"]);
    if (dialog?.shadowRoot) roots.push([dialog.shadowRoot, "active-edit-dialog-shadow-root"]);

    // While an editor is opening, also observe the roots from panelEditorObservationRoots, so the
    // .cm-editor mount runs an observer callback before the first paint instead of being found a
    // few frames later by a timed probe, after the unstyled editor was shown.
    // attachEditorSentinelObserver keeps one observer per root and uninstall disconnects them.
    if (universalCodeboxEnabled() && editorLikelyOpeningWithoutMountedCodebox()) {
      for (const entry of panelEditorObservationRoots()) {
        if (entry?.root) roots.push([entry.root, entry.label || editorSentinelLabel(entry.root)]);
      }
    }

    for (const [root, label] of roots) attachEditorSentinelObserver(root, label || editorSentinelLabel(root));
    if (state?.editorSentinelStats) {
      state.editorSentinelStats.observedRoots = state.editorSentinelObservers?.size || 0;
      state.editorSentinelStats.shallowRoots = Array.from(state.editorSentinelObservers?.values?.() || []).filter(item => item?.mode === "shallow").length;
      state.editorSentinelStats.deepRoots = Array.from(state.editorSentinelObservers?.values?.() || []).filter(item => item?.mode === "deep").length;
      state.editorSentinelStats.lastReason = reason;
    }
  }

  function scheduleEditorPresenceProbe(reason = "editor-presence-probe", delay = 0) {
    const run = () => runEditorPresenceProbe(reason);
    if (delay > 0) {
      const delayMs = Math.max(1, Math.round(Number(delay) || 0));
      const key = String(delayMs);
      if (state?.editorSentinelDelayedProbeTimers?.has?.(key)) {
        if (state.editorSentinelStats) {
          state.editorSentinelStats.delayedProbeCoalesces += 1;
          state.editorSentinelStats.lastCoalescedProbeReason = `${delayMs}:${reason}`;
          state.editorSentinelStats.pendingDelayedProbes = state.editorSentinelDelayedProbeTimers?.size || 0;
        }
        recordPerformanceEvent("editor-sentinel-probe-coalesced", 0, `${delayMs}:${reason}`);
        return;
      }
      const timer = setTimeoutRef(() => {
        state?.editorSentinelProbeTimers?.delete?.(timer);
        state?.editorSentinelDelayedProbeTimers?.delete?.(key);
        if (state?.editorSentinelStats) state.editorSentinelStats.pendingDelayedProbes = state.editorSentinelDelayedProbeTimers?.size || 0;
        run();
      }, delayMs);
      state?.editorSentinelProbeTimers?.add?.(timer);
      state?.editorSentinelDelayedProbeTimers?.set?.(key, timer);
      if (state?.editorSentinelStats) {
        state.editorSentinelStats.pendingDelayedProbes = state.editorSentinelDelayedProbeTimers?.size || 0;
        state.editorSentinelStats.lastDelayedProbeReason = `${delayMs}:${reason}`;
      }
      return;
    }
    if (state?.editorSentinelProbeRaf) return;
    state.editorSentinelProbeRaf = requestFrame(() => {
      state.editorSentinelProbeRaf = 0;
      run();
    });
  }

  function scheduleEditorSettleProbes(reason = "editor-sentinel-settle") {
    for (const delay of [60, 180, 420]) scheduleEditorPresenceProbe(`${reason}-${delay}`, delay);
  }

  function handleEditorSentinelDetected(reason = "editor-sentinel-detected", editor = null) {
    const stats = state?.editorSentinelStats;
    const now = Date.now();
    const activeEditor = editor?.querySelector ? editor : activeCodeboxStyleEditor();
    const editorKey = codeboxEditorCacheKey(activeEditor);
    const sameEditor = !!activeEditor?.querySelector &&
      editorKey && editorKey !== "no-editor" &&
      // Known through an earlier detection here, or remembered and styled by another path (the
      // settle ladder, a click).
      (editorKey === (stats?.lastEditorKey || "") || editorKey === (state?.activeEditorCache?.key || "")) &&
      state.codeboxStyleLastEditorKey === editorKey &&
      !state.codeboxStyleCacheInvalidated;

    if (sameEditor) {
      if (stats) {
        stats.lastEditorKey = editorKey;
        stats.duplicateDetections += 1;
        stats.stableSkips += 1;
        stats.lastStableSkipReason = reason;
        stats.lastDetectedAt = now;
        stats.lastDetectedReason = reason;
      }
      if (state?.activeEditorCache) {
        state.activeEditorCache.stableSkips += 1;
        state.activeEditorCache.lastStableSkipReason = reason;
      }
      // The companion layer is applied again on every hit: the first apply for a new editor can run
      // before the editor's shadow roots are complete, and the settle probes (60, 180 and 420 ms)
      // find the same editor again. applyForEditor does nothing when its nodes are already there.
      // rememberActiveCodeboxEditor applies it, so the direct call is only for the branch that does
      // not reach it.
      const stableLifecycleDecision = stableNativeFallbackLifecycleDecisionForEditor(activeEditor, "editor-sentinel-stable-hit", "editor-sentinel-stable-lifecycle");
      if (stableLifecycleDecision.skip) {
        if (activeEditor?.querySelector) {
          try { applyCompanionEditorLayer(activeEditor, `editor-sentinel-stable-${reason}`); } catch { /* never breaks detection */ }
        }
        suppressStableNativeFallbackEditorLifecycle(activeEditor, stableLifecycleDecision);
        return false;
      }
      rememberActiveCodeboxEditor(activeEditor, "editor-sentinel-stable-hit");
      return false;
    }

    if (stats) {
      stats.detections += 1;
      stats.lastDetectedAt = now;
      stats.lastDetectedReason = reason;
      stats.lastImmediateStyleReason = reason;
      stats.lastEditorKey = editorKey;
      stats.lastHandledAt = now;
    }
    state.editorSentinelLikelyOpeningUntil = now + 900;
    state.codeboxStyleCacheInvalidated = true;
    if (activeEditor?.querySelector) {
      try { primeCodeboxPreflightForEditor(activeEditor, `editor-sentinel-new-${reason}`); } catch { /* mid-frame HA mutation */ }
      // rememberActiveCodeboxEditor applies the companion layer.
      rememberActiveCodeboxEditor(activeEditor, "editor-sentinel-new-editor");
    }
    scheduleCodeboxStyleReapply(`editor-sentinel-new-${reason}`);
    forceStyleRootScanNextFrame(`editor-sentinel-new-${reason}`);
    scheduleEditorSettleProbes(`editor-sentinel-new-${reason}`);
    recordPerformanceEvent("editor-sentinel-detected", 0, reason);
    try { onEditorSeamProbe(`editor-sentinel-${reason}`); } catch { /* the self-check never breaks detection */ }
    return true;
  }

  function runEditorPresenceProbe(reason = "editor-presence-probe") {
    if (state?.editorSentinelStats) state.editorSentinelStats.probes += 1;
    refreshEditorSentinelRoots(reason);
    const editor = activeCodeboxStyleEditor();
    if (editor?.querySelector) {
      // An editor was found: the next opening, or a tab without a codebox after this one, gets a
      // new retry window.
      state.editorSentinelOpeningRetryDeadline = 0;
      // The detection applies the companion layer for this editor, and that layer ends with the
      // editor-warning reconcile. Running the reconcile here as well walked the dialog twice per probe.
      return handleEditorSentinelDetected(reason, editor);
    }
    // No editor: this covers a card dialog on the visual editor tab, which has no CodeMirror for
    // the detection above. Does nothing when the setting is off and no sheet was added.
    try { applyEditorWarningHide(); } catch { /* never breaks detection */ }
    // While a card dialog is opening (visible, or still at zero size), the probe repeats: each run
    // is a full discovery, so the editor is found and styled as soon as it is a visible candidate.
    // The retry window ends the repeats on a visual tab without a codebox; a later click still
    // finds an editor through the pointerdown handler.
    if (editorLikelyOpeningWithoutMountedCodebox()) {
      const now = Date.now();
      // After a page change to a route without an editor panel and with no card dialog in the
      // document, nothing is mounting: the six probes of the page change are enough, without the
      // 120 ms retries for four seconds.
      if (navigationOpeningWindowIsIdle()) return false;
      state.editorSentinelLikelyOpeningUntil = now + 700;
      if (!state.editorSentinelOpeningRetryDeadline) {
        state.editorSentinelOpeningRetryDeadline = now + EDITOR_OPENING_RETRY_WINDOW_MS;
      }
      if (state?.editorSentinelStats) {
        state.editorSentinelStats.noEditorRetries += 1;
        state.editorSentinelStats.lastNoEditorRetryReason = reason;
      }
      recordPerformanceEvent("editor-sentinel-no-editor-retry", 0, reason);
      if (now < state.editorSentinelOpeningRetryDeadline) {
        scheduleEditorPresenceProbe("no-editor-opening-retry", EDITOR_OPENING_RETRY_MS);
      }
      return false;
    }
    state.editorSentinelOpeningRetryDeadline = 0;
    return false;
  }

  function attachEditorSentinelObserver(root, label = "editor-sentinel-root") {
    if (!root || typeof MutationObserverRef !== "function") return false;
    const target = editorSentinelTargetForRoot(root);
    if (!target?.querySelectorAll && !target?.childNodes) return false;
    const config = structuralObserverConfigForTarget(target);
    const existing = state?.editorSentinelObservers?.get?.(root);
    if (existing && existing.mode === config.mode) return true;
    if (existing?.observer) {
      try { existing.observer.takeRecords?.(); } catch { /* injected observer */ }
      try { existing.observer.disconnect?.(); } catch { /* injected observer */ }
      state.editorSentinelObservers.delete(root);
    }
    const observer = new MutationObserverRef(records => {
      const recordCount = records?.length || 0;
      if (state?.editorSentinelStats) state.editorSentinelStats.mutationCallbacks += 1;
      if (mutationRecordsAreCodeMirrorOnly(records)) {
        if (state?.editorSentinelStats) state.editorSentinelStats.ignoredCodeMirrorRecords += recordCount;
        if (state?.observerStats) state.observerStats.suppressedCodeMirrorCallbacks += 1;
        return;
      }
      const structural = Array.from(records || []).some(mutationRecordLooksEditorStructural);
      if (!structural) {
        if (state?.observerStats) state.observerStats.suppressedIgnoredCallbacks += 1;
        return;
      }
      recordPerformanceEvent("editor-sentinel-callback", 0, `${recordCount} structural:${label}:${config.mode}`);
      if (state?.editorSentinelStats) state.editorSentinelStats.structuralCallbacks += 1;
      // Something an editor can live in was just added, so this is a new opening. A retry window
      // that has run out is cleared here: only a probe clears it otherwise, and none runs when a
      // dialog closes on the visual editor tab, so the next opening would get no retries. A window
      // that is still running is kept, so one opening has one window however many parts mount.
      if (state.editorSentinelOpeningRetryDeadline && Date.now() >= state.editorSentinelOpeningRetryDeadline) {
        state.editorSentinelOpeningRetryDeadline = 0;
      }
      // One pass over the added nodes: did a panel YAML wrapper or an editor element mount?
      let addedYamlWrapper = false, addedEditorNode = false;
      for (const r of records || []) for (const n of r?.addedNodes || []) {
        if (n?.nodeType !== elementNode) continue;
        if (!addedYamlWrapper && (n.localName === "ha-yaml-editor" || n.querySelector?.("ha-yaml-editor"))) addedYamlWrapper = true;
        if (!addedEditorNode && (n.localName === "ha-code-editor" || n.matches?.(".cm-editor") || n.querySelector?.("ha-code-editor, .cm-editor"))) addedEditorNode = true;
      }
      // A wrapper mounted: a short opening window lets refreshEditorSentinelRoots observe its shadow
      // root and keeps the no-editor backoff off until CodeMirror mounts.
      if (universalCodeboxEnabled() && addedYamlWrapper) {
        state.editorSentinelLikelyOpeningUntil = Math.max(state.editorSentinelLikelyOpeningUntil || 0, Date.now() + 900);
      }
      refreshEditorSentinelRoots(`mutation-${label}`);
      // An editor element mounted in an observed root: detect it now, in this callback before the
      // first paint, so the frame host is set before the editor is shown (the frame-delayed probe
      // lands a frame later). activeCodeboxStyleEditor only finds an editor once .cm-editor exists,
      // and the sameEditor check makes a repeat harmless. This applies to panel editors (no open
      // dialog) and, while a card dialog opens, to codeboxes deep in it (a stack card's sub-card),
      // whose shadow roots panelEditorObservationRoots adds. Form-field editors are still rejected by
      // activeCodeboxStyleEditor.
      if (universalCodeboxEnabled() && addedEditorNode && (!activeEditDialog() || editorLikelyOpeningWithoutMountedCodebox())) {
        try { runEditorPresenceProbe(`editor-sentinel-sync-mount-${label}`); } catch { /* never breaks detection */ }
      }
      scheduleEditorPresenceProbe(`editor-sentinel-mutation-${label}`);
    });
    try {
      observer.observe(target, config.options);
      state.editorSentinelObservers.set(root, { observer, label, target, mode: config.mode, options: config.options });
      if (state?.editorSentinelStats) {
        state.editorSentinelStats.installed = true;
        state.editorSentinelStats.observedRoots = state.editorSentinelObservers.size;
        state.editorSentinelStats.shallowRoots = Array.from(state.editorSentinelObservers.values()).filter(item => item.mode === "shallow").length;
        state.editorSentinelStats.deepRoots = Array.from(state.editorSentinelObservers.values()).filter(item => item.mode === "deep").length;
        state.editorSentinelStats.lastObserverMode = `${label}:${config.mode}`;
      }
      return true;
    } catch (err) {
      recordRuntimeErrorOnce("editor-sentinel:observe", err, { phase: "attachEditorSentinelObserver", label, mode: config.mode });
      return false;
    }
  }

  // Panel editors outside the card dialog, styled when the page opens.
  //
  // The card dialog is styled on open because it mounts in a root the sentinel observes, and
  // `editorLikelyOpeningWithoutMountedCodebox()` keeps the probes going while it settles. Panel
  // editors (Developer Tools Template, automation, script) mount deep inside the shadow tree of
  // `partial-panel-resolver`, which the document and home observers do not see into, and nothing
  // signals that a panel is opening. Without this they would be styled at the next click.
  //
  // On a route change this opens a 2.1 s opening window (no no-editor backoff meanwhile, as while
  // a dialog settles) and schedules six probes. A probe's `activeCodeboxStyleEditor()` finds the
  // panel editor once it has mounted; then the probes end and the window runs out. Does nothing
  // with style.universalCodebox off.
  function onEditorSurfaceNavigation(reason = "navigation") {
    if (!universalCodeboxEnabled()) return false;
    // The half millisecond marks this deadline as the one set here: every other writer stores a
    // whole number, so an equal value means nothing has re-armed the window since the navigation.
    navigationOpeningUntil = Date.now() + 2099.5;
    state.editorSentinelLikelyOpeningUntil = navigationOpeningUntil;
    // A new page is a new opening: the retry window of the previous page does not apply to it.
    state.editorSentinelOpeningRetryDeadline = 0;
    for (const delay of [60, 200, 450, 900, 1500, 2000]) {
      scheduleEditorPresenceProbe(`universal-${reason}`, delay);
    }
    if (state?.editorSentinelStats) {
      state.editorSentinelStats.universalNavigations = (state.editorSentinelStats.universalNavigations || 0) + 1;
      state.editorSentinelStats.lastUniversalNavigationReason = reason;
    }
    recordPerformanceEvent("editor-sentinel-universal-navigation", 0, reason);
    return true;
  }

  let navigationListenerCleanup = null;

  function installEditorSurfaceNavigationListeners() {
    if (navigationListenerCleanup) return;
    const target = windowRef;
    if (!target?.addEventListener) return;
    const handler = () => { try { onEditorSurfaceNavigation("spa-navigation"); } catch { /* the page-change hook never throws */ } };
    const events = ["location-changed", "popstate", "hashchange"];
    for (const type of events) {
      try { target.addEventListener(type, handler, true); } catch { /* injected/stubbed window */ }
    }
    navigationListenerCleanup = () => {
      for (const type of events) {
        try { target.removeEventListener(type, handler, true); } catch { /* teardown sweep */ }
      }
    };
  }

  function removeEditorSurfaceNavigationListeners() {
    if (!navigationListenerCleanup) return;
    try { navigationListenerCleanup(); } catch { /* teardown sweep */ }
    navigationListenerCleanup = null;
  }

  function installEditorLifecycleSentinel(reason = "install-editor-lifecycle-sentinel") {
    refreshEditorSentinelRoots(reason);
    installEditorSurfaceNavigationListeners();
    if (state?.editorSentinelStats) state.editorSentinelStats.installed = true;
    scheduleEditorPresenceProbe(reason);
    scheduleEditorSettleProbes(reason);
  }

  function uninstallEditorLifecycleSentinel(reason = "uninstall-editor-lifecycle-sentinel") {
    removeEditorSurfaceNavigationListeners();
    if (state?.editorSentinelProbeRaf) {
      try { cancelFrame(state.editorSentinelProbeRaf); } catch { /* injected delegate */ }
      state.editorSentinelProbeRaf = 0;
    }
    try {
      for (const timer of state?.editorSentinelProbeTimers || []) clearTimeoutRef(timer);
      state?.editorSentinelProbeTimers?.clear?.();
      state?.editorSentinelDelayedProbeTimers?.clear?.();
      if (state?.editorSentinelStats) state.editorSentinelStats.pendingDelayedProbes = 0;
    } catch { /* teardown sweep */ }
    let removed = 0;
    try {
      for (const item of state?.editorSentinelObservers?.values?.() || []) {
        try { item?.observer?.takeRecords?.(); } catch { /* injected observer */ }
        try { item?.observer?.disconnect?.(); removed += 1; } catch { /* injected observer */ }
      }
      state?.editorSentinelObservers?.clear?.();
    } catch { /* teardown sweep */ }
    if (state?.editorSentinelStats) {
      state.editorSentinelStats.installed = false;
      state.editorSentinelStats.observedRoots = 0;
      state.editorSentinelStats.shallowRoots = 0;
      state.editorSentinelStats.deepRoots = 0;
      state.editorSentinelStats.lastReason = reason;
    }
    if (removed) recordPerformanceEvent("editor-sentinel-disconnected", 0, `${removed}:${reason}`);
    return removed;
  }

  let navigationOpeningUntil = 0;

  function navigationOpeningWindowIsIdle() {
    if (!navigationOpeningUntil || state.editorSentinelLikelyOpeningUntil !== navigationOpeningUntil) return false;
    let path = "";
    try { path = String(windowRef?.location?.pathname || ""); } catch { /* sandboxed window */ }
    // Only the routes that can host an editor keep the retry loop; every other Settings and
    // Developer Tools page is idle like a dashboard.
    if (isPanelEditorRoute(path)) return false;
    try { return editCardDialogCandidates().length === 0; } catch { return false; }
  }

  function editorLikelyOpeningWithoutMountedCodebox() {
    if (Date.now() < (state?.editorSentinelLikelyOpeningUntil || 0)) return true;
    if (activeEditDialog()) return true;
    // From 2026.6 the dialog opens at zero size and grows later; meanwhile activeEditDialog() is
    // null although hui-dialog-edit-card is in the DOM. Counting that dialog as opening keeps the
    // probes going until the editor is a visible candidate. They stop once an editor is found or
    // the dialog has no content any more.
    try { return editCardDialogCandidates().length > 0; } catch { return false; }
  }

  function nodeLooksLikeCodeMirrorInternals(node) {
    if (!node) return false;
    try {
      const el = node.nodeType === elementNode ? node : node.parentElement;
      if (!el) return false;
      if (el.matches?.(CM_CONTAINMENT_SURFACES)) return true;
      return !!el.closest?.(CM_EDITOR_TREE);
    } catch (err) {
      recordRuntimeErrorOnce("editor:codemirror-internals-check", err, { phase: "nodeLooksLikeCodeMirrorInternals" });
      return false;
    }
  }

  function mutationRecordsAreCodeMirrorOnly(records) {
    const list = Array.from(records || []);
    if (!list.length) return false;
    return list.every(record => {
      if (!nodeLooksLikeCodeMirrorInternals(record?.target)) return false;
      for (const node of record?.addedNodes || []) {
        if (!nodeLooksLikeCodeMirrorInternals(node)) return false;
      }
      // Removed nodes are not checked one by one. A removed node is detached when this runs, so
      // it has no CodeMirror ancestor to be recognized by: every text node, token span, line
      // number and selection rectangle CodeMirror replaced while scrolling or selecting counted
      // as foreign. The target above already places the removal inside the CodeMirror tree.
      return true;
    });
  }

  function targetContainsCodeMirror(target) {
    try {
      return !!target?.querySelector?.(".cm-editor, .cm-scroller, .cm-content");
    } catch (err) {
      recordRuntimeErrorOnce("editor:target-contains-codemirror", err, { phase: "targetContainsCodeMirror" });
      return false;
    }
  }

  function structuralObserverConfigForTarget(target) {
    const containsCodeMirror = targetContainsCodeMirror(target);
    // Once CodeMirror exists in a root, never observe the full editor subtree.
    // CodeMirror mutates lines/tokens constantly; a deep observer there turns
    // normal typing and syntax painting into thousands of mutation records.
    return containsCodeMirror
      ? { mode: "shallow", options: { childList: true, subtree: false } }
      : { mode: "deep", options: { childList: true, subtree: true } };
  }

  function mutationRecordLooksEditorStructural(record) {
    for (const node of record?.addedNodes || []) {
      if (node?.nodeType !== elementNode) continue;
      if (node.matches?.(EDITOR_LIFECYCLE_TARGETS)) return true;
      if (node.querySelector?.(EDITOR_LIFECYCLE_TARGETS)) return true;
      // The panel YAML wrapper is not in EDITOR_LIFECYCLE_TARGETS (its ha-code-editor mounts one
      // boundary deeper, in its shadow root), but its mount is when that shadow root needs observing.
      if (node.localName === "ha-yaml-editor") return true;
      if (node.shadowRoot && (node.localName?.includes?.("dialog") || node.localName === "ha-code-editor" || node.localName?.includes?.("code"))) return true;
    }
    return false;
  }

  return {
    editorSentinelTargetForRoot,
    editorSentinelLabel,
    refreshEditorSentinelRoots,
    scheduleEditorPresenceProbe,
    scheduleEditorSettleProbes,
    handleEditorSentinelDetected,
    runEditorPresenceProbe,
    attachEditorSentinelObserver,
    pruneEditorSentinelObservers,
    installEditorLifecycleSentinel,
    uninstallEditorLifecycleSentinel,
    onEditorSurfaceNavigation,
    editorLikelyOpeningWithoutMountedCodebox,
    nodeLooksLikeCodeMirrorInternals,
    mutationRecordsAreCodeMirrorOnly,
    targetContainsCodeMirror,
    structuralObserverConfigForTarget,
    mutationRecordLooksEditorStructural,
  };
}
