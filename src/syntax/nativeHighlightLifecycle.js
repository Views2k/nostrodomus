// Nostrodomus CodeMirror native-highlight install/teardown lifecycle for the active editor.
// Cross-module calls go through the shared syntax runtime api object.

import {
  codeMirrorNativeHighlightApiStatus,
  installCodeMirrorNativeHighlightExtension,
  shouldAttemptNativeHighlightForActiveEditor,
  shouldSkipNativeUnavailableActiveEditorInstall,
} from './codeMirrorNativeHighlight.js';

export function createNativeHighlightLifecycle(deps) {
  const {
    VERSION,
    codeMirrorSourceClassParts,
    codeboxEditorCacheKey,
    effectiveStyleSettings,
    ensureStyleElementAtEnd,
    recordPerformanceEvent,
    resolveSyntaxTintSettings,
    state,
    visibleStyleEditorCandidate,
    api,
  } = deps;
  const CODEMIRROR_NATIVE_HIGHLIGHT_BASE_STYLE_ID = "nostrodomus-cm-native-highlight-base-v1";

// important-override registry — native-highlight base fg/caret css.

// external rules overridden: CodeMirror theme fg/caret-color and HA theme universal

//   transition rules during native-highlight ownership.

// owner: native-highlight lifecycle (this module).

// reason: base fg and caret must hold while the CM6 highlight extension owns token

//   colors; transitions must stay dead to avoid first-paint flashes.

// removal condition: CM theme bridge that sets these via the extension itself.

// verification: native-highlight syntax tests; browser smoke syntax items.

function buildCodeMirrorNativeHighlightBaseCss(syntax) {
    // Neutral base fg, never the theme palette fg: darkPlusColor("fg") can be white #ffffff
    // x opacity = rgba(255,255,255,0.67) on white-fg presets and would flash during a Ctrl+Space repaint
    // gap. The var is wired to #d4d4d4 (codeboxPreflight.js / styleDomRuntime.js) so it stays neutral.
    const neutralFg = "var(--nostrodomus-codebox-syntax-fg, #d4d4d4)";
    const dim = api.darkPlusColor("dim", syntax);
    const glow = syntax?.active ? (syntax.textShadow || "none") : "none";
    return `
      /* Nostrodomus native CodeMirror HighlightStyle base.
         Token colors are born from a CM6 highlight extension; this CSS only
         owns default foreground, gutters, caret, and transition suppression. */
      .cm-editor,
      .cm-scroller,
      .cm-content {
        color: ${neutralFg} !important;
        -webkit-text-fill-color: currentColor !important;
        transition: none !important;
      }
      .cm-content {
        caret-color: #ffffff !important;
      }
      .cm-gutters,
      .cm-gutter,
      .cm-lineNumbers,
      .cm-foldGutter {
        color: ${dim} !important;
        -webkit-text-fill-color: ${dim} !important;
      }
      .cm-content .cm-line,
      .cm-content .cm-line span {
        transition: none !important;
        text-shadow: ${glow} !important;
      }
    `;
  }

function installCodeMirrorNativeHighlightBaseStyle(parts, syntax) {
    const root = parts?.root || null;
    if (!root) return false;
    const style = ensureStyleElementAtEnd(root, CODEMIRROR_NATIVE_HIGHLIGHT_BASE_STYLE_ID);
    if (!style) return false;
    const css = buildCodeMirrorNativeHighlightBaseCss(syntax);
    if (style.textContent !== css) style.textContent = css;
    return true;
  }

function installCodeMirrorNativeHighlightSyntax(editor, settings, reason = "native-highlight-syntax") {
    const parts = codeMirrorSourceClassParts(editor);
    if (!parts) return { installed: false, nativeHighlight: false, reason: "missing-codemirror-parts" };
    const syntax = resolveSyntaxTintSettings(settings || effectiveStyleSettings());
    const apiStatus = codeMirrorNativeHighlightApiStatus({ ...parts, editor });
    const native = installCodeMirrorNativeHighlightExtension(
      { ...parts, editor },
      syntax,
      (kind) => api.darkPlusColor(kind, syntax),
      { version: VERSION, reason, key: codeboxEditorCacheKey(editor) },
    );
    if (!native?.installed) {
      const nativeApiStatus = native?.apiStatus || apiStatus;
      state.lastNativeHighlightApiStatus = {
        at: new Date().toISOString(),
        version: VERSION,
        reason,
        available: !!nativeApiStatus?.available,
        missing: nativeApiStatus?.missing || [],
        status: nativeApiStatus || null,
      };
      state.lastNativeHighlightSyntax = {
        at: new Date().toISOString(),
        version: VERSION,
        reason,
        installed: false,
        fallback: true,
        nativeHighlight: false,
        nativeReason: native?.reason || "not-installed",
        missingNativeApi: nativeApiStatus?.missing || [],
        nativeApiStatus: nativeApiStatus || null,
      };
      return native || { installed: false, nativeHighlight: false, reason: "native-install-returned-empty", apiStatus: nativeApiStatus || null };
    }

    const cleanup = api.clearDarkPlusInlineSyntaxStyles(editor);
    const ownership = suppressLegacySyntaxRecoveryForNativeHighlight(editor, reason);
    installCodeMirrorNativeHighlightBaseStyle(parts, syntax);
    editor.dataset.nostrodomusNativeHighlightSyntax = VERSION;
    parts.content.dataset.nostrodomusNativeHighlightSyntax = VERSION;
    if (parts.host?.dataset) parts.host.dataset.nostrodomusNativeHighlightSyntax = VERSION;
    state.lastNativeHighlightSyntax = {
      at: new Date().toISOString(),
      version: VERSION,
      reason,
      installed: true,
      nativeHighlight: true,
      skipped: !!native.skipped,
      dispatch: native.dispatch || "unchanged",
      specCount: native.specCount || 0,
      clearedInlineNodes: cleanup.cleared || 0,
      legacySuppressed: true,
      ownership,
      preset: syntax.presetKey,
      themeOpacity: syntax.themeOpacity,
      themeSaturation: syntax.themeSaturation,
    };
    recordPerformanceEvent("syntax.native-highlight", 0, `${reason}:${native.specCount || 0} tags:${native.dispatch || "skip"}:legacy-suppressed=${ownership.suppressed}`);
    return { ...native, clearedInlineNodes: cleanup.cleared || 0, ownership };
  }

function scheduleNativeHighlightForActiveEditor(editor, reason = "active-editor-native-highlight") {
    const hasEditor = !!editor?.querySelector;
    const editorKey = hasEditor ? codeboxEditorCacheKey(editor) : "no-editor";
    const alreadyNative = hasEditor && editorUsesCodeMirrorNativeHighlightSyntax(editor);
    const partsForStatus = hasEditor ? codeMirrorSourceClassParts(editor) : null;
    const nativeApiStatus = partsForStatus ? codeMirrorNativeHighlightApiStatus({ ...partsForStatus, editor }) : null;
    const nativeUnavailableReason = nativeApiStatus && nativeApiStatus.available === false ? "missing-native-codemirror-api" : "";
    const skipUnavailableDecision = shouldSkipNativeUnavailableActiveEditorInstall({
      hasEditor,
      pending: !!state.nativeHighlightActiveEditorRaf,
      editorKey,
      nativeAvailable: nativeApiStatus?.available === true,
      nativeReason: nativeUnavailableReason,
      missingNativeApi: nativeApiStatus?.missing || [],
      sourceClassActive: hasEditor && api.editorUsesCodeMirrorSourceClassSyntax(editor),
      previousOwnership: state.lastNativeHighlightSourceClassFallbackOwnership || null,
      reason,
    });
    if (skipUnavailableDecision.skip) {
      const result = {
        at: new Date().toISOString(),
        version: VERSION,
        reason,
        editorKey,
        attempt: false,
        skipped: true,
        skipReason: skipUnavailableDecision.path,
        nativeUnavailable: true,
        nativeReason: skipUnavailableDecision.nativeReason,
        missingNativeApi: skipUnavailableDecision.missingNativeApi,
        sourceClassFallbackActive: true,
        previousMatches: true,
        path: skipUnavailableDecision.path,
      };
      state.lastNativeHighlightActiveEditorInstall = result;
      state.lastNativeHighlightActiveEditorInstallDedupe = result;
      state.nativeHighlightActiveEditorInstallDedupedCount = (state.nativeHighlightActiveEditorInstallDedupedCount || 0) + 1;
      recordPerformanceEvent("syntax.native-highlight.active-editor-dedupe", 0, `${reason}:native=${result.nativeReason}`);
      return false;
    }
    const decision = shouldAttemptNativeHighlightForActiveEditor({
      hasEditor,
      nativeHighlightActive: alreadyNative,
      pending: !!state.nativeHighlightActiveEditorRaf,
      reason,
    });
    state.lastNativeHighlightActiveEditorInstall = {
      at: new Date().toISOString(),
      version: VERSION,
      reason,
      editorKey,
      attempt: !!decision.attempt,
      skipped: !decision.attempt,
      skipReason: decision.reason || "",
      path: decision.path || "",
      pending: !!state.nativeHighlightActiveEditorRaf,
      alreadyNative,
    };
    if (!decision.attempt) return false;

    state.nativeHighlightActiveEditorPendingKey = editorKey;
    state.nativeHighlightActiveEditorPendingReason = reason;
    state.nativeHighlightActiveEditorRaf = requestAnimationFrame(() => {
      state.nativeHighlightActiveEditorRaf = 0;
      const stillVisible = !!editor?.isConnected && visibleStyleEditorCandidate(editor);
      if (!stillVisible) {
        state.lastNativeHighlightActiveEditorInstall = {
          at: new Date().toISOString(),
          version: VERSION,
          reason,
          editorKey,
          attempt: true,
          installed: false,
          nativeHighlight: false,
          skipped: true,
          skipReason: "editor-not-visible-at-install",
          path: "active-editor-native-highlight-trigger",
        };
        return;
      }
      const native = installCodeMirrorNativeHighlightSyntax(editor, effectiveStyleSettings(), `active-editor-trigger-${reason}`);
      const sourceFallback = native?.installed
        ? null
        : api.installCodeMirrorSourceClassSyntax(editor, effectiveStyleSettings(), `native-unavailable-active-editor-${reason}`);
      state.lastNativeHighlightActiveEditorInstall = {
        at: new Date().toISOString(),
        version: VERSION,
        reason,
        editorKey,
        attempt: true,
        installed: !!native?.installed,
        nativeHighlight: !!native?.nativeHighlight,
        nativeReason: native?.reason || "",
        missingNativeApi: native?.missing || native?.apiStatus?.missing || [],
        nativeApiStatus: native?.apiStatus || null,
        dispatch: native?.dispatch || "",
        specCount: native?.specCount || 0,
        fallback: !native?.installed,
        sourceClassFallbackInstalled: !!sourceFallback?.installed,
        sourceClassFallbackMapped: sourceFallback?.mapped || 0,
        ownership: native?.ownership || state.lastNativeHighlightSourceClassFallbackOwnership || null,
        path: "active-editor-native-highlight-trigger",
      };
      recordPerformanceEvent("syntax.native-highlight.active-editor-trigger", 0, `${reason}:installed=${!!native?.installed}:reason=${native?.reason || ""}:sourceFallback=${!!sourceFallback?.installed}`);
    });
    return true;
  }

function cancelSyntaxRecoveryTimersForNativeHighlight(reason = "native-highlight-owns-syntax") {
    state.lastNativeHighlightRecoveryCancel = {
      at: new Date().toISOString(),
      reason,
      cancelled: 0,
      legacyRecoveryDeleted: true,
    };
    return 0;
  }

function suppressLegacySyntaxRecoveryForNativeHighlight(editor, reason = "native-highlight-owns-syntax") {
    const editorKey = codeboxEditorCacheKey(editor);
    const previousMode = state.codeMirrorSyntaxContentMode || "";
    let disconnectedSyntaxObserver = false;
    let disconnectedSmartObserver = false;
    try {
      if (state.codeMirrorSyntaxContentObserver && state.codeMirrorSyntaxContentEditorKey === editorKey) {
        api.disconnectCodeMirrorSyntaxContentObserver(`native-highlight-owns-syntax-${reason}`);
        disconnectedSyntaxObserver = true;
      }
    } catch { /* mid-frame HA mutation */ }
    try {
      if (state.sourceClassSmartSyntaxObserver || state.sourceClassSmartSyntaxRaf || state.sourceClassSmartSyntaxTimer) {
        api.disconnectSourceClassSmartSyntaxObserver(`native-highlight-owns-smart-syntax-${reason}`);
        disconnectedSmartObserver = true;
      }
    } catch { /* mid-frame HA mutation */ }
    const cancelledRecoveryTimers = cancelSyntaxRecoveryTimersForNativeHighlight(reason);
    const result = {
      at: new Date().toISOString(),
      reason,
      editorKey,
      previousMode,
      disconnectedSyntaxObserver,
      disconnectedSmartObserver,
      cancelledRecoveryTimers,
      suppressed: true,
    };
    state.lastNativeHighlightSyntaxOwnership = result;
    return result;
  }

function editorUsesCodeMirrorNativeHighlightSyntax(editor) {
    if (!editor?.querySelector) return false;
    if (editor.dataset?.nostrodomusNativeHighlightSyntax === VERSION) return true;
    const content = editor.querySelector?.(".cm-content") || null;
    if (content?.dataset?.nostrodomusNativeHighlightSyntax === VERSION) return true;
    const root = editor.getRootNode?.();
    return !!root?.querySelector?.(`#${CODEMIRROR_NATIVE_HIGHLIGHT_BASE_STYLE_ID}`);
  }

function nativeHighlightSyntaxContentPainted(content) {
    if (!content?.querySelectorAll) return false;
    if (content.dataset?.nostrodomusNativeHighlightSyntax !== VERSION) return false;
    const root = content.getRootNode?.();
    return !!root?.querySelector?.(`#${CODEMIRROR_NATIVE_HIGHLIGHT_BASE_STYLE_ID}`);
  }

  return {
    buildCodeMirrorNativeHighlightBaseCss,
    installCodeMirrorNativeHighlightBaseStyle,
    installCodeMirrorNativeHighlightSyntax,
    scheduleNativeHighlightForActiveEditor,
    cancelSyntaxRecoveryTimersForNativeHighlight,
    suppressLegacySyntaxRecoveryForNativeHighlight,
    editorUsesCodeMirrorNativeHighlightSyntax,
    nativeHighlightSyntaxContentPainted,
  };
}
