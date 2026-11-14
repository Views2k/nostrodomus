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

const __nostrodomusRuntimeCoordinatorV1 = __nostrodomusInstallRuntimeCoordinatorV1({
  id: "picker-safe",
  role: "picker-companion-runtime",
  version: "nostrodomus-picker-safe-v3-runtime-coordinator"
});

const __nostrodomusPickerSafeSharedState = globalThis.__nostrodomusPickerSafeSharedState || (globalThis.__nostrodomusPickerSafeSharedState = {
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

let __nostrodomusPickerEditorQuietFlushTimer = 0;
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
(() => {
  const STYLE_ID = "nostrodomus-picker-only-final-v2";

  const PICKER_FIX_TARGETS = [
    "ha-picker-combo-box",
    "wa-popover",
    "wa-popup",
    "ha-input-search",
    "ha-input-search wa-input",
    "ha-picker-combo-box ha-combo-box-item",
    "ha-picker-combo-box ha-ripple",
  ];

  const PICKER_FIX_SELECTOR = PICKER_FIX_TARGETS.join(", ");

  function collectPickerFixTargets(root = document) {
    const groups = {
      pickers: [],
      popovers: [],
      popups: [],
      searches: [],
      searchInputs: [],
      items: [],
      ripples: [],
    };
    const seen = new WeakSet();

    function add(el) {
      if (!el || seen.has(el)) return;
      seen.add(el);

      if (el.matches?.("ha-picker-combo-box")) groups.pickers.push(el);
      if (el.matches?.("wa-popover")) groups.popovers.push(el);
      if (el.matches?.("wa-popup")) groups.popups.push(el);
      if (el.matches?.("ha-input-search")) groups.searches.push(el);
      if (el.matches?.("ha-input-search wa-input")) groups.searchInputs.push(el);
      if (el.matches?.("ha-picker-combo-box ha-combo-box-item")) groups.items.push(el);
      if (el.matches?.("ha-picker-combo-box ha-ripple")) groups.ripples.push(el);
    }

    function walk(node) {
      if (!node?.querySelectorAll) return;

      node.querySelectorAll(PICKER_FIX_SELECTOR).forEach(add);

      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }

    walk(root);
    return groups;
  }

  function inject(root, css) {
    if (!root) return;

    let style = root.querySelector?.(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      root.appendChild(style);
    }

    if (style.textContent !== css) {
      style.textContent = css;
    }
  }

  function applyPickerOnlyFix() {
    __nostrodomusPickerSafeSharedState.appliedPasses += 1;

    const targets = collectPickerFixTargets();
    const { pickers, popovers, popups, searches, searchInputs, items, ripples } = targets;
    const hasPrimaryTargets = Boolean(pickers.length || popovers.length || popups.length);

    __nostrodomusSetPickerTargetPresence(hasPrimaryTargets);
    if (!hasPrimaryTargets) return;

    pickers.forEach((picker) => {
      picker.style.setProperty("position", "relative", "important");
      picker.style.setProperty("z-index", "2147483647", "important");
      picker.style.setProperty("isolation", "isolate", "important");
      picker.style.setProperty("background", "rgba(18, 24, 34, 0.10)", "important");
      picker.style.setProperty("backdrop-filter", "blur(28px) saturate(155%)", "important");
      picker.style.setProperty("-webkit-backdrop-filter", "blur(28px) saturate(155%)", "important");
      picker.style.setProperty("border", "0", "important");
      picker.style.setProperty("outline", "0", "important");
      picker.style.setProperty("box-shadow", "none", "important");

      inject(picker.shadowRoot, `
        :host {
          position: relative !important;
          isolation: isolate !important;
          overflow: hidden !important;
          background: rgba(18, 24, 34, 0.10) !important;
          backdrop-filter: blur(28px) saturate(155%) !important;
          -webkit-backdrop-filter: blur(28px) saturate(155%) !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        :host::before {
          content: "" !important;
          position: absolute !important;
          inset: 0 !important;
          z-index: 0 !important;
          pointer-events: none !important;
          background: rgba(18, 24, 34, 0.10) !important;
          backdrop-filter: blur(28px) saturate(155%) !important;
          -webkit-backdrop-filter: blur(28px) saturate(155%) !important;
        }

        :host > * {
          position: relative !important;
          z-index: 1 !important;
        }

        ha-input-search {
          display: block !important;
          margin: 8px !important;
          padding: 0 !important;
          border-radius: 14px !important;
          background: rgba(0, 0, 0, 0.10) !important;
          backdrop-filter: blur(28px) saturate(155%) !important;
          -webkit-backdrop-filter: blur(28px) saturate(155%) !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        .virtualizer-wrapper,
        lit-virtualizer,
        .combo-box-row,
        .combo-box-row.current-value {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        .combo-box-row:hover,
        .combo-box-row:focus,
        .combo-box-row:focus-within {
          background: rgba(255, 255, 255, 0.06) !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        ha-combo-box-item {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
          --md-list-item-container-color: transparent !important;
          --md-list-item-selected-container-color: transparent !important;
          --md-list-item-hover-state-layer-color: rgba(255, 255, 255, 0.06) !important;
        }
      `);
    });

    searches.forEach((search) => {
      search.style.setProperty("border", "0", "important");
      search.style.setProperty("outline", "0", "important");
      search.style.setProperty("box-shadow", "none", "important");

      inject(search.shadowRoot, `
        :host {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;

          --wa-form-control-background-color: transparent !important;
          --wa-form-control-background-color-hover: transparent !important;
          --wa-form-control-filled-background-color: transparent !important;
          --wa-form-control-border-color: transparent !important;
          --wa-form-control-border-color-hover: transparent !important;
          --wa-form-control-border-color-focus: transparent !important;
        }

        wa-input,
        wa-input::part(base),
        wa-input::part(input) {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
      `);
    });

    searchInputs.forEach((wa) => {
      inject(wa.shadowRoot, `
        :host {
          --wa-form-control-background-color: transparent !important;
          --wa-form-control-background-color-hover: transparent !important;
          --wa-form-control-filled-background-color: transparent !important;
          --wa-form-control-border-color: transparent !important;
          --wa-form-control-border-color-hover: transparent !important;
          --wa-form-control-border-color-focus: transparent !important;
        }

        .text-field,
        div[part~="base"],
        input,
        input.control,
        input[part~="input"] {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
          color: rgba(255, 255, 255, 0.95) !important;
        }
      `);
    });

    items.forEach((item) => {
      inject(item.shadowRoot, `
        :host,
        #item,
        .list-item,
        button,
        md-item {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
      `);
    });

    ripples.forEach((ripple) => {
      inject(ripple.shadowRoot, `
        .surface {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
      `);
    });

    popovers.forEach((el) => {
      el.style.setProperty("border", "0", "important");
      el.style.setProperty("outline", "0", "important");
      el.style.setProperty("box-shadow", "none", "important");
      el.style.setProperty("background", "transparent", "important");

      inject(el.shadowRoot, `
        :host,
        dialog,
        wa-popup,
        div,
        * {
          border: 0 !important;
          border-color: transparent !important;
          outline: 0 !important;
          outline-color: transparent !important;
          box-shadow: none !important;
        }

        dialog {
          background: transparent !important;
          background-color: transparent !important;
          padding: 0 !important;
        }

        wa-popup {
          background: transparent !important;
          background-color: transparent !important;
        }
      `);
    });

    popups.forEach((el) => {
      el.style.setProperty("border", "0", "important");
      el.style.setProperty("outline", "0", "important");
      el.style.setProperty("box-shadow", "none", "important");
      el.style.setProperty("background", "transparent", "important");

      inject(el.shadowRoot, `
        :host,
        div,
        .popup,
        .popup__container,
        [part],
        * {
          border: 0 !important;
          border-color: transparent !important;
          outline: 0 !important;
          outline-color: transparent !important;
          box-shadow: none !important;
        }

        :host,
        div,
        .popup,
        .popup__container {
          background: transparent !important;
          background-color: transparent !important;
        }
      `);
    });
  }

  applyPickerOnlyFix();

  let pickerFixRaf = null;
  let pickerFixTail = null;

  function schedulePickerOnlyFix(event) {
    if (__nostrodomusSkipCodeEditorHotpath(event, "picker-only-event")) return;
    if (__nostrodomusDeferPickerWorkDuringEditorInput("picker-only-schedule", applyPickerOnlyFix)) return;

    if (event?.type === "keydown" && !__nostrodomusPickerSafeSharedState.hasPickerTargets) return;

    __nostrodomusPickerSafeSharedState.scheduledPasses += 1;

    if (pickerFixRaf == null) {
      pickerFixRaf = requestAnimationFrame(() => {
        pickerFixRaf = null;
        applyPickerOnlyFix();
      });
    }

    clearTimeout(pickerFixTail);
    pickerFixTail = setTimeout(applyPickerOnlyFix, 120);
  }

  // Safety net, gated so dashboards without active picker/popup targets pay nothing while idle.
  setInterval(() => {
    if (!__nostrodomusPickerSafeSharedState.hasPickerTargets) return;
    if (__nostrodomusDeferPickerWorkDuringEditorInput("picker-only-interval", applyPickerOnlyFix)) return;
    applyPickerOnlyFix();
  }, 400);

  document.addEventListener("pointerdown", schedulePickerOnlyFix, true);
  document.addEventListener("click", schedulePickerOnlyFix, true);
  document.addEventListener("focusin", schedulePickerOnlyFix, true);
  document.addEventListener("keydown", schedulePickerOnlyFix, true);

  window.NostrodomusPickerSafe = {
    apply: applyPickerOnlyFix,
    debug: () => ({ ...__nostrodomusPickerSafeSharedState, runtimeCoordinator: (() => { try { return __nostrodomusRuntimeCoordinatorV1?.snapshot?.() || null; } catch { return null; } })() }),
  };

  window.NostrodomusPickerOnly = {
    apply: applyPickerOnlyFix,
    debug: () => ({ ...__nostrodomusPickerSafeSharedState, runtimeCoordinator: (() => { try { return __nostrodomusRuntimeCoordinatorV1?.snapshot?.() || null; } catch { return null; } })() }),
  };
})();

/* NOSTRODOMUS SMART PICKER TRIGGER */
(() => {
  const TARGETS = "ha-picker-combo-box, wa-popover, wa-popup";
  const seenRoots = new WeakSet();
  let timer = null;
  let raf = null;

  function runSoon(event) {
    if (__nostrodomusSkipCodeEditorHotpath(event, "picker-smart-event")) return;
    if (__nostrodomusDeferPickerWorkDuringEditorInput("picker-smart-schedule")) return;

    if (event?.type === "keydown" && !__nostrodomusPickerSafeSharedState.hasPickerTargets) return;

    const apply =
      window.NostrodomusPickerSafe?.apply ||
      window.NostrodomusPickerOnly?.apply;

    if (typeof apply !== "function") return;

    __nostrodomusPickerSafeSharedState.scheduledPasses += 1;

    if (raf == null) {
      raf = requestAnimationFrame(() => {
        raf = null;
        apply();
      });
    }

    clearTimeout(timer);
    timer = setTimeout(apply, 120);
  }

  function scanRoot(root) {
    if (!root || seenRoots.has(root) || !root.querySelectorAll) return;
    seenRoots.add(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node?.nodeType !== 1) continue;

          if (
            node.matches?.(TARGETS) ||
            node.querySelector?.(TARGETS)
          ) {
            __nostrodomusSetPickerTargetPresence(true);
            if (!__nostrodomusDeferPickerWorkDuringEditorInput("picker-smart-mutation")) runSoon();
          }

          if (node.shadowRoot) scanRoot(node.shadowRoot);
          node.querySelectorAll?.("*").forEach((el) => {
            if (el.shadowRoot) scanRoot(el.shadowRoot);
          });
        }
      }
    });

    observer.observe(root, { childList: true, subtree: true });

    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) scanRoot(el.shadowRoot);
    });
  }

  scanRoot(document);

  document.addEventListener("pointerdown", runSoon, true);
  document.addEventListener("mousedown", runSoon, true);
  document.addEventListener("click", runSoon, true);
  document.addEventListener("focusin", runSoon, true);
  document.addEventListener("keydown", runSoon, true);

  window.NostrodomusPickerSmartTrigger = { run: runSoon };
})();

/* NOSTRODOMUS PICKER OUTSIDE GLOW START */
(() => {
  const ID = "nostrodomus-picker-outside-glow-layer";

  let rafId = null;
  let removeTimer = null;
  let lastRectKey = "";
  let cachedPicker = null;
  let isClosing = false;
  let isVisible = false;
  let glowIsOpen = false;
  let searchUntil = 0;

  const TOP_FADE_OFFSET = 22;

  // Negative = inset. This tucks the glow box just under the menu side edges
  // so the shadow bleeds out from beneath instead of leaving left/right gaps.
  const SIDE_BLEED = -4;

  const SEARCH_MS = 450;

  const OPEN_SHADOW = `
    0 0 34px rgba(120, 220, 255, 0.30),
    0 0 82px rgba(120, 220, 255, 0.18),
    0 24px 76px rgba(0, 0, 0, 0.62)
  `;

  const OPEN_BG = `
    radial-gradient(
      ellipse at center,
      rgba(120, 220, 255, 0.055) 0%,
      rgba(120, 220, 255, 0.025) 48%,
      rgba(120, 220, 255, 0.000) 78%
    )
  `;

  const CLOSE_BG = `
    radial-gradient(
      ellipse at center,
      rgba(120, 220, 255, 0.16) 0%,
      rgba(120, 220, 255, 0.075) 38%,
      rgba(120, 220, 255, 0.020) 62%,
      rgba(120, 220, 255, 0.000) 82%
    )
  `;

  const OPEN_TRANSITION =
    "opacity 200ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms ease-out";

  const CLOSE_TRANSITION =
    "opacity 260ms cubic-bezier(0.22, 1, 0.36, 1), background 200ms ease-out";

  function deepQueryAll(selector, root = document) {
    const found = [];

    function walk(node) {
      if (!node?.querySelectorAll) return;

      found.push(...node.querySelectorAll(selector));

      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }

    walk(root);
    return [...new Set(found)];
  }

  function getGlowLayer() {
    return document.getElementById(ID);
  }

  function isPickerUsable(el) {
    if (!el?.isConnected) return false;

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    return (
      rect.width > 100 &&
      rect.height > 100 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  function getVisiblePicker() {
    if (cachedPicker && isPickerUsable(cachedPicker)) {
      return {
        el: cachedPicker,
        rect: cachedPicker.getBoundingClientRect(),
      };
    }

    const found = deepQueryAll("ha-picker-combo-box")
      .filter(isPickerUsable)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0];

    cachedPicker = found?.el || null;
    return found || null;
  }

  function eventInsidePicker(event) {
    const found = getVisiblePicker();

    if (!found || event.clientX == null || event.clientY == null) return false;

    const { rect } = found;

    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  function ensureGlowLayer() {
    let glow = getGlowLayer();

    if (!glow) {
      glow = document.createElement("div");
      glow.id = ID;
      document.body.appendChild(glow);

      glow.style.setProperty("position", "fixed", "important");
      glow.style.setProperty("pointer-events", "none", "important");
      glow.style.setProperty("z-index", "2147483646", "important");
      glow.style.setProperty("border-radius", "0 0 22px 22px", "important");
      glow.style.setProperty("background", OPEN_BG, "important");
      glow.style.setProperty("will-change", "opacity, background, transform", "important");
      glow.style.setProperty("transform", "translateZ(0)", "important");
      glow.style.setProperty("transition", OPEN_TRANSITION, "important");
      glow.style.setProperty("opacity", "0", "important");
      glow.style.setProperty("box-shadow", OPEN_SHADOW, "important");
    }

    return glow;
  }

  function positionGlow(rect) {
    const left = Math.round(rect.left - SIDE_BLEED);
    const top = Math.round(rect.top + TOP_FADE_OFFSET);
    const width = Math.round(rect.width + SIDE_BLEED * 2);
    const height = Math.round(Math.max(rect.height - TOP_FADE_OFFSET, 40));

    const rectKey = `${left}|${top}|${width}|${height}`;
    if (rectKey === lastRectKey) return;

    const glow = ensureGlowLayer();

    glow.style.setProperty("left", `${left}px`, "important");
    glow.style.setProperty("top", `${top}px`, "important");
    glow.style.setProperty("width", `${width}px`, "important");
    glow.style.setProperty("height", `${height}px`, "important");

    lastRectKey = rectKey;
  }

  function openGlow() {
    const glow = ensureGlowLayer();

    clearTimeout(removeTimer);
    isClosing = false;
    glowIsOpen = true;

    glow.style.setProperty("border-radius", "0 0 22px 22px", "important");
    glow.style.setProperty("background", OPEN_BG, "important");
    glow.style.setProperty("box-shadow", OPEN_SHADOW, "important");
    glow.style.setProperty("transition", OPEN_TRANSITION, "important");

    requestAnimationFrame(() => {
      if (!isClosing) {
        glow.style.setProperty("opacity", "1", "important");
      }
    });
  }

  function fadeGlowOut() {
    const glow = getGlowLayer();

    glowIsOpen = false;

    if (!glow || isClosing) return;

    isClosing = true;
    clearTimeout(removeTimer);

    glow.style.setProperty("box-shadow", "none", "important");
    glow.style.setProperty("border-radius", "999px", "important");
    glow.style.setProperty("background", CLOSE_BG, "important");
    glow.style.setProperty("transition", CLOSE_TRANSITION, "important");
    glow.style.setProperty("opacity", "0", "important");

    removeTimer = setTimeout(() => {
      if (!getVisiblePicker()) {
        glow.remove();
        lastRectKey = "";
        cachedPicker = null;
        isClosing = false;
      }
    }, 280);
  }

  function removeGlowNow() {
    clearTimeout(removeTimer);

    getGlowLayer()?.remove();

    lastRectKey = "";
    cachedPicker = null;
    isClosing = false;
    glowIsOpen = false;
  }

  function frame() {
    rafId = null;

    const found = getVisiblePicker();

    if (found) {
      if (!glowIsOpen) openGlow();

      positionGlow(found.rect);
      isVisible = true;
      rafId = requestAnimationFrame(frame);
      return;
    }

    if (isVisible) {
      isVisible = false;
      fadeGlowOut();
      return;
    }

    if (performance.now() < searchUntil) {
      rafId = requestAnimationFrame(frame);
    }
  }

  function kick(searchMs = SEARCH_MS) {
    searchUntil = performance.now() + searchMs;

    if (rafId == null) {
      rafId = requestAnimationFrame(frame);
    }
  }

  window.__nostrodomusPickerGlowCleanup?.();

  function onPointerDown() {
    kick();
  }

  function onPointerUp() {
    kick();
  }

  function onKeyDown(event) {
    if (__nostrodomusSkipCodeEditorHotpath(event, "picker-glow-keydown")) return;

    if (event.key === "Escape") {
      searchUntil = 0;
      isVisible = false;
      fadeGlowOut();
      return;
    }

    kick();
  }

  function onScrollOrResize() {
    if (rafId == null && getVisiblePicker()) {
      kick();
    }
  }

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize, true);

  window.__nostrodomusPickerGlowCleanup = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
    }

    rafId = null;
    clearTimeout(removeTimer);

    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize, true);

    removeGlowNow();
  };

  window.NostrodomusPickerGlow = {
    kick,
    cleanup: window.__nostrodomusPickerGlowCleanup,
  };

  kick();

  __nostrodomusCompanionLog("Nostrodomus picker outside glow active.");
})();
/* NOSTRODOMUS PICKER OUTSIDE GLOW END */


/* NOSTRODOMUS HA-DROPDOWN DIRECT GLOW START */
(() => {
  const STYLE_ID = "nostrodomus-ha-dropdown-direct-glow-filter";

  function deepQueryAll(selector, root = document) {
    const found = [];

    function walk(node) {
      if (!node?.querySelectorAll) return;

      found.push(...node.querySelectorAll(selector));

      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }

    walk(root);
    return [...new Set(found)];
  }

  function visible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    return (
      el.isConnected &&
      rect.width > 80 &&
      rect.height > 30 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  function applyHaDropdownGlow() {
    const dropdowns = deepQueryAll("ha-dropdown")
      .filter((drop) => drop.shadowRoot)
      .map((drop) => {
        const menu = drop.shadowRoot.querySelector("#menu");
        return menu ? { drop, menu, rect: menu.getBoundingClientRect() } : null;
      })
      .filter(Boolean)
      .filter(({ menu }) => visible(menu));

    dropdowns.forEach(({ drop, menu }) => {
      const root = drop.shadowRoot;

      let style = root.querySelector(`#${STYLE_ID}`);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        root.appendChild(style);
      }

      style.textContent = `
        #menu {
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
          background: rgba(18, 24, 34, 0.88) !important;
          border-radius: 14px !important;
          overflow: hidden !important;

          filter:
            drop-shadow(0 0 22px rgba(120, 220, 255, 0.42))
            drop-shadow(0 0 58px rgba(120, 220, 255, 0.24))
            drop-shadow(0 18px 54px rgba(0, 0, 0, 0.62)) !important;
        }

        ha-dropdown-item {
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
          background-color: rgba(18, 24, 34, 0.88) !important;
          color: #ffffff !important;
        }

        ha-dropdown-item:hover {
          background-color: rgba(120, 220, 255, 0.14) !important;
        }
      `;

      menu.style.setProperty("border", "0", "important");
      menu.style.setProperty("outline", "0", "important");
      menu.style.setProperty("box-shadow", "none", "important");
      menu.style.setProperty("background", "rgba(18, 24, 34, 0.88)", "important");
      menu.style.setProperty("border-radius", "14px", "important");
      menu.style.setProperty("overflow", "hidden", "important");
      menu.style.setProperty("filter", `
        drop-shadow(0 0 22px rgba(120, 220, 255, 0.42))
        drop-shadow(0 0 58px rgba(120, 220, 255, 0.24))
        drop-shadow(0 18px 54px rgba(0, 0, 0, 0.62))
      `, "important");
    });
  }

  let dropdownGlowRaf = null;
  let dropdownGlowTimer = null;

  function scheduleHaDropdownGlow(event) {
    if (__nostrodomusSkipCodeEditorHotpath(event, "ha-dropdown-glow-event")) return;
    if (__nostrodomusDeferPickerWorkDuringEditorInput("ha-dropdown-glow-schedule", applyHaDropdownGlow)) return;

    if (dropdownGlowRaf == null) {
      dropdownGlowRaf = requestAnimationFrame(() => {
        dropdownGlowRaf = null;
        applyHaDropdownGlow();
      });
    }

    clearTimeout(dropdownGlowTimer);
    dropdownGlowTimer = setTimeout(applyHaDropdownGlow, 120);
  }

  window.__nostrodomusHaDropdownDirectGlowCleanup?.();

  window.addEventListener("pointerdown", scheduleHaDropdownGlow, true);
  window.addEventListener("pointerup", scheduleHaDropdownGlow, true);
  window.addEventListener("click", scheduleHaDropdownGlow, true);
  window.addEventListener("keydown", scheduleHaDropdownGlow, true);
  window.addEventListener("focusin", scheduleHaDropdownGlow, true);

  window.__nostrodomusHaDropdownDirectGlowCleanup = () => {
    if (dropdownGlowRaf != null) cancelAnimationFrame(dropdownGlowRaf);
    dropdownGlowRaf = null;
    clearTimeout(dropdownGlowTimer);
    dropdownGlowTimer = null;

    window.removeEventListener("pointerdown", scheduleHaDropdownGlow, true);
    window.removeEventListener("pointerup", scheduleHaDropdownGlow, true);
    window.removeEventListener("click", scheduleHaDropdownGlow, true);
    window.removeEventListener("keydown", scheduleHaDropdownGlow, true);
    window.removeEventListener("focusin", scheduleHaDropdownGlow, true);

    deepQueryAll(`#${STYLE_ID}`).forEach((node) => node.remove());
  };

  window.NostrodomusHaDropdownGlow = {
    apply: applyHaDropdownGlow,
    cleanup: window.__nostrodomusHaDropdownDirectGlowCleanup,
  };

  scheduleHaDropdownGlow();
})();
/* NOSTRODOMUS HA-DROPDOWN DIRECT GLOW END */


/* NOSTRODOMUS EDIT TOOLBAR/TABBAR TRANSPARENCY START */
(() => {
  const STYLE_ID = "nostrodomus-edit-toolbar-tabbar-zero-test";

  let burstTimer = null;
  let burstInterval = null;
  let burstUntil = 0;

  function isEditMode() {
    return location.href.includes("edit=1");
  }

  function deepQueryAll(selector, root = document) {
    const found = [];

    function walk(node) {
      if (!node?.querySelectorAll) return;

      found.push(...node.querySelectorAll(selector));

      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }

    walk(root);
    return [...new Set(found)];
  }

  function inject(root, css) {
    if (!root) return;

    let style = root.querySelector?.(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      root.appendChild(style);
    }

    if (style.textContent !== css) {
      style.textContent = css;
    }
  }

  const css = `
    .header,
    .toolbar,
    .tab-bar {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
      border: 0 !important;
      outline: 0 !important;
    }

    .toolbar::before,
    .toolbar::after,
    .tab-bar::before,
    .tab-bar::after,
    .header::before,
    .header::after {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
      border: 0 !important;
      outline: 0 !important;
    }
  `;

  const tabGroupCss = `
    :host,
    .tab-group,
    .tab-group-top,
    .nav-container,
    .nav,
    .tabs,
    [part="base"],
    [part="nav"],
    [part="tabs"] {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
      border: 0 !important;
      outline: 0 !important;
    }
  `;

  function makeTransparent(el) {
    if (!el) return;

    el.style.setProperty("background", "transparent", "important");
    el.style.setProperty("background-color", "transparent", "important");
    el.style.setProperty("background-image", "none", "important");
    el.style.setProperty("box-shadow", "none", "important");
    el.style.setProperty("border", "0", "important");
    el.style.setProperty("outline", "0", "important");
  }

  function applyEditToolbarTabbarTransparency() {
    if (!isEditMode()) return;

    deepQueryAll("hui-root").forEach((el) => {
      inject(el.shadowRoot, css);
    });

    deepQueryAll(".header, .toolbar, .tab-bar").forEach(makeTransparent);

    deepQueryAll("ha-tab-group").forEach((el) => {
      makeTransparent(el);
      inject(el.shadowRoot, tabGroupCss);
    });
  }

  function burstApply(ms = 900) {
    clearTimeout(burstTimer);

    burstUntil = performance.now() + ms;

    applyEditToolbarTabbarTransparency();
    requestAnimationFrame(applyEditToolbarTabbarTransparency);

    if (!burstInterval) {
      burstInterval = setInterval(() => {
        applyEditToolbarTabbarTransparency();

        if (performance.now() > burstUntil) {
          clearInterval(burstInterval);
          burstInterval = null;
        }
      }, 90);
    }

    burstTimer = setTimeout(applyEditToolbarTabbarTransparency, 30);
    setTimeout(applyEditToolbarTabbarTransparency, 60);
    setTimeout(applyEditToolbarTabbarTransparency, 140);
    setTimeout(applyEditToolbarTabbarTransparency, 260);
  }

  window.__nostrodomusEditToolbarTabbarCleanup?.();

  const oldPushState = history.pushState;
  const oldReplaceState = history.replaceState;

  history.pushState = function(...args) {
    const result = oldPushState.apply(this, args);
    burstApply(1000);
    return result;
  };

  history.replaceState = function(...args) {
    const result = oldReplaceState.apply(this, args);
    burstApply(1000);
    return result;
  };

  function onPointerDown(event) {
    const path = event.composedPath?.() || [];
    const hit = path.some((el) => {
      const tag = el?.tagName?.toLowerCase?.() || "";
      const title = el?.getAttribute?.("title") || "";
      const aria = el?.getAttribute?.("aria-label") || "";
      const cls = String(el?.className || "");

      return (
        title.includes("Edit") ||
        title.includes("Done") ||
        aria.includes("Edit") ||
        aria.includes("Done") ||
        cls.includes("edit-icon") ||
        cls.includes("exit-edit-mode") ||
        tag === "ha-tab-group" ||
        tag === "ha-tab-group-tab"
      );
    });

    if (hit || isEditMode()) {
      burstApply(800);
    }
  }

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("popstate", () => burstApply(1000), true);

  window.__nostrodomusEditToolbarTabbarCleanup = () => {
    clearTimeout(burstTimer);
    clearInterval(burstInterval);
    burstTimer = null;
    burstInterval = null;

    history.pushState = oldPushState;
    history.replaceState = oldReplaceState;

    window.removeEventListener("pointerdown", onPointerDown, true);

    deepQueryAll(`#${STYLE_ID}`).forEach((node) => node.remove());

    __nostrodomusCompanionLog("Edit toolbar/tab-bar zero transparency removed.");
  };

  window.NostrodomusEditToolbarTabbar = {
    apply: applyEditToolbarTabbarTransparency,
    burst: burstApply,
    cleanup: window.__nostrodomusEditToolbarTabbarCleanup,
  };

  burstApply(1200);

  __nostrodomusCompanionLog("Edit toolbar/tab-bar zero transparency active, burst mode.");
})();
/* NOSTRODOMUS EDIT TOOLBAR/TABBAR TRANSPARENCY END */

