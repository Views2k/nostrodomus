/* Legacy runtime-contract token preserved: nostrodomus-editor-v17.2.59-preview-mutation-guard-native-events */
/* Settings guard compatibility token preserved: nostrodomus-editor-v17.2.64-settings-tab-guard */
const __nostrodomusCompanionDebug = (() => {
  try { return localStorage.getItem("nostrodomusDebug") === "1"; } catch { return false; }
})();
function __nostrodomusCompanionLog(...args) { if (__nostrodomusCompanionDebug) globalThis.console?.log?.(...args); }
function __nostrodomusCompanionWarn(...args) { if (__nostrodomusCompanionDebug) globalThis.console?.warn?.(...args); }
function __nostrodomusCompanionError(...args) { if (__nostrodomusCompanionDebug) globalThis.console?.error?.(...args); }

function __nostrodomusInstallRuntimeCoordinatorV1(descriptor = {}) {
  const W = globalThis;
  const VERSION_ID = "nostrodomus-runtime-coordinator-v1";
  const now = () => { try { return W.performance?.now?.() || Date.now(); } catch { return Date.now(); } };
  const stamp = () => { try { return new Date().toISOString(); } catch { return ""; } };
  const text = (value, limit = 160) => String(value || "").slice(0, limit);
  const cleanId = (value) => text(value || "runtime", 80) || "runtime";
  const existing = W.__nostrodomusRuntimeCoordinatorV1;
  if (existing?.version === VERSION_ID && typeof existing.register === "function") {
    existing.register(descriptor);
    return existing;
  }
  const state = existing?.state && typeof existing.state === "object" ? existing.state : {
    installedAt: stamp(),
    runtimes: Object.create(null),
    quietWindows: Object.create(null),
    counters: { registered: 0, quietMarks: 0, suppressions: 0 }
  };
  const prune = (obj, max) => {
    const keys = Object.keys(obj || {});
    if (keys.length <= max) return;
    keys.slice(0, keys.length - max).forEach((key) => { try { delete obj[key]; } catch {} });
  };
  const api = {
    version: VERSION_ID,
    state,
    now,
    register(next = {}) {
      const id = cleanId(next.id || next.name);
      state.runtimes[id] = {
        ...(state.runtimes[id] || {}),
        id,
        role: text(next.role || "runtime", 80),
        version: text(next.version || "", 180),
        projectVersion: text(next.projectVersion || "", 40),
        lastSeenAt: stamp()
      };
      state.counters.registered = Object.keys(state.runtimes).length;
      prune(state.runtimes, 12);
      return state.runtimes[id];
    },
    markQuiet(channel = "default", durationMs = 0, reason = "quiet", source = "runtime") {
      const key = text(channel || "default", 80) || "default";
      const duration = Math.max(0, Math.min(5000, Math.round(Number(durationMs) || 0)));
      const prior = state.quietWindows[key] || null;
      state.quietWindows[key] = {
        channel: key,
        until: Math.max(prior?.until || 0, now() + duration),
        durationMs: duration,
        reason: text(reason || "quiet", 160),
        source: cleanId(source),
        updatedAt: stamp()
      };
      state.counters.quietMarks = (state.counters.quietMarks || 0) + 1;
      prune(state.quietWindows, 12);
      return state.quietWindows[key];
    },
    remaining(channel = "default") {
      const key = text(channel || "default", 80) || "default";
      const q = state.quietWindows[key];
      return q ? Math.max(0, Math.ceil((q.until || 0) - now())) : 0;
    },
    isQuiet(channel = "default") { return api.remaining(channel) > 0; },
    noteSuppression(channel = "default", reason = "suppressed", source = "runtime") {
      state.lastSuppression = { channel: text(channel || "default", 80), reason: text(reason || "suppressed", 160), source: cleanId(source), at: stamp() };
      state.counters.suppressions = (state.counters.suppressions || 0) + 1;
      return state.lastSuppression;
    },
    snapshot() {
      const t = now();
      const quietWindows = Object.fromEntries(Object.entries(state.quietWindows || {}).map(([key, value]) => [key, {
        channel: value.channel || key,
        active: Math.max(0, Math.ceil((value.until || 0) - t)) > 0,
        remainingMs: Math.max(0, Math.ceil((value.until || 0) - t)),
        durationMs: value.durationMs || 0,
        reason: value.reason || "",
        source: value.source || "",
        updatedAt: value.updatedAt || ""
      }]));
      return { available: true, version: VERSION_ID, installedAt: state.installedAt || "", runtimes: Object.values(state.runtimes || {}), quietWindows, counters: { ...(state.counters || {}) }, lastSuppression: state.lastSuppression || null };
    }
  };
  W.__nostrodomusRuntimeCoordinatorV1 = api;
  api.register(descriptor);
  return api;
}
__nostrodomusCompanionLog("NOSTRODOMUS V17.2.65 RUNTIME COORDINATOR LOADED", new Date().toISOString());
window.__nostrodomusV172LoadedAt = new Date().toISOString();

(() => {
  const VERSION = "nostrodomus-editor-v17.2.65-runtime-coordinator";
  const runtimeCoordinator = __nostrodomusInstallRuntimeCoordinatorV1({ id: "v17-editor-bridge", role: "editor-layout-runtime", version: VERSION });
  const STYLE_ID = "nostrodomus-editor-v17-2-learned-style";
  const FIT_GAP = 60;

  const WRAPPER_HEIGHT = "calc(94vh - 399px)";
  const CM_HEIGHT = "calc(94vh - 437px)";
  const SCROLLER_HEIGHT = "calc(94vh - 439px)";

  /*
    Simple card editors without Layout / Visibility / Visual Editor option tabs
    have extra unused vertical space above the footer. Use it for the YAML editor.
  */
  const SIMPLE_WRAPPER_HEIGHT = "calc(94vh - 150px)";
  const SIMPLE_CM_HEIGHT = "calc(94vh - 188px)";
  const SIMPLE_SCROLLER_HEIGHT = "calc(94vh - 190px)";

  const state = {
    timers: new Set(),
    observers: [],
    applying: false,
    lastDialog: null,
    lastCodeEditor: null,
    lastLogKey: "",
    applyCount: 0,

    lifecycleRaf: 0,
    pendingReason: "",
    settleTimers: new Set(),
    observedDialog: null,
    observedRoots: [],
    dialogObserver: null,
    dialogModeCache: new WeakMap(),
    previewMutationCallbacksSuppressed: 0,
    lastPreviewMutationQuietReason: "",

    // v17.2.61: keep layout ownership out of the keystroke hot path.
    // Home Assistant/CodeMirror should process typing natively; Nostrodomus only
    // performs a trailing layout pass after the editor has been quiet.
    typingQuietUntil: 0,
    typingQuietTimer: 0,
    typingQuietMs: 1000,
    typingMutationCallbacksSuppressed: 0,
    typingMutationFlushes: 0,
    typingMutationFlushRearms: 0,
    typingStructuralMutationCallbacksSuppressed: 0,
    lastTypingQuietReason: "",
    bridgeNotifySuppressed: 0,
    lastBridgeNotifyAt: 0,
    lastBridgeCodeEditor: null,
    lastBridgeCmEditor: null,
    lastBridgeNotifyKey: "",

    // v17.2.63: held-backspace / 200WPM preview isolation.
    // Let CodeMirror update immediately, but keep HA's live preview from
    // rebuilding on every value-changed event during repeat-pressure.
    previewValueFreezeUntil: 0,
    previewValueFreezeMs: 650,
    previewValueFreezeTimer: 0,
    previewValueFreezeBlocked: 0,
    previewValueFreezeFlushes: 0,
    previewValueFreezeRearms: 0,
    previewValueFreezeAttachedTargets: new WeakSet(),
    previewValueFreezeAttachedList: [],
    previewValueFreezeLastTarget: null,
    previewValueFreezeLastDetail: undefined,
    previewValueFreezeDispatching: false,
    lastPreviewValueFreezeReason: ""
  };

  function killLegacyEditorStack() {
    /*
      The old v16 resource is currently still active as a separate HA resource.
      It contains multiple independent injectors with their own observers/timers.
      Kill those runtimes so v17 is the only controller applying editor layout.
      This does NOT delete the golden v16 file from disk.
    */
    const legacyCleanupNames = [
      "__nostrodomusEditorV161Cleanup",
      "__nostrodomusEditorV16Cleanup",
      "__nostrodomusEditorV151Cleanup",
      "__nostrodomusEditorV15Cleanup",
      "__nostrodomusEditorV144Cleanup",
      "__nostrodomusEditorV143Cleanup",
      "__nostrodomusEditorFinalV14Cleanup",
      "__nostrodomusEditorV163PreviewAddonCleanup",
      "__nostrodomusEditorV164PolishCleanup",
      "__nostrodomusEditorV1644BottomCleanup",
      "__nostrodomusEditorV1645CodeHeightCleanup",
      "__nostrodomusEditorV1646CodeTuneCleanup",
      "__nostrodomusEditorV1647CodeFitCleanup",
      "__nostrodomusEditorV1648DialogBodyCleanup",
      "__nostrodomusEditorV16411MeasuredCleanup",
      "__nostrodomusEditorV16416PersistentCleanup"
    ];

    let killed = 0;

    legacyCleanupNames.forEach((name) => {
      try {
        if (typeof window[name] === "function") {
          window[name]();
          killed += 1;
        }
      } catch (e) {
        __nostrodomusCompanionWarn("[nostrodomus-editor] legacy cleanup failed", name, e);
      }

      /*
        Prevent accidental second cleanup from restoring old inline styles later.
        The old resource will only recreate these on full page reload.
      */
      try {
        window[name] = () => {};
      } catch {}
    });

    function qLocal(root, selector) {
      try { return [...root.querySelectorAll(selector)].filter((el) => el?.isConnected); }
      catch { return []; }
    }

    function walkLocal(root, out = []) {
      if (!root || out.includes(root)) return out;
      out.push(root);

      qLocal(root, "*").forEach((el) => {
        if (el.shadowRoot) walkLocal(el.shadowRoot, out);
      });

      return out;
    }

    const hr = document.querySelector("home-assistant")?.shadowRoot;
    if (hr) {
      walkLocal(hr).forEach((root) => {
        qLocal(root, `
          style[id^="nostrodomus-editor-v16"],
          style[id^="nostrodomus-editor-v15"],
          style[id^="nostrodomus-editor-v14"],
          style[id^="nostrodomus-editor-final-v14"]
        `).forEach((el) => el.remove());
      });
    }

    if (!window.__nostrodomusLegacyStackKilledLogged) {
      window.__nostrodomusLegacyStackKilledLogged = true;
      __nostrodomusCompanionLog("[nostrodomus-editor] legacy stacked runtimes killed", { killed });
    }
  }

  killLegacyEditorStack();

  function q(root, selector) {
    try {
      return [...root.querySelectorAll(selector)].filter((el) => el?.isConnected);
    } catch {
      return [];
    }
  }

  function homeRoot() {
    return document.querySelector("home-assistant")?.shadowRoot || null;
  }

  function walkRoots(root, out = []) {
    if (!root || out.includes(root)) return out;
    out.push(root);

    q(root, "*").forEach((el) => {
      if (el.shadowRoot) walkRoots(el.shadowRoot, out);
    });

    return out;
  }

  function set(el, prop, value) {
    if (!el?.style || value == null) return false;
    const next = String(value);
    if (el.style.getPropertyValue(prop) === next && el.style.getPropertyPriority(prop) === "important") return false;
    el.style.setProperty(prop, next, "important");
    return true;
  }

  function rect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom)
    };
  }

  function isVisible(el) {
    const r = el?.getBoundingClientRect?.();
    if (!r || r.width <= 0 || r.height <= 0) return false;

    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0;
  }

  function isNostrodomusUiNode(node) {
    if (!node || node.nodeType !== 1) return false;

    const id = node.id || "";
    const cls = String(node.className || "");

    if (node.dataset?.nostrodomusUi === "1") return true;
    if (id.startsWith("nostrodomus-completions")) return true;
    if (id.startsWith("nostrodomus-assist")) return true;
    if (cls.includes("nostrodomus-settings") || cls.includes("nostrodomus-suggestion") || cls.includes("nostrodomus-completions")) return true;

    const nostrodomusUiSelector = `
        [data-nostrodomus-ui="1"],
        #nostrodomus-settings-root,
        #nostrodomus-completions-settings-document-host,
        #nostrodomus-completions-settings-global-root,
        #nostrodomus-completions-settings-portal,
        #nostrodomus-completions-root,
        .nostrodomus-settings-panel,
        .nostrodomus-suggestion-popup
      `;

    try {
      if (node.matches?.(nostrodomusUiSelector)) return true;
    } catch {}

    try {
      if (node.closest?.(nostrodomusUiSelector)) return true;
    } catch {}

    const root = node.getRootNode?.();
    const host = root?.host;
    if (host && host !== node) return isNostrodomusUiNode(host);

    return false;
  }

  function isNostrodomusUiEvent(event) {
    const path = event?.composedPath?.() || [];
    return path.some(isNostrodomusUiNode);
  }

  function nodeLooksLikeCodeMirrorElement(node) {
    if (!node) return false;
    try {
      const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!el) return false;
      if (el.matches?.(".cm-content, .cm-line, .cm-scroller, .cm-editor, .cm-gutters, .cm-selectionLayer, .cm-cursorLayer, span.cm")) return true;
      return !!el.closest?.(".cm-content, .cm-line, .cm-scroller, .cm-editor");
    } catch {
      return false;
    }
  }

  function eventIsInsideCodeMirror(event) {
    try {
      const path = event?.composedPath?.() || [];
      return path.some(nodeLooksLikeCodeMirrorElement);
    } catch {
      return false;
    }
  }

  function markCodeMirrorTyping(reason = "typing") {
    const now = performance.now();
    state.typingQuietUntil = Math.max(state.typingQuietUntil || 0, now + state.typingQuietMs);
    state.previewValueFreezeUntil = Math.max(state.previewValueFreezeUntil || 0, now + state.previewValueFreezeMs);
    try {
      runtimeCoordinator?.markQuiet?.("editor-input", state.typingQuietMs, reason, "v17-editor-bridge");
      runtimeCoordinator?.markQuiet?.("preview-value-freeze", state.previewValueFreezeMs, reason, "v17-editor-bridge");
    } catch {}
    state.lastTypingQuietReason = reason;
    state.lastPreviewValueFreezeReason = reason;
  }

  function isWithinTypingQuietWindow() {
    if (performance.now() < (state.typingQuietUntil || 0)) return true;
    try { return !!runtimeCoordinator?.isQuiet?.("editor-input"); } catch { return false; }
  }

  function activeEditorStillConnected() {
    return !!(state.lastCodeEditor?.isConnected);
  }

  function mutationContainsStructuralEditorNode(mutation) {
    const nodes = [
      mutation?.target,
      ...Array.from(mutation?.addedNodes || []),
      ...Array.from(mutation?.removedNodes || [])
    ];

    return nodes.some((node) => {
      const el = elementFromMutationNode(node);
      if (!el) return false;
      try {
        if (el.matches?.(`
          hui-dialog-edit-card,
          ha-dialog,
          hui-card-element-editor,
          hui-stack-card-editor,
          ha-yaml-editor,
          ha-code-editor,
          .element-editor,
          .element-preview,
          .cm-editor,
          .cm-scroller
        `)) return true;
        return !!el.querySelector?.(`
          hui-card-element-editor,
          hui-stack-card-editor,
          ha-yaml-editor,
          ha-code-editor,
          .element-editor,
          .element-preview,
          .cm-editor,
          .cm-scroller
        `);
      } catch {
        return false;
      }
    });
  }

  function mutationsContainStructuralEditorNode(mutations) {
    return Array.from(mutations || []).some(mutationContainsStructuralEditorNode);
  }

  function armTypingQuietFlush(reason = "typing-quiet-mutation") {
    if (state.typingQuietTimer) {
      try { clearTimeout(state.typingQuietTimer); } catch {}
      state.timers.delete(state.typingQuietTimer);
      state.typingQuietTimer = 0;
      state.typingMutationFlushRearms += 1;
    }

    const remaining = Math.max(160, Math.ceil((state.typingQuietUntil || 0) - performance.now() + 160));
    const t = setTimeout(() => {
      state.typingQuietTimer = 0;
      state.timers.delete(t);
      if (isWithinTypingQuietWindow()) {
        armTypingQuietFlush(`${reason}-extended`);
        return;
      }
      state.typingMutationFlushes += 1;
      scheduleLifecycle(`${reason}-flush`);
    }, remaining);

    state.typingQuietTimer = t;
    state.timers.add(t);
  }

  function shouldDeferMutationLifecycle(reason, mutations) {
    if (!String(reason || "").includes("mutation")) return false;
    if (!activeEditorStillConnected()) return false;
    if (!isWithinTypingQuietWindow()) return false;

    if (mutationsContainStructuralEditorNode(mutations)) {
      state.typingStructuralMutationCallbacksSuppressed += 1;
    }

    state.typingMutationCallbacksSuppressed += 1;
    state.lastTypingQuietReason = reason;
    armTypingQuietFlush("typing-quiet-mutation");
    return true;
  }

  function mutationIsOnlyNostrodomusUi(mutation) {
    const nodes = [
      mutation.target,
      ...Array.from(mutation.addedNodes || []),
      ...Array.from(mutation.removedNodes || [])
    ];

    return nodes.length > 0 && nodes.every((node) => {
      if (!node) return true;
      if (node.nodeType !== 1) return true;
      return isNostrodomusUiNode(node);
    });
  }

  function nodeLooksLikeCodeMirrorMutationSurface(node) {
    if (!node) return false;
    try {
      const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!el) return true;
      return nodeLooksLikeCodeMirrorElement(el);
    } catch {
      return false;
    }
  }

  function mutationIsOnlyCodeMirrorEditorText(mutation) {
    const nodes = [
      mutation.target,
      ...Array.from(mutation.addedNodes || []),
      ...Array.from(mutation.removedNodes || [])
    ];
    return nodes.length > 0 && nodes.every(nodeLooksLikeCodeMirrorMutationSurface);
  }

  function mutationsAreOnlyCodeMirrorEditorText(mutations) {
    const list = Array.from(mutations || []);
    return list.length > 0 && list.every(mutationIsOnlyCodeMirrorEditorText);
  }

  function elementFromMutationNode(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) return node;
    try {
      // MutationObserver records from nested preview cards often use the
      // ShadowRoot/DocumentFragment itself as the target. Treat that root's
      // host as the element so preview-content filtering can cross the
      // shadow boundary instead of scheduling a Nostrodomus layout pass on every
      // Home Assistant live-preview redraw.
      if (node.host?.nodeType === Node.ELEMENT_NODE) return node.host;
      if (node.parentElement) return node.parentElement;
      const parent = node.parentNode;
      if (parent?.nodeType === Node.ELEMENT_NODE) return parent;
      if (parent?.host?.nodeType === Node.ELEMENT_NODE) return parent.host;
    } catch {}
    return null;
  }

  function nodeIsPreviewContainer(node) {
    const el = elementFromMutationNode(node);
    if (!el) return false;
    try { if (el.classList?.contains("element-preview")) return true; } catch {}
    return false;
  }

  function nodeIsInsidePreviewPane(node) {
    const el = elementFromMutationNode(node);
    if (!el) return false;
    try {
      if (el.classList?.contains("element-preview") || el.closest?.(".element-preview")) return true;
    } catch {}
    const root = el.getRootNode?.();
    const host = root?.host;
    if (host && host !== el) return nodeIsInsidePreviewPane(host);
    return false;
  }

  function mutationIsPreviewContentOnly(mutation) {
    if (!mutation || mutation.type !== "childList") return false;

    // Content mutations under the rendered preview are Home Assistant's live-card
    // redraws while the user types. They are not editor/dialog layout changes and
    // must not cause Nostrodomus to rerun preview scaling/masking on every keypress.
    if (!nodeIsInsidePreviewPane(mutation.target)) return false;

    const nodes = [
      ...Array.from(mutation.addedNodes || []),
      ...Array.from(mutation.removedNodes || [])
    ];

    // If HA replaces the preview container itself, that is a real layout event.
    if (nodes.some(nodeIsPreviewContainer)) return false;

    return true;
  }

  function mutationsAreOnlyPreviewContent(mutations) {
    const list = Array.from(mutations || []);
    return list.length > 0 && list.every(mutationIsPreviewContentOnly);
  }

  function primeNostrodomusEditorPrepaint(active, reason = "prepaint") {
    if (!active) return false;
    const { codeEditor, codeRoot, cmEditor, cmScroller, cmContent } = active;
    try { codeEditor?.setAttribute?.("data-nostrodomus-codebox-frame-host", "1"); } catch {}
    try { codeEditor?.setAttribute?.("data-nostrodomus-codebox-style", "1"); } catch {}
    for (const node of [cmEditor, cmScroller, cmContent]) {
      try { if (node?.dataset) node.dataset.nostrodomusCodeboxStyle = "1"; } catch {}
    }
    try { if (cmEditor?.dataset) cmEditor.dataset.nostrodomusCodeboxFrameHost = "1"; } catch {}
    try {
      if (cmContent?.dataset && cmContent.dataset.nostrodomusInitialSyntaxReady !== "1") {
        cmContent.dataset.nostrodomusInitialSyntaxPending = "1";
      }
    } catch {}
    try { injectCodeCss(codeRoot); } catch {}
    try { window.__nostrodomus?.notifyEditorReady?.({ reason: `companion-prepaint-${reason}`, companionVersion: VERSION, codeEditor, cmEditor, cmScroller, cmContent }); } catch {}
    return true;
  }


  function isWithinPreviewValueFreezeWindow() {
    if (performance.now() < (state.previewValueFreezeUntil || 0)) return true;
    try { return !!runtimeCoordinator?.isQuiet?.("preview-value-freeze"); } catch { return false; }
  }

  function composedParent(node) {
    if (!node) return null;
    return node.parentElement || node.getRootNode?.()?.host || null;
  }

  function composedClosestLocalName(node, localName) {
    let n = node;
    const target = String(localName || "").toLowerCase();
    while (n) {
      if (String(n.localName || "").toLowerCase() === target) return n;
      n = composedParent(n);
    }
    return null;
  }

  function previewValueFreezeTargets(active) {
    const codeEditor = active?.codeEditor || null;
    const yamlEditor = composedClosestLocalName(codeEditor, "ha-yaml-editor");
    return [codeEditor, yamlEditor].filter(Boolean);
  }

  function flushPreviewValueChanged(reason = "preview-value-freeze-flush") {
    const target = state.previewValueFreezeLastTarget?.isConnected
      ? state.previewValueFreezeLastTarget
      : (state.lastCodeEditor?.isConnected ? state.lastCodeEditor : null);

    if (!target) return false;

    const detail = state.previewValueFreezeLastDetail;
    state.previewValueFreezeLastTarget = null;
    state.previewValueFreezeLastDetail = undefined;
    state.previewValueFreezeDispatching = true;

    try {
      target.dispatchEvent(new CustomEvent("value-changed", {
        detail,
        bubbles: true,
        composed: true
      }));
      state.previewValueFreezeFlushes += 1;
      state.lastPreviewValueFreezeReason = reason;
      return true;
    } catch (e) {
      __nostrodomusCompanionWarn("[nostrodomus-editor] preview value freeze flush failed", e);
      return false;
    } finally {
      state.previewValueFreezeDispatching = false;
    }
  }

  function armPreviewValueFreezeFlush(reason = "preview-value-freeze") {
    if (state.previewValueFreezeTimer) {
      try { clearTimeout(state.previewValueFreezeTimer); } catch {}
      state.timers.delete(state.previewValueFreezeTimer);
      state.previewValueFreezeTimer = 0;
      state.previewValueFreezeRearms += 1;
    }

    const remaining = Math.max(80, Math.ceil((state.previewValueFreezeUntil || 0) - performance.now() + 80));
    const t = setTimeout(() => {
      state.previewValueFreezeTimer = 0;
      state.timers.delete(t);

      if (isWithinPreviewValueFreezeWindow()) {
        armPreviewValueFreezeFlush(`${reason}-extended`);
        return;
      }

      flushPreviewValueChanged(`${reason}-quiet-flush`);
    }, remaining);

    state.previewValueFreezeTimer = t;
    state.timers.add(t);
  }

  function onPreviewValueChanged(event) {
    if (state.previewValueFreezeDispatching) return;
    if (!isWithinPreviewValueFreezeWindow()) return;

    state.previewValueFreezeBlocked += 1;
    state.previewValueFreezeLastTarget = event.currentTarget || event.target || state.lastCodeEditor || null;
    state.previewValueFreezeLastDetail = event.detail;
    state.lastPreviewValueFreezeReason = event.type || "value-changed";
    event.stopPropagation();
    armPreviewValueFreezeFlush("preview-value-freeze");
  }

  function installPreviewValueFreeze(active) {
    for (const target of previewValueFreezeTargets(active)) {
      if (!target || state.previewValueFreezeAttachedTargets.has(target)) continue;
      state.previewValueFreezeAttachedTargets.add(target);
      state.previewValueFreezeAttachedList.push(target);
      try { target.addEventListener("value-changed", onPreviewValueChanged, true); } catch {}
    }
  }



  /*
    Important preview ownership rule:
    Nostrodomus freezes Home Assistant preview value propagation only during
    repeat-pressure typing/backspace. CodeMirror input remains native; HA gets
    one trailing value-changed flush after the editor is quiet.
  */


  function hasOpenNostrodomusSettings() {
    const roots = [document];

    const hr = homeRoot();
    if (hr) roots.push(...walkRoots(hr));

    for (const root of roots) {
      const hosts = q(root, `
        #nostrodomus-completions-settings-document-host,
        #nostrodomus-completions-settings-global-root,
        #nostrodomus-completions-settings-portal,
        .nostrodomus-settings-panel
      `);

      if (hosts.some(isVisible)) return true;
    }

    return false;
  }

  function composedContains(host, node) {
    if (!host || !node) return false;

    let n = node;
    while (n) {
      if (n === host) return true;
      const root = n.getRootNode?.();
      if (root?.host) n = root.host;
      else n = n.parentElement;
    }

    return false;
  }

  function findDialog() {
    const hr = homeRoot();
    if (!hr) return null;

    return q(hr, "hui-dialog-edit-card").find((dialog) => {
      const content = dialog?.shadowRoot?.querySelector(".content");
      return isVisible(content);
    }) || null;
  }

  function findActiveEditor(dialog) {
    if (!dialog?.shadowRoot) return null;

    const candidates = [];

    walkRoots(dialog.shadowRoot).forEach((root) => {
      q(root, "ha-code-editor").forEach((codeEditor) => {
        const codeRoot = codeEditor.shadowRoot;
        if (!codeRoot) return;

        const cmEditor = codeRoot.querySelector(".cm-editor");
        const cmScroller = codeRoot.querySelector(".cm-scroller.ha-scrollbar, .cm-scroller");
        const cmContent = codeRoot.querySelector(".cm-content");

        if (!isVisible(cmEditor) || !cmScroller || !cmContent) return;

        const r = cmEditor.getBoundingClientRect();
        const x = Math.floor(r.left + r.width / 2);
        const y = Math.floor(r.top + Math.min(r.height / 2, 80));
        const hit = document.elementFromPoint(x, y);
        const hitInside = composedContains(codeEditor, hit);

        candidates.push({
          codeEditor,
          codeRoot,
          cmEditor,
          cmScroller,
          cmContent,
          hitInside,
          score: (hitInside ? 100000000 : 0) + r.width * r.height
        });
      });
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }


  function publishBridge(dialog, active, reason = "bridge") {
    try {
      const codeEditor = active?.codeEditor || null;
      const codeRoot = active?.codeRoot || null;
      const cmEditor = active?.cmEditor || null;
      const cmScroller = active?.cmScroller || null;
      const cmContent = active?.cmContent || null;

      const proto = codeEditor ? Object.getPrototypeOf(codeEditor) : null;
      const protoKeys = proto ? Object.getOwnPropertyNames(proto).sort() : [];
      const ownKeys = codeEditor ? Object.keys(codeEditor).sort() : [];

      const live = {
        version: VERSION,
        updatedAt: new Date().toISOString(),
        reason,

        hasDialog: !!dialog,
        hasDialogShadow: !!dialog?.shadowRoot,
        hasCodeEditor: !!codeEditor,
        hasCodeRoot: !!codeRoot,
        hasCmEditor: !!cmEditor,
        hasCmScroller: !!cmScroller,
        hasCmContent: !!cmContent,

        codeEditorTag: codeEditor?.tagName?.toLowerCase?.() || "",
        codeEditorRect: rect(codeEditor),
        cmEditorRect: rect(cmEditor),
        cmScrollerRect: rect(cmScroller),
        cmContentRect: rect(cmContent),

        codeEditorOwnKeys: ownKeys,
        codeEditorProtoKeys: protoKeys,

        hasCodeMirrorProp: !!codeEditor?.codemirror,
        hasCodeMirrorViewProp: !!codeEditor?.view,
        hasEditorViewProp: !!codeEditor?.editorView,
        hasLoadedCodeMirror: !!codeEditor?._loadedCodeMirror,

        loadedCodeMirrorKeys: codeEditor?._loadedCodeMirror ? Object.keys(codeEditor._loadedCodeMirror).sort() : [],
        codeMirrorKeys: codeEditor?.codemirror ? Object.keys(codeEditor.codemirror).sort() : [],

        active() {
          return {
            dialog,
            codeEditor,
            codeRoot,
            cmEditor,
            cmScroller,
            cmContent
          };
        },

        text() {
          return cmContent?.innerText || cmContent?.textContent || "";
        },

        summary() {
          return {
            version: VERSION,
            updatedAt: live.updatedAt,
            reason: live.reason,
            hasCodeEditor: live.hasCodeEditor,
            hasCodeRoot: live.hasCodeRoot,
            hasCmEditor: live.hasCmEditor,
            hasCmContent: live.hasCmContent,
            hasCodeMirrorProp: live.hasCodeMirrorProp,
            hasLoadedCodeMirror: live.hasLoadedCodeMirror,
            textLength: (() => { try { return cmContent?.textContent?.length || 0; } catch { return 0; } })(),
            codeEditorTag: live.codeEditorTag,
            codeEditorRect: live.codeEditorRect,
            cmEditorRect: live.cmEditorRect,
            ownKeys: live.codeEditorOwnKeys,
            protoKeys: live.codeEditorProtoKeys,
            loadedCodeMirrorKeys: live.loadedCodeMirrorKeys,
            previewMutationGuard: {
              enabled: true,
              suppressed: state.previewMutationCallbacksSuppressed,
              lastQuietReason: state.lastPreviewMutationQuietReason,
              preservesNativePreviewEvents: true
            },
            previewValueFreeze: {
              enabled: true,
              quietMs: state.previewValueFreezeMs,
              active: isWithinPreviewValueFreezeWindow(),
              quietRemainingMs: Math.max(0, Math.round((state.previewValueFreezeUntil || 0) - performance.now())),
              blocked: state.previewValueFreezeBlocked,
              flushes: state.previewValueFreezeFlushes,
              flushRearms: state.previewValueFreezeRearms,
              hasPendingValue: state.previewValueFreezeLastTarget?.isConnected || false,
              lastQuietReason: state.lastPreviewValueFreezeReason
            },
            typingMutationGate: {
              enabled: true,
              quietMs: state.typingQuietMs,
              active: isWithinTypingQuietWindow(),
              quietRemainingMs: Math.max(0, Math.round((state.typingQuietUntil || 0) - performance.now())),
              suppressed: state.typingMutationCallbacksSuppressed,
              structuralSuppressed: state.typingStructuralMutationCallbacksSuppressed,
              flushes: state.typingMutationFlushes,
              flushRearms: state.typingMutationFlushRearms,
              lastQuietReason: state.lastTypingQuietReason,
              bridgeNotifySuppressed: state.bridgeNotifySuppressed
            },
            runtimeCoordinator: (() => { try { return runtimeCoordinator?.snapshot?.() || null; } catch { return null; } })()
          };
        }
      };

      window.__nostrodomusEditorBridgeV1 = live;

      const notifyKey = [
        live.hasCodeEditor,
        live.hasCodeMirrorProp,
        live.hasLoadedCodeMirror,
        live.cmEditorRect?.w || 0,
        live.cmEditorRect?.h || 0,
        live.cmScrollerRect?.w || 0,
        live.cmScrollerRect?.h || 0
      ].join("|");

      const now = performance.now();
      const editorChanged =
        state.lastBridgeCodeEditor !== codeEditor ||
        state.lastBridgeCmEditor !== cmEditor ||
        state.lastBridgeNotifyKey !== notifyKey;
      const forceNotify = !String(reason || "").includes("mutation") && now - (state.lastBridgeNotifyAt || 0) > 750;
      const shouldNotify = editorChanged || forceNotify || now - (state.lastBridgeNotifyAt || 0) > 2500;

      if (shouldNotify) {
        state.lastBridgeCodeEditor = codeEditor;
        state.lastBridgeCmEditor = cmEditor;
        state.lastBridgeNotifyKey = notifyKey;
        state.lastBridgeNotifyAt = now;
        try { primeNostrodomusEditorPrepaint(active, reason); } catch {}
        try {
          window.__nostrodomus?.notifyEditorReady?.({
            reason,
            companionVersion: VERSION,
            dialog,
            codeEditor,
            cmEditor,
            cmScroller,
            cmContent,
          });
        } catch {}
      } else {
        state.bridgeNotifySuppressed += 1;
      }

      const logKey = notifyKey;

      if (window.__nostrodomusEditorBridgeLastLogKey !== logKey) {
        window.__nostrodomusEditorBridgeLastLogKey = logKey;
        __nostrodomusCompanionLog("[nostrodomus-editor-bridge] active editor", live.summary());
      }
    } catch (e) {
      window.__nostrodomusEditorBridgeV1 = {
        version: VERSION,
        error: String(e?.stack || e),
        updatedAt: new Date().toISOString()
      };
      __nostrodomusCompanionError("[nostrodomus-editor-bridge] failed", e);
    }
  }

  function isPreviewOrCard(el) {
    if (!el) return false;

    const tag = el.tagName?.toLowerCase?.() || "";
    if (tag === "better-thermostat-ui-card") return true;
    if (tag === "hui-grid-section") return true;
    if (tag === "hui-vertical-stack-card") return true;
    if (el.classList?.contains("element-preview")) return true;
    if (el.closest?.(".element-preview")) return true;

    const root = el.getRootNode?.();
    const host = root?.host;
    if (host && host !== el) return isPreviewOrCard(host);

    return false;
  }

  function editorRoots(dialog) {
    if (!dialog?.shadowRoot) return [];

    const roots = [dialog.shadowRoot];

    function walkEditorHosts(root) {
      q(root, "hui-card-element-editor, hui-stack-card-editor, ha-yaml-editor, ha-code-editor").forEach((el) => {
        if (isPreviewOrCard(el)) return;
        if (el.shadowRoot && !roots.includes(el.shadowRoot)) {
          roots.push(el.shadowRoot);
          walkEditorHosts(el.shadowRoot);
        }
      });
    }

    walkEditorHosts(dialog.shadowRoot);
    return roots;
  }

  function allEditor(dialog, selector) {
    const out = [];
    editorRoots(dialog).forEach((root) => {
      out.push(...q(root, selector).filter((el) => !isPreviewOrCard(el)));
    });
    return [...new Set(out)].filter((el) => el?.isConnected);
  }

  function hasOptionTabs(dialog) {
    /*
      Extra Layout / Visibility / Config tab row exists on some card editors.
      If no real tablist is visible, this is a simple editor and the codebox can
      extend farther down toward ha-dialog-footer.

      Nostrodomus Assist popups/settings are helper UI, not HA card-editor tabs.
      Ignore them so transient assistant UI cannot flip the editor from simple
      mode to tabbed mode and shrink the CodeMirror height.
    */
    if (!dialog?.shadowRoot) return false;

    const roots = walkRoots(dialog.shadowRoot);

    for (const root of roots) {
      if (isNostrodomusUiNode(root.host)) continue;

      const tabContainers = q(root, `
        [role="tablist"],
        ha-tabs,
        mwc-tab-bar,
        .mdc-tab-bar,
        .tabs
      `).filter((el) => isVisible(el) && !isNostrodomusUiNode(el));

      if (tabContainers.length) return true;

      const visibleTabs = q(root, `
        [role="tab"],
        ha-tab,
        mwc-tab,
        .mdc-tab
      `).filter((el) => isVisible(el) && !isNostrodomusUiNode(el));

      if (visibleTabs.length >= 2) return true;
    }

    return false;
  }

  function cssHeightToPx(value) {
    const text = String(value || "").trim();
    if (!text) return null;

    const pxMatch = text.match(/^(-?\d+(?:\.\d+)?)px$/);
    if (pxMatch) return Number(pxMatch[1]);

    const calcMinus = text.match(/^calc\(\s*94vh\s*-\s*(\d+(?:\.\d+)?)px\s*\)$/i);
    if (calcMinus) return Math.round(window.innerHeight * 0.94 - Number(calcMinus[1]));

    const calcNegativePlus = text.match(/^calc\(\s*-(\d+(?:\.\d+)?)px\s*\+\s*94vh\s*\)$/i);
    if (calcNegativePlus) return Math.round(window.innerHeight * 0.94 - Number(calcNegativePlus[1]));

    return null;
  }

  function pxHeight(n, min = 0) {
    return `${Math.max(min, Math.floor(Number(n) || 0))}px`;
  }

  function capHeightFromTop(staticHeight, top, min, bottomGap = 28) {
    const staticPx = cssHeightToPx(staticHeight);
    const available = Math.floor(window.innerHeight - Math.round(top || 0) - bottomGap);

    if (!Number.isFinite(available) || available <= 0) return staticHeight;
    if (!Number.isFinite(staticPx) || staticPx <= 0) return pxHeight(available, min);

    const capped = Math.min(staticPx, available);
    if (capped < staticPx - 1) return pxHeight(capped, min);
    return staticHeight;
  }

  function viewportFitHeights(active, heights) {
    if (!active?.codeEditor || !active?.cmEditor || !active?.cmScroller) return heights;

    const codeEditorRect = active.codeEditor.getBoundingClientRect?.();
    const cmEditorRect = active.cmEditor.getBoundingClientRect?.();
    const cmScrollerRect = active.cmScroller.getBoundingClientRect?.();

    if (!codeEditorRect || !cmEditorRect || !cmScrollerRect) return heights;

    const bottomGap = 28;
    const wrapper = capHeightFromTop(heights.wrapper, codeEditorRect.top, 260, bottomGap);
    const cm = capHeightFromTop(heights.cm, cmEditorRect.top, 220, bottomGap);
    const scroller = capHeightFromTop(heights.scroller, cmScrollerRect.top, 180, bottomGap);

    const viewportFit =
      wrapper !== heights.wrapper ||
      cm !== heights.cm ||
      scroller !== heights.scroller;

    return {
      ...heights,
      wrapper,
      cm,
      scroller,
      viewportFit,
      viewportFitMeta: {
        bottomGap,
        viewportHeight: window.innerHeight,
        codeEditorTop: Math.round(codeEditorRect.top),
        cmEditorTop: Math.round(cmEditorRect.top),
        cmScrollerTop: Math.round(cmScrollerRect.top)
      }
    };
  }

  function editorHeights(dialog) {
    const detectedSimple = !hasOptionTabs(dialog);
    const cached = dialog ? state.dialogModeCache.get(dialog) : null;
    const settingsOpen = hasOpenNostrodomusSettings();

    /*
      Sticky simple-mode guard:
      The card editor can start in the tall/simple layout and then transient UI
      such as Nostrodomus Assist settings can make broad tab detection report false.
      Once a dialog has safely learned simple=true, do not downgrade that same
      dialog to the short/tabbed mode during later mutation/click settle passes.

      Real tabbed editors still start as simple=false because their first
      measurement has real HA option tabs present.
    */
    let simple = detectedSimple;

    if (cached) {
      if (settingsOpen) {
        simple = cached.simple;
      } else if (cached.simple === true && detectedSimple === false) {
        /*
          v17.2.60 real-tab runoff repair:
          When HA finishes rendering its real Config / Visibility / Layout tabs
          after the first editor measurement, release the previously sticky
          simple=true cache so the editor can shrink to the tabbed height set.
          Nostrodomus Assist settings are still protected by the settingsOpen guard
          above, so assistant UI cannot cause this downgrade.
        */
        simple = false;
      }
    }

    if (dialog) {
      const shouldWriteCache =
        !cached ||
        simple === true ||
        (!settingsOpen && cached.simple !== true);

      if (shouldWriteCache) {
        state.dialogModeCache.set(dialog, {
          simple,
          detectedSimple,
          settingsOpen,
          stickySimple: cached?.simple === true && detectedSimple === false,
          updatedAt: new Date().toISOString()
        });
      }
    }

    return {
      simple,
      wrapper: simple ? SIMPLE_WRAPPER_HEIGHT : WRAPPER_HEIGHT,
      cm: simple ? SIMPLE_CM_HEIGHT : CM_HEIGHT,
      scroller: simple ? SIMPLE_SCROLLER_HEIGHT : SCROLLER_HEIGHT
    };
  }

  function updateStyleTextIfChanged(style, css) {
    if (!style) return false;
    const next = String(css || "");
    if (style.textContent === next) return false;
    style.textContent = next;
    return true;
  }

  function dedupeStyleElements(root, id) {
    if (!root?.querySelectorAll) return null;
    const nodes = Array.from(root.querySelectorAll(`#${id}`));
    const keep = nodes[0] || null;
    for (const node of nodes.slice(1)) {
      try { node.remove(); } catch {}
    }
    return keep;
  }

  function injectStyle(root, id, css) {
    if (!root?.querySelector) return false;

    let style = dedupeStyleElements(root, id) || root.querySelector(`#${id}`);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      style.dataset.nostrodomusVersion = VERSION;
      root.appendChild(style);
    }

    return updateStyleTextIfChanged(style, css);
  }

  function injectDialogCss(dialog, haDialog, waDialog) {
    /*
      This is the missing piece from the golden first-open behavior:
      expand the real dialog/panel/body roots and hide visual editor warnings.
      Do not touch preview-card internals.
    */

    injectStyle(dialog.shadowRoot, `${STYLE_ID}-dialog-root`, `
      :host {
        width: 98vw !important;
        max-width: 98vw !important;
        height: 94vh !important;
        max-height: 94vh !important;
        overflow: hidden auto !important;
        box-sizing: border-box !important;
      }

      ha-dialog {
        --dialog-width: 98vw !important;
        --mdc-dialog-min-width: 98vw !important;
        --mdc-dialog-max-width: 98vw !important;
        --dialog-height: 94vh !important;
        --mdc-dialog-max-height: 94vh !important;
        overflow: hidden !important;
        scrollbar-width: none !important;
        box-sizing: border-box !important;
      }

      .content {
        display: flex !important;
        max-width: 100% !important;
        min-width: 0 !important;
        overflow: visible !important;
      }

      .element-editor,
      .element-editor.ha-scrollbar {
        width: 54vw !important;
        max-width: 54vw !important;
        min-width: 54vw !important;
        height: calc(-198px + 94vh) !important;
        max-height: calc(-198px + 94vh) !important;
        min-height: 0 !important;
        overflow: visible !important;
        box-sizing: border-box !important;
        padding-right: 18px !important;
        padding-bottom: 12px !important;
        margin-left: 4px !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }

      .element-editor::-webkit-scrollbar,
      .element-editor.ha-scrollbar::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }

      .element-preview,
      .element-preview.ha-scrollbar {
        display: flex !important;
        width: calc(-44px + 44vw) !important;
        max-width: calc(-44px + 44vw) !important;
        min-width: 0 !important;
        height: calc(-136px + 94vh) !important;
        max-height: calc(-136px + 94vh) !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        padding: 16px 4px 4px 4px !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        align-items: flex-start !important;
        justify-content: center !important;
      }

      .element-preview::-webkit-scrollbar,
      .element-preview.ha-scrollbar::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }

      ha-alert,
      [role="alert"],
      .issue-type.warning,
      .warning,
      .error {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
    `);

    if (haDialog?.shadowRoot) {
      injectStyle(haDialog.shadowRoot, `${STYLE_ID}-ha-dialog-root`, `
        :host {
          --dialog-width: 98vw !important;
          --mdc-dialog-min-width: 98vw !important;
          --mdc-dialog-max-width: 98vw !important;
          --dialog-height: 94vh !important;
          --mdc-dialog-max-height: 94vh !important;
          overflow: hidden !important;
          scrollbar-width: none !important;
          box-sizing: border-box !important;
        }

        .body,
        .body.ha-scrollbar {
          overflow: hidden !important;
          scrollbar-width: none !important;
          box-sizing: border-box !important;
        }

        .body::-webkit-scrollbar,
        .body.ha-scrollbar::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
          display: none !important;
        }

        wa-dialog {
          width: 98vw !important;
          max-width: 98vw !important;
          height: 94vh !important;
          max-height: 94vh !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
        }
      `);
    }

    if (waDialog?.shadowRoot) {
      injectStyle(waDialog.shadowRoot, `${STYLE_ID}-wa-dialog-root`, `
        :host {
          --dialog-width: 98vw !important;
          --width: 98vw !important;
          --max-width: 98vw !important;
          --dialog-height: 94vh !important;
          --height: 94vh !important;
          --max-height: 94vh !important;
        }

        dialog.dialog,
        dialog.dialog.open,
        [part="base"],
        [part="panel"],
        .dialog,
        .dialog__panel,
        .panel {
          width: 98vw !important;
          max-width: 98vw !important;
          height: 94vh !important;
          max-height: 94vh !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          scrollbar-width: none !important;
        }

        dialog.dialog::-webkit-scrollbar,
        dialog.dialog.open::-webkit-scrollbar,
        [part="base"]::-webkit-scrollbar,
        [part="panel"]::-webkit-scrollbar,
        .dialog::-webkit-scrollbar,
        .dialog__panel::-webkit-scrollbar,
        .panel::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
          display: none !important;
        }
      `);
    }
  }

  function injectCodeCss(codeRoot) {
    let style = dedupeStyleElements(codeRoot, STYLE_ID) || codeRoot.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.dataset.nostrodomusVersion = VERSION;
      codeRoot.appendChild(style);
    }

    const css = `
      .cm-editor {
        width: calc(-18px + 54vw) !important;
        max-width: calc(-18px + 54vw) !important;
        min-width: calc(-18px + 54vw) !important;
        height: calc(94vh - 437px) !important;
        max-height: calc(94vh - 437px) !important;
        min-height: 0 !important;
        border-radius: 24px !important;
        overflow: hidden !important;
        background: rgba(0, 0, 0, 0.35) !important;
        background-color: rgba(0, 0, 0, 0.35) !important;
        background-image: none !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
      }

      .cm-editor.cm-focused,
      .cm-scroller,
      .cm-content {
        outline: 0 !important;
      }

      .cm-editor::before,
      .cm-editor::after,
      .cm-scroller::before,
      .cm-scroller::after,
      .cm-content::before,
      .cm-content::after {
        display: none !important;
        content: none !important;
      }

      .cm-scroller,
      .cm-scroller.ha-scrollbar {
        width: calc(-18px + 54vw) !important;
        max-width: calc(-18px + 54vw) !important;
        min-width: calc(-18px + 54vw) !important;
        height: calc(94vh - 439px) !important;
        max-height: calc(94vh - 439px) !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        background: transparent !important;
        background-color: transparent !important;
        padding: 16px 18px 30px 14px !important;
        margin: 0 !important;
        scrollbar-width: thin !important;
        scrollbar-color: var(--nostrodomus-codebox-scrollbar-thumb, rgba(120, 210, 255, 0.68)) var(--nostrodomus-codebox-scrollbar-track, rgba(0, 0, 0, 0.10)) !important;
        -ms-overflow-style: auto !important;
        box-sizing: border-box !important;
      }

      .cm-content {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        flex-basis: auto !important;
        overflow-x: hidden !important;
        background: transparent !important;
        background-color: transparent !important;
        border-radius: 0 !important;
        min-height: calc(100% - 46px) !important;
        padding: 0 8px 18px 0 !important;
        margin: 0 !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        box-sizing: border-box !important;
      }

      .cm-line,
      .cm-line span,
      .cm-activeLine {
        max-width: 100% !important;
        background: transparent !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        box-sizing: border-box !important;
      }

      .cm-line,
      .cm-activeLine {
        padding-left: 2px !important;
        padding-right: 8px !important;
      }

      .cm-gutters,
      .cm-gutters-before,
      .cm-gutter,
      .cm-lineNumbers,
      .cm-foldGutter,
      .cm-gutterElement,
      .cm-activeLineGutter,
      ha-icon-button-toolbar,
      ha-icon-button-group,
      .code-editor-toolbar,
      .icon-toolbar-buttongroup {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
      }

      .cm-scroller::-webkit-scrollbar {
        width: 12px !important;
        height: 0 !important;
        background: transparent !important;
      }

      .cm-scroller::-webkit-scrollbar:horizontal,
      .cm-editor::-webkit-scrollbar:horizontal,
      .cm-content::-webkit-scrollbar:horizontal {
        height: 0 !important;
        max-height: 0 !important;
        display: none !important;
        background: transparent !important;
      }

      .cm-scroller::-webkit-scrollbar-track {
        background: linear-gradient(180deg, rgba(0,0,0,0.055), rgba(0,0,0,0.13)) !important;
        border-radius: 999px !important;
        margin: 18px 5px 18px 0 !important;
        border: 1px solid rgba(255,255,255,0.025) !important;
        box-shadow: inset 0 0 8px rgba(0,0,0,0.18) !important;
      }

      .cm-scroller::-webkit-scrollbar-thumb {
        background: var(--nostrodomus-codebox-scrollbar-thumb, rgba(120, 210, 255, 0.68)) !important;
        border-radius: 999px !important;
        border: 3px solid rgba(16,18,24,0.72) !important;
        box-shadow:
          0 0 6px rgba(145,35,60,0.22),
          inset 0 1px 0 rgba(255,255,255,0.09),
          inset 0 -1px 0 rgba(0,0,0,0.18) !important;
        min-height: 72px !important;
      }
    `;
    updateStyleTextIfChanged(style, css);
  }

  function forcePink(codeRoot) {
    /*
      Pink token patch disabled intentionally.
      Keep this function as a no-op so the lifecycle can stay stable.
    */
    return;
  }



  function hideWarningsEverywhere(dialog) {
    /*
      Warning can live inside nested editor shadow roots, not only dialog root.
    */
    walkRoots(dialog.shadowRoot).forEach((root) => {
      injectStyle(root, `${STYLE_ID}-warning-hide`, `
        ha-alert,
        [role="alert"],
        .issue-type.warning {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `);

      q(root, "ha-alert, [role='alert'], .issue-type.warning").forEach((el) => {
        set(el, "display", "none");
        set(el, "visibility", "hidden");
        set(el, "opacity", "0");
        set(el, "height", "0");
        set(el, "min-height", "0");
        set(el, "max-height", "0");
        set(el, "margin", "0");
        set(el, "padding", "0");
        set(el, "overflow", "hidden");
        set(el, "pointer-events", "none");
      });
    });
  }

  function previewPane(dialog) {
    return dialog?.shadowRoot?.querySelector(".element-preview.ha-scrollbar, .element-preview") || null;
  }

  function maskPreviewUntilReady(dialog, reason = "mask") {
    const preview = previewPane(dialog);
    if (!preview) return;

    if (preview.dataset.nostrodomusPreviewReady === "1") return;

    preview.style.setProperty("opacity", "0", "important");
    preview.style.setProperty("visibility", "hidden", "important");
    preview.style.setProperty("transition", "none", "important");
    preview.style.setProperty("pointer-events", "none", "important");
    preview.dataset.nostrodomusPreviewMasked = reason;
  }

  function revealPreview(dialog, reason = "ready") {
    const preview = previewPane(dialog);
    if (!preview) return;

    preview.dataset.nostrodomusPreviewReady = "1";
    delete preview.dataset.nostrodomusPreviewMasked;

    preview.style.setProperty("opacity", "1", "important");
    preview.style.setProperty("visibility", "visible", "important");
    preview.style.setProperty("pointer-events", "auto", "important");
    preview.style.setProperty("transition", "opacity 45ms linear", "important");

    if (!window.__nostrodomusPreviewRevealLogged) {
      window.__nostrodomusPreviewRevealLogged = true;
      __nostrodomusCompanionLog("[nostrodomus-editor] preview revealed", { version: VERSION, reason });
    }
  }

  function scalePreviewCard(dialog) {
    /*
      Preview layout zoom:
      - preserve rendered card internals exactly
      - do not touch mod-card, ha-card, button-card, custom card hosts, or nested hui-cards
      - recreate the dashboard-natural card width context, then visually zoom the editor preview wrapper
    */
    const preview = previewPane(dialog);
    if (!preview) return;

    preview.dataset.nostrodomusPreviewReady = "1";
    delete preview.dataset.nostrodomusPreviewMasked;

    preview.style.setProperty("opacity", "1", "important");
    preview.style.setProperty("visibility", "visible", "important");
    preview.style.setProperty("pointer-events", "auto", "important");
    preview.style.setProperty("transition", "none", "important");
    preview.style.setProperty("overflow", "hidden", "important");
    preview.style.setProperty("overflow-x", "hidden", "important");
    preview.style.setProperty("overflow-y", "auto", "important");
    preview.style.setProperty("contain", "layout style paint", "important");

    const grid = q(preview, "hui-grid-section.type-grid-section, hui-grid-section")[0];
    if (!grid?.shadowRoot) return;

    const gridCard = grid.shadowRoot.querySelector(".card") || grid.shadowRoot.querySelector("div");
    const outerHuiCard = grid.shadowRoot.querySelector("hui-card");

    if (!gridCard || !outerHuiCard) return;

    /*
      480px is the measured live-dashboard natural ha-card width for the SAB card.
      Scaling the gridCard keeps card internals untouched while making the preview readable.
    */
    const LAYOUT_W = "480px";
    const ZOOM = "scale(1.55)";

    [grid, gridCard, outerHuiCard].forEach((el) => {
      set(el, "width", LAYOUT_W);
      set(el, "max-width", LAYOUT_W);
      set(el, "min-width", LAYOUT_W);
      set(el, "margin", "0 auto");
      set(el, "overflow", "visible");
      set(el, "contain", "none");
      set(el, "box-sizing", "border-box");
    });

    set(gridCard, "transform", ZOOM);
    set(gridCard, "transform-origin", "center center");
    set(gridCard, "transition", "none");

    grid.style.removeProperty("transform");
    grid.style.removeProperty("transform-origin");
    outerHuiCard.style.removeProperty("transform");
    outerHuiCard.style.removeProperty("transform-origin");
  }


  function apply(reason = "apply") {
    if (state.applying) return;
    state.applying = true;

    try {
      const dialog = findDialog();
      if (!dialog?.shadowRoot) {
        state.lastDialog = null;
        state.lastCodeEditor = null;
        state.lastLogKey = "";
        return;
      }

      const active = findActiveEditor(dialog);
      if (!active) return;

      publishBridge(dialog, active, reason);
      installPreviewValueFreeze(active);

      const root = dialog.shadowRoot;
      const haDialog = root.querySelector("ha-dialog");
      const waDialog = haDialog?.shadowRoot?.querySelector("wa-dialog");
      const body =
        haDialog?.shadowRoot?.querySelector("div.body.ha-scrollbar") ||
        haDialog?.shadowRoot?.querySelector("div.body") ||
        document.body;

      injectDialogCss(dialog, haDialog, waDialog);

      const content = root.querySelector(".content");
      const elementEditor = root.querySelector(".element-editor.ha-scrollbar, .element-editor");
      const elementPreview = root.querySelector(".element-preview.ha-scrollbar, .element-preview");

      injectCodeCss(active.codeRoot);
      hideWarningsEverywhere(dialog);
      scalePreviewCard(dialog);

      set(dialog, "width", "98vw");
      set(dialog, "max-width", "98vw");
      set(dialog, "height", "94vh");
      set(dialog, "max-height", "94vh");

      if (haDialog) {
        set(haDialog, "--dialog-width", "98vw");
        set(haDialog, "--mdc-dialog-min-width", "98vw");
        set(haDialog, "--mdc-dialog-max-width", "98vw");
        set(haDialog, "--dialog-height", "94vh");
        set(haDialog, "--mdc-dialog-max-height", "94vh");
        set(haDialog, "overflow", "hidden");
        set(haDialog, "scrollbar-width", "none");
        set(haDialog, "box-sizing", "border-box");
      }

      if (body && body !== document.body) {
        set(body, "overflow", "hidden");
        set(body, "scrollbar-width", "none");
      }

      if (content) {
        set(content, "display", "flex");
        set(content, "max-width", "100%");
        set(content, "min-width", "0");
      }

      if (elementEditor) {
        set(elementEditor, "width", "54vw");
        set(elementEditor, "max-width", "54vw");
        set(elementEditor, "min-width", "54vw");
        set(elementEditor, "height", "calc(-198px + 94vh)");
        set(elementEditor, "max-height", "calc(-198px + 94vh)");
        set(elementEditor, "min-height", "0");
        set(elementEditor, "overflow", "visible");
        set(elementEditor, "box-sizing", "border-box");
        set(elementEditor, "padding-right", "18px");
        set(elementEditor, "padding-bottom", "12px");
        set(elementEditor, "margin-left", "4px");
        set(elementEditor, "scrollbar-width", "none");
      set(elementEditor, "transition", "none");
      }

      if (elementPreview) {
        set(elementPreview, "display", "flex");
        set(elementPreview, "width", "calc(-44px + 44vw)");
        set(elementPreview, "max-width", "calc(-44px + 44vw)");
        set(elementPreview, "min-width", "0");
        set(elementPreview, "height", "calc(-136px + 94vh)");
        set(elementPreview, "max-height", "calc(-136px + 94vh)");
        set(elementPreview, "overflow", "hidden");
        set(elementPreview, "box-sizing", "border-box");
        set(elementPreview, "padding-top", "16px");
        set(elementPreview, "padding-right", "4px");
        set(elementPreview, "padding-bottom", "4px");
        set(elementPreview, "padding-left", "4px");
        set(elementPreview, "scrollbar-width", "none");
      set(elementPreview, "transition", "none");
      }

      const heights = viewportFitHeights(active, editorHeights(dialog));

      allEditor(dialog, `
        .card-config,
        hui-card-element-editor,
        hui-stack-card-editor,
        ha-yaml-editor,
        ha-code-editor
      `).forEach((el) => {
        set(el, "width", "54vw");
        set(el, "max-width", "54vw");
        set(el, "min-width", "54vw");
        set(el, "height", heights.wrapper);
        set(el, "max-height", heights.wrapper);
        set(el, "min-height", "0");
        set(el, "overflow", "visible");
        set(el, "box-sizing", "border-box");
        set(el, "transition", "none");
      });

      if (heights.viewportFit) {
        set(active.codeEditor, "overflow", "hidden");
        set(active.codeEditor, "box-sizing", "border-box");
      }

      set(active.cmEditor, "width", "calc(-18px + 54vw)");
      set(active.cmEditor, "max-width", "calc(-18px + 54vw)");
      set(active.cmEditor, "min-width", "calc(-18px + 54vw)");
      set(active.cmEditor, "height", heights.cm);
      set(active.cmEditor, "max-height", heights.cm);
      set(active.cmEditor, "min-height", "0");
      set(active.cmEditor, "overflow", "hidden");
      set(active.cmEditor, "border-radius", "24px");
      set(active.cmEditor, "box-sizing", "border-box");
      set(active.cmEditor, "transition", "none");

      set(active.cmScroller, "width", "calc(-18px + 54vw)");
      set(active.cmScroller, "max-width", "calc(-18px + 54vw)");
      set(active.cmScroller, "min-width", "calc(-18px + 54vw)");
      set(active.cmScroller, "height", heights.scroller);
      set(active.cmScroller, "max-height", heights.scroller);
      set(active.cmScroller, "min-height", "0");
      set(active.cmScroller, "overflow-y", "auto");
      set(active.cmScroller, "overflow-x", "hidden");
      set(active.cmScroller, "box-sizing", "border-box");
      set(active.cmScroller, "scrollbar-width", "thin");
      set(active.cmScroller, "scrollbar-color", "var(--nostrodomus-codebox-scrollbar-thumb, rgba(120, 210, 255, 0.68)) var(--nostrodomus-codebox-scrollbar-track, rgba(0, 0, 0, 0.10))");
      set(active.cmScroller, "transition", "none");

      set(active.cmContent, "width", "100%");
      set(active.cmContent, "max-width", "100%");
      set(active.cmContent, "min-width", "0");
      set(active.cmContent, "overflow-x", "hidden");
      set(active.cmContent, "box-sizing", "border-box");

      forcePink(active.codeRoot);

      state.lastDialog = dialog;
      state.lastCodeEditor = active.codeEditor;
      state.applyCount += 1;

      const rr = rect(active.cmEditor);
      const pr = rect(elementPreview);
      const key = `${rr?.w || 0}x${rr?.h || 0}|preview:${pr?.w || 0}x${pr?.h || 0}`;

      if (key !== state.lastLogKey) {
        state.lastLogKey = key;
        __nostrodomusCompanionLog("[nostrodomus-editor] applied", {
          version: VERSION,
          reason,
          staticHeights: {
            simple: heights.simple,
            wrapper: heights.wrapper,
            cm: heights.cm,
            scroller: heights.scroller,
            viewportFit: !!heights.viewportFit,
            viewportFitMeta: heights.viewportFitMeta || null
          },
          key,
          count: state.applyCount
        });
      }
    } catch (e) {
      __nostrodomusCompanionError("[nostrodomus-editor] apply failed", VERSION, e);
    } finally {
      state.applying = false;
    }
  }

  function clearTimers() {
    state.timers.forEach((t) => {
      try { clearTimeout(t); } catch {}
    });
    state.timers.clear();
  }

  function burst(reason) {
    clearTimers();
    [0, 1, 8, 16, 33, 66, 120, 240, 500].forEach((ms) => {
      const t = setTimeout(() => {
        state.timers.delete(t);
        requestAnimationFrame(() => apply(reason));
      }, ms);
      state.timers.add(t);
    });
  }

  function clearSettleTimers() {
    state.settleTimers.forEach((t) => {
      try { clearTimeout(t); } catch {}
    });
    state.settleTimers.clear();
  }

  function disconnectDialogObserver() {
    if (state.dialogObserver) {
      try { state.dialogObserver.disconnect(); } catch {}
    }

    state.dialogObserver = null;
    state.observedDialog = null;
    state.observedRoots = [];
  }

  function scheduleLifecycle(reason = "scheduled") {
    if (String(reason || "").includes("mutation") && activeEditorStillConnected() && isWithinTypingQuietWindow()) {
      state.typingMutationCallbacksSuppressed += 1;
      state.lastTypingQuietReason = reason;
      armTypingQuietFlush("typing-quiet-schedule");
      return;
    }

    state.pendingReason = reason;

    if (state.lifecycleRaf) return;

    state.lifecycleRaf = requestAnimationFrame(() => {
      state.lifecycleRaf = 0;

      const runReason = state.pendingReason || reason;
      state.pendingReason = "";

      try {
        instantEverythingPass(runReason);
      } catch (e) {
        __nostrodomusCompanionError("[nostrodomus-editor] scheduled lifecycle failed", runReason, e);
      }

      const dialog = findDialog();
      if (dialog?.shadowRoot) {
        refreshDialogObserver(dialog);
      } else {
        disconnectDialogObserver();
      }
    });
  }

  function armSettleWindow(reason = "settle") {
    clearSettleTimers();

    [0, 16, 40, 80, 140, 220, 340, 520, 780, 1100, 1500, 2100, 2800].forEach((ms) => {
      const t = setTimeout(() => {
        state.settleTimers.delete(t);
        state.timers.delete(t);
        scheduleLifecycle(`${reason}-${ms}ms`);
      }, ms);

      state.settleTimers.add(t);
      state.timers.add(t);
    });
  }

  function observeDialogRoot(root) {
    if (!root || state.observedRoots.includes(root)) return;

    try {
      state.dialogObserver.observe(root, { childList: true, subtree: true });
      state.observedRoots.push(root);
    } catch {}
  }

  function refreshDialogObserver(dialog) {
    if (!dialog?.shadowRoot) {
      disconnectDialogObserver();
      return;
    }

    if (state.observedDialog !== dialog) {
      disconnectDialogObserver();

      state.observedDialog = dialog;
      state.dialogObserver = new MutationObserver((mutations) => {
        if (mutations.length && mutations.every(mutationIsOnlyNostrodomusUi)) return;
        if (mutationsAreOnlyCodeMirrorEditorText(mutations)) return;
        if (mutationsAreOnlyPreviewContent(mutations)) {
          state.previewMutationCallbacksSuppressed += 1;
          state.lastPreviewMutationQuietReason = "preview-content-mutation";
          return;
        }
        if (shouldDeferMutationLifecycle("dialog-shadow-mutation", mutations)) return;
        scheduleLifecycle("dialog-shadow-mutation");
      });
    }

    walkRoots(dialog.shadowRoot).forEach(observeDialogRoot);
  }

  function preStyleDialog(dialog) {
    /*
      Instant first-stage styling:
      run as soon as the edit dialog exists, before CodeMirror has mounted.
      This prevents the user from seeing HA's default narrow editor layout first.
    */
    if (!dialog?.shadowRoot) return;

    const root = dialog.shadowRoot;
    const haDialog = root.querySelector("ha-dialog");
    const waDialog = haDialog?.shadowRoot?.querySelector("wa-dialog");
    const body =
      haDialog?.shadowRoot?.querySelector("div.body.ha-scrollbar") ||
      haDialog?.shadowRoot?.querySelector("div.body");

    const content = root.querySelector(".content");
    const elementEditor = root.querySelector(".element-editor.ha-scrollbar, .element-editor");
    const elementPreview = root.querySelector(".element-preview.ha-scrollbar, .element-preview");

    if (typeof injectDialogCss === "function") {
      injectDialogCss(dialog, haDialog, waDialog);
    }

    set(dialog, "width", "98vw");
    set(dialog, "max-width", "98vw");
    set(dialog, "height", "94vh");
    set(dialog, "max-height", "94vh");

    if (haDialog) {
      set(haDialog, "--dialog-width", "98vw");
      set(haDialog, "--mdc-dialog-min-width", "98vw");
      set(haDialog, "--mdc-dialog-max-width", "98vw");
      set(haDialog, "--dialog-height", "94vh");
      set(haDialog, "--mdc-dialog-max-height", "94vh");
      set(haDialog, "overflow", "hidden");
      set(haDialog, "scrollbar-width", "none");
      set(haDialog, "box-sizing", "border-box");
    }

    if (body) {
      set(body, "overflow", "hidden");
      set(body, "scrollbar-width", "none");
    }

    if (content) {
      set(content, "display", "flex");
      set(content, "max-width", "100%");
      set(content, "min-width", "0");
      set(content, "overflow", "visible");
    }

    if (elementEditor) {
      set(elementEditor, "width", "54vw");
      set(elementEditor, "max-width", "54vw");
      set(elementEditor, "min-width", "54vw");
      set(elementEditor, "height", "calc(-198px + 94vh)");
      set(elementEditor, "max-height", "calc(-198px + 94vh)");
      set(elementEditor, "min-height", "0");
      set(elementEditor, "overflow", "visible");
      set(elementEditor, "box-sizing", "border-box");
      set(elementEditor, "padding-right", "18px");
      set(elementEditor, "padding-bottom", "12px");
      set(elementEditor, "margin-left", "4px");
      set(elementEditor, "scrollbar-width", "none");
      set(elementEditor, "transition", "none");
      set(elementEditor, "-ms-overflow-style", "none");
    }

    if (elementPreview) {
      set(elementPreview, "display", "flex");
      set(elementPreview, "width", "calc(-44px + 44vw)");
      set(elementPreview, "max-width", "calc(-44px + 44vw)");
      set(elementPreview, "min-width", "0");
      set(elementPreview, "height", "calc(-136px + 94vh)");
      set(elementPreview, "max-height", "calc(-136px + 94vh)");
      set(elementPreview, "overflow", "hidden");
      set(elementPreview, "box-sizing", "border-box");
      set(elementPreview, "padding-top", "0");
      set(elementPreview, "padding-right", "4px");
      set(elementPreview, "padding-bottom", "4px");
      set(elementPreview, "padding-left", "4px");
      set(elementPreview, "scrollbar-width", "none");
      set(elementPreview, "transition", "none");
      set(elementPreview, "-ms-overflow-style", "none");
      set(elementPreview, "align-items", "center");
      set(elementPreview, "justify-content", "center");
      maskPreviewUntilReady(dialog, "prestyle");
    }

    if (typeof scalePreviewCard === "function") {
      scalePreviewCard(dialog);
    }

    if (typeof hideWarningsEverywhere === "function") {
      hideWarningsEverywhere(dialog);
    }
  }

  function needsReapply(dialog, active) {
    if (!dialog || !active) return false;

    const root = dialog.shadowRoot;
    const elementEditor = root?.querySelector(".element-editor.ha-scrollbar, .element-editor");
    const elementPreview = root?.querySelector(".element-preview.ha-scrollbar, .element-preview");

    const hasStyle = !!active.codeRoot.querySelector(`#${STYLE_ID}`);

    const editorWidth = elementEditor?.style.getPropertyValue("width") || "";
    const editorMaxWidth = elementEditor?.style.getPropertyValue("max-width") || "";
    const previewWidth = elementPreview?.style.getPropertyValue("width") || "";
    const cmHeight = active.cmEditor?.style.getPropertyValue("height") || "";
    const cmScrollerHeight = active.cmScroller?.style.getPropertyValue("height") || "";
    const cmWidth = active.cmEditor?.style.getPropertyValue("width") || "";

    const missingLearnedLayout =
      editorWidth !== "54vw" ||
      editorMaxWidth !== "54vw" ||
      previewWidth !== "calc(-44px + 44vw)" ||
      cmWidth !== "calc(-18px + 54vw)" ||
      !cmHeight ||
      !cmScrollerHeight;

    return !hasStyle || missingLearnedLayout;
  }

  function instantEverythingPass(reason = "instant") {
    /*
      One immediate pass that does ALL visible corrections:
      - dialog/root sizing
      - editor pane sizing
      - preview pane sizing
      - preview custom card scaling
      - visual editor warning deletion
      - CodeMirror sizing/styling if it exists already

      This is intentionally separate from burst(), because burst() can be too late.
    */
    const dialog = findDialog();

    if (!dialog?.shadowRoot) {
      state.lastDialog = null;
      state.lastCodeEditor = null;
      state.lastLogKey = "";
      return false;
    }

    const preview = previewPane(dialog);
    if (dialog !== state.lastDialog && preview) {
      delete preview.dataset.nostrodomusPreviewReady;
      maskPreviewUntilReady(dialog, "new-dialog");
    }

    preStyleDialog(dialog);

    if (typeof hideWarningsEverywhere === "function") {
      hideWarningsEverywhere(dialog);
    }

    if (typeof scalePreviewCard === "function") {
      scalePreviewCard(dialog);
    }

    const active = findActiveEditor(dialog);
    if (active) {
      publishBridge(dialog, active, reason);
      apply(reason);
      return true;
    }

    return false;
  }

  function instantWindow(reason = "instant-window") {
    /*
      HA mounts the dialog, editor shell, preview host, custom card, and CodeMirror
      in separate micro-steps. Hit every early step instead of waiting for the
      normal full apply cycle.
    */
    const run = (label) => {
      try { instantEverythingPass(`${reason}-${label}`); } catch (e) {
        __nostrodomusCompanionError("[nostrodomus-editor] instant pass failed", label, e);
      }
    };

    run("now");

    try {
      queueMicrotask(() => run("microtask"));
    } catch {}

    try {
      requestAnimationFrame(() => run("raf1"));
      requestAnimationFrame(() => requestAnimationFrame(() => run("raf2")));
    } catch {}

    [1, 8, 16, 33, 66, 100, 160, 240, 360, 560, 850, 1200].forEach((ms) => {
      const t = setTimeout(() => {
        state.timers.delete(t);
        run(`${ms}ms`);
      }, ms);
      state.timers.add(t);
    });
  }

  function maybeOpen(reason) {
    instantEverythingPass(`${reason}-pre`);

    const dialog = findDialog();

    if (!dialog) {
      state.lastDialog = null;
      state.lastCodeEditor = null;
      state.lastLogKey = "";

      /*
        Critical first-open fix:
        Do NOT clear timers here. On the opener click, HA often has not mounted
        hui-dialog-edit-card yet. Clearing timers here cancels the instantWindow
        settle passes that are supposed to catch the dialog/CodeMirror once they
        appear. This was the click-required bug.
      */
      return;
    }

    preStyleDialog(dialog);

    const active = findActiveEditor(dialog);
    if (!active) {
      /*
        CodeMirror is not mounted yet.
        Do NOT call burst() here because burst() clears the open-settle timers.
        The existing instantWindow delayed passes will call instantEverythingPass()
        again and apply CodeMirror styling as soon as ha-code-editor exists.
      */
      return;
    }

    const newInstance = dialog !== state.lastDialog || active.codeEditor !== state.lastCodeEditor;
    const missingOrResetLayout = needsReapply(dialog, active);

    if (newInstance || missingOrResetLayout) {
      burst(reason);
    }
  }

  function boot() {
    killLegacyEditorStack();

    const hr = homeRoot();
    if (!hr) {
      const t = setTimeout(() => {
        state.timers.delete(t);
        boot();
      }, 250);
      state.timers.add(t);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      if (mutationsAreOnlyCodeMirrorEditorText(mutations)) return;
      if (mutationsAreOnlyPreviewContent(mutations)) {
        state.previewMutationCallbacksSuppressed += 1;
        state.lastPreviewMutationQuietReason = "home-preview-content-mutation";
        return;
      }

      if (shouldDeferMutationLifecycle("home-mutation", mutations)) return;

      scheduleLifecycle("home-mutation");

      if (findDialog()) {
        armSettleWindow("home-mutation-settle");
      }
    });
    observer.observe(hr, { childList: true, subtree: true });
    state.observers.push(observer);

    const noteEditorInput = (event) => {
      if (isNostrodomusUiEvent(event)) return;
      if (!eventIsInsideCodeMirror(event)) return;
      markCodeMirrorTyping(event.type || "editor-input");
    };

    document.addEventListener("keydown", noteEditorInput, true);
    document.addEventListener("beforeinput", noteEditorInput, true);
    document.addEventListener("input", noteEditorInput, true);
    document.addEventListener("compositionupdate", noteEditorInput, true);

    document.addEventListener("pointerdown", (event) => {
      if (isNostrodomusUiEvent(event)) return;
      scheduleLifecycle("pointerdown");
      armSettleWindow("pointerdown-settle");
    }, true);

    document.addEventListener("mousedown", (event) => {
      if (isNostrodomusUiEvent(event)) return;
      scheduleLifecycle("mousedown");
      armSettleWindow("mousedown-settle");
    }, true);

    document.addEventListener("click", (event) => {
      if (isNostrodomusUiEvent(event)) return;
      scheduleLifecycle("click");
      armSettleWindow("click-settle");
    }, true);

    window.addEventListener("focus", () => {
      scheduleLifecycle("focus");
      armSettleWindow("focus-settle");
    }, { passive: true });

    scheduleLifecycle("boot");
    armSettleWindow("boot-settle");

    __nostrodomusCompanionLog("[nostrodomus-editor] loaded", VERSION);
  }

  window.__nostrodomusEditorCleanup = () => {
    clearTimers();
    clearSettleTimers();

    if (state.lifecycleRaf) {
      try { cancelAnimationFrame(state.lifecycleRaf); } catch {}
      state.lifecycleRaf = 0;
    }

    if (state.typingQuietTimer) {
      try { clearTimeout(state.typingQuietTimer); } catch {}
      state.typingQuietTimer = 0;
    }
    if (state.previewValueFreezeTimer) {
      try { clearTimeout(state.previewValueFreezeTimer); } catch {}
      state.previewValueFreezeTimer = 0;
    }
    state.previewValueFreezeLastTarget = null;
    state.previewValueFreezeLastDetail = undefined;
    for (const target of state.previewValueFreezeAttachedList || []) {
      try { target.removeEventListener("value-changed", onPreviewValueChanged, true); } catch {}
    }
    state.previewValueFreezeAttachedList.length = 0;
    state.previewValueFreezeAttachedTargets = new WeakSet();

    disconnectDialogObserver();

    state.observers.forEach((o) => {
      try { o.disconnect(); } catch {}
    });
    state.observers.length = 0;

    const hr = homeRoot();
    if (hr) {
      q(hr, "hui-dialog-edit-card").forEach((dialog) => {
        if (!dialog?.shadowRoot) return;
        walkRoots(dialog.shadowRoot).forEach((root) => {
          q(root, `style[id^="${STYLE_ID}"]`).forEach((el) => el.remove());
        });
      });
    }

    state.applying = false;
    state.lastDialog = null;
    state.lastCodeEditor = null;
    state.lastLogKey = "";
    state.pendingReason = "";
    state.observedDialog = null;
    state.observedRoots = [];

    __nostrodomusCompanionLog("[nostrodomus-editor] removed", VERSION);
  };

  boot();
})();
