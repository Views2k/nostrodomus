// Quiet-window semantics fixture (generated from
// reference/companions/nostrodomus-picker-safe.js). The functions between the VERBATIM
// markers are lifted byte-for-byte from source; quiet_window_semantics.test.mjs
// re-extracts each from source and asserts byte-identity, so they cannot drift.
//
// The shim above the markers provides a deterministic, test-controlled clock and
// timer queue (the source uses performance.now / setTimeout / window /
// __nostrodomusRuntimeCoordinatorV1). Shadowing performance & window as module consts
// also satisfies eslint's no-undef under the Node test globals. Do not edit the
// verbatim region.

// ---- test-controlled shim (NOT part of the verbatim transplant) ----
export const __clock = { t: 0 };
const performance = { now: () => __clock.t };

let __timerQueue = [];
let __timerSeq = 1;
const setTimeout = (fn, ms) => {
  const id = __timerSeq++;
  __timerQueue.push({ id, fn, due: __clock.t + (Number(ms) || 0) });
  return id;
};
const clearTimeout = (id) => {
  __timerQueue = __timerQueue.filter((x) => x.id !== id);
};

const window = {};
const __nostrodomusCompanionWarn = () => {};
let __nostrodomusRuntimeCoordinatorV1 = null;
let __nostrodomusPickerEditorQuietFlushTimer = 0;

const __nostrodomusPickerSafeSharedState = {
  hasPickerTargets: false,
  skippedCodeEditorEvents: 0,
  scheduledPasses: 0,
  appliedPasses: 0,
  editorInputQuietUntil: 0,
  editorInputQuietMs: 1000,
  editorInputQuietSuppressions: 0,
  editorInputQuietFlushes: 0,
  lastEditorInputQuietReason: "",
};

export function __setCoordinator(coordinator) { __nostrodomusRuntimeCoordinatorV1 = coordinator; }
export function __setPickerApply(fn) { window.NostrodomusPickerSafe = { apply: fn }; }
export function __pendingTimerCount() { return __timerQueue.length; }
export function __advanceClock(ms) {
  __clock.t += Number(ms) || 0;
  // Fire due timers oldest-first, re-querying after each (defer re-arms timers).
  for (;;) {
    const due = __timerQueue
      .filter((x) => x.due <= __clock.t)
      .sort((a, b) => a.due - b.due);
    if (!due.length) break;
    const next = due[0];
    __timerQueue = __timerQueue.filter((x) => x.id !== next.id);
    next.fn();
  }
}
export function __resetQuietFixture() {
  __clock.t = 0;
  __timerQueue = [];
  __timerSeq = 1;
  __nostrodomusRuntimeCoordinatorV1 = null;
  __nostrodomusPickerEditorQuietFlushTimer = 0;
  delete window.NostrodomusPickerSafe;
  delete window.NostrodomusPickerOnly;
  Object.assign(__nostrodomusPickerSafeSharedState, {
  hasPickerTargets: false,
  skippedCodeEditorEvents: 0,
  scheduledPasses: 0,
  appliedPasses: 0,
  editorInputQuietUntil: 0,
  editorInputQuietMs: 1000,
  editorInputQuietSuppressions: 0,
  editorInputQuietFlushes: 0,
  lastEditorInputQuietReason: "",
});
}

// >>> VERBATIM-QUIET-BEGIN
function __nostrodomusNowMs() {
  try { return performance.now(); } catch { return Date.now(); }
}

function __nostrodomusMarkEditorInputQuiet(reason = "code-editor-input") {
  const now = __nostrodomusNowMs();
  __nostrodomusPickerSafeSharedState.editorInputQuietUntil = Math.max(
    __nostrodomusPickerSafeSharedState.editorInputQuietUntil || 0,
    now + (__nostrodomusPickerSafeSharedState.editorInputQuietMs || 1000)
  );
  __nostrodomusPickerSafeSharedState.lastEditorInputQuietReason = reason;
  try { __nostrodomusRuntimeCoordinatorV1?.markQuiet?.("editor-input", __nostrodomusPickerSafeSharedState.editorInputQuietMs || 1000, reason, "picker-safe"); } catch {}
}

function __nostrodomusEditorInputQuietActive() {
  if (__nostrodomusNowMs() < (__nostrodomusPickerSafeSharedState.editorInputQuietUntil || 0)) return true;
  try { return !!__nostrodomusRuntimeCoordinatorV1?.isQuiet?.("editor-input"); } catch { return false; }
}

function __nostrodomusDeferPickerWorkDuringEditorInput(reason = "picker-work", applyFn = null) {
  if (!__nostrodomusEditorInputQuietActive()) return false;

  __nostrodomusPickerSafeSharedState.editorInputQuietSuppressions += 1;
  __nostrodomusPickerSafeSharedState.lastEditorInputQuietReason = reason;

  if (__nostrodomusPickerEditorQuietFlushTimer) {
    clearTimeout(__nostrodomusPickerEditorQuietFlushTimer);
    __nostrodomusPickerEditorQuietFlushTimer = 0;
  }

  const localRemaining = Math.max(0, (__nostrodomusPickerSafeSharedState.editorInputQuietUntil || 0) - __nostrodomusNowMs());
  const coordinatorRemaining = (() => { try { return __nostrodomusRuntimeCoordinatorV1?.remaining?.("editor-input") || 0; } catch { return 0; } })();
  const remaining = Math.max(160, Math.ceil(Math.max(localRemaining, coordinatorRemaining) + 160));
  try { __nostrodomusRuntimeCoordinatorV1?.noteSuppression?.("picker-work", reason, "picker-safe"); } catch {}

  __nostrodomusPickerEditorQuietFlushTimer = setTimeout(() => {
    __nostrodomusPickerEditorQuietFlushTimer = 0;
    if (__nostrodomusEditorInputQuietActive()) {
      __nostrodomusDeferPickerWorkDuringEditorInput(`${reason}-extended`, applyFn);
      return;
    }
    __nostrodomusPickerSafeSharedState.editorInputQuietFlushes += 1;
    const apply =
      applyFn ||
      window.NostrodomusPickerSafe?.apply ||
      window.NostrodomusPickerOnly?.apply ||
      null;
    try { if (typeof apply === "function") apply(); } catch (e) { __nostrodomusCompanionWarn("[nostrodomus-picker-safe] quiet flush failed", e); }
  }, remaining);

  return true;
}

function __nostrodomusSkipCodeEditorHotpath(event, reason = "code-editor-event") {
  if (!__nostrodomusIsCodeMirrorEvent(event)) return false;
  __nostrodomusMarkEditorInputQuiet(reason);
  __nostrodomusPickerSafeSharedState.skippedCodeEditorEvents += 1;
  return true;
}

function __nostrodomusSetPickerTargetPresence(value) {
  __nostrodomusPickerSafeSharedState.hasPickerTargets = Boolean(value);
}

function __nostrodomusClassText(node) {
  const cls = node?.className;
  if (!cls) return "";
  if (typeof cls === "string") return cls;
  if (typeof cls.baseVal === "string") return cls.baseVal;
  return String(cls || "");
}

function __nostrodomusIsCodeMirrorEvent(event) {
  const path = event?.composedPath?.() || [];
  return path.some((node) => {
    const local = node?.localName || "";
    const cls = ` ${__nostrodomusClassText(node)} `;
    return (
      local === "ha-code-editor" ||
      cls.includes(" cm-editor ") ||
      cls.includes(" cm-content ") ||
      cls.includes(" cm-scroller ") ||
      cls.includes(" cm-line ")
    );
  });
}
// <<< VERBATIM-QUIET-END

export {
  __nostrodomusPickerSafeSharedState,
  __nostrodomusNowMs,
  __nostrodomusMarkEditorInputQuiet,
  __nostrodomusEditorInputQuietActive,
  __nostrodomusDeferPickerWorkDuringEditorInput,
  __nostrodomusSkipCodeEditorHotpath,
  __nostrodomusSetPickerTargetPresence,
  __nostrodomusClassText,
  __nostrodomusIsCodeMirrorEvent,
};
