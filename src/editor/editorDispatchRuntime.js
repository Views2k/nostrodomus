import * as activeEditor from './activeEditor.js';
import { looksLikeView } from './activeEditor.js';
import * as codeMirrorBridge from './codeMirrorBridge.js';

// Runtime owner for CodeMirror view memory, dispatch hooks, and repeat-pressure quiet windows.
// Keep popup/provider/style owners injected through callbacks so this module owns only editor dispatch
// lifecycle and does not become a second completion runtime.

export const EDITOR_DISPATCH_REPEAT_PRESSURE_MS = 420;
export const EDITOR_DISPATCH_REPEAT_THRESHOLD_MS = 90;
const EDITOR_DISPATCH_QUIET_TELEMETRY_NAMES = new Set([
  'source-class-smart-syntax-reason-coalesced',
  'source-class-syntax-refresh-reason-coalesced',
  'syntax-recovery-timer-coalesced',
  'scheduler-skipped-hidden',
  'syntax.native-highlight.stable-editor-lifecycle-dedupe',
  'active-editor-cache-hit',
]);

function defaultNow() {
  return Date.now();
}

export function createEditorDispatchRuntime(deps = {}) {
  const {
    windowRef = globalThis.window,
    state,
    runtimeCoordinator = null,
    runtimeCoordinatorId = 'main-completion-runtime',
    now = defaultNow,
    setTimeout: setTimer = globalThis.setTimeout,
    clearTimeout: clearTimer = globalThis.clearTimeout,
    recordPerformanceEvent = () => {},
    recordRuntimeErrorOnce = () => {},
    logDebug = () => {},
    codeboxEditorCacheKey = () => '',
    scheduleCodeboxStyleReapply = () => {},
    scheduleDiagnosticsRefresh = () => {},
    activeContextDiagnosticsSection = () => false,
    typingSessionOwnsEditorDispatchSettling = () => false,
    enterTypingSession = () => {},
    updateSnippetSessionAfterDispatch = () => {},
    requestLiveUpdate = () => {},
    popupIsOpen = () => false,
    // The last* breadcrumbs below are only read through the diagnostics API. This says whether
    // diagnostics are recording; when they are not, a keystroke builds no breadcrumb.
    diagnosticsRecording = () => true,
  } = deps;

  if (!state || typeof state !== 'object') {
    throw new Error('createEditorDispatchRuntime requires a mutable state object');
  }

  function editorDispatchRepeatPressureActive(at = now()) {
    return at < (state.editorDispatchRepeatPressureUntil || 0);
  }

  function quietEditorDispatchTelemetryEvent(name = '', detail = '') {
    const key = String(name || '').slice(0, 96);
    if (!key) return null;
    const events = state.editorDispatchQuietTelemetryEvents || (state.editorDispatchQuietTelemetryEvents = Object.create(null));
    const bucket = events[key] || (events[key] = { count: 0, lastDetail: '' });
    bucket.count += 1;
    bucket.lastDetail = String(detail || '').slice(0, 96);
    state.editorDispatchQuietTelemetryTotal = (state.editorDispatchQuietTelemetryTotal || 0) + 1;
    if (diagnosticsRecording()) state.lastEditorDispatchQuietTelemetry = { at: new Date(now()).toISOString(), name: key, detail: bucket.lastDetail, count: bucket.count };
    return bucket;
  }

  function shouldQuietEditorDispatchTelemetryEvent(name = '', durationMs = 0) {
    if (!editorDispatchRepeatPressureActive()) return false;
    if ((Number(durationMs) || 0) > 0) return false;
    return EDITOR_DISPATCH_QUIET_TELEMETRY_NAMES.has(String(name || ''));
  }

  function editorDispatchQuietTelemetrySummary() {
    const events = state.editorDispatchQuietTelemetryEvents || {};
    return Object.entries(events)
      .sort((a, b) => (b[1]?.count || 0) - (a[1]?.count || 0))
      .slice(0, 6)
      .map(([name, bucket]) => `${name}:${bucket?.count || 0}`)
      .join(',');
  }

  function resetEditorDispatchQuietTelemetry() {
    state.editorDispatchQuietTelemetryEvents = Object.create(null);
    state.editorDispatchQuietTelemetryTotal = 0;
  }

  function markRuntimeQuiet(channel = 'default', durationMs = 0, reason = 'quiet') {
    try {
      return runtimeCoordinator?.markQuiet?.(channel, durationMs, reason, runtimeCoordinatorId) || null;
    } catch {
      return null;
    }
  }

  function scheduleEditorDispatchRepeatPressureFlush() {
    if (state.editorDispatchRepeatPressureFlushTimer) {
      try { clearTimer(state.editorDispatchRepeatPressureFlushTimer); } catch { /* injected delegate */ }
    }
    const current = now();
    const wait = Math.max(120, (state.editorDispatchRepeatPressureUntil || current) - current + 35);
    state.editorDispatchRepeatPressureFlushTimer = setTimer(() => {
      state.editorDispatchRepeatPressureFlushTimer = 0;
      if (editorDispatchRepeatPressureActive()) {
        scheduleEditorDispatchRepeatPressureFlush();
        return;
      }
      const quietTotal = state.editorDispatchQuietTelemetryTotal || 0;
      const summary = editorDispatchQuietTelemetrySummary();
      resetEditorDispatchQuietTelemetry();
      state.editorDispatchRepeatPressureFlushes = (state.editorDispatchRepeatPressureFlushes || 0) + 1;
      if (diagnosticsRecording()) state.lastEditorDispatchRepeatPressureFlush = {
        at: new Date(now()).toISOString(),
        quietedEvents: quietTotal,
        summary,
        changes: state.editorDispatchRepeatPressureChangeCount || 0,
      };
      if (quietTotal) recordPerformanceEvent('editor-dispatch-repeat-pressure-quieted', 0, `events=${quietTotal}:${summary}`);
      if (!typingSessionOwnsEditorDispatchSettling() && activeContextDiagnosticsSection()) scheduleDiagnosticsRefresh('editor-dispatch-repeat-pressure-quiet');
      scheduleCodeboxStyleReapply('editor-dispatch-repeat-pressure-quiet');
    }, wait);
  }

  function noteEditorDispatchRepeatPressure(view, oldDocLength = 0, newDocLength = 0) {
    const current = now();
    const previousAt = state.editorDispatchLastDocChangeAt || 0;
    const deltaMs = previousAt ? current - previousAt : Infinity;
    const rapid = deltaMs <= EDITOR_DISPATCH_REPEAT_THRESHOLD_MS;
    state.editorDispatchLastDocChangeAt = current;
    state.editorDispatchLastDocLength = newDocLength;
    if (!rapid) return false;
    state.editorDispatchRepeatPressureUntil = current + EDITOR_DISPATCH_REPEAT_PRESSURE_MS;
    markRuntimeQuiet('editor-input', EDITOR_DISPATCH_REPEAT_PRESSURE_MS, 'editor-dispatch-repeat-pressure');
    markRuntimeQuiet('editor-dispatch-repeat-pressure', EDITOR_DISPATCH_REPEAT_PRESSURE_MS, 'editor-dispatch-repeat-pressure');
    state.editorDispatchRepeatPressureChangeCount = (state.editorDispatchRepeatPressureChangeCount || 0) + 1;
    if (diagnosticsRecording()) state.lastEditorDispatchRepeatPressure = {
      at: new Date(current).toISOString(),
      deltaMs: Math.max(0, Math.round(deltaMs)),
      oldDocLength,
      newDocLength,
      editorKey: codeboxEditorCacheKey(view?.dom || view),
    };
    scheduleEditorDispatchRepeatPressureFlush();
    return true;
  }

  function isNostrodomusUiEvent(ev) {
    return activeEditor.isNostrodomusUiEvent(ev, { state });
  }

  function isViewAllowed(view = state.view) {
    return activeEditor.isViewAllowed(view, { state, window: windowRef });
  }

  function viewFromEvent(ev) {
    return activeEditor.viewFromEvent(ev, { state, window: windowRef });
  }

  function afterDispatch(view, oldDocLength = 0, oldSel = null, oldDoc = null) {
    try {
      const newDoc = view.state?.doc || null;
      const newDocLength = view.state?.doc?.length ?? getDocLength(view);
      const docChanged = oldDoc && newDoc ? oldDoc !== newDoc : oldDocLength !== newDocLength;

      updateSnippetSessionAfterDispatch(view, oldDocLength, oldSel);
      if (docChanged) {
        enterTypingSession(view, 'editor-dispatch');
        const repeatPressure = noteEditorDispatchRepeatPressure(view, oldDocLength, newDocLength);
        if (repeatPressure) {
          state.editorDispatchRepeatPressureImmediateSkips = (state.editorDispatchRepeatPressureImmediateSkips || 0) + 1;
          if (diagnosticsRecording()) state.lastEditorDispatchRepeatPressureImmediateSkip = { at: new Date(now()).toISOString(), reason: 'editor-dispatch-repeat-pressure' };
        } else {
          scheduleCodeboxStyleReapply('editor-dispatch');
          scheduleDiagnosticsRefresh('editor-dispatch');
        }
      } else {
        state.editorDispatchHotpathSkipped = (state.editorDispatchHotpathSkipped || 0) + 1;
        if (diagnosticsRecording()) state.lastEditorDispatchHotpathSkip = { at: new Date(now()).toISOString(), reason: 'doc-unchanged' };
        recordPerformanceEvent('editor-dispatch-hotpath-skipped', 0, 'doc-unchanged');
      }

      if (popupIsOpen() || state.settings?.keepOpen) {
        requestLiveUpdate();
      }
    } catch (err) {
      recordRuntimeErrorOnce('editor:dispatch-hook-post', err, { phase: 'hookDispatch', postDispatch: true });
    }
  }

  function hookDispatch(view) {
    if (!looksLikeView(view)) return false;
    if (state.hookedView === view) return false;

    unhookDispatch();

    state.hookedView = view;
    state.originalDispatch = view.dispatch.bind(view);

    view.dispatch = (...args) => {
      const oldDoc = view.state?.doc || null;
      const oldDocLength = view.state?.doc?.length ?? getDocLength(view);
      const oldSel = view.state?.selection?.main
        ? {
            from: Math.min(view.state.selection.main.anchor, view.state.selection.main.head),
            to: Math.max(view.state.selection.main.anchor, view.state.selection.main.head),
            head: view.state.selection.main.head,
          }
        : null;

      const result = state.originalDispatch(...args);
      afterDispatch(view, oldDocLength, oldSel, oldDoc);
      return result;
    };

    logDebug('dispatch hooked');
    return true;
  }

  function rememberView(ev) {
    return activeEditor.rememberView(ev, {
      state,
      window: windowRef,
      hookDispatch: view => {
        const hooked = hookDispatch(view);
        if (hooked || state.hookedView === view) scheduleCodeboxStyleReapply('remember-view');
        return hooked;
      },
    });
  }

  function unhookDispatch() {
    if (state.hookedView && state.originalDispatch) {
      try {
        state.hookedView.dispatch = state.originalDispatch;
      } catch (err) {
        recordRuntimeErrorOnce('editor:unhook-dispatch', err, { phase: 'unhookDispatch' });
      }
    }

    if (state.editorDispatchRepeatPressureFlushTimer) {
      try { clearTimer(state.editorDispatchRepeatPressureFlushTimer); } catch { /* injected delegate */ }
      state.editorDispatchRepeatPressureFlushTimer = 0;
    }
    state.hookedView = null;
    state.originalDispatch = null;
    return true;
  }

  function getDoc() {
    return codeMirrorBridge.getDoc(state);
  }

  function getPos() {
    return codeMirrorBridge.getPos(state);
  }

  function getDocLength(view = state.view) {
    return codeMirrorBridge.getDocLength(view);
  }

  return {
    editorDispatchRepeatPressureActive,
    quietEditorDispatchTelemetryEvent,
    shouldQuietEditorDispatchTelemetryEvent,
    editorDispatchQuietTelemetrySummary,
    resetEditorDispatchQuietTelemetry,
    markRuntimeQuiet,
    scheduleEditorDispatchRepeatPressureFlush,
    noteEditorDispatchRepeatPressure,
    isNostrodomusUiEvent,
    isViewAllowed,
    viewFromEvent,
    rememberView,
    hookDispatch,
    unhookDispatch,
    getDoc,
    getPos,
    getDocLength,
  };
}
