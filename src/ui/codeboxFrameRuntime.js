// The codebox frame host and the keyboard containment of the editor. The frame is drawn by the
// host's own stylesheet (codeboxStyle.js). A separate, measured frame element is not used (see
// docs/contracts/STYLE_OWNERSHIP_CONTRACT.md), so the functions named "external frame" only
// mark the frame host and remove any such element. Dependencies are injected.

export function createCodeboxFrameRuntime(ctx = {}) {
  const {
    state,
    cancelAnimationFrame = globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout = globalThis.clearTimeout?.bind?.(globalThis),
    applyCodeboxStyleTokensToElement,
    activeCodeboxStyleEditor,
    codeboxStyleTokensFromSettings,
    effectiveStyleSettings,
    measurePerformanceEvent,
    recordRuntimeErrorOnce,
    recordPerformanceEvent,
    composedContains,
    isNostrodomusUiEvent,
    codeboxEditorCacheKey,
  } = ctx;

  function codeboxFrameHostForEditor(editor) {
    if (!editor) return null;
    // The frame follows CodeMirror's own box, not the wider Home Assistant wrapper, which the
    // companion layer resizes while the dialog opens.
    if (editor.matches?.(".cm-editor")) return editor;
    const root = editor.getRootNode?.();
    if (root?.host?.localName === "ha-code-editor") return root.host;
    try {
      const closest = editor.closest?.("ha-code-editor");
      if (closest) return closest;
    } catch { /* detached node */ }
    let node = root?.host || editor;
    for (let i = 0; node && i < 12; i += 1) {
      if (node.localName === "ha-code-editor") return node;
      node = node.parentElement || node.getRootNode?.()?.host || null;
    }
    return root?.host || null;
  }

  function codeboxComposedParent(node) {
    if (!node) return null;
    if (node.assignedSlot) return node.assignedSlot;
    if (node.parentElement) return node.parentElement;
    const root = node.parentNode || node.getRootNode?.();
    if (root?.host && root.host !== node) return root.host;
    return null;
  }

  function removeCodeboxExternalFrame() {
    if (state.codeboxFrameRaf) {
      cancelAnimationFrame(state.codeboxFrameRaf);
      state.codeboxFrameRaf = 0;
    }
    state.codeboxFrameLastRectKey = "";
    state.codeboxFrameLastTokenKey = "";
    state.codeboxFramePendingRectKey = "";
    state.codeboxFrameStableFrames = 0;
    state.codeboxFrameEditor = null;
  }

  function scheduleCodeboxExternalFrameSettleSync(editor, tokens, delay = 140, reason = "codebox-frame-settle") {
    const delayMs = Math.max(0, Math.round(Number(delay) || 0));
    const timer = setTimeout(() => {
      state.codeboxFrameSettleTimers?.delete?.(timer);
      try {
        scheduleCodeboxExternalFrameSync(editor, tokens, reason);
      } catch (err) {
        recordRuntimeErrorOnce?.("codebox-frame:settle-sync", err, { phase: "scheduleCodeboxExternalFrameSettleSync", reason });
      }
    }, delayMs);
    state.codeboxFrameSettleTimers?.add?.(timer);
    return timer;
  }

  function clearCodeboxExternalFrameSettleTimers(reason = "codebox-frame-settle-clear") {
    const timers = Array.from(state.codeboxFrameSettleTimers || []);
    for (const timer of timers) {
      try { clearTimeout(timer); } catch (err) { recordRuntimeErrorOnce?.("codebox-frame:settle-timer-clear", err, { phase: "clearCodeboxExternalFrameSettleTimers", reason }); }
    }
    state.codeboxFrameSettleTimers?.clear?.();
    if (timers.length) recordPerformanceEvent?.("codebox-frame-settle-timer-cleared", 0, `${timers.length}:${reason}`);
    return timers.length;
  }

  // Marks the frame host of `editor` as framed and gives it the color tokens.
  function markCodeboxFrameHost(editor, tokens) {
    const frameHost = codeboxFrameHostForEditor(editor);
    if (!frameHost) return;
    if (frameHost.dataset.nostrodomusCodeboxFrameHost !== "1") frameHost.dataset.nostrodomusCodeboxFrameHost = "1";
    if (frameHost.dataset.nostrodomusCodeboxFrameReady !== "1") frameHost.dataset.nostrodomusCodeboxFrameReady = "1";
    if (frameHost.dataset.nostrodomusCodeboxFrameVisible !== "1") frameHost.dataset.nostrodomusCodeboxFrameVisible = "1";
    try {
      applyCodeboxStyleTokensToElement?.(frameHost, tokens || codeboxStyleTokensFromSettings?.(effectiveStyleSettings?.()));
    } catch { /* the host keeps the tokens it had */ }
  }

  function syncCodeboxExternalFrame(editor, tokens, reason = "external-frame-disabled") {
    return measurePerformanceEvent?.("codebox-frame-sync-disabled", reason, () => {
      removeCodeboxExternalFrame();
      markCodeboxFrameHost(editor, tokens);
      return false;
    });
  }

  function scheduleCodeboxExternalFrameSync(editor = state.codeboxFrameEditor, tokens = null, _reason = "external-frame-sync-disabled") {
    removeCodeboxExternalFrame();
    markCodeboxFrameHost(activeCodeboxStyleEditor?.() || editor, tokens);
    return false;
  }

  function removeCodeboxKeyboardContainment(reason = "keyboard-containment-reset") {
    const entries = Array.isArray(state.codeboxKeyboardContainmentHandlers) ? state.codeboxKeyboardContainmentHandlers : [];
    let removed = 0;
    for (const entry of entries) {
      try { entry?.target?.removeEventListener?.(entry.type, entry.handler, entry.options || false); removed += 1; } catch { /* foreign listener target */ }
    }
    state.codeboxKeyboardContainmentHandlers = [];
    state.codeboxKeyboardContainmentEditor = null;
    state.codeboxKeyboardContainmentKey = "";
    state.lastCodeboxKeyboardContainment = { at: new Date().toISOString(), reason, removed };
    if (removed) recordPerformanceEvent?.("codebox-keyboard-containment-reset", 0, `${removed}:${reason}`);
    return removed;
  }

  function eventPathHasCodeboxEditor(path, editor) {
    if (!Array.isArray(path) || !editor) return false;
    return path.some((node) => {
      if (!node) return false;
      if (node === editor) return true;
      try { if (node.matches?.(".cm-editor, .cm-scroller, .cm-content, .cm-line")) return composedContains?.(editor, node); } catch { /* detached node */ }
      return false;
    });
  }

  function shouldContainCodeboxKeyEvent(ev, editor) {
    if (!ev || !editor?.querySelector) return false;
    if (ev.__nostrodomusCodeboxKeyContained) return false;
    if (isNostrodomusUiEvent?.(ev)) return false;
    if (ev.metaKey || ev.key === "F5" || ev.key === "F12") return false;
    const path = ev.composedPath?.() || [];
    if (!eventPathHasCodeboxEditor(path, editor)) return false;
    return true;
  }

  function installCodeboxKeyboardContainment(editor, reason = "keyboard-containment") {
    if (!editor?.querySelector) return false;
    const key = codeboxEditorCacheKey?.(editor);
    if (state.codeboxKeyboardContainmentEditor === editor && state.codeboxKeyboardContainmentKey === key) return false;
    removeCodeboxKeyboardContainment(`new-editor:${reason}`);

    const handler = (ev) => {
      if (!shouldContainCodeboxKeyEvent(ev, editor)) return;
      try { ev.__nostrodomusCodeboxKeyContained = true; } catch { /* foreign event object */ }
      // Bubble-phase only: CodeMirror already receives the event/default action, and Home
      // Assistant's dialog and preview shortcuts do not get it.
      try { ev.stopPropagation(); } catch { /* foreign event object */ }
      state.lastCodeboxKeyContained = {
        at: new Date().toISOString(),
        reason,
        type: ev.type,
        key: String(ev.key || ev.code || "").slice(0, 32),
      };
    };

    const targets = [];
    const addTarget = (target) => {
      if (!target?.addEventListener || targets.includes(target)) return;
      targets.push(target);
    };
    addTarget(editor);
    addTarget(editor.querySelector?.(".cm-scroller"));
    addTarget(editor.querySelector?.(".cm-content"));

    for (const target of targets) {
      for (const type of ["keydown", "keyup"]) {
        try {
          target.addEventListener(type, handler, false);
          state.codeboxKeyboardContainmentHandlers.push({ target, type, handler, options: false });
        } catch { /* foreign listener target */ }
      }
    }

    state.codeboxKeyboardContainmentEditor = editor;
    state.codeboxKeyboardContainmentKey = key;
    state.lastCodeboxKeyboardContainment = { at: new Date().toISOString(), reason, targets: targets.length };
    if (targets.length) recordPerformanceEvent?.("codebox-keyboard-containment-install", 0, `${targets.length}:${reason}`);
    return targets.length > 0;
  }

  return {
    codeboxFrameHostForEditor,
    codeboxComposedParent,
    removeCodeboxExternalFrame,
    scheduleCodeboxExternalFrameSettleSync,
    clearCodeboxExternalFrameSettleTimers,
    syncCodeboxExternalFrame,
    scheduleCodeboxExternalFrameSync,
    removeCodeboxKeyboardContainment,
    eventPathHasCodeboxEditor,
    shouldContainCodeboxKeyEvent,
    installCodeboxKeyboardContainment,
  };
}
