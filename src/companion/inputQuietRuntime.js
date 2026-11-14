// Companion input-quiet-window module + the suppression-gap guard.
//
// The typing-session quiet window: mark -> active window, defer -> flush-after-quiet,
// plus the CodeMirror hotpath predicate. The coordinator's `quietWindows`
// "editor-input" channel is the shared substrate (same keys) so an externally-loaded
// picker-safe still interoperates. The module-level functions are pure; the
// mutable state + clock/timer/coordinator are parameterized into the deps-factory.
//
// The one guard (deferDuringTyping) is the suppression-gap closure: every site that
// should pause during a typing burst routes through it, and it returns "no deferral"
// whenever the companion layer is dormant or externally owned, so the wiring is provably
// a no-op until the layer is active (unit-asserted).
//
// Hard rule: completion itself must never be deferred by its own quiet window — the
// feature is the typing path. The guard is wired into diagnostics/inspector/syntax
// refresh, never into completion compute.

import { companionModuleDormant } from './coordinatorRuntime.js';

function classText(node) {
  const cls = node?.className;
  if (!cls) return '';
  if (typeof cls === 'string') return cls;
  if (typeof cls.baseVal === 'string') return cls.baseVal;
  return String(cls || '');
}

// Pure CodeMirror-origin predicate (space-padded class match, so a partial class
// name like cm-content-wrapper does not match).
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
  // Deferred work keyed by reason: repeated defers of the same reason coalesce (replace), but
  // DIFFERENT clients keep distinct entries so one client's defer never cancels another's.
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

  // The one guard. Returns false ("no deferral, run now") whenever the companion
  // layer is dormant/external or no quiet window is open; otherwise suppresses the
  // work and schedules a single trailing flush after the window closes (re-arming
  // if typing continues), returning true.
  function deferDuringTyping(reason = 'companion-deferred-work', applyFn = null) {
    if (dormant()) return false;            // dormant/external -> behaves exactly as today
    if (!editorInputQuietActive()) return false;

    sharedState.editorInputQuietSuppressions += 1;
    sharedState.lastEditorInputQuietReason = reason;

    // Queue this client's work under its own reason. A single shared timer used to hold only ONE
    // applyFn, so a second client deferring within the same quiet window cancelled the first
    // client's deferred work — it silently never ran. Distinct reasons now coexist and all flush.
    if (typeof applyFn === 'function') pendingDeferrals.set(reason, applyFn);

    if (quietFlushTimer) { try { clearTimeoutRef(quietFlushTimer); } catch { /* */ } quietFlushTimer = 0; }

    const localRemaining = Math.max(0, (sharedState.editorInputQuietUntil || 0) - now());
    const coordinatorRemaining = (() => { try { return coord()?.remaining?.(EDITOR_INPUT_QUIET_CHANNEL) || 0; } catch { return 0; } })();
    const remaining = Math.max(160, Math.ceil(Math.max(localRemaining, coordinatorRemaining) + 160));
    try { coord()?.noteSuppression?.('companion-deferred-work', reason, 'companion-input-quiet'); } catch { /* */ }

    quietFlushTimer = setTimeoutRef(() => {
      quietFlushTimer = 0;
      // Still typing: re-arm without touching the queue so every client's work survives the wait.
      if (editorInputQuietActive()) { deferDuringTyping(`${reason}-extended`, null); return; }
      sharedState.editorInputQuietFlushes += 1;
      const work = Array.from(pendingDeferrals.values());
      pendingDeferrals.clear();
      for (const fn of work) {
        try { fn(); } catch { /* fail-dark: deferred work never throws into the loop */ }
      }
    }, remaining);

    return true;
  }

  // Editor-input hotpath: when an event originates in CodeMirror, mark the quiet
  // window so picker/diagnostics/syntax work pauses. Returns true if it was a CM event.
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

  // Cancel the pending trailing flush so a scheduled deferred-work callback can't fire after the
  // plugin is torn down. Wired into the public uninstall path.
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
