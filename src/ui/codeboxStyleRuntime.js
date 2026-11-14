// Runtime owner for Nostrodomus codebox style/frame behavior.
//
// Dependencies are injected so this module owns codebox style/frame behavior
// without importing browser globals and without circular imports.

import { cssColorIsDark } from './codeboxStyle.js';
import { createCodeboxUnclip } from './codebox/codeboxUnclip.js';
import { createCodeboxStyleSettle } from './codebox/codeboxStyleSettle.js';
import { createCodeboxPreflight } from './codebox/codeboxPreflight.js';

export function createCodeboxStyleRuntime(ctx = {}) {
  const {
    window = globalThis.window,
    document = globalThis.document,
    W = window,
    state,
    performance = globalThis.performance,
    requestAnimationFrame = globalThis.requestAnimationFrame?.bind?.(globalThis),
    cancelAnimationFrame = globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout = globalThis.clearTimeout?.bind?.(globalThis),
    MutationObserver = globalThis.MutationObserver,
    DARKPLUS_SYNTAX_COLORS,
    STYLE_TEXT_SIZE_PRESETS,
    activeEditDialog,
    activeEditorNoEditorBackoffAllowed,
    applyCodeboxStyleTokensToElement,
    applyCodeboxStyleTokensToStableRoots,
    applyTextColorPreset,
    buildCodeboxRootCss,
    clearCodeboxExternalFrameSettleTimers,
    clearStyleRangeLivePreviewCache,
    codeboxComposedParent,
    codeboxEditorCacheKey,
    codeboxFrameHostForEditor,
    codeboxStyleReasonNeedsSettle,
    codeboxStyleReasonRequiresFullApply,
    codeboxStyleReasonRequiresSyntaxPaint,
    codeboxStyleSettleReasonCoalesceDecision,
    codeboxStyleSignature,
    codeboxStyleTokensFromSettings,
    composedContains,
    discoverOpenStyleRoots,
    editorLikelyOpeningWithoutMountedCodebox,
    effectiveStyleSettings,
    ensureRootCodeboxStyle,
    ensureStableStyleElement,
    installCodeboxExternalFrameEventGuards,
    installCodeboxKeyboardContainment,
    installCodeboxStyleMutationGuard,
    installInitialSyntaxPaintGate,
    installSyntaxOwnerObserver,
    isStyleRoot,
    maybeSkipSourceClassSteadyStateStyleReapply,
    measurePerformanceEvent,
    mutationRecordLooksEditorStructural,
    mutationRecordsAreCodeMirrorOnly,
    primeInitialSyntaxPaintGateForEditor,
    recordPerformanceEvent,
    rememberActiveCodeboxEditor,
    rememberActiveEditorNoEditor,
    removeCodeboxExternalFrame,
    removeCodeboxRootStylesFromAllRoots,
    resolveSyntaxTintSettings,
    scheduleCodeboxExternalFrameSettleSync,
    scheduleEditorPresenceProbe,
    scheduleSourceClassSyntaxRefresh,
    scheduleStyleRootScan,
    nostrodomusWalkOpenRoots,
    structuralObserverConfigForTarget,
    nostrodomusPerfMode,
    styleEditorFromNode,
    stylePresetValue,
    styleRangeGroupTouchesSyntax,
    syncCodeboxExternalFrame,
    usableBridgeStyleEditorCandidate,
    visibleStyleEditorCandidate,
  } = ctx;



function isCodeMirrorInlineStyleTarget(node) {
  try { return !!node?.matches?.(".cm-editor, .cm-scroller, .cm-content"); } catch { return false; }
}

function haCodeEditorHostForEditor(editor) {
  if (!editor) return null;
  try {
    const root = editor.getRootNode?.();
    if (root?.host?.localName === "ha-code-editor") return root.host;
  } catch { /* detached node */ }
  try {
    const closest = editor.closest?.("ha-code-editor");
    if (closest) return closest;
  } catch { /* detached node */ }
  let node = editor;
  for (let i = 0; node && i < 10; i += 1) {
    try { if (node.localName === "ha-code-editor") return node; } catch { /* detached node */ }
    try {
      const root = node.getRootNode?.();
      if (root?.host?.localName === "ha-code-editor") return root.host;
      node = node.parentElement || root?.host || null;
    } catch {
      node = node?.parentElement || null;
    }
  }
  return null;
}

  const unclip = createCodeboxUnclip({
    document,
    MutationObserver,
    state,
    recordPerformanceEvent,
    codeboxComposedParent,
    codeboxFrameHostForEditor,
    isCodeMirrorInlineStyleTarget,
    haCodeEditorHostForEditor,
  });
  const {
    labelCodeboxUnclipTarget,
    rememberCodeboxUnclipOriginal,
    setImportantIfNeeded,
    forceCodeboxUnclipTarget,
    restoreCodeboxUnclipTarget,
    cleanupCodeboxSlotUnclip,
    isCodeboxSlotUnclipTarget,
    attachCodeboxSlotUnclipObserver,
    applyCodeboxSlotDialogBodyUnclip,
    allowCodeboxFrameOverflow,
  } = unclip;



  const settle = createCodeboxStyleSettle({
    setTimeout,
    clearTimeout,
    requestAnimationFrame,
    state,
    recordPerformanceEvent,
    styleRangeGroupTouchesSyntax,
    clearStyleRangeLivePreviewCache,
    scheduleSourceClassSyntaxRefresh,
    codeboxStyleSettleReasonCoalesceDecision,
    codeboxStyleReasonNeedsSettle,
    maybeSkipSourceClassSteadyStateStyleReapply,
    applyCodeboxStyleSettings: (reason) => applyCodeboxStyleSettings(reason),
  });
  const {
    cancelStyleRangeCommitReapply,
    scheduleStyleRangeCommitReapply,
    codeboxStyleReasonIsPassiveEditorSettle,
    codeboxStyleCanUsePassiveStableFastPath,
    flushCodeboxStyleReapply,
    clearCodeboxStyleSettleReasonState,
    clearCodeboxStyleSettleTimers,
    shouldCoalesceCodeboxStyleSettleReason,
    scheduleCodeboxStyleReapply,
  } = settle;


// The editor of the view remembered from the user's last key, click or focus, when it is another
// editor than `cached` and can be a style target. With two editors on a page the remembered one
// stayed the target for as long as it was visible, so an editor the user moved to and typed in
// was never styled. A view that is not another target (too small, a form field, outside the open
// dialog, or the remembered editor itself) is recorded as checked, so the steady-state skip does
// not ask again for every keystroke in it.
function userViewStyleEditor(cached, dialog) {
  const viewDom = state.view?.dom || null;
  if (state.codeboxStyleViewDomChecked && state.codeboxStyleViewDomChecked !== viewDom) state.codeboxStyleViewDomChecked = null;
  if (!viewDom || viewDom === cached || viewDom.isConnected === false) return null;
  const editor = styleEditorFromNode(viewDom);
  if (editor && editor !== cached && visibleStyleEditorCandidate(editor) && (!dialog || composedContains(dialog, editor))) return editor;
  state.codeboxStyleViewDomChecked = viewDom;
  return null;
}

function activeCodeboxStyleEditor() {
  const cached = state.activeEditorCache?.editor || null;
  const dialog = activeEditDialog();
  const viewEditor = userViewStyleEditor(cached, dialog);
  if (cached && viewEditor) {
    rememberActiveCodeboxEditor(viewEditor, "user-view-editor");
    return viewEditor;
  }
  if (cached && visibleStyleEditorCandidate(cached) && (!dialog || composedContains(dialog, cached))) {
    state.activeEditorCache.hit += 1;
    recordPerformanceEvent("active-editor-cache-hit", 0, state.activeEditorCache.key || "cached-editor");
    return cached;
  }
  if (cached) {
    state.activeEditorCache.invalidated += 1;
    state.activeEditorCache.lastReason = "cached-editor-stale";
    state.activeEditorCache.editor = null;
    state.activeEditorCache.key = "";
    recordPerformanceEvent("active-editor-cache-invalidated", 0, "cached-editor-stale");
  }
  if (activeEditorNoEditorBackoffAllowed("discover-active-editor")) return null;

  state.activeEditorCache.miss += 1;
  recordPerformanceEvent("active-editor-cache-miss", 0, "discover-active-editor");
  const bridgeActive = (() => { try { return W.__nostrodomusEditorBridgeV1?.active?.() || null; } catch { return null; } })();
  const bridgeEditor = usableBridgeStyleEditorCandidate(bridgeActive, "discover-active-editor-bridge");
  const candidates = [
    styleEditorFromNode(state.view?.dom),
    bridgeEditor,
    styleEditorFromNode(bridgeActive?.cmEditor),
    styleEditorFromNode(bridgeActive?.cmScroller),
    styleEditorFromNode(bridgeActive?.cmContent),
    styleEditorFromNode(bridgeActive?.codeEditor),
    styleEditorFromNode(document.activeElement),
    styleEditorFromNode(dialog),
  ].filter(Boolean);

  if (dialog?.shadowRoot) {
    for (const editor of dialog.shadowRoot.querySelectorAll?.(".cm-editor") || []) candidates.push(editor);
  }

  try {
    nostrodomusWalkOpenRoots(document, root => {
      for (const editor of root.querySelectorAll?.(".cm-editor") || []) candidates.push(editor);
    });
  } catch { /* cross-origin root */ }

  const seen = new Set();
  const visible = [];
  for (const editor of candidates) {
    if (!editor || seen.has(editor) || !visibleStyleEditorCandidate(editor)) continue;
    seen.add(editor);
    visible.push(editor);
  }

  visible.sort((a, b) => {
    const aDialog = dialog && composedContains(dialog, a) ? 1 : 0;
    const bDialog = dialog && composedContains(dialog, b) ? 1 : 0;
    if (aDialog !== bDialog) return bDialog - aDialog;
    const ar = a.getBoundingClientRect?.();
    const br = b.getBoundingClientRect?.();
    const aa = (ar?.width || 0) * (ar?.height || 0);
    const ba = (br?.width || 0) * (br?.height || 0);
    return ba - aa;
  });

  // The editor the user works in comes before the largest one.
  const selected = (viewEditor && visible.includes(viewEditor) ? viewEditor : visible[0]) || bridgeEditor || null;
  if (selected) {
    rememberActiveCodeboxEditor(selected, selected === bridgeEditor ? "discovered-active-editor-bridge" : "discovered-active-editor");
  } else {
    rememberActiveEditorNoEditor("no-editor-discovered");
  }
  return selected;
}

// Whether the Home Assistant theme around the editor is a light one, judged by the text color the
// editor element inherits from the page: dark text means a light theme. Nostrodomus sets colors
// inside the editor element and never on the element itself, so the inherited color is the
// theme's. Read at most once every THEME_BRIGHTNESS_RECHECK_MS per editor element; a color that
// cannot be read counts as a dark theme, which leaves the codebox colors as they always were.
const THEME_BRIGHTNESS_RECHECK_MS = 3000;
const themeBrightnessByHost = new WeakMap();
function themeIsLightAround(editor) {
  const host = haCodeEditorHostForEditor(editor) || editor?.parentElement || null;
  if (!host) return state.codeboxThemeIsLight === true;
  const at = Date.now();
  const known = themeBrightnessByHost.get(host);
  if (known && at - known.at < THEME_BRIGHTNESS_RECHECK_MS) return known.light;
  let light = false;
  try {
    const view = host.ownerDocument?.defaultView || window;
    light = cssColorIsDark(view?.getComputedStyle?.(host)?.color) === true;
  } catch { /* detached node */ }
  themeBrightnessByHost.set(host, { at, light });
  return light;
}

function applyCodeboxStyleSettings(reason = "style") {
  return measurePerformanceEvent("codebox-style-apply", reason, () => {
    const settings = effectiveStyleSettings();
    const size = stylePresetValue(STYLE_TEXT_SIZE_PRESETS, settings.codeTextSize, "normal");
    const frameEnabled = settings.codeboxFrameEnabled !== false;
    const editor = activeCodeboxStyleEditor();
    if (editor?.querySelector) state.codeboxThemeIsLight = themeIsLightAround(editor);
    const { scrollbarThumb, scrollbarTrack, frameBorder, frameGlow, frameGlowSoft, frameGlowInner, frameGlowInnerSoft, frameGlowOuter, frameGlowOuterSoft, editorSurface, thumbBorder, syntaxFg, gutterColor, caretColor, activeLineWash, resultPaneSurface } = codeboxStyleTokensFromSettings(settings);
    const syntax = resolveSyntaxTintSettings(settings);
    const syntaxFilter = syntax.active
      ? `hue-rotate(${Math.round(syntax.hue - syntax.filterBase)}deg) saturate(${syntax.saturation.toFixed(2)})`
      : "none";
    // Active-line (current-row) highlight: hidden by default (style.hideActiveLineHighlight !== false),
    // else the faint wash. Folded into rootCss so a toggle flip changes the CSS (rootCssChanged → reapply)
    // via the same scheduleCodeboxStyleReapply path every style toggle already uses.
    const activeLineBackground = settings.hideActiveLineHighlight === false ? (activeLineWash || "rgba(255, 255, 255, 0.045)") : "transparent";
    const tokens = { scrollbarThumb, scrollbarTrack, frameBorder, frameGlow, frameGlowSoft, frameGlowInner, frameGlowInnerSoft, frameGlowOuter, frameGlowOuterSoft, editorSurface, syntaxFilter };
    // The text colors are part of the root CSS only, so a change of theme brightness or preset
    // reaches the editor through rootCssChanged below.
    const styleSignature = codeboxStyleSignature({ settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax });
    const rootCss = buildCodeboxRootCss({ scrollbarThumb, scrollbarTrack, frameBorder, frameGlow, frameGlowSoft, frameGlowInner, frameGlowInnerSoft, frameGlowOuter, frameGlowOuterSoft, editorSurface, size, syntaxFilter, thumbBorder, activeLineBackground, syntaxFg, gutterColor, caretColor, resultPaneSurface });
    const rootCssChanged = state.codeboxStyleLastRootCss !== rootCss;
    const editorKey = codeboxEditorCacheKey(editor);
    const styleChanged = styleSignature !== state.codeboxStyleLastSignature;
    const editorChanged = editorKey !== state.codeboxStyleLastEditorKey;
    const reasonOptions = { lastAppliedAt: state?.codeboxStyleLastAppliedAt, cacheInvalidated: state?.codeboxStyleCacheInvalidated };
    const forcedFullApply = codeboxStyleReasonRequiresFullApply(reason, reasonOptions);
    const passiveStableFastPath = codeboxStyleCanUsePassiveStableFastPath(reason, {
      lastAppliedAt: state?.codeboxStyleLastAppliedAt,
      hasEditor: !!editor?.querySelector,
      styleChanged,
      editorChanged,
      rootCssChanged,
    });
    const fullApply = styleChanged || editorChanged || rootCssChanged || (forcedFullApply && !passiveStableFastPath);
    if (forcedFullApply && passiveStableFastPath) {
      state.codeboxStylePassiveFullApplySkips = (state.codeboxStylePassiveFullApplySkips || 0) + 1;
      state.lastCodeboxStylePassiveFullApplySkip = { at: new Date().toISOString(), reason, editorKey };
      recordPerformanceEvent("codebox-style-passive-full-apply-skipped", 0, reason);
    }
    let rootStylesInstalled = 0;

    if (!editor?.querySelector) {
      clearCodeboxExternalFrameSettleTimers(`no-active-editor-${reason}`);
      removeCodeboxExternalFrame();
      const opening = editorLikelyOpeningWithoutMountedCodebox();
      if (!opening) cleanupCodeboxSlotUnclip(`no-active-editor-${reason}`);
      const removed = opening ? 0 : removeCodeboxRootStylesFromAllRoots(`no-active-editor-${reason}`);
      if (opening) {
        if (state.editorSentinelStats) {
          state.editorSentinelStats.noEditorRetries += 1;
          state.editorSentinelStats.lastNoEditorRetryReason = `no-active-editor-${reason}`;
        }
        scheduleEditorPresenceProbe(`no-active-editor-${reason}`, 60);
      }
      state.codeboxStyleLastEditorKey = editorKey;
      state.codeboxStyleCacheInvalidated = false;
      state.codeboxStyleLastAppliedAt = Date.now();
      state.lastStyleApply = {
        at: new Date().toISOString(),
        reason,
        fastPath: true,
        rootStylesInstalled: false,
        rootStyleCount: 0,
        staleRootStylesRemoved: removed,
        editorBound: false,
        settings: { ...settings },
      };
      return true;
    }

    try { primeCodeboxPreflightForEditor(editor, `codebox-style-${reason}`); } catch { /* mid-frame HA mutation */ }

    if (!fullApply) {
      if (frameEnabled && !passiveStableFastPath) syncCodeboxExternalFrame(editor, tokens, `${reason}-fast-frame`);
      if (!passiveStableFastPath) installSyntaxOwnerObserver(editor, `codebox-style-fast-${reason}`);
      if (!passiveStableFastPath && codeboxStyleReasonRequiresSyntaxPaint(reason, reasonOptions)) {
        applyTextColorPreset(editor, settings);
      }
      state.lastStyleApply = {
        at: new Date().toISOString(),
        reason,
        fastPath: true,
        rootStylesInstalled: false,
        rootStyleCount: 0,
        editorBound: true,
        settings: { ...settings },
      };
      return true;
    }

    applyCodeboxStyleTokensToStableRoots(tokens, editor);
    const roots = discoverOpenStyleRoots(editor);
    for (const root of roots) {
      if (ensureRootCodeboxStyle(root, rootCss)) rootStylesInstalled += 1;
    }

    state.applyingCodeboxStyle = true;
    try {
    allowCodeboxFrameOverflow(editor);
    installCodeboxStyleMutationGuard(editor);
    installSyntaxOwnerObserver(editor, `codebox-style-${reason}`);

    const frameHost = codeboxFrameHostForEditor(editor);
    const haCodeEditorHost = haCodeEditorHostForEditor(editor);
    if (haCodeEditorHost?.style) {
      if (haCodeEditorHost.dataset.nostrodomusCodeboxFrameHost !== "1") haCodeEditorHost.dataset.nostrodomusCodeboxFrameHost = "1";
      if (haCodeEditorHost.dataset.nostrodomusCodeboxStyle !== "1") haCodeEditorHost.dataset.nostrodomusCodeboxStyle = "1";
      applyCodeboxStyleTokensToElement(haCodeEditorHost, tokens);
    }
    if (frameHost?.style) {
      if (frameHost.dataset.nostrodomusCodeboxFrameHost !== "1") frameHost.dataset.nostrodomusCodeboxFrameHost = "1";
      if (!isCodeMirrorInlineStyleTarget(frameHost)) applyCodeboxStyleTokensToElement(frameHost, tokens);
    }
    installCodeboxExternalFrameEventGuards();
    if (frameEnabled) {
      syncCodeboxExternalFrame(editor, tokens, reason);
      if (styleChanged || editorChanged || rootCssChanged) {
        for (const delay of [140, 520]) {
          scheduleCodeboxExternalFrameSettleSync(editor, tokens, delay, `${reason}-settle-${delay}`);
        }
      }
    } else {
      clearCodeboxExternalFrameSettleTimers(`frame-disabled-${reason}`);
      removeCodeboxExternalFrame();
    }

    const styleNodes = [editor, ...editor.querySelectorAll(".cm-editor, .cm-scroller, .cm-content")];
    for (const el of styleNodes) {
      if (!el?.style) continue;
      if (el.dataset.nostrodomusCodeboxStyle !== "1") el.dataset.nostrodomusCodeboxStyle = "1";
      // CodeMirror internals own layout-critical inline properties such as
      // .cm-content height. The v17 companion owns .cm-editor overflow and the
      // var()-form scrollbar-color on .cm-scroller. Runtime steady-state reapply
      // must not rewrite these inline styles or it creates scroll collapse/flap.
      if (isCodeMirrorInlineStyleTarget(el)) continue;
      applyCodeboxStyleTokensToElement(el, tokens);
    }

    if (styleChanged || editorChanged || codeboxStyleReasonRequiresSyntaxPaint(reason, reasonOptions) || !state.codeboxStyleLastSyntaxSignature) {
      applyTextColorPreset(editor, settings);
      state.codeboxStyleLastSyntaxSignature = styleSignature;
    }

    state.codeboxStyleLastSignature = styleSignature;
    state.codeboxStyleLastRootCss = rootCss;
    state.codeboxStyleLastEditorKey = editorKey;
    state.codeboxStyleCacheInvalidated = false;
    state.codeboxStyleLastAppliedAt = Date.now();
    state.lastStyleApply = {
      at: new Date().toISOString(),
      reason,
      fastPath: false,
      rootStylesInstalled: rootStylesInstalled > 0,
      rootStyleCount: rootStylesInstalled,
      editorBound: true,
      settings: { ...settings },
    };
    } finally {
      setTimeout(() => { state.applyingCodeboxStyle = false; }, 0);
    }
    return true;
  });
}

function attachStyleRootObserver(root) {
  if (!isStyleRoot(root) || typeof MutationObserver !== "function") return false;
  const target = root === document ? (document.documentElement || document) : root;
  const config = structuralObserverConfigForTarget(target);
  const existing = state.styleRootObservers?.get?.(root);
  if (existing && existing.mode === config.mode) return false;
  if (existing?.observer) {
    try { existing.observer.takeRecords?.(); } catch { /* injected observer */ }
    try { existing.observer.disconnect?.(); } catch { /* injected observer */ }
    state.styleRootObservers.delete(root);
  }
  const observer = new MutationObserver(records => {
    const count = records?.length || 0;
    if (state.observerStats) {
      state.observerStats.callbacks += 1;
      state.observerStats.styleMutationRecords += count;
      state.observerStats.lastObserverMode = config.mode;
    }
    if (mutationRecordsAreCodeMirrorOnly(records)) {
      if (state.observerStats) {
        state.observerStats.ignoredCodeMirrorRecords += count;
        state.observerStats.suppressedCodeMirrorCallbacks += 1;
      }
      return;
    }
    const structural = Array.from(records || []).some(mutationRecordLooksEditorStructural);
    if (state.observerStats) {
      if (structural) state.observerStats.structuralRecords += count;
      else {
        state.observerStats.ignoredRecords += count;
        state.observerStats.suppressedIgnoredCallbacks += 1;
      }
    }
    if (!structural) return;
    recordPerformanceEvent("observer-callback", 0, `style-root-structural:${count}:${config.mode}`);
    recordPerformanceEvent("style-root-mutation", 0, `${count} structural records`);
    scheduleStyleRootScan("shadow-root-editor-discovered");
  });
  try {
    observer.observe(target, config.options);
    state.styleRootObservers.set(root, { observer, target, mode: config.mode, options: config.options });
    if (state.observerStats) {
      state.observerStats.shallowStyleRootObservers = Array.from(state.styleRootObservers.values()).filter(item => item?.mode === "shallow").length;
      state.observerStats.deepStyleRootObservers = Array.from(state.styleRootObservers.values()).filter(item => item?.mode === "deep").length;
      state.observerStats.lastObserverMode = config.mode;
    }
    return true;
  } catch { /* invalid observe target */ }
  return false;
}


  const preflight = createCodeboxPreflight({
    document,
    performance,
    requestAnimationFrame,
    cancelAnimationFrame,
    setTimeout,
    clearTimeout,
    MutationObserver,
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
    activeCodeboxStyleEditor: () => activeCodeboxStyleEditor(),
    preflightColors: (editor) => {
      if (editor?.querySelector) state.codeboxThemeIsLight = themeIsLightAround(editor);
      const tokens = codeboxStyleTokensFromSettings(effectiveStyleSettings());
      // caretColor is set only when the colors were adjusted (a light theme, or dark text).
      return tokens?.caretColor ? { surface: tokens.editorSurface, syntaxFg: tokens.syntaxFg } : null;
    },
  });
  const {
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
  } = preflight;





  return {
    labelCodeboxUnclipTarget,
    rememberCodeboxUnclipOriginal,
    setImportantIfNeeded,
    forceCodeboxUnclipTarget,
    restoreCodeboxUnclipTarget,
    cleanupCodeboxSlotUnclip,
    isCodeboxSlotUnclipTarget,
    attachCodeboxSlotUnclipObserver,
    applyCodeboxSlotDialogBodyUnclip,
    allowCodeboxFrameOverflow,
    primeCodeboxPreflightForEditor,
    codeboxPreflightCss,
    cancelStyleRangeCommitReapply,
    scheduleStyleRangeCommitReapply,
    codeboxStyleReasonIsPassiveEditorSettle,
    codeboxStyleCanUsePassiveStableFastPath,
    flushCodeboxStyleReapply,
    clearCodeboxStyleSettleReasonState,
    clearCodeboxStyleSettleTimers,
    shouldCoalesceCodeboxStyleSettleReason,
    scheduleCodeboxStyleReapply,
    activeCodeboxStyleEditor,
    applyCodeboxStyleSettings,
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
    attachStyleRootObserver,
  };
}
