// Nostrodomus style DOM/root runtime owner.
// Owns DOM style-root helpers, codebox root cleanup, and style mutation guard
// behavior. Dependencies stay injected so this module remains reusable and
// avoids circular runtime imports.

import {
  CM_OWNERS,
  HA_CODE_EDITOR,
  HA_COMBO_BOX,
  HA_DIALOG,
  HA_FORM,
  HA_MD_DIALOG,
  HA_PANEL_LOVELACE,
  HA_SELECTOR,
  HA_TEXTFIELD,
  HA_YAML_EDITOR,
  HOME_ASSISTANT,
  HUI_CARD,
  HUI_CARD_EDITOR,
  HUI_CARD_ELEMENT_EDITOR,
  HUI_CARD_OPTIONS_EDITOR,
  HUI_DIALOG_EDIT_CARD,
  HUI_ROOT,
  HUI_VIEW,
} from "../editor/haSelectors.js";

function call(fn, ...args) {
  return typeof fn === "function" ? fn(...args) : undefined;
}

function isDocumentFragmentNode(node, NodeRef) {
  return !!node && !!NodeRef && node.nodeType === NodeRef.DOCUMENT_FRAGMENT_NODE;
}

export function createStyleDomRuntime(ctx = {}) {
  const {
    documentRef = globalThis.document,
    NodeRef = globalThis.Node,
    MutationObserverRef = globalThis.MutationObserver,
    state = {},
    STYLE_TEXT_SIZE_PRESETS = {},
    DARKPLUS_SYNTAX_COLORS = {},
    DARKPLUS_STYLE_ID = "nostrodomus-cm6-darkplus-v1-v5-style",
    codeboxStyleTokenMap,
    codeboxStyleBuildRootCss,
    codeboxStyleSourceClassSteadyStateSkipDecision,
    activeEditDialog,
    activeTopLayerDialog,
    codeboxEditorCacheKey,
    codeboxFrameHostForEditor,
    editorUsesCodeMirrorSourceClassSyntax,
    homeRoot,
    mutationRecordsAreCodeMirrorOnly,
    nodeLooksLikeCodeMirrorInternals,
    recordPerformanceEvent,
    scheduleCodeboxStyleReapply,
    scheduleSourceClassSmartSyntax,
    nostrodomusPerfMode,
    visibleStyleEditorCandidate,
  } = ctx;

  function clearStyledTextPreset(editor) {
    if (!editor?.querySelectorAll) return;
    for (const node of editor.querySelectorAll("[data-nostrodomus-text-preset], [data-nostrodomus-syntax-kind], [data-nostrodomus-darkplus-line-kind], [data-nostrodomus-darkplus-token-kind]")) {
      node.style.removeProperty("color");
      node.style.removeProperty("-webkit-text-fill-color");
      node.style.removeProperty("text-shadow");
      node.style.removeProperty("filter");
      node.style.removeProperty("caret-color");
      delete node.dataset.nostrodomusTextPreset;
      delete node.dataset.nostrodomusSyntaxKind;
      delete node.dataset.nostrodomusDarkplusLineKind;
      delete node.dataset.nostrodomusDarkplusTokenKind;
    }
  }

  function applyTextColorPreset(editor, settings) {
    const preset = STYLE_TEXT_SIZE_PRESETS?.[settings?.style?.textSizePreset] || STYLE_TEXT_SIZE_PRESETS?.base;
    if (!editor?.style || !preset) return;
    editor.style.setProperty("--nostrodomus-font-size", `${preset.fontSize}px`);
    editor.style.setProperty("--nostrodomus-line-height", String(preset.lineHeight));
  }

  function integrationDocumentStyleRoot() {
    return documentRef?.head || documentRef?.documentElement || documentRef?.body;
  }

  function isStyleRoot(root) {
    return !!root && (root === documentRef || isDocumentFragmentNode(root, NodeRef) || !!root.querySelectorAll);
  }

  function styleContainerForRoot(root) {
    if (!root) return integrationDocumentStyleRoot();
    if (root === documentRef) return integrationDocumentStyleRoot();
    return root;
  }

  function activeEditorStyleRoot(editor) {
    try { return editor?.getRootNode?.() || documentRef; } catch { return documentRef; }
  }

  // True when a <style> or stylesheet <link> that Nostrodomus does not own sits after `style`
  // in the same container, so `style` would lose the cascade to it at equal specificity.
  function foreignStylesheetFollows(style) {
    for (let node = style?.nextElementSibling || null; node; node = node.nextElementSibling) {
      const tag = node.localName;
      const isSheet = tag === "style" || (tag === "link" && String(node.rel || "").toLowerCase().includes("stylesheet"));
      if (isSheet && !String(node.id || "").startsWith("nostrodomus")) return true;
    }
    return false;
  }

  function ensureStyleElementAtEnd(root, id) {
    const container = styleContainerForRoot(root);
    if (!container?.appendChild) return null;
    let style = null;
    try { style = container.getElementById?.(id) || container.querySelector?.(`style#${id}`) || null; } catch { style = null; }
    if (!style && container === documentRef?.head) {
      try { style = documentRef.getElementById?.(id); } catch { style = null; }
    }
    if (!style) {
      style = documentRef.createElement("style");
      style.id = id;
    }
    // Keep the node where it is when it already wins the cascade. It only has to move when a
    // stylesheet that is not ours was added after it. Re-appending on every call queued two
    // childList records per call in the editor shadow root, which the companion dialog observer
    // read as a foreign change and answered with another apply (a self-sustaining ~30 Hz loop).
    try {
      if (style.parentNode === container && !foreignStylesheetFollows(style)) return style;
      if (style.parentNode) style.parentNode.removeChild(style);
      container.appendChild(style);
    } catch {
      return null;
    }
    return style;
  }

  const STABLE_CODEBOX_STYLE_NODE_IDS = new Set([
    "nostrodomus-codebox-preflight-style-v1",
    "nostrodomus-codebox-root-style-v1",
  ]);

  function queryStyleElementInContainer(container, id) {
    if (!container || !id) return null;
    try { return container.getElementById?.(id) || container.querySelector?.(`style#${id}`) || null; } catch { /* detached node */ }
    return null;
  }

  function ensureStableStyleElement(root, id) {
    const container = styleContainerForRoot(root);
    if (!container?.appendChild) return { style: null, changed: false, created: false, moved: false };
    let style = queryStyleElementInContainer(container, id);
    if (!style && container === documentRef?.head) {
      try { style = documentRef.getElementById?.(id); } catch { style = null; }
    }

    let created = false;
    let moved = false;
    if (!style) {
      style = documentRef.createElement("style");
      style.id = id;
      created = true;
    }

    try {
      style.dataset.nostrodomusStableStyleNode = "1";
      if (STABLE_CODEBOX_STYLE_NODE_IDS.has(id)) style.dataset.nostrodomusCodeboxStableStyleNode = "1";
    } catch { /* detached node */ }

    try {
      if (style.parentNode !== container) {
        container.appendChild(style);
        moved = !created;
      } else if (created) {
        container.appendChild(style);
      }
    } catch {
      return { style: null, changed: false, created, moved };
    }

    return { style, changed: created || moved, created, moved };
  }


  function isCodeMirrorInlineStyleTarget(el) {
    try { return !!el?.matches?.(CM_OWNERS); } catch { return false; }
  }

  function applyCodeboxStyleTokensToElement(el, tokens, allowedNames = null) {
    if (!el?.style || !tokens) return false;
    if (isCodeMirrorInlineStyleTarget(el)) return false;
    let changed = false;
    const allowed = allowedNames instanceof Set ? allowedNames : null;
    const vars = call(codeboxStyleTokenMap, tokens) || {};
    for (const [name, value] of Object.entries(vars)) {
      if (allowed && !allowed.has(name)) continue;
      if (value == null) continue;
      if (el.style.getPropertyValue(name) === value && el.style.getPropertyPriority(name) === "important") continue;
      el.style.setProperty(name, value, "important");
      changed = true;
    }
    return changed;
  }

  function discoverOpenStyleRoots(editor = null) {
    const roots = [];
    const seen = new Set();
    const addRoot = (root) => {
      if (!root || seen.has(root) || !isStyleRoot(root)) return;
      seen.add(root);
      roots.push(root);
    };

    // Codebox CSS is allowed only in the active editor/dialog ownership chain.
    // Do not walk every Home Assistant shadow root; dashboard cards can contain
    // SVG clip/mask internals that must remain untouched.
    if (!editor) return roots;

    addRoot(documentRef);
    try { addRoot(editor.getRootNode?.()); } catch { /* cross-origin root */ }
    const frameHost = call(codeboxFrameHostForEditor, editor);
    try { addRoot(frameHost?.getRootNode?.()); } catch { /* cross-origin root */ }

    const dialog = call(activeEditDialog);
    try { addRoot(dialog?.shadowRoot); } catch { /* cross-origin root */ }
    try { addRoot(call(activeTopLayerDialog)); } catch { /* injected delegate */ }

    let node = editor;
    for (let i = 0; node && i < 10; i += 1) {
      try { addRoot(node.getRootNode?.()); } catch { /* cross-origin root */ }
      node = node.parentElement || node.getRootNode?.()?.host || null;
    }

    return roots;
  }

  function buildCodeboxRootCss(options) {
    return call(codeboxStyleBuildRootCss, { ...options, syntaxFg: options?.syntaxFg || DARKPLUS_SYNTAX_COLORS.fg }) || "";
  }

  // Every container the codebox root style was put in. The cleanup walk further down descends
  // only through the dashboard and dialog hosts, so it never reached the shadow roots of an
  // editor panel (automation or script YAML, the template tool) or the one of
  // home-assistant-main, and the stylesheet stayed there after uninstall and after the editor
  // was gone. A container that left the page is dropped when the next one is added.
  const codeboxRootStyleContainers = new Set();

  function rememberCodeboxRootStyleContainer(container) {
    if (!container || codeboxRootStyleContainers.has(container)) return;
    for (const known of Array.from(codeboxRootStyleContainers)) {
      if (known.isConnected === false) codeboxRootStyleContainers.delete(known);
    }
    codeboxRootStyleContainers.add(container);
  }

  function ensureRootCodeboxStyle(root, css) {
    const ensured = ensureStableStyleElement(root, "nostrodomus-codebox-root-style-v1");
    const style = ensured.style;
    if (!style) return false;
    rememberCodeboxRootStyleContainer(style.parentNode);
    let changed = !!ensured.changed;
    if (style.textContent !== css) { style.textContent = css; changed = true; }
    return changed;
  }

  const DASHBOARD_CONTAINMENT_TARGETED_SHADOW_HOST_SELECTOR = [
    HOME_ASSISTANT,
    HA_PANEL_LOVELACE,
    HUI_ROOT,
    HUI_VIEW,
    HUI_CARD,
    HUI_DIALOG_EDIT_CARD,
    HUI_CARD_ELEMENT_EDITOR,
    HUI_CARD_OPTIONS_EDITOR,
    HUI_CARD_EDITOR,
    HA_DIALOG,
    HA_MD_DIALOG,
    "dialog",
    HA_CODE_EDITOR,
    HA_YAML_EDITOR,
    HA_FORM,
    HA_SELECTOR,
    HA_TEXTFIELD,
    HA_COMBO_BOX
  ].join(",");

  function dashboardContainmentCleanupTargetedShadowTraversalEnabled() {
    return call(nostrodomusPerfMode) !== "legacy";
  }

  function dashboardContainmentCleanupShadowHosts(root, reason = "dashboard-containment-cleanup", depth = 0) {
    if (!root?.querySelectorAll) return [];
    const targeted = dashboardContainmentCleanupTargetedShadowTraversalEnabled();
    const selector = targeted ? DASHBOARD_CONTAINMENT_TARGETED_SHADOW_HOST_SELECTOR : "*";
    let candidates = [];
    try { candidates = Array.from(root.querySelectorAll?.(selector) || []); } catch { candidates = []; }
    const hosts = [];
    for (const el of candidates) {
      if (el?.shadowRoot) hosts.push(el);
    }
    const mode = targeted ? "targeted" : "legacy-wildcard";
    state.dashboardContainmentCleanupShadowTraversalMode = mode;
    if (targeted) state.dashboardContainmentCleanupTargetedShadowTraversals = (state.dashboardContainmentCleanupTargetedShadowTraversals || 0) + 1;
    else state.dashboardContainmentCleanupLegacyWildcardShadowTraversals = (state.dashboardContainmentCleanupLegacyWildcardShadowTraversals || 0) + 1;
    state.lastDashboardContainmentCleanupShadowTraversal = {
      at: new Date().toISOString(),
      reason,
      mode,
      depth,
      candidates: candidates.length,
      hosts: hosts.length,
    };
    return hosts;
  }

  // options.everyOwnedNode (uninstall): the containers the root style was put in are cleared of
  // every node in the list below, like the roots the walk reaches, not only of the root style.
  /** @param {string} [reason] @param {Record<string, any>} [options] */
  function removeCodeboxRootStylesFromAllRoots(reason = "dashboard-containment", options = {}) {
    const selectors = [
      "#nostrodomus-codebox-root-style-v1",
      "#nostrodomus-cm6-darkplus-v1-v5-style",
      `#${DARKPLUS_STYLE_ID}`,
      "#nostrodomus-cm-root-overlay-host",
      "#nostrodomus-codebox-frame-portal-host-v1",
      "#nostrodomus-completions-root",
      "#nostrodomus-settings-root",
      "#nostrodomus-settings-portal-host-v1"
    ].join(",");
    let removed = 0;
    const seen = new Set();
    const removeOwnedNodesIn = (root) => {
      for (const node of root.querySelectorAll?.(selectors) || []) {
        if (node === state.settingsPanel) continue;
        if (node === state.settingsPortalHost && state.settingsPanel?.isConnected) continue;
        if (node === state.settingsPortalHost) state.settingsPortalHost = null;
        try { node.remove(); removed += 1; } catch { /* detached node */ }
      }
    };
    const walk = (root, depth = 0) => {
      if (!root || seen.has(root) || depth > 12) return;
      seen.add(root);
      try {
        removeOwnedNodesIn(root);
        for (const el of dashboardContainmentCleanupShadowHosts(root, reason, depth)) {
          if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
        }
      } catch { /* cross-origin root */ }
    };
    walk(documentRef);
    try { if (call(homeRoot)) walk(call(homeRoot)); } catch { /* injected delegate */ }
    // The root style in the containers the walk did not reach (see codeboxRootStyleContainers).
    // Outside an uninstall, a container that still holds an editor keeps its root style and stays
    // remembered: the editor is hidden, not gone (a tab page kept in the page), and would show
    // unstyled when it comes back without a click or a navigation.
    const kept = [];
    for (const container of codeboxRootStyleContainers) {
      if (container.isConnected === false) continue;
      try {
        if (!options?.everyOwnedNode && container.querySelector?.(".cm-editor")) { kept.push(container); continue; }
        const style = queryStyleElementInContainer(container, "nostrodomus-codebox-root-style-v1");
        if (style) { style.remove(); removed += 1; }
        if (options?.everyOwnedNode && !seen.has(container)) removeOwnedNodesIn(container);
      } catch { /* detached node */ }
    }
    codeboxRootStyleContainers.clear();
    for (const container of kept) codeboxRootStyleContainers.add(container);
    if (removed) call(recordPerformanceEvent, "dashboard-style-containment-cleanup", 0, `${removed} removed:${reason}`);
    return removed;
  }

  function sourceClassEditorForStyleSkip() {
    const cached = state.activeEditorCache?.editor || null;
    if (cached?.querySelector && call(visibleStyleEditorCandidate, cached)) return cached;
    return null;
  }

  // Whether a steady-state reapply can be left to the source-class syntax owner. The remembered
  // editor must still be a visible candidate, and that check reads layout, so it is made last and
  // only when the reason, the style cache, the syntax owner and the editor key all allow the
  // skip: every other reason is answered without a layout read. With options.verifyVisibleLater
  // the caller takes over the layout read: the skip is taken as if the editor is visible, and the
  // caller runs the given check later and schedules the reapply itself when it fails.
  /** @param {string} [reason] @param {Record<string, any>} [options] */
  function maybeSkipSourceClassSteadyStateStyleReapply(reason = "style-settle", options = {}) {
    const cached = state.activeEditorCache?.editor || null;
    const editor = cached?.querySelector ? cached : null;
    if (!editor) return false;
    const decide = (sourceClassActive, editorKey) => call(codeboxStyleSourceClassSteadyStateSkipDecision, { reason, cacheInvalidated: state.codeboxStyleCacheInvalidated, lastAppliedAt: state.codeboxStyleLastAppliedAt, hasEditor: true, sourceClassActive, lastEditorKey: state.codeboxStyleLastEditorKey, editorKey }) || {};
    // Reason and style cache first: they need nothing from the editor.
    if (!decide(true, state.codeboxStyleLastEditorKey).skip) return false;
    // The user moved to another editor (the view remembered from their last key, click or focus
    // is not the remembered editor): the reapply has to run so that editor can become the style
    // target. A view the reapply already looked at and did not switch to (activeCodeboxStyleEditor)
    // keeps the skip.
    const viewDom = state.view?.dom || null;
    if (viewDom && viewDom !== editor && viewDom !== state.codeboxStyleViewDomChecked && viewDom.isConnected !== false) return false;
    const editorKey = call(codeboxEditorCacheKey, editor);
    if (!decide(call(editorUsesCodeMirrorSourceClassSyntax, editor), editorKey).skip) return false;
    const editorIsVisible = () => !!call(visibleStyleEditorCandidate, editor);
    if (typeof options?.verifyVisibleLater === "function") options.verifyVisibleLater(editor, editorIsVisible);
    else if (!editorIsVisible()) return false;
    call(scheduleSourceClassSmartSyntax, editor, `style-reapply-skip-${reason}`);
    state.codeboxStyleSkippedReapply = (state.codeboxStyleSkippedReapply || 0) + 1;
    state.lastCodeboxStyleReapplySkip = { at: new Date().toISOString(), reason, editorKey, sourceClass: true };
    return true;
  }

  function installCodeboxStyleMutationGuard(editor) {
    if (!editor?.querySelectorAll || state.styleMutationEditor === editor) return;
    try { state.styleMutationObserver?.takeRecords?.(); } catch { /* injected observer */ }
    try { state.styleMutationObserver?.disconnect?.(); } catch { /* injected observer */ }

    // Do not observe .cm-editor/.cm-scroller/.cm-content. CodeMirror mutates
    // line/token DOM constantly and Nostrodomus also writes syntax data
    // attributes there. Styling persistence only needs the stable host/wrapper
    // surfaces; content changes are handled by editor dispatch and bounded style
    // settle passes.
    const targets = [];
    const addTarget = (node) => {
      if (!node || targets.includes(node)) return;
      if (call(nodeLooksLikeCodeMirrorInternals, node)) return;
      targets.push(node);
    };
    addTarget(editor);
    try { addTarget(editor.closest?.(HA_CODE_EDITOR)); } catch { /* detached node */ }
    try { addTarget(editor.parentElement); } catch { /* detached node */ }

    if (!targets.length || typeof MutationObserverRef !== "function") return;
    const observer = new MutationObserverRef(records => {
      if (state.applyingCodeboxStyle) return;
      if (call(mutationRecordsAreCodeMirrorOnly, records)) {
        if (state.observerStats) {
          state.observerStats.ignoredCodeMirrorRecords += records?.length || 0;
          state.observerStats.suppressedCodeMirrorCallbacks += 1;
        }
        return;
      }
      if (!records.some(record => record.type === "attributes" && (record.attributeName === "style" || record.attributeName === "class"))) return;
      call(scheduleCodeboxStyleReapply, "style-mutation");
    });
    for (const target of targets) {
      try { observer.observe(target, { attributes: true, attributeFilter: ["style", "class"] }); } catch { /* invalid observe target */ }
    }
    if (state.observerStats) state.observerStats.styleMutationGuardTargets = targets.length;
    state.styleMutationObserver = observer;
    state.styleMutationEditor = editor;
  }

  return {
    activeEditorStyleRoot,
    applyCodeboxStyleTokensToElement,
    applyTextColorPreset,
    buildCodeboxRootCss,
    clearStyledTextPreset,
    dashboardContainmentCleanupShadowHosts,
    dashboardContainmentCleanupTargetedShadowTraversalEnabled,
    discoverOpenStyleRoots,
    ensureRootCodeboxStyle,
    ensureStableStyleElement,
    ensureStyleElementAtEnd,
    integrationDocumentStyleRoot,
    installCodeboxStyleMutationGuard,
    isStyleRoot,
    maybeSkipSourceClassSteadyStateStyleReapply,
    queryStyleElementInContainer,
    removeCodeboxRootStylesFromAllRoots,
    sourceClassEditorForStyleSkip,
    styleContainerForRoot,
  };
}
