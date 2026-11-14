// Nostrodomus Source-class syntax install/refresh lifecycle for open editors.
// Cross-module calls go through the shared syntax runtime api object.

import { codeMirrorNativeHighlightApiStatus, shouldSkipSourceClassNativeProbeForNativeFallback, shouldSuppressLegacySourceClassRefreshForNativeHighlight } from './codeMirrorNativeHighlight.js';
import { sourceClassSmartSyntaxObserverReady, sourceClassSyntaxInstallForceRefresh, sourceClassSyntaxRefreshReasonUpdate } from './smartSyntaxScheduler.js';

import { insideCardOwnEditor } from '../editor/cardOwnEditor.js';

export function createSourceClassLifecycle(deps) {
  const {
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID,
    VERSION,
    activeCodeboxStyleEditor,
    codeMirrorSourceClassParts,
    codeboxEditorCacheKey,
    effectiveStyleSettings,
    ensureStyleElementAtEnd,
    recordPerformanceEvent,
    resolveSyntaxTintSettings,
    state,
    nostrodomusWalkOpenRoots,
    api,
  } = deps;

function clearDarkPlusInlineSyntaxStyles(editor) {
    if (!editor?.querySelectorAll) return { cleared: 0 };
    let cleared = 0;
    const nodes = editor.querySelectorAll(".cm-content, .cm-line, .cm-line span, .cm-content span, [data-nostrodomus-text-preset], [data-nostrodomus-syntax-kind], [data-nostrodomus-darkplus-line-kind], [data-nostrodomus-darkplus-token-kind]");
    for (const node of nodes || []) {
      if (!node?.style) continue;
      const before = node.style.getPropertyValue("color") || node.style.getPropertyValue("-webkit-text-fill-color") || node.style.getPropertyValue("text-shadow") || node.style.getPropertyValue("filter");
      node.style.removeProperty("color");
      node.style.removeProperty("-webkit-text-fill-color");
      node.style.removeProperty("text-shadow");
      node.style.removeProperty("filter");
      delete node.dataset.nostrodomusTextPreset;
      delete node.dataset.nostrodomusSyntaxKind;
      delete node.dataset.nostrodomusDarkplusLineKind;
      delete node.dataset.nostrodomusDarkplusTokenKind;
      if (before) cleared += 1;
    }
    return { cleared };
  }

// The sheet depends on the editor's highlighter configuration and the syntax settings. Both
// are the same from one apply to the next, and building it asks CodeMirror for the class of
// about thirty tags, so the last result is kept per view. state.config is replaced when the
// editor is reconfigured; an editor without it rebuilds every time.
const sourceClassCssByView = new WeakMap();

function sourceClassSyntaxCssFor(parts, syntax) {
    const view = parts?.view;
    const config = view?.state?.config || null;
    let syntaxKey = "";
    try { syntaxKey = JSON.stringify(syntax); } catch { syntaxKey = ""; }
    const known = view && typeof view === "object" ? sourceClassCssByView.get(view) : null;
    if (known && config && syntaxKey && known.config === config && known.tags === parts.tags && known.syntaxKey === syntaxKey) return known.built;
    const built = api.buildCodeMirrorSourceClassSyntaxCss(parts, syntax);
    if (view && typeof view === "object" && config && syntaxKey && built?.css) {
      sourceClassCssByView.set(view, { config, tags: parts.tags, syntaxKey, built });
    }
    return built;
  }

function installCodeMirrorSourceClassSyntax(editor, settings, reason = "source-class-syntax") {
    const parts = codeMirrorSourceClassParts(editor);
    let nativeApiStatus = parts ? codeMirrorNativeHighlightApiStatus({ ...parts, editor }) : null;
    const editorKey = editor?.querySelector ? codeboxEditorCacheKey(editor) : "no-editor";
    const nativeUnavailableReason = nativeApiStatus && nativeApiStatus.available === false ? "missing-native-codemirror-api" : "";
    const sourceClassNativeProbeDecision = shouldSkipSourceClassNativeProbeForNativeFallback({
      hasEditor: !!editor?.querySelector,
      editorKey,
      nativeAvailable: nativeApiStatus?.available === true,
      nativeReason: nativeUnavailableReason,
      missingNativeApi: nativeApiStatus?.missing || [],
      sourceClassActive: editorUsesCodeMirrorSourceClassSyntax(editor),
      previousOwnership: state.lastNativeHighlightSourceClassFallbackOwnership || null,
      reason,
    });
    const native = sourceClassNativeProbeDecision.skip
      ? {
          installed: false,
          nativeHighlight: false,
          skipped: true,
          reason: sourceClassNativeProbeDecision.nativeReason || "missing-native-codemirror-api",
          missing: sourceClassNativeProbeDecision.missingNativeApi || [],
          apiStatus: nativeApiStatus || null,
          deduped: api.suppressSourceClassNativeProbeForNativeFallback(editor, sourceClassNativeProbeDecision),
        }
      : api.installCodeMirrorNativeHighlightSyntax(editor, settings, `native-${reason}`);
    if (native?.installed) return { ...native, sourceClass: false, fallback: false };

    if (!parts) return { installed: false, sourceClass: false, reason: native?.reason || "missing-codemirror-parts" };
    const syntax = resolveSyntaxTintSettings(settings || effectiveStyleSettings());
    const built = sourceClassSyntaxCssFor(parts, syntax);
    if (!built?.css || !built.classMap?.length) return { installed: false, sourceClass: false, reason: "no-class-map" };

    const style = ensureStyleElementAtEnd(parts.root, CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID);
    if (!style) return { installed: false, sourceClass: false, reason: "style-install-failed" };

    const styleChanged = style.textContent !== built.css;
    if (styleChanged) style.textContent = built.css;

    const sourceAlreadyActive = editor.dataset?.nostrodomusSourceClassSyntax === VERSION &&
      parts.content?.dataset?.nostrodomusSourceClassSyntax === VERSION;
    const observerReady = sourceClassSmartSyntaxObserverReady(state.sourceClassSmartSyntaxObserver, state.sourceClassSmartSyntaxEditorKey, state.sourceClassSmartSyntaxContent, editorKey, parts.content);

    // The markers are written only when they change. Setting an attribute to the value it has
    // still produces a mutation record, and CodeMirror observes the attributes of .cm-content;
    // this function runs on every style apply.
    for (const marked of [editor, parts.content, parts.host]) {
      if (marked?.dataset && marked.dataset.nostrodomusSourceClassSyntax !== VERSION) marked.dataset.nostrodomusSourceClassSyntax = VERSION;
    }

    if (!sourceClassSyntaxInstallForceRefresh(styleChanged, sourceAlreadyActive, reason) && observerReady) {
      state.sourceClassSyntaxSkippedInstalls = (state.sourceClassSyntaxSkippedInstalls || 0) + 1;
      state.lastSourceClassSyntaxSkip = {
        at: new Date().toISOString(),
        version: VERSION,
        reason,
        editorKey,
        mapped: built.classMap.length,
        sourceClassRuleCollisions: built.sourceClassRuleCollisions || 0,
        skipped: true,
      };
      const skippedSource = { installed: true, sourceClass: true, skipped: true, mapped: built.classMap.length, sourceClassRuleCollisions: built.sourceClassRuleCollisions || 0, lines: 0, spans: 0, smartChanged: 0, clearedInlineNodes: 0 };
      if (!native?.deduped) api.promoteSourceClassFallbackForNativeUnavailable(editor, reason, native, skippedSource);
      return skippedSource;
    }

    const cleanup = sourceAlreadyActive && !styleChanged ? { cleared: 0 } : clearDarkPlusInlineSyntaxStyles(editor);
    // Attaching the observer runs a syntax pass of its own, after it removed the ranges of the
    // editor it was attached to before. That pass is the pass of this install. A pass here, ahead
    // of the observer, was thrown away by that removal and done a second time.
    let smart = null;
    if (!observerReady) {
      const passBefore = state.lastSmartSourceSyntax;
      api.installSourceClassSmartSyntaxObserver(editor, settings || effectiveStyleSettings(), reason);
      if (state.lastSmartSourceSyntax && state.lastSmartSourceSyntax !== passBefore) smart = state.lastSmartSourceSyntax;
    }
    if (!smart) smart = api.applyCodeMirrorSmartSyntaxClasses(editor, settings || effectiveStyleSettings(), reason);

    try {
      if (state.syntaxOwnerEditorKey === editorKey) {
        state.syntaxOwnerObserver?.disconnect?.();
        state.syntaxOwnerObserver = null;
        state.syntaxOwnerContent = null;
        state.syntaxOwnerEditorKey = "";
      }
    } catch { /* injected observer */ }

    state.lastSourceClassSyntax = {
      at: new Date().toISOString(),
      version: VERSION,
      reason,
      editorKey,
      mapped: built.classMap.length,
      sourceClassRuleCollisions: built.sourceClassRuleCollisions || 0,
      classMap: built.classMap,
      smartLines: smart.lines,
      smartSpans: smart.spans,
      smartChanged: smart.changed,
      clearedInlineNodes: cleanup.cleared,
      preset: syntax.presetKey,
      themeOpacity: syntax.themeOpacity,
      themeSaturation: syntax.themeSaturation,
    };
    const source = { installed: true, sourceClass: true, lines: smart.lines, spans: smart.spans, mapped: built.classMap.length, sourceClassRuleCollisions: built.sourceClassRuleCollisions || 0, smartChanged: smart.changed, clearedInlineNodes: cleanup.cleared };
    if (!native?.deduped) api.promoteSourceClassFallbackForNativeUnavailable(editor, reason, native, source);
    recordPerformanceEvent("syntax.source-class", 0, `${reason}:${built.classMap.length} classes`);
    return source;
  }

function refreshSourceClassSyntaxForOpenEditors(reason = "source-class-refresh") {
    const editors = [];
    const seen = new Set();
    const add = (editor) => {
      if (!editor?.querySelector || seen.has(editor)) return;
      seen.add(editor);
      // The walk below finds every code box on the page; one in a custom card's own editor is not ours.
      if (insideCardOwnEditor(editor)) return;
      editors.push(editor);
    };
    try { add(activeCodeboxStyleEditor()); } catch { /* mid-frame HA mutation */ }
    try {
      nostrodomusWalkOpenRoots(document, (root) => {
        for (const editor of root.querySelectorAll?.(".cm-editor") || []) add(editor);
      });
    } catch { /* cross-origin root */ }
    let refreshed = 0;
    let nativeSuppressed = 0;
    for (const editor of editors) {
      try {
        const nativeDecision = shouldSuppressLegacySourceClassRefreshForNativeHighlight({
          nativeHighlightActive: api.editorUsesCodeMirrorNativeHighlightSyntax(editor),
          reason,
        });
        if (nativeDecision.suppressed) {
          api.suppressSourceClassSyntaxRefreshForNativeHighlight(editor, nativeDecision);
          nativeSuppressed += 1;
          continue;
        }
        installCodeMirrorSourceClassSyntax(editor, effectiveStyleSettings(), reason);
        refreshed += 1;
      } catch { /* per-editor isolation */ }
    }
    state.lastSourceClassSyntaxRefresh = { at: new Date().toISOString(), reason, editors: editors.length, refreshed, nativeSuppressed };
    return refreshed;
  }

function appendSourceClassSyntaxRefreshReason(reason = "source-class-refresh", source = "source-class-refresh") {
    const update = sourceClassSyntaxRefreshReasonUpdate(state.sourceClassSyntaxRefreshReason, reason || "source-class-refresh");
    if (update.duplicate) {
      state.sourceClassSyntaxRefreshReasonCoalesces = (state.sourceClassSyntaxRefreshReasonCoalesces || 0) + 1;
      state.lastSourceClassSyntaxRefreshCoalescedReason = `${source}:${update.clean}`;
      state.sourceClassSyntaxRefreshReasonCount = update.count;
      recordPerformanceEvent("source-class-syntax-refresh-reason-coalesced", 0, `${source}:${update.clean}`);
      return false;
    }
    state.sourceClassSyntaxRefreshReason = update.pendingReason;
    state.sourceClassSyntaxRefreshReasonCount = update.count;
    state.lastSourceClassSyntaxRefreshPendingReason = update.clean;
    return true;
  }

function scheduleSourceClassSyntaxRefresh(reason = "source-class-refresh") {
    appendSourceClassSyntaxRefreshReason(reason || "source-class-refresh", "schedule");
    if (state.sourceClassSyntaxRefreshRaf) {
      return true;
    }
    state.sourceClassSyntaxRefreshRaf = requestAnimationFrame(() => {
      state.sourceClassSyntaxRefreshRaf = 0;
      const pendingReason = state.sourceClassSyntaxRefreshReason || reason;
      state.sourceClassSyntaxRefreshReason = "";
      state.sourceClassSyntaxRefreshReasonCount = 0;
      refreshSourceClassSyntaxForOpenEditors(pendingReason);
    });
    return true;
  }

function editorUsesCodeMirrorSourceClassSyntax(editor) {
    if (!editor?.querySelector) return false;
    if (api.editorUsesCodeMirrorNativeHighlightSyntax(editor)) return true;
    if (editor.dataset?.nostrodomusSourceClassSyntax === VERSION) return true;
    const root = editor.getRootNode?.();
    return !!root?.querySelector?.(`#${CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID}`);
  }

  return {
    clearDarkPlusInlineSyntaxStyles,
    installCodeMirrorSourceClassSyntax,
    refreshSourceClassSyntaxForOpenEditors,
    appendSourceClassSyntaxRefreshReason,
    scheduleSourceClassSyntaxRefresh,
    editorUsesCodeMirrorSourceClassSyntax,
  };
}
