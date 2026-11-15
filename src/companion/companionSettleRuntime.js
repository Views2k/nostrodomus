// Decides when the companion layer styles the editor again after Home Assistant changed it.
//
// The triggers are a MutationObserver on the home-assistant root, one on the shadow roots of the
// open card dialog, a watcher of each card dialog's own shadow root (open and close), listeners
// for pointer, click and window focus, and a settle ladder of timers out to 2800ms that
// follows the dialog while it opens and sizes itself. All of them go through one scheduler that
// runs at most once per frame and skips mutation triggers while the user is typing.
//
// The scheduler calls the injected `scheduleReapply`, which finds the editor and applies the
// styles; this module does neither. Every path does nothing while the companion layer is
// dormant. Nothing polls.

// The settle ladder timings.
export const SETTLE_LADDER_MS = [0, 16, 40, 80, 140, 220, 340, 520, 780, 1100, 1500, 2100, 2800];

// One physical click arrives as pointerdown, mousedown and click, and a busy dashboard can
// mutate many times a second. A ladder already covers the next 2800ms, so a second one inside
// this window adds timers and applies without adding coverage.
export const SETTLE_BURST_MS = 400;
// A click or a focus change in an open dialog: the dialog is already laid out, the open/close
// watcher and the size observer cover structural changes, so four re-applies spread over a
// second are enough.
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

// The shadow roots under `root` that the dialog observer watches: a subtree observer does not
// cross shadow boundaries, and on Home Assistant 2026.6 the editor sits several shadow roots
// deep. Depth-capped, and it enters only the editor hosts in `hostSelector` (the same bound
// codeboxEnlargeRuntime uses), not every element. With no selector it returns `root` alone.
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
    // Whether the companion layer is active. Every path does nothing while it is not.
    isActive = () => false,
    // Finds the editor and applies the styles (scheduleCodeboxStyleReapply in main).
    scheduleReapply = () => {},
    // Whether a card editor dialog with content is in the document.
    editDialogPresent = () => false,
    // Every card editor dialog element in the document, open or closed. Home Assistant keeps a
    // closed dialog attached with an empty shadow root, so watching that root shows exactly when
    // the dialog opens and closes.
    editDialogElements = () => [],
    // Whether an editor is known to the runtime. With no dialog and no editor there is nothing
    // for an interaction to keep styled.
    editorKnown = () => true,
    // Whether the current page can hold a code editor outside a card dialog. Only the boot
    // ladder asks.
    pageMayHostEditor = () => defaultPageMayHostEditor(globalRef),
    now = () => Date.now(),
    // The open card editor dialog element to observe, or null while it has no size.
    activeDialog = () => null,
    homeRoot = () => null,
    // Whether a batch of mutations calls for a re-apply. Main leaves out a batch that changes
    // only CodeMirror's own elements (mutationRecordsAreCodeMirrorOnly).
    shouldHandleMutation = () => true,
    // True while the user is typing. Mutation triggers are dropped then; the ladder rungs that
    // follow still run.
    isTypingQuiet = () => false,
    // Opens the typing window for a keydown in CodeMirror.
    markTyping = () => {},
    isNostrodomusUiEvent = () => false,
    eventIsInsideCodeMirror = () => false,
    recordPerformanceEvent = () => {},
    // The editor hosts whose shadow roots the dialog observer enters
    // (OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR). Empty: only the dialog's own shadow root.
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

  // Timers are unref'd where that exists: the public runtime contract test boots the built
  // bundle in Node, and an unref'd timer does not keep its event loop alive. In a browser a
  // timer id is a number without `.unref`.
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

  // The one scheduler: at most one re-apply per frame, however many triggers fire.
  function scheduleLifecycle(reason = 'companion-settle', options = {}) {
    if (!isActive()) return;
    // A mutation trigger is dropped while the user types. A ladder rung is not, even when the
    // ladder was armed by a mutation and its reason says so: the dialog still has to be sized
    // while the user types.
    if (!options.settleRung && String(reason || '').includes('mutation') && isTypingQuiet()) {
      state.quietDeferrals += 1;
      return;
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
      try { scheduleReapply(`companion-settle-${runReason}`); state.applyCount += 1; } catch { /* the observers keep running */ }
      const dialog = activeDialog();
      if (dialog && dialog.shadowRoot) refreshDialogObserver(dialog);
      else if (!editDialogPresent()) disconnectDialogObserver();
    };
    state.lifecycleRaf = typeof rafRef === 'function' ? rafRef(run) : (run(), 0);
  }

  // The settle ladder: one re-apply at each step of `ladder`, out to 2800ms by default, while the
  // dialog opens (wa-dialog has no size at first) and sizes itself. Rungs run while the user types.
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

  // The observer of the open dialog's shadow roots. A new dialog element gets a new observer;
  // shadow roots that appeared since the last call are added to it.
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

  // Starts the home-root observer and the listeners. The home observer re-applies when the
  // dashboard changes and arms the settle ladder while a dialog is present. Runs once.
  function boot(reason = 'boot') {
    if (state.booted) return true;
    const hr = homeRoot();
    if (!hr || typeof MutationObserverRef !== 'function') {
      // Retry until the home-assistant root mounts, at most MAX_BOOT_RETRIES times, so a page
      // that never has one (the headless public runtime contract test) stops retrying.
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
      // Home Assistant's preview rebuild run synchronously in every keystroke (measured on a
      // 708-line card: 810ms of blocked main thread for 30 keystrokes, against 68ms without those
      // listeners). keydown marks the typing window before any text is inserted.
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
    // directly). Its reason is not the boot reason: a reason containing "install" asks for a
    // full apply and the settle cascade at every rung. A rung that fires while there is nothing
    // to style only looks for a dialog element to watch, so a dashboard pays no editor search.
    armSettleWindow('boot-settle', SETTLE_LADDER_MS, { skipWhileNothingToStyle: true });
    recordPerformanceEvent('companion-settle-boot', 0, reason);
    return true;
  }

  // Called by main when it finds an editor dialog, in addition to the home observer: arms the
  // ladder and observes the dialog.
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
