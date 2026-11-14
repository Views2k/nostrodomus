// Runtime owner for Nostrodomus codebox frame and keyboard containment behavior.
//
// Dependencies are injected so this module owns the live frame/keyboard behavior
// without importing browser-global singleton state.

export function createCodeboxFrameRuntime(ctx = {}) {
  const {
    window = globalThis.window,
    document = globalThis.document,
    state,
    cancelAnimationFrame = globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout = globalThis.clearTimeout?.bind?.(globalThis),
    activeTopLayerDialog,
    activeEditDialog,
    homeRoot,
    integrationDocumentStyleRoot,
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
    addPersistentListener,
  } = ctx;

  function codeboxFrameHostForEditor(editor) {
    if (!editor) return null;
    // The visible frame must track the actual CodeMirror editor box, not the
    // broader HA wrapper that v17 may continue resizing during open settle.
    if (editor.matches?.(".cm-editor")) return editor;
    const root = editor.getRootNode?.();
    if (root?.host?.localName === "ha-code-editor" && !editor.matches?.(".cm-editor")) return root.host;
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

  function activeCodeboxFramePortalRoot() {
    const topLayerDialog = activeTopLayerDialog?.();
    if (topLayerDialog?.appendChild) return topLayerDialog;

    const dialog = activeEditDialog?.();
    if (dialog?.shadowRoot?.appendChild) return dialog.shadowRoot;
    if (dialog?.appendChild) return dialog;

    const haRoot = homeRoot?.();
    if (haRoot?.appendChild) return haRoot;

    return document?.body || document?.documentElement || integrationDocumentStyleRoot?.();
  }

  function ensureCodeboxExternalFrameHost() {
    const root = activeCodeboxFramePortalRoot();
    const fallback = document?.body || document?.documentElement;
    if (!root?.appendChild) return fallback;

    const rootIsTopLayerDialog = root?.localName === "dialog" && !!root.open;
    let host = null;
    try { host = root.querySelector?.("#nostrodomus-codebox-frame-portal-host-v1") || null; } catch { host = null; }

    if (!host) {
      host = document.createElement("div");
      host.id = "nostrodomus-codebox-frame-portal-host-v1";
      host.dataset.nostrodomusPurpose = "codebox-external-frame-portal";
    }

    host.dataset.nostrodomusPortalRootKind = rootIsTopLayerDialog ? "top-layer-dialog" : "root-portal";
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("width", "100vw", "important");
    host.style.setProperty("height", "100vh", "important");
    host.style.setProperty("overflow", "visible", "important");
    host.style.setProperty("contain", "none", "important");
    host.style.setProperty("isolation", "isolate", "important");
    host.style.setProperty("z-index", "2147483000", "important");
    host.style.setProperty("pointer-events", "none", "important");

    try {
      if (host.parentNode !== root) root.appendChild(host);
      else root.appendChild(host);
    } catch {
      try { fallback.appendChild(host); } catch { /* detached node */ }
    }

    state.codeboxFramePortalHost = host;
    state.codeboxFramePortalRootKind = host.dataset.nostrodomusPortalRootKind || "unknown";
    return host;
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
    if (state.codeboxFrameOverlay?.parentNode) {
      try { state.codeboxFrameOverlay.parentNode.removeChild(state.codeboxFrameOverlay); } catch { /* detached node */ }
    }
    state.codeboxFrameOverlay = null;
    state.codeboxFrameEditor = null;
  }

  function ensureCodeboxExternalFrame(tokens) {
    const host = ensureCodeboxExternalFrameHost();
    if (!host?.appendChild) return null;

    let frame = state.codeboxFrameOverlay;
    if (!frame || frame.parentNode !== host) {
      if (frame?.parentNode) {
        try { frame.parentNode.removeChild(frame); } catch { /* detached node */ }
      }
      frame = document.createElement("div");
      frame.dataset.nostrodomusCodeboxExternalFrame = "1";
      frame.setAttribute("aria-hidden", "true");
      host.appendChild(frame);
      state.codeboxFrameOverlay = frame;
    }

    frame.style.setProperty("position", "absolute", "important");
    frame.style.setProperty("box-sizing", "border-box", "important");
    frame.style.setProperty("pointer-events", "none", "important");
    frame.style.setProperty("border-radius", "24px", "important");
    frame.style.setProperty("border", "1px solid var(--nostrodomus-codebox-frame-border)", "important");
    frame.style.setProperty("background", "transparent", "important");
    frame.style.setProperty("z-index", "1", "important");
    frame.style.setProperty("contain", "none", "important");
    frame.style.setProperty("overflow", "visible", "important");
    frame.style.setProperty("box-shadow", "0 20px 64px rgba(0,0,0,.32), 0 0 0 1px var(--nostrodomus-codebox-frame-border), 0 0 28px var(--nostrodomus-codebox-frame-glow), 0 0 52px var(--nostrodomus-codebox-frame-glow-soft)", "important");
    if (!frame.dataset.nostrodomusFrameReady) {
      frame.style.setProperty("visibility", "hidden", "important");
      frame.style.setProperty("opacity", "0", "important");
    }
    applyCodeboxStyleTokensToElement?.(frame, tokens);
    return frame;
  }

  function codeboxFrameTokenKey(tokens) {
    if (!tokens) return "";
    return [tokens.frameBorder, tokens.frameGlow, tokens.frameGlowSoft, tokens.editorSurface].map(value => String(value || "")).join("|");
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

  function syncCodeboxExternalFrame(editor, tokens, reason = "external-frame-disabled") {
    return measurePerformanceEvent?.("codebox-frame-sync-disabled", reason, () => {
      removeCodeboxExternalFrame();
      const frameHost = codeboxFrameHostForEditor(editor);
      if (frameHost) {
        if (frameHost.dataset.nostrodomusCodeboxFrameHost !== "1") frameHost.dataset.nostrodomusCodeboxFrameHost = "1";
        if (frameHost.dataset.nostrodomusCodeboxFrameReady !== "1") frameHost.dataset.nostrodomusCodeboxFrameReady = "1";
        if (frameHost.dataset.nostrodomusCodeboxFrameVisible !== "1") frameHost.dataset.nostrodomusCodeboxFrameVisible = "1";
        try {
          applyCodeboxStyleTokensToElement?.(frameHost, tokens || codeboxStyleTokensFromSettings?.(effectiveStyleSettings?.()));
        } catch {
        }
      }
      return false;
    });
  }

  function scheduleCodeboxExternalFrameSync(editor = state.codeboxFrameEditor, tokens = null, _reason = "external-frame-sync-disabled") {
    removeCodeboxExternalFrame();
    const frameHost = codeboxFrameHostForEditor(activeCodeboxStyleEditor?.() || editor);
    if (frameHost) {
      if (frameHost.dataset.nostrodomusCodeboxFrameHost !== "1") frameHost.dataset.nostrodomusCodeboxFrameHost = "1";
      if (frameHost.dataset.nostrodomusCodeboxFrameReady !== "1") frameHost.dataset.nostrodomusCodeboxFrameReady = "1";
      if (frameHost.dataset.nostrodomusCodeboxFrameVisible !== "1") frameHost.dataset.nostrodomusCodeboxFrameVisible = "1";
      try {
        applyCodeboxStyleTokensToElement?.(frameHost, tokens || codeboxStyleTokensFromSettings?.(effectiveStyleSettings?.()));
      } catch {
      }
    }
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
      // Bubble-phase only: CodeMirror already receives the event/default action, but HA preview/dialog shortcuts do not.
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

  function installCodeboxExternalFrameEventGuards() {
    if (state.codeboxFrameEventsInstalled) return;
    state.codeboxFrameEventsInstalled = true;
    // The frame overlay is the only thing a scroll or a resize would have to reposition, and
    // nothing creates it while the external frame is disabled. Without this check every scroll
    // event, including each scroll of the code, ran editor discovery (a layout read, or a walk
    // of the page when no editor is known) and built the style tokens, to write nothing.
    const handler = () => {
      if (!state.codeboxFrameOverlay) return;
      scheduleCodeboxExternalFrameSync(state.codeboxFrameEditor, null, "viewport-event");
    };
    addPersistentListener?.(window, "resize", handler, { passive: true }, "codebox-frame-resize");
    addPersistentListener?.(window, "scroll", handler, { passive: true, capture: true }, "codebox-frame-scroll");
  }

  return {
    codeboxFrameHostForEditor,
    codeboxComposedParent,
    activeCodeboxFramePortalRoot,
    ensureCodeboxExternalFrameHost,
    removeCodeboxExternalFrame,
    ensureCodeboxExternalFrame,
    codeboxFrameTokenKey,
    scheduleCodeboxExternalFrameSettleSync,
    clearCodeboxExternalFrameSettleTimers,
    syncCodeboxExternalFrame,
    scheduleCodeboxExternalFrameSync,
    removeCodeboxKeyboardContainment,
    eventPathHasCodeboxEditor,
    shouldContainCodeboxKeyEvent,
    installCodeboxKeyboardContainment,
    installCodeboxExternalFrameEventGuards,
  };
}
