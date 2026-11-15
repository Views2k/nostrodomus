// __nostrodomus.notifyEditorReady: a companion script can report a ready CodeMirror editor before
// the dialog and editor observers have settled. A usable editor is remembered and styled at once;
// otherwise the report schedules presence probes and a style pass.

export function createCompanionReadyRuntime(ctx = {}) {
  const {
    state,
    now = () => Date.now(),
    usableBridgeStyleEditorCandidate = () => null,
    visibleStyleEditorCandidate = () => null,
    stableNativeFallbackLifecycleDecisionForEditor = () => ({ skip: false }),
    suppressStableNativeFallbackEditorLifecycle = () => {},
    scheduleCodeboxExternalFrameSync = () => {},
    primeCodeboxPreflightForEditor = () => {},
    rememberActiveCodeboxEditor = () => {},
    handleEditorSentinelDetected = () => {},
    installSyntaxOwnerObserver = () => {},
    scheduleEditorPresenceProbe = () => {},
    scheduleEditorSettleProbes = () => {},
    scheduleCodeboxStyleReapply = () => {},
  } = ctx;

  if (!state) throw new TypeError('createCompanionReadyRuntime requires state');

  function notifyEditorReadyFromCompanion(detail = {}) {
    const rawReason = String(detail?.reason || 'bridge').slice(0, 48);
    const reason = `companion-editor-ready-${rawReason}`;
    const rawCompanionReason = String(detail?.reason || 'bridge').toLowerCase();
    const ts = now();

    state.editorSentinelLikelyOpeningUntil = ts + 900;
    if (/boot|open|mutation|settle|raf|ms|pointer|click|focus/.test(rawCompanionReason)) {
      state.codeboxFrameHoldUntil = Math.max(state.codeboxFrameHoldUntil || 0, ts + 180);
    }

    const readyEditor = usableBridgeStyleEditorCandidate(detail, reason)
      || (detail?.cmEditor?.querySelector && visibleStyleEditorCandidate(detail.cmEditor) ? detail.cmEditor : null);

    if (readyEditor?.querySelector) {
      const stableLifecycleDecision = stableNativeFallbackLifecycleDecisionForEditor(readyEditor, reason, 'companion-editor-ready-stable-lifecycle');
      if (stableLifecycleDecision.skip) {
        suppressStableNativeFallbackEditorLifecycle(readyEditor, stableLifecycleDecision);
        scheduleCodeboxExternalFrameSync(readyEditor, null, `${reason}-frame-hold`);
        return true;
      }
      try { primeCodeboxPreflightForEditor(readyEditor, reason); } catch { /* mid-frame HA mutation */ }
      rememberActiveCodeboxEditor(readyEditor, reason);
      handleEditorSentinelDetected(reason, readyEditor);
      installSyntaxOwnerObserver(readyEditor, reason);
      scheduleCodeboxExternalFrameSync(readyEditor, null, `${reason}-frame-hold`);
      return true;
    }

    scheduleEditorPresenceProbe(reason);
    scheduleEditorSettleProbes(reason);
    scheduleCodeboxStyleReapply(reason);
    return true;
  }

  return {
    notifyEditorReadyFromCompanion,
  };
}
