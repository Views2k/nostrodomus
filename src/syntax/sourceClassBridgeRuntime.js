// CodeMirror source-class bridge owner for Nostrodomus syntax runtime.
//
// This module owns the small browser-bridge adapter that turns Home Assistant's
// active CodeMirror editor surface into the parts syntaxRuntime needs for
// source-class styling. It intentionally keeps actual syntax painting in
// src/syntax/syntaxRuntime.js.

/**
 * @param {{
 *   W?: any,
 *   styleEditorFromNode?: (node: any) => any,
 *   composedContains?: (host: any, node: any) => boolean,
 * }} [deps]
 */
export function createSourceClassBridgeRuntime({
  W = globalThis,
  styleEditorFromNode = () => null,
  composedContains = () => false,
} = {}) {
  function cssEscapeSelectorPart(value) {
    try {
      if (W?.CSS?.escape) return W.CSS.escape(String(value));
    } catch { /* injected window stub */ }
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function bridgeActiveForStyleEditor(editor) {
    if (!editor?.querySelector) return null;
    const bridgeActive = (() => {
      try {
        return W?.__nostrodomusEditorBridgeV1?.active?.() || null;
      } catch {
        return null;
      }
    })();
    if (!bridgeActive) return null;
    const bridgedEditor = styleEditorFromNode(bridgeActive.cmEditor) ||
      styleEditorFromNode(bridgeActive.cmScroller) ||
      styleEditorFromNode(bridgeActive.cmContent) ||
      styleEditorFromNode(bridgeActive.codeEditor);
    if (!bridgedEditor) return null;
    if (bridgedEditor === editor || composedContains(bridgedEditor, editor) || composedContains(editor, bridgedEditor)) return bridgeActive;
    if (bridgeActive.cmContent && composedContains(editor, bridgeActive.cmContent)) return bridgeActive;
    return null;
  }

  function codeMirrorViewCandidate(value) {
    return value && typeof value === 'object' && typeof value.dispatch === 'function' && !!value.state;
  }

  function firstCodeMirrorViewCandidate(...values) {
    for (const value of values) {
      if (codeMirrorViewCandidate(value)) return value;
    }
    return null;
  }

  function codeMirrorModuleCandidate(value) {
    return !!value && typeof value === 'object'
      && !!value.tags && !!value.HighlightStyle && typeof value.syntaxHighlighting === 'function';
  }

  // The HA-loaded CodeMirror module (tags + highlight API) used to be read only as ._loadedCodeMirror
  // off three objects -- one rename of that private field zeroed every read at once. Keep the
  // conventional field as the fast path, then fall back to a field-name-independent probe that finds
  // the module by its CodeMirror 6 highlight-API shape, so a single rename no longer takes out the
  // sole acquisition path.
  function probeCodeMirrorModule(...sources) {
    for (const source of sources) {
      const known = source && typeof source === 'object' ? source._loadedCodeMirror : null;
      if (known) return known;
    }
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      let keys = [];
      try { keys = Object.keys(source); } catch { keys = []; }
      for (const key of keys) {
        if (key === '_loadedCodeMirror') continue;
        let value = null;
        try { value = source[key]; } catch { value = null; }
        if (codeMirrorModuleCandidate(value)) return value;
      }
    }
    return null;
  }

  function codeMirrorSourceClassParts(editor) {
    if (!editor?.querySelector) return null;
    const bridgeActive = bridgeActiveForStyleEditor(editor);
    const bridgeCodeEditor = bridgeActive?.codeEditor || null;
    const root = editor.getRootNode?.() || null;
    const host = root?.host || editor.closest?.('ha-code-editor') || bridgeCodeEditor || null;
    const cm = probeCodeMirrorModule(host, editor, bridgeCodeEditor);
    const view = firstCodeMirrorViewCandidate(
      host?.codemirror,
      host?.view,
      host?.editorView,
      editor.codemirror,
      editor.view,
      editor.editorView,
      bridgeCodeEditor?.codemirror,
      bridgeCodeEditor?.view,
      bridgeCodeEditor?.editorView,
    );
    const tags = cm?.tags || null;
    if (!root || !cm || !view?.state || !tags) return null;
    const content = editor.querySelector?.('.cm-content') || bridgeActive?.cmContent || null;
    if (!content) return null;
    return { root, host, cm, view, tags, content };
  }

  return {
    cssEscapeSelectorPart,
    bridgeActiveForStyleEditor,
    codeMirrorViewCandidate,
    firstCodeMirrorViewCandidate,
    codeMirrorModuleCandidate,
    probeCodeMirrorModule,
    codeMirrorSourceClassParts,
  };
}
