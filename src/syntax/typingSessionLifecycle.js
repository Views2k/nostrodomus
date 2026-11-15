// Nostrodomus Typing-session quiet-mode lifecycle: tracks active typing windows so syntax repaints
// and diagnostics defer while the user is typing.
// Cross-module calls go through the shared syntax runtime api object.

export function createTypingSessionLifecycle(deps) {
  const {
    activeCodeboxStyleEditor,
    codeboxEditorCacheKey,
    recordPerformanceEvent,
    scheduleDiagnosticsRefresh,
    state,
    api,
  } = deps;
  const TYPING_SESSION_EXIT_MS = 150;

  function noteTypingSessionSuppressed(area = "syntax", reason = "typing-session") {
    const key = String(area || "syntax");
    const clean = String(reason || "typing-session").slice(0, 120);
    state.typingSessionSuppressed = state.typingSessionSuppressed || Object.create(null);
    state.typingSessionSuppressed[key] = (state.typingSessionSuppressed[key] || 0) + 1;
    state.lastTypingSessionSuppression = { at: new Date().toISOString(), area: key, reason: clean, active: !!state.typingSessionActive };
    recordPerformanceEvent("typing-session-suppressed", 0, `${key}:${clean}`);
    return true;
  }

  function typingSessionOwnsEditorDispatchSettling() {
    const last = state.typingSessionLastChangeTs || 0;
    return !!state.typingSessionActive || (last > 0 && Date.now() - last <= 350);
  }

  function finishTypingSession(view, reason = "typing-session-exit") {
    state.typingSessionExitTimer = 0;
    const elapsed = Date.now() - (state.typingSessionLastChangeTs || 0);
    if (elapsed < TYPING_SESSION_EXIT_MS) {
      state.typingSessionExitTimer = setTimeout(() => finishTypingSession(view, reason), Math.max(1, TYPING_SESSION_EXIT_MS - elapsed));
      return;
    }
    state.typingSessionActive = false;
    const editor = view?.dom?.querySelector ? view.dom : activeCodeboxStyleEditor();
    state.lastTypingSessionExit = { at: new Date().toISOString(), reason, editorKey: codeboxEditorCacheKey(editor), suppressed: { ...(state.typingSessionSuppressed || {}) } };
    recordPerformanceEvent("typing-session-exit", 0, reason);
    api.scheduleSourceClassSmartSyntax(editor, "typing-session-exit");
    scheduleDiagnosticsRefresh("typing-session-exit");
  }

  function enterTypingSession(view, reason = "editor-dispatch") {
    state.typingSessionActive = true;
    state.typingSessionLastChangeTs = Date.now();
    if (state.typingSessionExitTimer) {
      clearTimeout(state.typingSessionExitTimer);
      state.typingSessionExitTimer = 0;
    }
    state.typingSessionExitTimer = setTimeout(() => finishTypingSession(view, `${reason}-quiet`), TYPING_SESSION_EXIT_MS);
  }

  return {
    noteTypingSessionSuppressed,
    typingSessionOwnsEditorDispatchSettling,
    enterTypingSession,
  };
}
