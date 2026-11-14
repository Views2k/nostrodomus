// Companion settle/persistence runtime — the persistent re-apply trigger engine.
//
// A one-shot apply on detection (often only when a user click triggers detection) does not
// keep the editor styled around the clock. Persistence needs an observer-driven engine:
//   - a home-root MutationObserver (re-apply when the dashboard DOM changes),
//   - a per-dialog shadow-root MutationObserver (re-apply when the dialog DOM changes),
//   - a settle ladder out to 2800ms (ride the dialog open animation / async size-up),
//   - capture-phase interaction listeners,
//   all funnelling into ONE rAF-coalesced, typing-quiet-AWARE scheduler that re-applies.
//   The quiet-awareness is the no-spam guard: DOM-mutation re-applies are skipped while the
//   user is typing (the input-quiet window), so it never thrashes the editor.
//
// This module owns only that persistent trigger, not the apply and not discovery, and drives
// the apply pipeline via the injected `scheduleReapply` (main's `scheduleCodeboxStyleReapply`,
// which discovers the editor and applies main + the companion layers). Observer-driven (no
// poll), filtered + quiet-aware (no spam), dormant-gated (every path is a no-op until the
// companion layer is active). The interaction re-apply already exists in main (onPointer →
// scheduleCodeboxStyleReapply); this adds the persistent dialog observer and the long settle
// ladder.

// The settle ladder timings.
export const SETTLE_LADDER_MS = [0, 16, 40, 80, 140, 220, 340, 520, 780, 1100, 1500, 2100, 2800];

// One physical click arrives as pointerdown, mousedown and click, and a busy dashboard can
// mutate many times a second. A ladder already covers the next 2800ms, so a second one inside
// this window adds timers and applies without adding coverage.
export const SETTLE_BURST_MS = 400;
// A click or a focus change in an open dialog: the dialog is already laid out, the open/close
// watcher and the size observer cover structural changes, so four re-applies spread over a
// second are enough. The full ladder ran thirteen style passes per click.
export const INTERACTION_LADDER_MS = [0, 80, 340, 1100];

// Cap on boot retries while waiting for the home-assistant root (~30s at 250ms each).
const MAX_BOOT_RETRIES = 120;

// Pages that can hold a code editor outside a card dialog: the Settings pages (automation and
// script editors, the Tools pages since 2026.11) and Developer Tools. Kept wide on purpose; a
// page whose address cannot be read counts as one of them.
const EDITOR_PAGE_PATH = /\/(?:config|developer-tools)(?:\/|$)/;

function defaultPageMayHostEditor(globalRef) {
  let path = '';
  try { path = String(globalRef?.location?.pathname || ''); } catch { /* sandboxed window */ }
  return !path || EDITOR_PAGE_PATH.test(path);
}

// Bounded shadow-root walk so the dialog observer reaches the editor's nested shadow on
// 2026.6 (MutationObserver subtree does not cross shadow boundaries). Depth-capped, and it
// descends only into the registry's known editor-host types (`hostSelector`), never a
// wildcard shadow walk (the no-wildcard law; the same bound codeboxEnlargeRuntime uses). With
// no selector it observes just the top dialog shadow.
function walkShadowRoots(root, hostSelector, maxDepth = 12) {
  const out = [];
  const seen = new Set();
  const stack = [{ node: root, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    out.push(node);
    if (depth >= maxDepth || !hostSelector) continue;
    let hosts = [];
    try { hosts = Array.from(node.querySelectorAll?.(hostSelector) || []); } catch { hosts = []; }
    for (const el of hosts) {
      const sr = el && el.shadowRoot;
      if (sr && !seen.has(sr)) stack.push({ node: sr, depth: depth + 1 });
    }
  }
  return out;
}

/** @param {Record<string, any>} [deps] */
export function createCompanionSettleRuntime(deps = {}) {
  const {
    globalRef = globalThis,
    documentRef = globalRef.document,
    MutationObserver: MutationObserverRef = globalRef.MutationObserver,
    requestAnimationFrame: rafRef = globalRef.requestAnimationFrame?.bind?.(globalRef),
    cancelAnimationFrame: cafRef = globalRef.cancelAnimationFrame?.bind?.(globalRef),
    setTimeout: setTimeoutRef = globalRef.setTimeout?.bind?.(globalRef),
    clearTimeout: clearTimeoutRef = globalRef.clearTimeout?.bind?.(globalRef),
    // Companion layer active? Every path no-ops when false (dormant/external/force-dormant).
    isActive = () => false,
    // main's scheduleCodeboxStyleReapply — discovers the editor and applies main + companion.
    scheduleReapply = () => {},
    // Is an edit-card dialog present in the DOM (any visibility)? Drives "should we observe /
    // arm the settle ladder". editCardDialogCandidates().length > 0 from main.
    editDialogPresent = () => false,
    // Every edit-card dialog ELEMENT in the DOM, open or closed. Home Assistant keeps a closed
    // dialog attached with an empty shadow root; watching that root gives an exact open/close
    // signal, so opening no longer depends on a click happening to arm a ladder.
    editDialogElements = () => [],
    // Is an editor currently known to the runtime? With no dialog and no editor there is
    // nothing for an interaction to keep styled.
    editorKnown = () => true,
    // Can the current page hold a code editor outside a card dialog? Only the boot ladder asks.
    pageMayHostEditor = () => defaultPageMayHostEditor(globalRef),
    now = () => Date.now(),
    // The active edit dialog ELEMENT to observe (activeEditDialog), or null while 0-sized.
    activeDialog = () => null,
    homeRoot = () => null,
    // Should this batch of mutations trigger a re-apply? main wires the existing classifiers
    // (skip CodeMirror-text-only, preview-content-only, and Nostrodomus-UI-only churn). Default
    // true so an unwired module still functions (just less filtered).
    shouldHandleMutation = () => true,
    // Input-quiet window: true while the user is mid typing-burst. Mutation re-applies are
    // deferred while quiet (no thrash); the trailing settle-ladder pass catches up after.
    isTypingQuiet = () => false,
    // Mark a CodeMirror-origin input event into the quiet window (the mark side).
    markTyping = () => {},
    isNostrodomusUiEvent = () => false,
    eventIsInsideCodeMirror = () => false,
    recordPerformanceEvent = () => {},
    // Registry-sourced editor-host selector to descend into (OVERLAY_ROOT_TARGETED_SHADOW_
    // HOST_SELECTOR). NEVER `*` — the no-wildcard-shadow law. Empty = observe only the top
    // dialog shadow.
    shadowHostSelector = '',
    maxRootWalkDepth = 12,
  } = deps;

  const state = {
    timers: new Set(),
    settleTimers: new Set(),
    homeObserver: null,
    dialogObserver: null,
    observedDialog: null,
    observedRoots: [],
    lifecycleRaf: 0,
    pendingReason: '',
    booted: false,
    bootRetryTimer: 0,
    bootRetries: 0,
    applyCount: 0,
    lastBurstArmAt: 0,
    burstSkips: 0,
    openWatchers: new Map(),
    settleArmCount: 0,
    bootIdleSkips: 0,
    mutationSkips: 0,
    quietDeferrals: 0,
    listeners: [],
  };

  // All engine timers are unref'd: in Node (the public-runtime contract runner boots the
  // built dist) an unref'd timer never keeps the event loop alive, so the engine can't hang
  // the test runner; in the browser a timer id is a number and `.unref` is absent (the
  // try/catch makes it a no-op), so behavior is unchanged.
  function scheduleTimeout(fn, ms) {
    const t = typeof setTimeoutRef === 'function' ? setTimeoutRef(fn, ms) : 0;
    try { t?.unref?.(); } catch { /* browser timer id is a plain number */ }
    return t;
  }

  function clearTimers() {
    for (const t of state.timers) { try { clearTimeoutRef(t); } catch { /* */ } }
    state.timers.clear();
    state.settleTimers.clear();
  }

  function disconnectDialogObserver() {
    if (state.dialogObserver) { try { state.dialogObserver.disconnect(); } catch { /* */ } }
    state.dialogObserver = null;
    state.observedDialog = null;
    state.observedRoots = [];
  }

  // The single coalesced scheduler. rAF-coalesced (one re-apply per frame however many
  // triggers fire), typing-quiet-aware for mutation-origin reasons. No-op while dormant.
  function scheduleLifecycle(reason = 'companion-settle', options = {}) {
    if (!isActive()) return;
    // Direct mutation-origin triggers coalesce under the typing-quiet window (no thrash). But a
    // settle-LADDER rung is a time-based catch-up that must fire even mid-typing — the dialog still
    // has to be sized while you type. When a ladder is armed by a mutation observer its rung reason
    // carries 'mutation', which wrongly matched this drop and killed the entire catch-up ladder; the
    // settleRung flag exempts ladder rungs so only direct mutation triggers coalesce.
    if (!options.settleRung && String(reason || '').includes('mutation') && isTypingQuiet()) {
      state.quietDeferrals += 1;
      return; // a direct mutation trigger; the ladder's rungs still re-apply after typing settles
    }
    state.pendingReason = reason;
    if (state.lifecycleRaf) return;
    const run = () => {
      state.lifecycleRaf = 0;
      const runReason = state.pendingReason || reason;
      state.pendingReason = '';
      // The home observer cannot see a dialog element mounted outside the home root, so the
      // open/close watchers are also refreshed on every coalesced pass.
      watchDialogElements();
      try { scheduleReapply(`companion-settle-${runReason}`); state.applyCount += 1; } catch { /* fail-dark */ }
      const dialog = activeDialog();
      if (dialog && dialog.shadowRoot) refreshDialogObserver(dialog);
      else if (!editDialogPresent()) disconnectDialogObserver();
    };
    state.lifecycleRaf = typeof rafRef === 'function' ? rafRef(run) : (run(), 0);
  }

  // The settle ladder — rides the wa-dialog's 0-sized async settle out to 2800ms. Each rung
  // is a non-mutation reason, so it re-applies even mid-typing (the dialog still has to be
  // sized correctly while you type).
  /** @param {string} [reason] @param {number[]} [ladder] @param {{ skipWhileNothingToStyle?: boolean }} [options] */
  function armSettleWindow(reason = 'settle', ladder = SETTLE_LADDER_MS, options = {}) {
    if (!isActive()) return;
    state.settleArmCount += 1;
    for (const ms of ladder) {
      const t = scheduleTimeout(() => {
        state.timers.delete(t);
        state.settleTimers.delete(t);
        if (options.skipWhileNothingToStyle && nothingToStyle()) {
          state.bootIdleSkips += 1;
          watchDialogElements();
          return;
        }
        scheduleLifecycle(`${reason}-${ms}ms`, { settleRung: true });
      }, ms);
      state.timers.add(t);
      state.settleTimers.add(t);
    }
  }

  // No card dialog with content in the document, no editor known to the runtime, and a page that
  // holds no editor of its own (a dashboard, not a Settings or Developer Tools page): a style
  // pass has nothing to find. Asked again by every rung, so a dialog that opens or a page change
  // during the ladder gets the rungs that follow.
  function nothingToStyle() {
    try { return !editDialogPresent() && !editorKnown() && !pageMayHostEditor(); } catch { return false; }
  }

  // At most one ladder per SETTLE_BURST_MS for the high-frequency triggers.
  function armSettleBurst(reason, ladder = SETTLE_LADDER_MS) {
    const at = Number(now()) || 0;
    if (state.lastBurstArmAt && at - state.lastBurstArmAt < SETTLE_BURST_MS) {
      state.burstSkips += 1;
      return false;
    }
    state.lastBurstArmAt = at;
    armSettleWindow(reason, ladder);
    return true;
  }

  // The plugin's own stylesheets land in the dialog's shadow root while it is open. Those
  // records are not the dialog opening or closing.
  function onlyOwnStyleRecords(records) {
    if (!records || typeof records.length !== 'number' || !records.length) return false;
    let nodes = 0;
    for (const record of records) {
      for (const list of [record?.addedNodes, record?.removedNodes]) {
        for (const node of list || []) {
          nodes += 1;
          if (node?.localName !== 'style' || !String(node.id || '').startsWith('nostrodomus')) return false;
        }
      }
    }
    return nodes > 0;
  }

  // Watch each edit-card dialog element's own shadow root (direct children only). It fills when
  // the dialog opens and empties when it closes: one record each way, nothing while it is open.
  function watchDialogElements() {
    if (typeof MutationObserverRef !== 'function') return;
    for (const [dialog, observer] of state.openWatchers) {
      if (dialog?.isConnected === false) {
        try { observer.disconnect(); } catch { /* */ }
        state.openWatchers.delete(dialog);
      }
    }
    let elements = [];
    try { elements = editDialogElements() || []; } catch { elements = []; }
    for (const dialog of elements) {
      const root = dialog?.shadowRoot;
      if (!root || state.openWatchers.has(dialog)) continue;
      const observer = new MutationObserverRef((records) => {
        if (!isActive()) return;
        if (onlyOwnStyleRecords(records)) { state.mutationSkips += 1; return; }
        scheduleLifecycle('dialog-state');
        if (editDialogPresent()) armSettleWindow('dialog-state-settle');
      });
      try { observer.observe(root, { childList: true }); state.openWatchers.set(dialog, observer); } catch { /* closed root */ }
    }
  }

  // Per-dialog shadow-root observer. Re-observes only when the dialog element changes; walks
  // nested shadow roots so it reaches the editor's deep shadow on 2026.6 (subtree observation
  // does not cross shadow boundaries).
  function refreshDialogObserver(dialog) {
    if (!dialog || !dialog.shadowRoot || typeof MutationObserverRef !== 'function') {
      if (!editDialogPresent()) disconnectDialogObserver();
      return;
    }
    if (state.observedDialog !== dialog) {
      disconnectDialogObserver();
      state.observedDialog = dialog;
      state.dialogObserver = new MutationObserverRef((mutations) => {
        if (!shouldHandleMutation(mutations)) { state.mutationSkips += 1; return; }
        scheduleLifecycle('dialog-shadow-mutation');
      });
    }
    const observer = state.dialogObserver;
    if (!observer) return;
    // Home Assistant reuses the dialog element, so this list is only reset by a new element. Drop
    // roots whose host left the document so their detached editor subtrees can be collected.
    state.observedRoots = state.observedRoots.filter((root) => root?.host?.isConnected !== false);
    for (const root of walkShadowRoots(dialog.shadowRoot, shadowHostSelector, maxRootWalkDepth)) {
      if (state.observedRoots.includes(root)) continue;
      try { observer.observe(root, { childList: true, subtree: true }); state.observedRoots.push(root); } catch { /* closed root */ }
    }
  }

  // Home-root observer + the typing-mark listeners. The home observer re-applies on dashboard
  // DOM changes and arms the settle ladder when a dialog is present — the reliable open
  // trigger. Idempotent; gated.
  function boot(reason = 'boot') {
    if (state.booted) return true;
    const hr = homeRoot();
    if (!hr || typeof MutationObserverRef !== 'function') {
      // Retry until the home-assistant root mounts — but CAPPED (~30s) so a DOM that never
      // provides one (e.g. the headless public-runtime contract runner) can't retry forever.
      // The timer is unref'd via scheduleTimeout, so even an in-flight retry never blocks Node.
      if (!state.bootRetryTimer && state.bootRetries < MAX_BOOT_RETRIES) {
        state.bootRetries += 1;
        state.bootRetryTimer = scheduleTimeout(() => { state.bootRetryTimer = 0; boot('boot-retry'); }, 250);
      }
      return false;
    }
    state.booted = true;

    state.homeObserver = new MutationObserverRef((mutations) => {
      watchDialogElements();
      if (!shouldHandleMutation(mutations)) { state.mutationSkips += 1; return; }
      scheduleLifecycle('home-mutation');
      if (editDialogPresent()) armSettleBurst('home-mutation-settle');
    });
    try { state.homeObserver.observe(hr, { childList: true, subtree: true }); } catch { /* */ }

    const addListener = (target, type, handler, opts) => {
      try { target.addEventListener(type, handler, opts); state.listeners.push({ target, type, handler, opts }); } catch { /* */ }
    };
    if (documentRef?.addEventListener) {
      const noteInput = (event) => {
        if (isNostrodomusUiEvent(event)) return;
        if (!eventIsInsideCodeMirror(event)) return;
        try { markTyping(event.type || 'editor-input'); } catch { /* */ }
      };
      // keydown only. A script listener for input, beforeinput or compositionupdate makes the
      // browser run a microtask checkpoint inside the editing command, so CodeMirror's flush and
      // Home Assistant's preview rebuild ran synchronously in every keystroke. Measured on a
      // 708-line card: 810ms of blocked main thread for 30 keystrokes with those three
      // listeners, 68ms without them (the same as with the plugin uninstalled). keydown already
      // marks the typing window before any text is inserted.
      addListener(documentRef, 'keydown', noteInput, true);
      const interact = (type) => (event) => {
        if (isNostrodomusUiEvent(event)) return;
        const dialogPresent = editDialogPresent();
        if (!dialogPresent && !editorKnown()) return;
        scheduleLifecycle(type);
        if (dialogPresent) armSettleBurst(`${type}-settle`, INTERACTION_LADDER_MS);
      };
      for (const type of ['pointerdown', 'mousedown', 'click']) addListener(documentRef, type, interact(type), true);
    }
    if (globalRef?.addEventListener) {
      addListener(globalRef, 'focus', () => {
        const dialogPresent = editDialogPresent();
        if (!dialogPresent && !editorKnown()) return;
        scheduleLifecycle('focus');
        if (dialogPresent) armSettleBurst('focus-settle', INTERACTION_LADDER_MS);
      }, { passive: true });
    }

    watchDialogElements();
    scheduleLifecycle(reason);
    // The boot ladder covers an editor that mounts after page load (a panel route opened
    // directly). Its label is deliberately not the boot reason: a rung named "install-…" was
    // routed as a full install apply plus a three-timer cascade, thirteen times per page load.
    // A rung that fires while there is nothing to style only looks for a dialog element to
    // watch: on a dashboard every rung ran editor discovery and the cleanup walks for nothing.
    armSettleWindow('boot-settle', SETTLE_LADDER_MS, { skipWhileNothingToStyle: true });
    recordPerformanceEvent('companion-settle-boot', 0, reason);
    return true;
  }

  // Explicit open trigger main can call when it detects an editor dialog (belt-and-suspenders
  // alongside the home observer): arm the ladder + (re)observe the dialog.
  function onDialogOpen(reason = 'dialog-open') {
    if (!isActive()) return;
    armSettleWindow(reason);
    const dialog = activeDialog();
    if (dialog && dialog.shadowRoot) refreshDialogObserver(dialog);
  }

  function cleanup() {
    clearTimers();
    if (state.bootRetryTimer) { try { clearTimeoutRef(state.bootRetryTimer); } catch { /* */ } state.bootRetryTimer = 0; }
    if (state.lifecycleRaf && typeof cafRef === 'function') { try { cafRef(state.lifecycleRaf); } catch { /* */ } }
    state.lifecycleRaf = 0;
    if (state.homeObserver) { try { state.homeObserver.disconnect(); } catch { /* */ } state.homeObserver = null; }
    for (const observer of state.openWatchers.values()) { try { observer.disconnect(); } catch { /* */ } }
    state.openWatchers.clear();
    state.lastBurstArmAt = 0;
    disconnectDialogObserver();
    for (const { target, type, handler, opts } of state.listeners) { try { target.removeEventListener(type, handler, opts); } catch { /* */ } }
    state.listeners = [];
    state.booted = false;
  }

  function snapshot() {
    return {
      active: isActive(),
      booted: state.booted,
      applyCount: state.applyCount,
      settleArmCount: state.settleArmCount,
      burstSkips: state.burstSkips,
      bootIdleSkips: state.bootIdleSkips,
      openWatchers: state.openWatchers.size,
      mutationSkips: state.mutationSkips,
      quietDeferrals: state.quietDeferrals,
      observedRoots: state.observedRoots.length,
      observingDialog: !!state.observedDialog,
    };
  }

  return { boot, onDialogOpen, scheduleLifecycle, armSettleWindow, cleanup, snapshot };
}
