// The typing quiet window of the companion layer.
//
// A keydown in CodeMirror opens the window (markEditorInputQuiet), and work that should wait
// for a pause in typing goes through deferDuringTyping, which holds it until the window closes.
// The window is also recorded on the coordinator's "editor-input" channel, so a standalone
// picker script sees the same window. While the companion layer is dormant, deferDuringTyping
// never defers.
//
// Completion is never deferred: it is the work typing is for. The guard is used by the
// diagnostics refresh and the picker fix.

import { companionModuleDormant } from './coordinatorRuntime.js';

function classText(node) {
  const cls = node?.className;
  if (!cls) return '';
  if (typeof cls === 'string') return cls;
  if (typeof cls.baseVal === 'string') return cls.baseVal;
  return String(cls || '');
}

// True when the event comes from inside CodeMirror. Classes are matched as whole words, so
// cm-content-wrapper is not cm-content.
export function isCodeMirrorEvent(event) {
  const path = event?.composedPath?.() || [];
  return path.some((node) => {
    const local = node?.localName || '';
    const cls = ` ${classText(node)} `;
    return (
      local === 'ha-code-editor' ||
      cls.includes(' cm-editor ') ||
      cls.includes(' cm-content ') ||
      cls.includes(' cm-scroller ') ||
      cls.includes(' cm-line ')
    );
  });
}

const EDITOR_INPUT_QUIET_CHANNEL = 'editor-input';
const DEFAULT_EDITOR_INPUT_QUIET_MS = 1000;

/** @param {Record<string, any>} [deps] */
export function createInputQuietRuntime(deps = {}) {
  const {
    globalRef = globalThis,
    storage,
    coordinator,
    quietMs = DEFAULT_EDITOR_INPUT_QUIET_MS,
    now = () => {
      try { return globalRef?.performance?.now?.() ?? Date.now(); } catch { return Date.now(); }
    },
    setTimeout: setTimeoutRef = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: clearTimeoutRef = globalThis.clearTimeout?.bind?.(globalThis),
  } = deps;

  // Per-instance quiet-window state.
  const sharedState = {
    editorInputQuietUntil: 0,
    editorInputQuietMs: quietMs,
    editorInputQuietSuppressions: 0,
    editorInputQuietFlushes: 0,
    lastEditorInputQuietReason: '',
  };
  let quietFlushTimer = 0;
  // Deferred work keyed by reason: a second defer with the same reason replaces the first, and
  // each other reason keeps its own entry, so one caller's defer never cancels another's.
  const pendingDeferrals = new Map();

  const coord = () => coordinator || globalRef?.__nostrodomusRuntimeCoordinatorV1 || null;

  function markEditorInputQuiet(reason = 'code-editor-input') {
    const t = now();
    sharedState.editorInputQuietUntil = Math.max(sharedState.editorInputQuietUntil || 0, t + (sharedState.editorInputQuietMs || DEFAULT_EDITOR_INPUT_QUIET_MS));
    sharedState.lastEditorInputQuietReason = reason;
    try { coord()?.markQuiet?.(EDITOR_INPUT_QUIET_CHANNEL, sharedState.editorInputQuietMs || DEFAULT_EDITOR_INPUT_QUIET_MS, reason, 'companion-input-quiet'); } catch { /* coordinator absent */ }
  }

  function editorInputQuietActive() {
    if (now() < (sharedState.editorInputQuietUntil || 0)) return true;
    try { return !!coord()?.isQuiet?.(EDITOR_INPUT_QUIET_CHANNEL); } catch { return false; }
  }

  function dormant() {
    return companionModuleDormant({ globalRef, storage });
  }

  // Returns false, and the caller runs its work now, while the layer is dormant or no quiet
  // window is open. Otherwise it queues `applyFn`, schedules one flush for after the window
  // (scheduled again while typing goes on), and returns true.
  function deferDuringTyping(reason = 'companion-deferred-work', applyFn = null) {
    if (dormant()) return false;
    if (!editorInputQuietActive()) return false;

    sharedState.editorInputQuietSuppressions += 1;
    sharedState.lastEditorInputQuietReason = reason;

    if (typeof applyFn === 'function') pendingDeferrals.set(reason, applyFn);

    if (quietFlushTimer) { try { clearTimeoutRef(quietFlushTimer); } catch { /* */ } quietFlushTimer = 0; }

    const localRemaining = Math.max(0, (sharedState.editorInputQuietUntil || 0) - now());
    const coordinatorRemaining = (() => { try { return coord()?.remaining?.(EDITOR_INPUT_QUIET_CHANNEL) || 0; } catch { return 0; } })();
    const remaining = Math.max(160, Math.ceil(Math.max(localRemaining, coordinatorRemaining) + 160));
    try { coord()?.noteSuppression?.('companion-deferred-work', reason, 'companion-input-quiet'); } catch { /* */ }

    quietFlushTimer = setTimeoutRef(() => {
      quietFlushTimer = 0;
      // Still typing: re-arm without touching the queue so every client's work survives the wait.
      // A layer that turned dormant meanwhile does not re-arm, so the queue is flushed now.
      if (editorInputQuietActive() && deferDuringTyping(`${reason}-extended`, null)) return;
      sharedState.editorInputQuietFlushes += 1;
      const work = Array.from(pendingDeferrals.values());
      pendingDeferrals.clear();
      for (const fn of work) {
        try { fn(); } catch { /* one failing caller does not stop the others */ }
      }
    }, remaining);

    return true;
  }

  // Opens the quiet window for an event from inside CodeMirror. Returns true for such an event.
  function skipCodeEditorHotpath(event, reason = 'code-editor-event') {
    if (!isCodeMirrorEvent(event)) return false;
    markEditorInputQuiet(reason);
    return true;
  }

  function snapshot() {
    return {
      active: editorInputQuietActive(),
      dormant: dormant(),
      remainingMs: Math.max(0, Math.round((sharedState.editorInputQuietUntil || 0) - now())),
      suppressions: sharedState.editorInputQuietSuppressions,
      flushes: sharedState.editorInputQuietFlushes,
      lastReason: sharedState.lastEditorInputQuietReason,
    };
  }

  // Uninstall: cancel the pending flush so no deferred work runs afterwards.
  function cleanup() {
    if (quietFlushTimer) { try { clearTimeoutRef(quietFlushTimer); } catch { /* */ } quietFlushTimer = 0; }
    pendingDeferrals.clear();
    sharedState.editorInputQuietUntil = 0;
  }

  return {
    isCodeMirrorEvent,
    markEditorInputQuiet,
    editorInputQuietActive,
    deferDuringTyping,
    skipCodeEditorHotpath,
    snapshot,
    cleanup,
    sharedState,
  };
}
