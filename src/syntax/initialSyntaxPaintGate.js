// Nostrodomus Initial syntax paint gate: hides the first paint of editor content until syntax
// classes land, scoped to active editor roots.
// Cross-module calls go through the shared syntax runtime api object.

import { sourceClassSyntaxContentPainted } from './smartSyntaxStyles.js';
import { insideCardOwnEditor } from '../editor/cardOwnEditor.js';
import {
  CM_CONTENT,
  CM_EDITOR,
  CM_LINE_SPAN,
  HA_CODE_EDITOR,
  HA_COMBO_BOX,
  HA_DIALOG,
  HA_FORM,
  HA_MD_DIALOG,
  HA_SELECTOR,
  HA_TEXTFIELD,
  HA_YAML_EDITOR,
  HOME_ASSISTANT,
  HUI_CARD_EDITOR,
  HUI_CARD_ELEMENT_EDITOR,
  HUI_CARD_OPTIONS_EDITOR,
  HUI_DIALOG_EDIT_CARD,
} from '../editor/haSelectors.js';

// Retry times (ms) for paint-then-reveal while CodeMirror syntax classes settle. The last retry
// is also the budget: it reveals the content whether or not it is painted.
const SYNTAX_GATE_RETRY_1_MS = 80;
const SYNTAX_GATE_RETRY_2_MS = 160;
const SYNTAX_GATE_BUDGET_MS = 360;

export function createInitialSyntaxPaintGate(deps) {
  const {
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID,
    VERSION,
    activeCodeboxStyleEditor,
    activeEditDialog,
    activeTopLayerDialog,
    applyTextColorPreset,
    effectiveStyleSettings,
    ensureStyleElementAtEnd,
    recordPerformanceEvent,
    rememberActiveCodeboxEditor,
    state,
    nostrodomusPerfMode,
    styleEditorFromNode,
    api,
  } = deps;
  const INITIAL_SYNTAX_GATE_TARGETED_SHADOW_HOST_SELECTOR = [
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
  const INITIAL_SYNTAX_PAINT_GATE_STYLE_ID = "nostrodomus-initial-syntax-paint-gate-v1";

  // The rules use !important because Home Assistant themes and card_mod set transition and
  // opacity rules on every element, which would animate the reveal and show the code uncolored
  // for a moment. New content stays hidden until its token colors are in place, then appears at once.
  function initialSyntaxPaintGateCss() {
    return `
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
    `;
  }

  function installInitialSyntaxPaintGateStyle(root) {
    if (!root) return false;
    const container = root.head || root;
    const style = ensureStyleElementAtEnd(container, INITIAL_SYNTAX_PAINT_GATE_STYLE_ID);
    if (!style) return false;
    const css = initialSyntaxPaintGateCss();
    if (style.textContent !== css) style.textContent = css;
    // Drop styles whose editor is gone. The set only exists so uninstall can remove live nodes;
    // a detached one would keep the closed dialog tree alive for the rest of the session.
    for (const known of state.initialSyntaxGateStyles || []) {
      if (known !== style && known?.isConnected === false) state.initialSyntaxGateStyles.delete(known);
    }
    state.initialSyntaxGateStyles?.add?.(style);
    return true;
  }

  function initialSyntaxContentPainted(content) {
    if (!content?.querySelectorAll) return false;
    if (api.nativeHighlightSyntaxContentPainted(content) || sourceClassSyntaxContentPainted(content, VERSION, CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID)) return true;
    const spans = Array.from(content.querySelectorAll(CM_LINE_SPAN)).filter((span) => String(span.textContent || "").trim()).slice(0, 180);
    if (!spans.length) return false;
    return spans.every((span) => {
      const color = span.style?.getPropertyValue?.("color") || "";
      const fill = span.style?.getPropertyValue?.("-webkit-text-fill-color") || "";
      const kind = span.dataset?.nostrodomusSyntaxKind || span.dataset?.nostrodomusDarkplusTokenKind || "";
      return !!(color || fill || kind);
    });
  }

  function editorForInitialSyntaxContent(content) {
    const editor = styleEditorFromNode(content) || content?.closest?.(CM_EDITOR) || null;
    if (editor?.querySelector) return editor;
    const root = content?.getRootNode?.();
    return root?.querySelector?.(CM_EDITOR) || null;
  }

  function revealInitialSyntaxContent(content, reason = "initial-syntax-reveal") {
    if (!content?.dataset) return false;
    delete content.dataset.nostrodomusInitialSyntaxPending;
    content.dataset.nostrodomusInitialSyntaxReady = "1";
    state.lastInitialSyntaxPaintGate = {
      at: new Date().toISOString(),
      reason,
      painted: initialSyntaxContentPainted(content),
    };
    recordPerformanceEvent("syntax.initial-paint-gate", 0, reason);
    return true;
  }

  function scheduleInitialSyntaxPaintGate(content, reason = "initial-syntax-paint-gate") {
    if (!content?.querySelectorAll || !content?.dataset || !state.enabled) return false;
    if (insideCardOwnEditor(content)) return false; // a code box of a custom card's own editor
    try { installInitialSyntaxPaintGateStyle(content.getRootNode?.()); } catch { /* cross-origin root */ }
    if (content.dataset.nostrodomusInitialSyntaxReady === "1" || state.initialSyntaxGateContents?.has?.(content)) return false;
    state.initialSyntaxGateContents?.add?.(content);
    content.dataset.nostrodomusInitialSyntaxPending = "1";
    delete content.dataset.nostrodomusInitialSyntaxReady;

    const startedAt = performance.now();
    let done = false;

    const tryPaintAndReveal = (label, force = false) => {
      if (done || !content?.isConnected) return true;
      const editor = editorForInitialSyntaxContent(content);
      if (editor?.querySelector) {
        try {
          rememberActiveCodeboxEditor(editor, `initial-syntax-paint-gate-${label}`);
          api.installSyntaxOwnerObserver(editor, `initial-syntax-paint-gate-${label}`);
          applyTextColorPreset(editor, effectiveStyleSettings());
        } catch { /* per-editor isolation */ }
      }
      if (initialSyntaxContentPainted(content) || force || performance.now() - startedAt > SYNTAX_GATE_BUDGET_MS) {
        done = true;
        revealInitialSyntaxContent(content, `${reason}-${label}`);
        return true;
      }
      return false;
    };

    const addTimer = (timer) => {
      state.initialSyntaxGateTimers?.add?.(timer);
      return timer;
    };

    queueMicrotask(() => tryPaintAndReveal("microtask"));
    requestAnimationFrame(() => {
      if (tryPaintAndReveal("raf1")) return;
      requestAnimationFrame(() => tryPaintAndReveal("raf2"));
    });
    const timer80 = setTimeout(() => { state.initialSyntaxGateTimers?.delete?.(timer80); tryPaintAndReveal("80ms"); }, SYNTAX_GATE_RETRY_1_MS);
    addTimer(timer80);
    const timer160 = setTimeout(() => { state.initialSyntaxGateTimers?.delete?.(timer160); tryPaintAndReveal("160ms"); }, SYNTAX_GATE_RETRY_2_MS);
    addTimer(timer160);
    const timer360 = setTimeout(() => { state.initialSyntaxGateTimers?.delete?.(timer360); tryPaintAndReveal("360ms", true); }, SYNTAX_GATE_BUDGET_MS);
    addTimer(timer360);

    state.lastInitialSyntaxPaintGate = {
      at: new Date().toISOString(),
      reason,
      pending: true,
    };
    return true;
  }

  function initialSyntaxPaintGateScopedEnabled() {
    return nostrodomusPerfMode() !== "legacy";
  }

  function initialSyntaxPaintGateRootLabel(root, fallback = "root") {
    try {
      if (root === document) return "document";
      if (root === document.documentElement) return "documentElement";
      if (root === document.body) return "body";
      if (root?.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return root.host?.localName ? `${root.host.localName}:shadowRoot` : "shadowRoot";
      if (root?.localName) return root.localName;
    } catch { /* cross-origin root */ }
    return fallback;
  }

  function initialSyntaxPaintGateTargetedShadowTraversalEnabled() {
    return nostrodomusPerfMode() !== "legacy";
  }

  function initialSyntaxPaintGateShadowHosts(root, reason = "initial-syntax-shadow-scan", depth = 0) {
    if (!root?.querySelectorAll) return [];
    const targeted = initialSyntaxPaintGateTargetedShadowTraversalEnabled();
    const selector = targeted ? INITIAL_SYNTAX_GATE_TARGETED_SHADOW_HOST_SELECTOR : "*";
    let candidates = [];
    try { candidates = Array.from(root.querySelectorAll?.(selector) || []); } catch { candidates = []; }
    const hosts = [];
    for (const el of candidates) {
      if (el?.shadowRoot) hosts.push(el);
    }
    const mode = targeted ? "targeted" : "legacy-wildcard";
    state.initialSyntaxGateShadowTraversalMode = mode;
    if (targeted) state.initialSyntaxGateTargetedShadowTraversals = (state.initialSyntaxGateTargetedShadowTraversals || 0) + 1;
    else state.initialSyntaxGateLegacyWildcardShadowTraversals = (state.initialSyntaxGateLegacyWildcardShadowTraversals || 0) + 1;
    state.lastInitialSyntaxGateShadowTraversal = {
      at: new Date().toISOString(),
      reason,
      mode,
      depth,
      candidates: candidates.length,
      hosts: hosts.length,
    };
    return hosts;
  }

  function initialSyntaxPaintGateTargets(reason = "initial-syntax-paint-gate") {
    if (!initialSyntaxPaintGateScopedEnabled()) {
      return [{ root: document.documentElement || document, scanRoot: document, label: "legacy-document" }];
    }
    const targets = [];
    const add = (root, label = "root", scanRoot = root) => {
      if (!root || !root.querySelectorAll || targets.some(item => item.root === root)) return;
      if (root === document || root === document.documentElement || root === document.body) return;
      targets.push({ root, scanRoot: scanRoot || root, label: initialSyntaxPaintGateRootLabel(root, label) });
    };

    const editor = activeCodeboxStyleEditor();
    const dialog = activeEditDialog();
    const topLayerDialog = activeTopLayerDialog();
    if (dialog) {
      add(dialog, "active-edit-dialog");
      try { add(dialog.shadowRoot, "active-edit-dialog-shadow-root"); } catch { /* cross-origin root */ }
    }
    if (topLayerDialog && topLayerDialog !== dialog) {
      add(topLayerDialog, "active-top-layer-dialog");
      try { add(topLayerDialog.shadowRoot, "active-top-layer-dialog-shadow-root"); } catch { /* cross-origin root */ }
    }
    if (editor?.querySelector) {
      add(editor, "active-codebox-editor");
      try { add(editor.getRootNode?.(), "active-codebox-root"); } catch { /* cross-origin root */ }
      try {
        const host = editor.closest?.(HA_CODE_EDITOR) || (editor.getRootNode?.()?.host || null);
        add(host, "active-ha-code-editor");
        add(host?.shadowRoot, "active-ha-code-editor-shadow-root");
      } catch { /* cross-origin root */ }
    }

    if (!targets.length) {
      state.lastInitialSyntaxGateScope = {
        at: new Date().toISOString(),
        reason,
        mode: "sentinel-only",
        roots: [],
        note: "initial syntax gate waits for editor lifecycle sentinel before observing roots",
      };
    }
    return targets;
  }

  function scanInitialSyntaxPaintGateRoot(root, reason = "scan-initial-syntax-root", depth = 0) {
    if (!root || depth > 8) return 0;
    let count = 0;
    try { installInitialSyntaxPaintGateStyle(root); } catch { /* mid-frame HA mutation */ }
    try {
      for (const content of root.querySelectorAll?.(CM_CONTENT) || []) {
        if (scheduleInitialSyntaxPaintGate(content, reason)) count += 1;
      }
      for (const el of initialSyntaxPaintGateShadowHosts(root, reason, depth)) {
        count += scanInitialSyntaxPaintGateRoot(el.shadowRoot, `${reason}:shadow:${el.localName || "host"}`, depth + 1);
      }
    } catch { /* cross-origin root */ }
    return count;
  }

  function primeInitialSyntaxPaintGateForEditor(editor, reason = "prime-initial-syntax-editor") {
    if (!editor?.querySelector) return 0;
    pruneDetachedInitialSyntaxPaintGateObservers();
    let count = 0;
    const root = editor.getRootNode?.() || document;
    try { installInitialSyntaxPaintGateStyle(root); } catch { /* mid-frame HA mutation */ }
    try { observeInitialSyntaxPaintGateRoot(root, reason); } catch { /* mid-frame HA mutation */ }
    try {
      for (const content of editor.querySelectorAll?.(CM_CONTENT) || []) {
        if (scheduleInitialSyntaxPaintGate(content, reason)) count += 1;
      }
    } catch { /* cross-origin root */ }
    if (count) recordPerformanceEvent("syntax.initial-paint-gate.prime", 0, `${reason}:${count}`);
    return count;
  }

  // Disconnect and forget observers whose root has left the DOM (a closed editor dialog or a
  // removed shadow host). initialSyntaxGateObservers is a strong Map, so each card editor opened
  // would otherwise keep its observer and detached root until uninstall. The document (nodeType 9)
  // is never pruned; a detached shadowRoot reports isConnected === false. Runs on each prime.
  function pruneDetachedInitialSyntaxPaintGateObservers() {
    const observers = state.initialSyntaxGateObservers;
    if (!observers || typeof observers.forEach !== "function") return 0;
    let pruned = 0;
    for (const [root, observer] of Array.from(observers)) {
      if (root && root.nodeType !== 9 && root.isConnected === false) {
        try { observer?.disconnect?.(); } catch { /* injected observer */ }
        observers.delete(root);
        try { state.initialSyntaxGateObservedRoots?.delete?.(root); } catch { /* WeakSet */ }
        pruned += 1;
      }
    }
    return pruned;
  }

  function observeInitialSyntaxPaintGateRoot(root, _reason = "observe-initial-syntax-root") {
    if (!root || state.initialSyntaxGateObservedRoots?.has?.(root) || typeof MutationObserver === "undefined") return false;
    state.initialSyntaxGateObservedRoots?.add?.(root);
    try { installInitialSyntaxPaintGateStyle(root); } catch { /* mid-frame HA mutation */ }
    const observer = new MutationObserver((records) => {
      // The observed subtree includes the editor, so every line, token span and gutter element
      // CodeMirror adds while the user types or scrolls arrives here. Nothing added inside an
      // existing editor can hold another editor, so those records are skipped before any query.
      // CodeMirror reports many additions under the same parent in a row; the test runs once
      // for each run.
      let lastTarget = null;
      let lastTargetInsideEditor = false;
      for (const record of records || []) {
        if (record.type !== "childList") continue;
        if (record.target !== lastTarget) {
          lastTarget = record.target;
          lastTargetInsideEditor = !!(/** @type {Element} */ (lastTarget))?.closest?.(CM_EDITOR);
        }
        if (lastTargetInsideEditor) continue;
        for (const added of record.addedNodes || []) {
          if (added.nodeType !== 1) continue;
          const node = /** @type {Element} */ (added);
          if (node.matches?.(CM_CONTENT)) scheduleInitialSyntaxPaintGate(node, "added-cm-content");
          for (const content of node.querySelectorAll?.(CM_CONTENT) || []) scheduleInitialSyntaxPaintGate(content, "added-descendant-cm-content");
          if (node.shadowRoot) {
            observeInitialSyntaxPaintGateRoot(node.shadowRoot, `added-shadow-root:${node.localName || "host"}`);
            scanInitialSyntaxPaintGateRoot(node.shadowRoot, `added-shadow-root:${node.localName || "host"}`);
          }
          try {
            for (const el of initialSyntaxPaintGateShadowHosts(node, "added-descendant-shadow-root", 0)) {
              observeInitialSyntaxPaintGateRoot(el.shadowRoot, `added-descendant-shadow-root:${el.localName || "host"}`);
              scanInitialSyntaxPaintGateRoot(el.shadowRoot, `added-descendant-shadow-root:${el.localName || "host"}`);
            }
          } catch { /* cross-origin root */ }
        }
      }
    });
    try {
      observer.observe(root, { childList: true, subtree: true });
      state.initialSyntaxGateObservers?.set?.(root, observer);
      return true;
    } catch {
      state.initialSyntaxGateObservedRoots?.delete?.(root);
      return false;
    }
  }

  function installInitialSyntaxPaintGate(reason = "install-initial-syntax-paint-gate") {
    if (state.initialSyntaxGateInstallComplete) {
      state.lastInitialSyntaxPaintGateInstallSkip = {
        at: new Date().toISOString(),
        reason,
        mode: state.initialSyntaxGateMode || "unknown",
        note: "initial syntax gate already installed for the current active roots; preflight now primes only active editors",
      };
      return false;
    }

    const scoped = initialSyntaxPaintGateScopedEnabled();
    const targets = initialSyntaxPaintGateTargets(reason);
    const mode = scoped ? (targets.length ? "scoped" : "sentinel-only") : "legacy-document";
    if (!targets.length) {
      state.initialSyntaxGateMode = mode;
      state.initialSyntaxGateObservedRootCount = 0;
      state.lastInitialSyntaxPaintGateInstall = {
        at: new Date().toISOString(),
        reason,
        mode,
        observedRoots: 0,
        scheduledContents: 0,
        note: "initial syntax gate waits for editor lifecycle sentinel before installing scoped roots",
      };
      return false;
    }

    let scanned = 0;
    let observed = 0;
    try {
      for (const item of targets) {
        if (observeInitialSyntaxPaintGateRoot(item.root, reason)) observed += 1;
        scanned += scanInitialSyntaxPaintGateRoot(item.scanRoot || item.root, reason);
      }
    } catch { /* cross-origin root */ }
    state.initialSyntaxGateInstallComplete = true;
    state.initialSyntaxGateMode = mode;
    state.initialSyntaxGateObservedRootCount = observed;
    if (mode === "scoped") state.initialSyntaxGateScopedInstalls = (state.initialSyntaxGateScopedInstalls || 0) + 1;
    if (mode === "legacy-document") state.initialSyntaxGateLegacyDocumentInstalls = (state.initialSyntaxGateLegacyDocumentInstalls || 0) + 1;
    state.lastInitialSyntaxGateScope = {
      at: new Date().toISOString(),
      reason,
      mode,
      roots: targets.map(item => item.label),
      observedRoots: observed,
      scheduledContents: scanned,
    };
    state.lastInitialSyntaxPaintGateInstall = {
      at: new Date().toISOString(),
      reason,
      mode,
      observedRoots: observed,
      scheduledContents: scanned,
    };
    recordPerformanceEvent("syntax.initial-paint-gate.install", 0, `${reason}:mode=${mode}:roots=${observed}:contents=${scanned}`);
    return true;
  }

  function cleanupInitialSyntaxPaintGate(reason = "cleanup-initial-syntax-paint-gate") {
    try { for (const observer of state.initialSyntaxGateObservers?.values?.() || []) observer?.disconnect?.(); } catch { /* injected observer */ }
    state.initialSyntaxGateObservers?.clear?.();
    state.initialSyntaxGateObservedRoots = new WeakSet();
    state.initialSyntaxGateInstallComplete = false;
    state.initialSyntaxGateMode = "";
    state.initialSyntaxGateObservedRootCount = 0;
    for (const timer of state.initialSyntaxGateTimers || []) clearTimeout(timer);
    state.initialSyntaxGateTimers?.clear?.();
    for (const style of state.initialSyntaxGateStyles || []) style?.remove?.();
    state.initialSyntaxGateStyles?.clear?.();
    try {
      for (const root of [document, document.querySelector?.(HOME_ASSISTANT)?.shadowRoot].filter(Boolean)) {
        for (const content of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll?.(".cm-content[data-nostrodomus-initial-syntax-pending], .cm-content[data-nostrodomus-initial-syntax-ready]")) || []) {
          delete content.dataset.nostrodomusInitialSyntaxPending;
          delete content.dataset.nostrodomusInitialSyntaxReady;
        }
      }
    } catch { /* detached node */ }
    state.lastInitialSyntaxPaintGate = { at: new Date().toISOString(), reason, cleaned: true };
  }

  return {
    initialSyntaxPaintGateCss,
    installInitialSyntaxPaintGateStyle,
    initialSyntaxContentPainted,
    editorForInitialSyntaxContent,
    revealInitialSyntaxContent,
    scheduleInitialSyntaxPaintGate,
    initialSyntaxPaintGateScopedEnabled,
    initialSyntaxPaintGateRootLabel,
    initialSyntaxPaintGateTargetedShadowTraversalEnabled,
    initialSyntaxPaintGateShadowHosts,
    initialSyntaxPaintGateTargets,
    scanInitialSyntaxPaintGateRoot,
    primeInitialSyntaxPaintGateForEditor,
    observeInitialSyntaxPaintGateRoot,
    pruneDetachedInitialSyntaxPaintGateObservers,
    installInitialSyntaxPaintGate,
    cleanupInitialSyntaxPaintGate,
  };
}
