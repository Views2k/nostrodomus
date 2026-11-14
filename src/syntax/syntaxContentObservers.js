// Nostrodomus Syntax content/owner observer management for CodeMirror editor surfaces.
// Cross-module calls go through the shared syntax runtime api object.

import { codeMirrorNativeHighlightApiStatus, shouldSkipSyntaxOwnerSourceClassInstallForNativeFallback, shouldSuppressLegacyInlineSyntaxOwnerForNativeHighlight } from './codeMirrorNativeHighlight.js';
import { sourceClassSmartSyntaxObserverReady } from './smartSyntaxScheduler.js';

export function createSyntaxContentObservers(deps) {
  const {
    VERSION,
    codeMirrorSourceClassParts,
    codeboxEditorCacheKey,
    effectiveStyleSettings,
    recordPerformanceEvent,
    state,
    api,
  } = deps;

function codeMirrorSyntaxContentMutationRelevant(records) {
    for (const record of records || []) {
      if (record?.type === "childList" || record?.type === "characterData") return true;
    }
    return false;
  }

function resetCodeMirrorSyntaxContentObserverAliases(observer = null, mode = "") {
    if (mode === "source-class") {
      state.sourceClassSmartSyntaxObserver = observer;
      state.syntaxOwnerObserver = null;
      state.syntaxOwnerEditorKey = "";
      state.syntaxOwnerContent = null;
      return;
    }
    if (mode === "legacy-inline") {
      state.syntaxOwnerObserver = observer;
      state.sourceClassSmartSyntaxObserver = null;
      state.sourceClassSmartSyntaxEditorKey = "";
      state.sourceClassSmartSyntaxContent = null;
      return;
    }
    state.syntaxOwnerObserver = null;
    state.syntaxOwnerEditorKey = "";
    state.syntaxOwnerContent = null;
    state.sourceClassSmartSyntaxObserver = null;
    state.sourceClassSmartSyntaxEditorKey = "";
    state.sourceClassSmartSyntaxContent = null;
  }

function disconnectCodeMirrorSyntaxContentObserver(reason = "disconnect-syntax-content-observer") {
    const previousMode = state.codeMirrorSyntaxContentMode || "";
    try { state.codeMirrorSyntaxContentObserver?.disconnect?.(); } catch { /* injected observer */ }
    state.codeMirrorSyntaxContentObserver = null;
    state.codeMirrorSyntaxContentMode = "";
    state.codeMirrorSyntaxContentEditorKey = "";
    state.codeMirrorSyntaxContent = null;
    if (previousMode === "source-class") api.smartSyntaxClearRangeHighlights();
    state.lastCodeMirrorSyntaxContentObserverDisconnect = { at: new Date().toISOString(), reason, previousMode };
    resetCodeMirrorSyntaxContentObserverAliases(null, "");
  }

function installCodeMirrorSyntaxContentObserver(editor, content, mode, onRecords, reason = "syntax-content-observer") {
    if (!editor?.querySelector || !content || typeof MutationObserver === "undefined") return false;
    const editorKey = codeboxEditorCacheKey(editor);
    if (state.codeMirrorSyntaxContentObserver &&
      state.codeMirrorSyntaxContentMode === mode &&
      state.codeMirrorSyntaxContentEditorKey === editorKey &&
      state.codeMirrorSyntaxContent === content) {
      resetCodeMirrorSyntaxContentObserverAliases(state.codeMirrorSyntaxContentObserver, mode);
      return true;
    }
    disconnectCodeMirrorSyntaxContentObserver(`${reason}-replace`);
    const observer = new MutationObserver((records) => {
      if (!codeMirrorSyntaxContentMutationRelevant(records)) return;
      onRecords?.(records, editorKey);
    });
    try {
      observer.observe(content, { childList: true, characterData: true, subtree: true });
    } catch {
      return false;
    }
    state.codeMirrorSyntaxContentObserver = observer;
    state.codeMirrorSyntaxContentMode = mode;
    state.codeMirrorSyntaxContentEditorKey = editorKey;
    state.codeMirrorSyntaxContent = content;
    resetCodeMirrorSyntaxContentObserverAliases(observer, mode);
    return true;
  }

function suppressSyntaxOwnerSourceClassInstallForNativeFallback(editor, content, decision = {}) {
    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason: decision.reason || "syntax-owner",
      editorKey: codeboxEditorCacheKey(editor),
      skipped: true,
      attempt: false,
      nativeUnavailable: true,
      nativeReason: decision.nativeReason || "",
      missingNativeApi: decision.missingNativeApi || [],
      sourceClassFallbackActive: true,
      sourceClassObserverReady: true,
      previousMatches: true,
      mode: state.codeMirrorSyntaxContentMode || "",
      contentMatches: state.codeMirrorSyntaxContent === content,
      path: decision.path || "native-unavailable-syntax-owner-source-class-deduped",
    };
    state.lastNativeHighlightSyntaxOwnerSourceClassInstallDedupe = result;
    state.nativeHighlightSyntaxOwnerSourceClassInstallDedupedCount = (state.nativeHighlightSyntaxOwnerSourceClassInstallDedupedCount || 0) + 1;
    recordPerformanceEvent("syntax.native-highlight.syntax-owner-source-class-dedupe", 0, `${result.reason}:native=${result.nativeReason}`);
    return result;
  }

function installSyntaxOwnerObserver(editor, reason = "syntax-owner") {
    if (!editor?.querySelector || typeof MutationObserver === "undefined") return false;
    const nativeDecision = shouldSuppressLegacyInlineSyntaxOwnerForNativeHighlight({
      nativeHighlightActive: api.editorUsesCodeMirrorNativeHighlightSyntax(editor),
      reason,
    });
    if (nativeDecision.suppressed) {
      api.suppressLegacyInlineSyntaxOwnerForNativeHighlight(editor, nativeDecision);
      return true;
    }
    const content = editor.querySelector?.(".cm-content");
    if (!content) return false;
    const editorKey = codeboxEditorCacheKey(editor);
    const partsForStatus = codeMirrorSourceClassParts(editor);
    const nativeApiStatus = partsForStatus ? codeMirrorNativeHighlightApiStatus({ ...partsForStatus, editor }) : null;
    const nativeUnavailableReason = nativeApiStatus && nativeApiStatus.available === false ? "missing-native-codemirror-api" : "";
    const sourceClassObserverReady = sourceClassSmartSyntaxObserverReady(state.sourceClassSmartSyntaxObserver, state.sourceClassSmartSyntaxEditorKey, state.sourceClassSmartSyntaxContent, editorKey, content, state.codeMirrorSyntaxContentMode, state.codeMirrorSyntaxContentEditorKey, state.codeMirrorSyntaxContent, true);
    const syntaxOwnerDedupeDecision = shouldSkipSyntaxOwnerSourceClassInstallForNativeFallback({
      hasEditor: true,
      editorKey,
      nativeAvailable: nativeApiStatus?.available === true,
      nativeReason: nativeUnavailableReason,
      missingNativeApi: nativeApiStatus?.missing || [],
      sourceClassActive: api.editorUsesCodeMirrorSourceClassSyntax(editor),
      sourceClassObserverReady,
      previousOwnership: state.lastNativeHighlightSourceClassFallbackOwnership || null,
      reason,
    });
    if (syntaxOwnerDedupeDecision.skip) {
      suppressSyntaxOwnerSourceClassInstallForNativeFallback(editor, content, syntaxOwnerDedupeDecision);
      return true;
    }
    const source = api.installCodeMirrorSourceClassSyntax(editor, effectiveStyleSettings(), `syntax-owner-${reason}`);
    if (source?.installed) return true;
    if (state.syntaxOwnerObserver && state.syntaxOwnerEditorKey === editorKey && state.syntaxOwnerContent === content) return true;
    state.lastSyntaxOwnerObserver = {
      at: new Date().toISOString(),
      reason,
      editorKey,
      installed: false,
      sourceClassUnavailable: true,
      legacyInlineDeleted: true,
    };
    return true;
  }

  return {
    codeMirrorSyntaxContentMutationRelevant,
    resetCodeMirrorSyntaxContentObserverAliases,
    disconnectCodeMirrorSyntaxContentObserver,
    installCodeMirrorSyntaxContentObserver,
    suppressSyntaxOwnerSourceClassInstallForNativeFallback,
    installSyntaxOwnerObserver,
  };
}
