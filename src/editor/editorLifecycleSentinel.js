// Persistent editor lifecycle sentinel runtime owner.
// Owns CodeMirror mutation containment and editor-presence probes behind the
// public delegate seams.

import { CM_CONTAINMENT_SURFACES, CM_EDITOR_TREE, EDITOR_LIFECYCLE_TARGETS, isPanelEditorRoute } from "./haSelectors.js";

// Apply-on-open heartbeat: while a card-edit dialog is opening but its codebox is not yet a visible
// candidate (the 2026.6 wa-dialog opens 0-sized and async-settles), keep the no-editor discovery loop
// alive so the chrome applies the instant the editor sizes up — on open, not on the first click.
// EDITOR_OPENING_RETRY_MS is the heartbeat interval; EDITOR_OPENING_RETRY_WINDOW_MS is a hard wall-clock
// ceiling (covers the ~2800ms settle ladder with margin) so a genuinely codeboxless visual tab cannot spin.
const EDITOR_OPENING_RETRY_MS = 120;
const EDITOR_OPENING_RETRY_WINDOW_MS = 4000;

export function createEditorLifecycleSentinelRuntime(deps = {}) {
  const {
    document: documentRef = globalThis.document,
    // The window for SPA-navigation listeners (location-changed / popstate / hashchange).
    // HA fires `location-changed` on window for SPA route changes.
    window: windowRef = globalThis,
    // Gate for the on-open navigation convergence (style.universalCodebox). Default true;
    // when false the navigation handler is a strict no-op.
    universalCodeboxEnabled = () => true,
    state,
    MutationObserver: MutationObserverRef = globalThis.MutationObserver,
    Node: NodeRef = globalThis.Node,
    requestAnimationFrame: requestAnimationFrameRef = globalThis.requestAnimationFrame?.bind?.(globalThis),
    cancelAnimationFrame: cancelAnimationFrameRef = globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout: setTimeoutRef = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: clearTimeoutRef = globalThis.clearTimeout?.bind?.(globalThis),
    activeEditDialog = () => null,
    // All edit-card dialog candidates regardless of visible-surface state. Used to keep
    // the no-editor re-probe loop alive through the 2026.6 wa-dialog's 0-sized async
    // settle, when activeEditDialog() is still null but the dialog is in the DOM.
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
    // Fired once per fresh editor detection so the seam
    // self-check can record which HA-selector categories match the live DOM.
    onEditorSeamProbe = () => {},
    // Additive editor-ready hook for the companion editor layers (scrollbar styling +
    // codebox enlargement). No-op default; the real hooks are gated dormant (no DOM
    // write) unless the companion layer is active, so this never changes behavior on
    // its own.
    applyCompanionEditorLayer = () => {},
    // Returns the panel editor-surface observation roots currently present
    // ({root,label}) — the panel host shadow, the ha-yaml-editor shadow, and the ha-code-editor
    // shadow — so a MutationObserver catches the .cm-editor mount across those nested shadow
    // boundaries (a pre-paint microtask). [] off-panel / when universalCodebox is off.
    panelEditorObservationRoots = () => [],
    // Surface-wide "Hide editor warnings" reconcile. Called on each probe that finds no editor, so
    // it fires when a card-edit dialog is open with NO CodeMirror editor (the visual editor tab).
    // With an editor the companion layer applied by the detection runs it. No-op default.
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
      if (root?.nodeType === NodeRef?.DOCUMENT_FRAGMENT_NODE) return !!root.host && !!root.host.isConnected;
      if (root?.isConnected === false) return false;
      return !!root && !!root.querySelectorAll;
    } catch {
      return false;
    }
  }

  // Disconnect + drop observers whose root has detached (e.g. a closed edit dialog). The Map
  // dedups on root object identity, so a reopened dialog is a fresh key and stale entries would
  // otherwise accumulate per open/close cycle; this keeps editorSentinelObservers bounded.
  // Mirrors pruneStyleRootObservers; only ever prunes roots that are no longer connected.
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

    // Universal panels only: also observe the panel editor wrappers during the opening
    // window so the .cm-editor mount fires an observer callback (a pre-paint microtask) instead
    // of being caught a few frames late by the polled ladder (the open-flash). Leak-safe
    // (attachEditorSentinelObserver dedups + shallows-once-CM + disconnects on uninstall); a no-op when
    // the accessor returns [] (off-panel route / flag off).
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
      // settle ladder, a click). Comparing with the last detection only treated such an editor as
      // new again and repeated the whole new-editor sequence.
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
      // Re-attempt the companion layer on every stable settle hit. applyForEditor
      // is idempotent (first-injector-wins: a no-op when its node already exists or the
      // layer is dormant/external), so repeated calls are safe. The first new-editor apply
      // (below) can race the editor's final shadow-root assembly; the settle probes
      // (60/180/420ms) then re-detect the same editor and would otherwise skip the
      // companion forever.
      // One companion apply per hit: rememberActiveCodeboxEditor makes it, so the direct call is
      // only for the branch that does not reach it.
      const stableLifecycleDecision = stableNativeFallbackLifecycleDecisionForEditor(activeEditor, "editor-sentinel-stable-hit", "editor-sentinel-stable-lifecycle");
      if (stableLifecycleDecision.skip) {
        if (activeEditor?.querySelector) {
          try { applyCompanionEditorLayer(activeEditor, `editor-sentinel-stable-${reason}`); } catch { /* fail-dark: never break detection */ }
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
    try { onEditorSeamProbe(`editor-sentinel-${reason}`); } catch { /* fail-dark: the seam self-check never breaks detection */ }
    return true;
  }

  function runEditorPresenceProbe(reason = "editor-presence-probe") {
    if (state?.editorSentinelStats) state.editorSentinelStats.probes += 1;
    refreshEditorSentinelRoots(reason);
    const editor = activeCodeboxStyleEditor();
    if (editor?.querySelector) {
      // Editor found → the opening race is over; clear the heartbeat ceiling so a later re-open
      // (or a codeboxless tab after this) gets a fresh window.
      state.editorSentinelOpeningRetryDeadline = 0;
      // The detection applies the companion layer for this editor, and that layer ends with the
      // editor-warning reconcile. Running the reconcile here as well walked the dialog twice per probe.
      return handleEditorSentinelDetected(reason, editor);
    }
    // Reconcile the surface-wide editor-warning hide on every probe without an editor — this is the path
    // that covers a card-edit dialog open on the VISUAL editor tab (no CodeMirror, so the editor-detection
    // path above never fires). A cheap no-op when the toggle is off and nothing was injected.
    try { applyEditorWarningHide(); } catch { /* fail-dark: never break detection */ }
    // No visible-candidate editor yet. While an edit-card dialog is opening (activeEditDialog or the
    // 0-sized wa-dialog settle phase, both covered by editorLikelyOpeningWithoutMountedCodebox), keep
    // the discovery loop alive across the settle. The probe re-runs full discovery (CM-gated via
    // visibleStyleEditorCandidate; the form-field skip is intact), so the instant the editor sizes to
    // a candidate it is found → handleEditorSentinelDetected → chrome, on open, no click. Bounded by a
    // hard wall-clock ceiling so a genuinely codeboxless visual tab cannot poll forever (the heartbeat
    // stops; a later click still converges via the document-capture pointerdown path).
    if (editorLikelyOpeningWithoutMountedCodebox()) {
      const now = Date.now();
      // After a navigation to a route that hosts no editor panel, with no edit dialog in the
      // document, nothing is mounting. The six probes scheduled by the navigation cover it; the
      // 120ms retry below would keep itself running for four seconds on every page change.
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
      // Something an editor can live in was just added, so this is a new opening. The heartbeat
      // ceiling of an earlier opening is only cleared by a probe, and none runs when a dialog
      // closes on the visual editor tab: left in place after it ran out, it stopped the retry loop
      // of the next opening before it started. A ceiling that is still running is kept, so one
      // opening keeps one window however many of its parts mount.
      if (state.editorSentinelOpeningRetryDeadline && Date.now() >= state.editorSentinelOpeningRetryDeadline) {
        state.editorSentinelOpeningRetryDeadline = 0;
      }
      // Scan the structural records once — did a panel YAML wrapper or an editor node
      // just mount? (single pass, reused below).
      let addedYamlWrapper = false, addedEditorNode = false;
      for (const r of records || []) for (const n of r?.addedNodes || []) {
        if (n?.nodeType !== elementNode) continue;
        if (!addedYamlWrapper && (n.localName === "ha-yaml-editor" || n.querySelector?.("ha-yaml-editor"))) addedYamlWrapper = true;
        if (!addedEditorNode && (n.localName === "ha-code-editor" || n.matches?.(".cm-editor") || n.querySelector?.("ha-code-editor, .cm-editor"))) addedEditorNode = true;
      }
      // The wrapper just mounted → re-arm a short opening window so refreshEditorSentinelRoots re-includes
      // (and observes) its shadow, and the no-editor backoff stays disabled through the CM mount.
      if (universalCodeboxEnabled() && addedYamlWrapper) {
        state.editorSentinelLikelyOpeningUntil = Math.max(state.editorSentinelLikelyOpeningUntil || 0, Date.now() + 900);
      }
      refreshEditorSentinelRoots(`mutation-${label}`);
      // When an editor node mounts in an observed wrapper, run the same detection synchronously
      // in this pre-paint microtask so frame-host is set before first paint (the deferred rAF probe lands
      // about one frame later: the flash). It is a no-op until .cm-editor exists (runEditorPresenceProbe →
      // activeCodeboxStyleEditor is CM-gated), so frame + scroller sizing stay coupled (corner spec safe);
      // idempotent via the sameEditor guard. Two cases, same synchronous fire:
      //   • Panel (no active dialog).
      //   • Card dialog while opening: added once the card dialog's deep codebox shadow is observed (the
      //     card-dialog arm of panelEditorObservationRoots), so a stack/nested sub-card codebox mounting deep
      //     in the dialog also styles pre-paint instead of flashing in on a post-paint probe. Gated by
      //     editorLikelyOpeningWithoutMountedCodebox() so it is bounded to the open window; the form-field
      //     skip + CM gate still flow through activeCodeboxStyleEditor, so sub-field editors are still rejected.
      if (universalCodeboxEnabled() && addedEditorNode && (!activeEditDialog() || editorLikelyOpeningWithoutMountedCodebox())) {
        try { runEditorPresenceProbe(`editor-sentinel-sync-mount-${label}`); } catch { /* fail-dark: never break detection */ }
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

  // On-open convergence for non-card-dialog panel editors.
  //
  // The card-edit dialog styles on open because it mounts in the top layer / document (a root
  // the sentinel observes) and `editorLikelyOpeningWithoutMountedCodebox()` keeps a re-probe
  // loop alive while it async-settles. HA SPA panel editors (Dev Tools Template, automation,
  // script) instead mount deep inside `partial-panel-resolver`'s shadow tree — a boundary the
  // sentinel's document/home observers cannot cross — and there is no "panel opening" signal,
  // so styling only fires on the next click (the `onPointer` reapply path).
  //
  // This handler is the boundary-agnostic analog: on an SPA route change it arms a time-boxed
  // opening window (which disables the no-editor backoff + teardown for a bounded ~2.1s, like the
  // dialog's settle) and fires a bounded settle-probe ladder. When the panel editor
  // finishes mounting, a probe's `activeCodeboxStyleEditor()` (the universal walk) finds
  // it and styles it — then the ladder ends and the window expires, so it cannot spin. Gated by
  // style.universalCodebox; a strict no-op when the flag is off.
  function onEditorSurfaceNavigation(reason = "navigation") {
    if (!universalCodeboxEnabled()) return false;
    // The half millisecond marks this deadline as the one set here: every other writer stores a
    // whole number, so an equal value means nothing has re-armed the window since the navigation.
    navigationOpeningUntil = Date.now() + 2099.5;
    state.editorSentinelLikelyOpeningUntil = navigationOpeningUntil;
    // A new page is a new opening: the heartbeat ceiling of the previous page does not apply to it.
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
    const handler = () => { try { onEditorSurfaceNavigation("spa-navigation"); } catch { /* fail-dark: navigation hook never throws */ } };
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
    // The 2026.6 wa-dialog editor opens 0-sized and async-settles to full size; during
    // that phase activeEditDialog() is null (visibleDialogSurface() not yet true) even
    // though the hui-dialog-edit-card is in the DOM. Keeping the no-editor re-probe loop
    // alive while an edit-card dialog is present lets discovery converge the moment the
    // editor becomes a visible candidate, on open rather than on the next click. Bounded
    // like the visible-dialog case: the no-editor loop stops once an editor is found
    // (has-editor path) or the dialog leaves the DOM.
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
      // The panel YAML wrapper itself is not in EDITOR_LIFECYCLE_TARGETS (the
      // ha-code-editor mounts one boundary deeper, inside its shadow), but its mount is the cue to
      // nest-observe its shadow — so treat it as structural.
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
    documentFragmentNode,
  };
}
