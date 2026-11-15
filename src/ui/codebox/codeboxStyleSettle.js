// When the codebox style pass runs: the scheduler (one pass per frame, plus passes at 120, 420
// and 950ms for reasons that need the settle cascade), the deferred pass after a Style slider is
// released, and which reasons count as a passive settle. applyCodeboxStyleSettings is injected
// from codeboxStyleRuntime.js.

export function createCodeboxStyleSettle(deps = {}) {
  const {
    setTimeout = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout = globalThis.clearTimeout?.bind?.(globalThis),
    requestAnimationFrame = globalThis.requestAnimationFrame?.bind?.(globalThis),
    state,
    recordPerformanceEvent,
    styleRangeGroupTouchesSyntax,
    clearStyleRangeLivePreviewCache,
    scheduleSourceClassSyntaxRefresh,
    codeboxStyleSettleReasonCoalesceDecision,
    codeboxStyleReasonNeedsSettle,
    maybeSkipSourceClassSteadyStateStyleReapply,
    applyCodeboxStyleSettings,
  } = deps;

  function cancelStyleRangeCommitReapply(reason = "style-range-live") {
    if (!state.settingsRangeCommitTimer) return false;
    clearTimeout(state.settingsRangeCommitTimer);
    state.settingsRangeCommitTimer = 0;
    state.settingsRangeCommitCancelCount = (state.settingsRangeCommitCancelCount || 0) + 1;
    state.lastStyleRangeCommitCancel = { at: new Date().toISOString(), reason };
    recordPerformanceEvent("style-range-commit-cancelled", 0, reason);
    return true;
  }

  function scheduleStyleRangeCommitReapply(group = "style-range-change") {
    const cleanGroup = String(group || "style-range-change");
    const touchesSyntax = styleRangeGroupTouchesSyntax(cleanGroup);
    state.settingsRangeCommitReasons = state.settingsRangeCommitReasons instanceof Set
      ? state.settingsRangeCommitReasons
      : new Set();
    state.settingsRangeCommitReasons.add(cleanGroup);
    state.settingsRangeCommitTouchesSyntax = !!state.settingsRangeCommitTouchesSyntax || touchesSyntax;

    if (state.settingsRangeCommitTimer) {
      clearTimeout(state.settingsRangeCommitTimer);
      state.settingsRangeCommitCoalesces = (state.settingsRangeCommitCoalesces || 0) + 1;
      recordPerformanceEvent("style-range-commit-coalesced", 0, cleanGroup);
    }

    state.settingsRangeCommitTimer = setTimeout(() => {
      state.settingsRangeCommitTimer = 0;
      const reasons = Array.from(state.settingsRangeCommitReasons || []);
      state.settingsRangeCommitReasons?.clear?.();
      const commitTouchesSyntax = !!state.settingsRangeCommitTouchesSyntax;
      state.settingsRangeCommitTouchesSyntax = false;
      clearStyleRangeLivePreviewCache("style-range-commit");
      scheduleCodeboxStyleReapply("style-range-commit");
      if (commitTouchesSyntax) scheduleSourceClassSyntaxRefresh("settings-syntax-range-commit");
      state.settingsRangeCommitCount = (state.settingsRangeCommitCount || 0) + 1;
      state.lastStyleRangeCommit = {
        at: new Date().toISOString(),
        reason: "style-range-commit",
        groups: reasons.slice(-8),
        touchesSyntax: commitTouchesSyntax,
        deferred: true,
        settleCascadeSkipped: true,
      };
      recordPerformanceEvent("style-range-commit-deferred", 0, `${reasons.slice(-4).join("+") || "style-range-commit"}:syntax=${commitTouchesSyntax ? "1" : "0"}`);
    }, 180);

    state.lastStyleRangeCommitPending = {
      at: new Date().toISOString(),
      group: cleanGroup,
      touchesSyntax,
      deferredMs: 180,
    };
    return true;
  }

  function codeboxStyleReasonIsPassiveEditorSettle(reason = "") {
    const text = String(reason || "").toLowerCase();
    if (!text) return false;
    const passive =
      text.includes("companion-editor-ready") ||
      text.includes("companion-prepaint") ||
      text.includes("dialog-shadow-mutation") ||
      text.includes("click-settle") ||
      text.includes("editor-sentinel-new");
    if (!passive) return false;
    return !(
      text.includes("settings") ||
      text.includes("option-change") ||
      text.includes("range-change") ||
      text.includes("toggle") ||
      text.includes("reset") ||
      text.includes("restore") ||
      text.includes("install") ||
      text.includes("open") ||
      text.includes("no-active-editor")
    );
  }

  function codeboxStyleCanUsePassiveStableFastPath(reason = "", checks = {}) {
    return !!(
      checks.lastAppliedAt &&
      checks.hasEditor &&
      !checks.styleChanged &&
      !checks.editorChanged &&
      !checks.rootCssChanged &&
      codeboxStyleReasonIsPassiveEditorSettle(reason)
    );
  }

  function flushCodeboxStyleReapply(reason = "style-settle") {
    const reasons = Array.from(state.codeboxStylePendingReasons || []);
    state.codeboxStylePendingReasons?.clear?.();
    const label = reasons.length ? reasons.slice(-4).join("+") : reason;
    applyCodeboxStyleSettings(`coalesced-${label}`);
  }

  function clearCodeboxStyleSettleReasonState() {
    state.codeboxStyleSettleReason = "";
    state.codeboxStyleSettleReasonCount = 0;
  }

  function clearCodeboxStyleSettleTimers() {
    try {
      for (const timer of state.codeboxStyleSettleTimers || []) clearTimeout(timer);
      state.codeboxStyleSettleTimers?.clear?.();
      clearCodeboxStyleSettleReasonState();
    } catch { /* teardown sweep */ }
  }

  function shouldCoalesceCodeboxStyleSettleReason(reason = "style-settle") {
    const decision = codeboxStyleSettleReasonCoalesceDecision({ reason, activeTimerCount: state.codeboxStyleSettleTimers?.size || 0, currentReason: state.codeboxStyleSettleReason, currentCount: state.codeboxStyleSettleReasonCount });
    if (!decision.coalesce) return false;
    state.codeboxStyleSettleReasonCoalesces = (state.codeboxStyleSettleReasonCoalesces || 0) + 1;
    state.codeboxStyleSettleReasonCount = decision.count;
    state.lastCodeboxStyleSettleCoalescedReason = decision.reason;
    recordPerformanceEvent("codebox-style-settle-reason-coalesced", 0, decision.reason);
    return true;
  }

  // The reason given by the dispatch hook. That call runs inside CodeMirror's dispatch, right after
  // CodeMirror changed the DOM, so a layout read there makes the browser lay the page out in the
  // middle of the keystroke.
  const EDITOR_DISPATCH_REASON = "editor-dispatch";
  // Visibility checks handed over by the steady-state skip, one per editor, waiting for the next frame.
  const pendingSkipVisibilityChecks = new Map();
  let skipVisibilityFrame = 0;

  // Run the handed-over visibility checks on the next frame, one layout read per editor however
  // many dispatches the frame had. An editor that is no longer visible gets the reapply the skip
  // held back, in the frame it would have run in.
  function verifySkippedReapplyNextFrame(editor, isVisible) {
    pendingSkipVisibilityChecks.set(editor, isVisible);
    if (skipVisibilityFrame) return;
    skipVisibilityFrame = requestAnimationFrame(() => {
      skipVisibilityFrame = 0;
      const checks = Array.from(pendingSkipVisibilityChecks.values());
      pendingSkipVisibilityChecks.clear();
      if (state.enabled === false) return;
      let visible = true;
      for (const check of checks) {
        try { if (!check()) visible = false; } catch { visible = false; }
      }
      if (visible) return;
      state.codeboxStylePendingReasons?.add?.(EDITOR_DISPATCH_REASON);
      if (!state.codeboxStyleReapplyRaf) flushCodeboxStyleReapply(EDITOR_DISPATCH_REASON);
    });
  }

  function scheduleCodeboxStyleReapply(reason = "style-settle") {
    if (state.enabled === false) return false; // uninstalled: no pass runs after it
    const skipOptions = reason === EDITOR_DISPATCH_REASON ? { verifyVisibleLater: verifySkippedReapplyNextFrame } : undefined;
    if (maybeSkipSourceClassSteadyStateStyleReapply(reason, skipOptions)) return false;
    state.codeboxStylePendingReasons?.add?.(String(reason || "style-settle"));
    if (!state.codeboxStyleReapplyRaf) {
      state.codeboxStyleReapplyRaf = requestAnimationFrame(() => {
        state.codeboxStyleReapplyRaf = 0;
        flushCodeboxStyleReapply(reason);
      });
    }

    if (!codeboxStyleReasonNeedsSettle(reason)) return;
    const settleReason = String(reason || "style-settle");
    if (shouldCoalesceCodeboxStyleSettleReason(settleReason)) return;
    state.codeboxStyleGeneration = (state.codeboxStyleGeneration || 0) + 1;
    const generation = state.codeboxStyleGeneration;
    clearCodeboxStyleSettleTimers();
    state.codeboxStyleSettleReason = settleReason;
    state.codeboxStyleSettleReasonCount = 1;
    state.lastCodeboxStyleSettlePendingReason = settleReason;
    for (const delay of [120, 420, 950]) {
      const timer = setTimeout(() => {
        state.codeboxStyleSettleTimers?.delete?.(timer);
        if (generation !== state.codeboxStyleGeneration) return;
        applyCodeboxStyleSettings(`${settleReason}-settle-${delay}`);
        if (!(state.codeboxStyleSettleTimers?.size || 0)) clearCodeboxStyleSettleReasonState();
      }, delay);
      state.codeboxStyleSettleTimers?.add?.(timer);
    }
  }

  return {
    cancelStyleRangeCommitReapply,
    scheduleStyleRangeCommitReapply,
    codeboxStyleReasonIsPassiveEditorSettle,
    codeboxStyleCanUsePassiveStableFastPath,
    flushCodeboxStyleReapply,
    clearCodeboxStyleSettleReasonState,
    clearCodeboxStyleSettleTimers,
    shouldCoalesceCodeboxStyleSettleReason,
    scheduleCodeboxStyleReapply,
  };
}
