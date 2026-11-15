// The preflight stylesheet: the codebox frame, surface and text color in place from the first
// frame an editor is shown, before the settings and the full style pass. This module installs it
// in the document and the editors' shadow roots, marks the editors it styles, and watches the
// open dialog and editor for new editors. activeCodeboxStyleEditor is injected from
// codeboxStyleRuntime.js.

import {
  HA_CODE_EDITOR,
  HA_COMBO_BOX,
  HA_DIALOG,
  HA_FORM,
  HA_MD_DIALOG,
  HA_SELECTOR,
  HA_TEXTFIELD,
  HA_YAML_EDITOR,
  HUI_CARD_EDITOR,
  HUI_CARD_ELEMENT_EDITOR,
  HUI_CARD_OPTIONS_EDITOR,
  HUI_DIALOG_EDIT_CARD,
} from "../../editor/haSelectors.js";
import { insideCardOwnEditor } from "../../editor/cardOwnEditor.js";

export function createCodeboxPreflight(deps = {}) {
  const {
    document = globalThis.document,
    performance = globalThis.performance,
    requestAnimationFrame = globalThis.requestAnimationFrame?.bind?.(globalThis),
    cancelAnimationFrame = globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout = globalThis.clearTimeout?.bind?.(globalThis),
    MutationObserver = globalThis.MutationObserver,
    DARKPLUS_SYNTAX_COLORS,
    state,
    recordPerformanceEvent,
    nostrodomusPerfMode,
    activeEditDialog,
    codeboxEditorCacheKey,
    ensureStableStyleElement,
    installCodeboxKeyboardContainment,
    installInitialSyntaxPaintGate,
    primeInitialSyntaxPaintGateForEditor,
    activeCodeboxStyleEditor,
    // (editor) => { surface, syntaxFg } when the codebox colors are adjusted for a light Home
    // Assistant theme or a dark-text syntax theme, else null. With them the preflight sheet does
    // not show the dark surface and light text before the full style arrives.
    preflightColors = () => null,
  } = deps;
  const bangPriority = "!" + "im" + "portant";

  function preflightColorsFor(editor) {
    try {
      const colors = preflightColors(editor);
      return colors && colors.surface && colors.syntaxFg ? colors : null;
    } catch {
      return null;
    }
  }

  // Puts the preflight sheet into `root`: one stable element, its text updated in place. Returns
  // true when the element or its text changed.
  function installPreflightStyleIn(root, colors) {
    if (!root) return false;
    const ensured = ensureStableStyleElement(root, "nostrodomus-codebox-preflight-style-v1");
    const style = ensured.style;
    if (!style) return false;
    const css = codeboxPreflightCssFor(root?.host ? "shadow" : "document", colors);
    let changed = !!ensured.changed;
    if (style.textContent !== css) { style.textContent = css; changed = true; }
    return changed;
  }

  function primeCodeboxPreflightForEditor(editor, reason = "preflight-prime") {
    if (!editor?.querySelector) return false;
    const colors = preflightColorsFor(editor);
    let installedRoots = 0;
    try { if (installPreflightStyleIn(document, colors)) installedRoots += 1; } catch { /* mid-frame HA mutation */ }
    const root = editor.getRootNode?.() || document;
    try { if (installPreflightStyleIn(root, colors)) installedRoots += 1; } catch { /* mid-frame HA mutation */ }

    // Each marker is written only when it is missing. An attribute write queues a mutation record
    // even when the value is unchanged, on .cm-content it wakes CodeMirror's own observer, and
    // this function runs on every style apply.
    const tag = (node, name) => {
      try { if (node?.getAttribute && node.getAttribute(name) !== "1") node.setAttribute(name, "1"); } catch { /* detached node */ }
    };
    tag(editor, "data-nostrodomus-codebox-style");
    tag(editor, "data-nostrodomus-codebox-frame-host");
    const host = (() => {
      try { return editor.closest?.("ha-code-editor") || (root?.host?.localName === "ha-code-editor" ? root.host : null); } catch { return null; }
    })();
    if (host) {
      tag(host, "data-nostrodomus-codebox-frame-host");
      tag(host, "data-nostrodomus-codebox-style");
    }

    for (const node of [editor.querySelector?.(".cm-scroller"), editor.querySelector?.(".cm-content")]) {
      tag(node, "data-nostrodomus-codebox-style");
    }

    try { primeInitialSyntaxPaintGateForEditor(editor, `codebox-preflight-prime:${reason}`); } catch { /* mid-frame HA mutation */ }
    try { installCodeboxKeyboardContainment(editor, `preflight-prime:${reason}`); } catch { /* mid-frame HA mutation */ }
    state.lastCodeboxPreflightPrime = {
      at: new Date().toISOString(),
      reason,
      editorKey: codeboxEditorCacheKey(editor),
      installedRoots,
      hostTagged: !!host,
    };
    recordPerformanceEvent("codebox-preflight-prime", 0, `${reason}:roots=${installedRoots}:host=${!!host}`);
    return true;
  }

  // The preflight sheet with its default colors. It has the host frame, surface and unclip rules
  // of codeboxStyleBuildRootCss, with `!important` for the same reasons.
  function codeboxPreflightCss(rootKind = "document") {
    return codeboxPreflightCssFor(rootKind, null);
  }

  // `colors` replaces the fixed dark surface and light text; without it the CSS is the frozen one.
  function codeboxPreflightCssFor(rootKind, colors) {
    const surface = colors?.surface || "rgba(0, 0, 0, 0.35)";
    const syntaxFg = colors?.syntaxFg || DARKPLUS_SYNTAX_COLORS.fg;
    return codeboxPreflightCssWith(rootKind, surface, syntaxFg);
  }

  function codeboxPreflightCssWith(rootKind, surface, syntaxFg) {
    const hostSelector = rootKind === "shadow" ? ":host" : "ha-code-editor";
    const hostFrameSelector = rootKind === "shadow"
      ? ':host([data-nostrodomus-codebox-frame-host="1"])::before'
      : 'ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::before';
    const hostSurfaceSelector = rootKind === "shadow"
      ? ':host([data-nostrodomus-codebox-frame-host="1"])::after'
      : 'ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after';
    const innerPrefix = rootKind === "shadow" ? "" : "ha-code-editor ";
    return `
    ${hostSelector},
    ${hostSelector}[data-nostrodomus-codebox-frame-host="1"] {
      position: relative ${bangPriority};
      display: block ${bangPriority};
      overflow: visible ${bangPriority};
      contain: none ${bangPriority};
      background: transparent ${bangPriority};
      border: 0 ${bangPriority};
      box-shadow: none ${bangPriority};
      isolation: isolate ${bangPriority};
      --nostrodomus-codebox-frame-border: rgba(120, 220, 255, 0.46);
      --nostrodomus-codebox-frame-glow: rgba(120, 220, 255, 0.28);
      --nostrodomus-codebox-frame-glow-soft: rgba(255, 120, 185, 0.16);
      --nostrodomus-codebox-frame-glow-inner: rgba(120, 220, 255, 0.28);
      --nostrodomus-codebox-frame-glow-inner-soft: rgba(255, 120, 185, 0.16);
      --nostrodomus-codebox-frame-glow-outer: rgba(0, 0, 0, 0);
      --nostrodomus-codebox-frame-glow-outer-soft: rgba(0, 0, 0, 0);
      --nostrodomus-codebox-surface: ${surface};
      --nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);
      --nostrodomus-codebox-syntax-fg: ${syntaxFg};
    }
    [data-nostrodomus-codebox-unclip],
    :host([data-nostrodomus-codebox-unclip]) {
      overflow: visible !important;
      overflow-x: visible ${bangPriority};
      overflow-y: visible ${bangPriority};
      contain: none !important;
      clip-path: none !important;
      mask-image: none !important;
      -webkit-mask-image: none !important;
    }
    ${hostFrameSelector} {
      content: "";
      position: absolute !important;
      inset: 0 !important;
      box-sizing: border-box !important;
      border-radius: 22px !important;
      pointer-events: none !important;
      z-index: 2147483001 !important;
      border: 1px solid var(--nostrodomus-codebox-frame-border) !important;
      box-shadow:
        inset 0 0 0 1px var(--nostrodomus-codebox-frame-border),
        inset 0 0 18px var(--nostrodomus-codebox-frame-glow-inner),
        inset 0 0 34px var(--nostrodomus-codebox-frame-glow-inner-soft),
        0 0 0 1px var(--nostrodomus-codebox-frame-border),
        0 0 24px var(--nostrodomus-codebox-frame-glow-outer),
        0 0 52px var(--nostrodomus-codebox-frame-glow-outer-soft) !important;
      background: transparent !important;
      opacity: 1 !important;
      visibility: visible !important;
      transform: translateZ(0) !important;
    }
    ${hostSurfaceSelector} {
      content: "";
      position: absolute !important;
      inset: 0 !important;
      box-sizing: border-box !important;
      border-radius: 22px !important;
      pointer-events: none !important;
      z-index: 1 !important;
      background: var(--nostrodomus-codebox-surface) !important;
      backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;
      -webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;
      transform: translateZ(0) !important;
    }
    ${innerPrefix}.cm-editor,
    ${innerPrefix}.cm-scroller,
    ${innerPrefix}.cm-content {
      background: transparent !important;
      color: var(--nostrodomus-codebox-syntax-fg, ${DARKPLUS_SYNTAX_COLORS.fg}) !important;
      -webkit-text-fill-color: var(--nostrodomus-codebox-syntax-fg, ${DARKPLUS_SYNTAX_COLORS.fg}) !important;
    }
    ${innerPrefix}.cm-editor {
      position: relative !important;
      z-index: 2 !important;
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
    }
    ${innerPrefix}.cm-line,
    ${innerPrefix}.cm-line span,
    ${innerPrefix}.cm-content span {
      color: var(--nostrodomus-codebox-syntax-fg, ${DARKPLUS_SYNTAX_COLORS.fg}) !important;
      -webkit-text-fill-color: var(--nostrodomus-codebox-syntax-fg, ${DARKPLUS_SYNTAX_COLORS.fg}) !important;
      text-shadow: none !important;
    }

    .cm-content[data-nostrodomus-initial-syntax-pending="1"],
    .cm-content[data-nostrodomus-initial-syntax-pending="1"] .cm-line,
    .cm-content[data-nostrodomus-initial-syntax-pending="1"] .cm-line span {
      opacity: 0 !important;
      transition: none !important;
    }
    .cm-content[data-nostrodomus-initial-syntax-ready="1"],
    .cm-content[data-nostrodomus-initial-syntax-ready="1"] .cm-line,
    .cm-content[data-nostrodomus-initial-syntax-ready="1"] .cm-line span {
      opacity: 1 !important;
      transition: none !important;
    }
    [data-nostrodomus-codebox-external-frame="1"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
  `;
  }

  function mutationRecordIsNostrodomusStableStyleNode(record) {
    const isStableStyle = (node) => {
      if (!node) return false;
      try {
        if (node.nodeType === 1 && node.matches?.("style[data-nostrodomus-codebox-stable-style-node='1']")) return true;
        const parent = node.parentNode;
        if (parent?.nodeType === 1 && parent.matches?.("style[data-nostrodomus-codebox-stable-style-node='1']")) return true;
      } catch { /* detached node */ }
      return false;
    };
    if (isStableStyle(record?.target)) return true;
    for (const node of record?.addedNodes || []) if (!isStableStyle(node)) return false;
    for (const node of record?.removedNodes || []) if (!isStableStyle(node)) return false;
    return !!((record?.addedNodes?.length || 0) || (record?.removedNodes?.length || 0));
  }


  function nodeLooksLikeEditorSurface(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.matches?.("ha-code-editor, .cm-editor, .cm-content")) return true;
      if (node.querySelector?.("ha-code-editor, .cm-editor, .cm-content")) return true;
      const shadow = node.shadowRoot || null;
      if (shadow?.querySelector?.("ha-code-editor, .cm-editor, .cm-content")) return true;
    } catch { /* detached node */ }
    return false;
  }

  function mutationRecordsContainEditorSurface(records) {
    for (const record of records || []) {
      if (record?.type !== "childList") continue;
      for (const node of record.addedNodes || []) if (nodeLooksLikeEditorSurface(node)) return true;
    }
    return false;
  }

  function codeboxPreflightScopedObserverEnabled() {
    return nostrodomusPerfMode() !== "legacy";
  }

  function codeboxPreflightObserverLabel(target, fallback = "target") {
    try {
      if (target === document) return "document";
      if (target === document.documentElement) return "documentElement";
      if (target === document.body) return "body";
      if (target?.host?.localName) return `shadow:${target.host.localName}`;
      if (target?.localName) return target.localName;
    } catch { /* cross-origin root */ }
    return fallback;
  }

  function codeboxPreflightScopedObserverTargets() {
    const targets = [];
    const add = (target, label = "target") => {
      if (!target || !target.childNodes && !target.querySelectorAll) return;
      if (targets.some(item => item.target === target)) return;
      targets.push({ target, label: codeboxPreflightObserverLabel(target, label) });
    };

    const editor = activeCodeboxStyleEditor();
    const dialog = activeEditDialog();
    if (dialog) {
      add(dialog, "active-edit-dialog");
      try { add(dialog.shadowRoot, "active-edit-dialog-shadow-root"); } catch { /* cross-origin root */ }
    }
    if (editor?.querySelector) {
      add(editor, "active-cm-editor");
      const root = editor.getRootNode?.();
      add(root, "active-editor-root");
      try {
        const host = editor.closest?.("ha-code-editor") || (root?.host?.localName === "ha-code-editor" ? root.host : null);
        add(host, "active-ha-code-editor");
        add(host?.shadowRoot, "active-ha-code-editor-shadow-root");
      } catch { /* cross-origin root */ }
    }
    return targets.filter(item => item?.target && item.target !== document && item.target !== document.documentElement && item.target !== document.body);
  }

  function disconnectCodeboxPreflightObserver(reason = "codebox-preflight-observer-disconnect") {
    try { state.codeboxPreflightObserver?.takeRecords?.(); } catch { /* injected observer */ }
    try { state.codeboxPreflightObserver?.disconnect?.(); } catch { /* injected observer */ }
    state.codeboxPreflightObserver = null;
    state.codeboxPreflightObserverMode = "";
    state.codeboxPreflightObserverKey = "";
    state.codeboxPreflightObserverTargetCount = 0;
    state.lastCodeboxPreflightObserverScope = {
      at: new Date().toISOString(),
      reason,
      mode: "disconnected",
      targets: [],
    };
  }

  function installCodeboxPreflightObserver(reason = "preflight-observer") {
    if (typeof MutationObserver !== "function") return false;
    const scoped = codeboxPreflightScopedObserverEnabled();
    const targets = scoped
      ? codeboxPreflightScopedObserverTargets()
      : [{ target: document.documentElement || document, label: "legacy-document" }];
    const mode = scoped ? (targets.length ? "scoped" : "sentinel-only") : "legacy-broad";
    const key = mode === "legacy-broad"
      ? "legacy-document"
      : targets.map(item => `${item.label}:${codeboxPreflightObserverLabel(item.target)}`).join("|");

    if (!targets.length) {
      if (state.codeboxPreflightObserver) disconnectCodeboxPreflightObserver(`${reason}-sentinel-only`);
      state.codeboxPreflightObserverMode = mode;
      state.codeboxPreflightObserverKey = "";
      state.codeboxPreflightObserverTargetCount = 0;
      state.lastCodeboxPreflightObserverScope = {
        at: new Date().toISOString(),
        reason,
        mode,
        targets: [],
        note: "preflight observer waits for editor lifecycle sentinel to detect the active editor",
      };
      return false;
    }

    if (state.codeboxPreflightObserver && state.codeboxPreflightObserverMode === mode && state.codeboxPreflightObserverKey === key) {
      return true;
    }

    disconnectCodeboxPreflightObserver(`${reason}-replace`);
    const observer = new MutationObserver((records) => {
      let shouldScan = false;
      for (const record of records || []) {
        if (mutationRecordIsNostrodomusStableStyleNode(record)) continue;
        if (record.type === "childList" && (record.addedNodes?.length || record.removedNodes?.length)) { shouldScan = true; break; }
      }
      if (!shouldScan) return;
      scheduleCodeboxPreflightMutationScan(records, mode === "scoped" ? "scoped-mutation" : "mutation");
    });

    let observed = 0;
    for (const item of targets) {
      try {
        observer.observe(item.target, { childList: true, subtree: true });
        observed += 1;
      } catch { /* invalid observe target */ }
    }
    if (!observed) return false;

    state.codeboxPreflightObserver = observer;
    state.codeboxPreflightObserverMode = mode;
    state.codeboxPreflightObserverKey = key;
    state.codeboxPreflightObserverTargetCount = observed;
    if (mode === "scoped") state.codeboxPreflightScopedInstalls = (state.codeboxPreflightScopedInstalls || 0) + 1;
    if (mode === "legacy-broad") state.codeboxPreflightLegacyBroadInstalls = (state.codeboxPreflightLegacyBroadInstalls || 0) + 1;
    state.lastCodeboxPreflightObserverScope = {
      at: new Date().toISOString(),
      reason,
      mode,
      targets: targets.slice(0, observed).map(item => item.label),
    };
    return true;
  }

  function codeboxPreflightTargetedScanEnabled() {
    return nostrodomusPerfMode() !== "legacy";
  }

  function codeboxPreflightScanRootLabel(root, fallback = "root") {
    return codeboxPreflightObserverLabel(root, fallback);
  }

  function codeboxPreflightTargetedScanRoots(reason = "preflight-scan") {
    if (!codeboxPreflightTargetedScanEnabled()) {
      return [{ root: document, label: "legacy-document" }];
    }

    const roots = [];
    const add = (root, label = "root") => {
      if (!root || roots.some(item => item.root === root)) return;
      if (root === document || root === document.documentElement || root === document.body) return;
      roots.push({ root, label: codeboxPreflightScanRootLabel(root, label) });
    };

    const editor = activeCodeboxStyleEditor();
    const dialog = activeEditDialog();
    if (dialog) {
      add(dialog, "active-edit-dialog");
      try { add(dialog.shadowRoot, "active-edit-dialog-shadow-root"); } catch { /* cross-origin root */ }
    }
    if (editor?.querySelector) {
      add(editor, "active-cm-editor");
      try { add(editor.getRootNode?.(), "active-editor-root"); } catch { /* cross-origin root */ }
      try {
        const host = editor.closest?.("ha-code-editor") || (editor.getRootNode?.()?.host?.localName === "ha-code-editor" ? editor.getRootNode?.().host : null);
        add(host, "active-ha-code-editor");
        add(host?.shadowRoot, "active-ha-code-editor-shadow-root");
      } catch { /* cross-origin root */ }
    }

    if (!roots.length) {
      state.lastCodeboxPreflightScanScope = {
        at: new Date().toISOString(),
        reason,
        mode: "sentinel-only",
        roots: [],
        note: "preflight scan waits for editor lifecycle sentinel before scanning roots",
      };
    }

    return roots;
  }

  const CODEBOX_PREFLIGHT_TARGETED_SHADOW_HOST_SELECTOR = [
    HA_CODE_EDITOR,
    HA_YAML_EDITOR,
    HUI_DIALOG_EDIT_CARD,
    HUI_CARD_ELEMENT_EDITOR,
    HUI_CARD_OPTIONS_EDITOR,
    HUI_CARD_EDITOR,
    HA_DIALOG,
    HA_MD_DIALOG,
    "dialog",
    HA_FORM,
    HA_SELECTOR,
    HA_TEXTFIELD,
    HA_COMBO_BOX
  ].join(",");

  function codeboxPreflightTargetedShadowTraversalEnabled() {
    return nostrodomusPerfMode() !== "legacy";
  }

  function codeboxPreflightShadowHosts(root, reason = "preflight-shadow-scan", depth = 0) {
    if (!root?.querySelectorAll) return [];
    const targeted = codeboxPreflightTargetedShadowTraversalEnabled();
    const selector = targeted ? CODEBOX_PREFLIGHT_TARGETED_SHADOW_HOST_SELECTOR : "*";
    let candidates = [];
    try { candidates = Array.from(root.querySelectorAll?.(selector) || []); } catch { candidates = []; }
    const hosts = [];
    for (const el of candidates) {
      if (el?.shadowRoot) hosts.push(el);
    }
    const mode = targeted ? "targeted" : "legacy-wildcard";
    state.codeboxPreflightShadowTraversalMode = mode;
    if (targeted) state.codeboxPreflightTargetedShadowTraversals = (state.codeboxPreflightTargetedShadowTraversals || 0) + 1;
    else state.codeboxPreflightLegacyWildcardShadowTraversals = (state.codeboxPreflightLegacyWildcardShadowTraversals || 0) + 1;
    state.lastCodeboxPreflightShadowTraversal = {
      at: new Date().toISOString(),
      reason,
      mode,
      depth,
      candidates: candidates.length,
      hosts: hosts.length,
    };
    return hosts;
  }

  function runCodeboxPreflightMutationScan(reason = "mutation") {
    if (state.codeboxPreflightRaf) { cancelAnimationFrame(state.codeboxPreflightRaf); state.codeboxPreflightRaf = 0; }
    if (state.codeboxPreflightTimer) { clearTimeout(state.codeboxPreflightTimer); state.codeboxPreflightTimer = 0; }
    state.codeboxPreflightLastRunAt = performance?.now?.() || Date.now();
    installCodeboxPreflightStyle(reason);
  }

  function appendCodeboxPreflightPendingReason(reason = "mutation", source = "mutation") {
    const clean = String(reason || "mutation");
    const parts = String(state.codeboxPreflightPendingReason || "").split("+").filter(Boolean);
    if (parts.includes(clean)) {
      state.codeboxPreflightReasonCoalesces = (state.codeboxPreflightReasonCoalesces || 0) + 1;
      state.lastCodeboxPreflightCoalescedReason = `${source}:${clean}`;
      state.codeboxPreflightPendingReasonCount = parts.length;
      recordPerformanceEvent("codebox-preflight-reason-coalesced", 0, `${source}:${clean}`);
      return false;
    }
    parts.push(clean);
    state.codeboxPreflightPendingReason = parts.join("+");
    state.codeboxPreflightPendingReasonCount = parts.length;
    state.lastCodeboxPreflightPendingReason = clean;
    return true;
  }

  function scheduleCodeboxPreflightMutationScan(records, reason = "mutation") {
    const urgent = mutationRecordsContainEditorSurface(records);
    const now = performance?.now?.() || Date.now();
    const elapsed = now - (state.codeboxPreflightLastRunAt || 0);
    const minWait = urgent ? 0 : 1200;
    const wait = urgent || elapsed >= minWait ? 0 : Math.max(80, minWait - elapsed);

    appendCodeboxPreflightPendingReason(reason || "mutation", urgent ? "urgent-mutation" : "mutation");

    if (state.codeboxPreflightRaf || state.codeboxPreflightTimer) return;

    if (!wait) {
      state.codeboxPreflightRaf = requestAnimationFrame(() => {
        const pendingReason = state.codeboxPreflightPendingReason || reason;
        state.codeboxPreflightPendingReason = "";
        runCodeboxPreflightMutationScan(urgent ? `urgent:${pendingReason}` : pendingReason);
      });
      return;
    }

    state.codeboxPreflightTimer = setTimeout(() => {
      const pendingReason = state.codeboxPreflightPendingReason || reason;
      state.codeboxPreflightPendingReason = "";
      runCodeboxPreflightMutationScan(`coalesced:${pendingReason}`);
    }, wait);
  }

  function installCodeboxPreflightStyle(reason = "preflight") {
    // The same colors as primeCodeboxPreflightForEditor writes, or the two would rewrite each
    // other's sheet.
    const colors = preflightColorsFor(null);
    const installIntoRoot = (root) => installPreflightStyleIn(root, colors);
    installIntoRoot(document);
    const tagEditor = (editor) => {
      if (!editor?.querySelector) return;
      if (insideCardOwnEditor(editor)) return;
      try { editor.dataset.nostrodomusCodeboxStyle = "1"; } catch { /* detached node */ }
      try { editor.dataset.nostrodomusCodeboxFrameHost = "1"; } catch { /* detached node */ }
      try { editor.closest?.("ha-code-editor")?.setAttribute?.("data-nostrodomus-codebox-frame-host", "1"); } catch { /* detached node */ }
      try { editor.closest?.("ha-code-editor")?.setAttribute?.("data-nostrodomus-codebox-style", "1"); } catch { /* detached node */ }
      try { installIntoRoot(editor.getRootNode?.()); } catch { /* cross-origin root */ }
      try { primeInitialSyntaxPaintGateForEditor(editor, `codebox-preflight:${reason}`); } catch { /* mid-frame HA mutation */ }
    };
    const scanRoot = (root, depth = 0) => {
      if (!root || depth > 5) return;
      try {
        if (root.matches?.("ha-code-editor") && !insideCardOwnEditor(root)) {
          root.setAttribute("data-nostrodomus-codebox-frame-host", "1");
          root.setAttribute("data-nostrodomus-codebox-style", "1");
        }
      } catch { /* detached node */ }
      try {
        for (const host of root.querySelectorAll?.("ha-code-editor") || []) {
          if (insideCardOwnEditor(host)) continue; // a code box of a custom card's own editor
          try { host.setAttribute("data-nostrodomus-codebox-frame-host", "1"); host.setAttribute("data-nostrodomus-codebox-style", "1"); } catch { /* detached node */ }
          try { installIntoRoot(host.shadowRoot); } catch { /* cross-origin root */ }
          try { for (const editor of host.shadowRoot?.querySelectorAll?.(".cm-editor") || []) tagEditor(editor); } catch { /* detached node */ }
        }
        for (const editor of root.querySelectorAll?.(".cm-editor") || []) tagEditor(editor);
        for (const el of codeboxPreflightShadowHosts(root, reason, depth)) if (el.shadowRoot) scanRoot(el.shadowRoot, depth + 1);
      } catch { /* cross-origin root */ }
    };
    const scanTargets = codeboxPreflightTargetedScanRoots(reason);
    const scanMode = codeboxPreflightTargetedScanEnabled() ? (scanTargets.length ? "targeted" : "sentinel-only") : "legacy-document";
    if (scanTargets.length) {
      for (const item of scanTargets) scanRoot(item.root);
    }
    if (scanMode === "targeted") state.codeboxPreflightTargetedScans = (state.codeboxPreflightTargetedScans || 0) + 1;
    if (scanMode === "legacy-document") state.codeboxPreflightLegacyDocumentScans = (state.codeboxPreflightLegacyDocumentScans || 0) + 1;
    state.codeboxPreflightScanMode = scanMode;
    state.codeboxPreflightScanRootCount = scanTargets.length;
    state.lastCodeboxPreflightScanScope = {
      at: new Date().toISOString(),
      reason,
      mode: scanMode,
      roots: scanTargets.map(item => item.label),
    };
    if (!state.initialSyntaxGateInstallComplete) {
      try { installInitialSyntaxPaintGate("preflight-bootstrap"); } catch { /* mid-frame HA mutation */ }
    }
    installCodeboxPreflightObserver(reason);
    recordPerformanceEvent("codebox-preflight-style", 0, reason);
    return true;
  }

  function removeCodeboxPreflightStyle(reason = "uninstall") {
    try { state.codeboxPreflightObserver?.disconnect?.(); } catch { /* injected observer */ }
    state.codeboxPreflightObserver = null;
    if (state.codeboxPreflightRaf) { cancelAnimationFrame(state.codeboxPreflightRaf); state.codeboxPreflightRaf = 0; }
    if (state.codeboxPreflightTimer) { clearTimeout(state.codeboxPreflightTimer); state.codeboxPreflightTimer = 0; }
    state.codeboxPreflightPendingReason = "";
    // installCodeboxPreflightStyle puts the sheet into document.head and into each ha-code-editor
    // shadow root, so the same roots are walked and every copy is removed. Only uninstall calls
    // this, so the stable element is never removed during normal use.
    const id = "nostrodomus-codebox-preflight-style-v1";
    const seen = new Set();
    const removeFrom = (root, depth = 0) => {
      if (!root || seen.has(root) || depth > 5) return;
      seen.add(root);
      try { root.querySelector?.(`#${id}`)?.remove?.(); } catch { /* detached node */ }
      try {
        for (const host of root.querySelectorAll?.("ha-code-editor") || []) if (host.shadowRoot) removeFrom(host.shadowRoot, depth + 1);
        for (const el of codeboxPreflightShadowHosts(root, reason, depth)) if (el.shadowRoot) removeFrom(el.shadowRoot, depth + 1);
      } catch { /* cross-origin root */ }
    };
    try { removeFrom(document); } catch { /* detached node */ }
    try { for (const item of codeboxPreflightTargetedScanRoots(reason)) removeFrom(item?.root, 1); } catch { /* injected delegate */ }
  }

  return {
    primeCodeboxPreflightForEditor,
    codeboxPreflightCss,
    mutationRecordIsNostrodomusStableStyleNode,
    nodeLooksLikeEditorSurface,
    mutationRecordsContainEditorSurface,
    codeboxPreflightScopedObserverEnabled,
    codeboxPreflightObserverLabel,
    codeboxPreflightScopedObserverTargets,
    disconnectCodeboxPreflightObserver,
    installCodeboxPreflightObserver,
    codeboxPreflightTargetedScanEnabled,
    codeboxPreflightScanRootLabel,
    codeboxPreflightTargetedScanRoots,
    codeboxPreflightTargetedShadowTraversalEnabled,
    codeboxPreflightShadowHosts,
    runCodeboxPreflightMutationScan,
    appendCodeboxPreflightPendingReason,
    scheduleCodeboxPreflightMutationScan,
    installCodeboxPreflightStyle,
    removeCodeboxPreflightStyle,
  };
}
