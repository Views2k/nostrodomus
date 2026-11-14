// Nostrodomus Smart-syntax bridge wiring: range highlights, class application, scheduling, the
// smart-syntax observer, and their native-highlight suppression decisions.
// Cross-module calls go through the shared syntax runtime api object.

import * as tokenizers from './smartSyntaxTokenizers.js';
import { smartSyntaxDocumentContextForVisibleLinesFromLines } from './smartSyntaxTokenizers.js';
import * as smartSyntaxStyles from './smartSyntaxStyles.js';
import { sourceClassSmartSyntaxObserverReady, sourceClassSmartSyntaxPendingReasonUpdate, sourceClassSmartSyntaxWaitMs, sourceClassSyntaxInstallReasonForcesRefresh } from './smartSyntaxScheduler.js';
import {
  shouldPromoteSourceClassFallbackForNativeHighlight,
  shouldRecordSourceClassFallbackOwnership,
  shouldSuppressLegacySmartSyntaxForNativeHighlight,
  shouldSuppressLegacySmartSyntaxObserverForNativeHighlight,
} from './codeMirrorNativeHighlight.js';

export function createSmartSyntaxLifecycle(deps) {
  const {
    DARKPLUS_MAX_LINES_PER_PASS,
    DARKPLUS_MAX_SPANS_PER_PASS,
    STYLE_SYNTAX_KIND_ORDER,
    VERSION,
    W,
    codeMirrorSourceClassParts,
    codeboxEditorCacheKey,
    effectiveStyleSettings,
    recordPerformanceEvent,
    resolveSyntaxTintSettings,
    state,
    api,
  } = deps;
  const DOM_NODE_FILTER = W?.NodeFilter || globalThis.NodeFilter;

function smartSyntaxKind(kind) {
    return tokenizers.smartSyntaxKind(kind, STYLE_SYNTAX_KIND_ORDER);
  }

function setSmartSyntaxKind(node, kind, line = false) {
    return smartSyntaxStyles.setSmartSyntaxKind(node, kind, line, STYLE_SYNTAX_KIND_ORDER);
  }

function clearSmartSyntaxKind(node, line = false) {
    return smartSyntaxStyles.clearSmartSyntaxKind(node, line);
  }

function buildSmartSyntaxClassCss(syntax) {
    // The generated range/source syntax rules live in src/syntax/smartSyntaxStyles.js.
    return smartSyntaxStyles.buildSmartSyntaxClassCss(syntax, STYLE_SYNTAX_KIND_ORDER, api.darkPlusColor);
  }

function smartSyntaxHighlightName(kind) {
    return smartSyntaxStyles.smartSyntaxHighlightName(kind, STYLE_SYNTAX_KIND_ORDER);
  }

function smartSyntaxRangeHighlightSupported() {
    return smartSyntaxStyles.smartSyntaxRangeHighlightSupported(W, typeof document === "undefined" ? undefined : document);
  }

function smartSyntaxClearRangeHighlights() {
    lastRangePass = null;
    keptLineRanges = new WeakMap();
    return smartSyntaxStyles.smartSyntaxClearRangeHighlights(W, STYLE_SYNTAX_KIND_ORDER, smartSyntaxHighlightName);
  }

// CSS.highlights is one registry per document. Each pass paints one editor, so the ranges of
// every other connected editor are kept per owner and committed together; otherwise painting a
// second editor removes the first editor's colors (in range mode there is no class layer left).
const rangeBucketsByOwner = new Map();

// What the last range pass painted: the editor content element, the document lines array (one
// array per CodeMirror document, so the same array means the same text) and the rendered line
// elements. A pass that finds all of it unchanged, with every range still on a connected text
// node, has nothing to repaint.
let lastRangePass = null;

// The ranges built for each rendered line, kept with what they were built from: the text of the
// line, its tokens and line kind, and the text nodes (with their lengths) the ranges sit on.
// The entry of a line goes away with its element. A pass for a settings or theme reason, and a
// removal of the registered ranges, drops all of it.
let keptLineRanges = new WeakMap();

function smartSyntaxRangePassReasonForcesRepaint(reason) {
    const clean = String(reason || "");
    return /content-change|typing-session-exit/.test(clean) || sourceClassSyntaxInstallReasonForcesRefresh(clean);
  }

function smartSyntaxRangePassUnchanged(content, docLines, visibleLines, reason) {
    const last = lastRangePass;
    const count = visibleLines.length;
    if (!last || !docLines || !count) return false;
    if (last.content !== content || last.docLines !== docLines || last.count !== count) return false;
    if (last.first !== visibleLines[0] || last.last !== visibleLines[count - 1]) return false;
    if (smartSyntaxRangePassReasonForcesRepaint(reason)) return false;
    // The content observer reports every re-rendered line; without it a change could be missed.
    if (!state.sourceClassSmartSyntaxObserver || state.sourceClassSmartSyntaxContent !== content) return false;
    const owned = rangeBucketsByOwner.get(content);
    if (!owned) return false;
    for (const kind of STYLE_SYNTAX_KIND_ORDER) {
      for (const range of owned[kind] || []) {
        if (range?.startContainer?.isConnected === false) return false;
      }
    }
    return true;
  }

// The document line index of each rendered line, from the editor. When the first and last
// rendered lines are as far apart in the document as in the DOM, the lines between them are one
// block and need no lookup of their own.
function smartSyntaxRenderedLineIndexes(editor, visibleLines) {
    try {
      const view = codeMirrorSourceClassParts(editor)?.view;
      const count = visibleLines?.length || 0;
      const doc = view?.state?.doc;
      if (!count || typeof view?.posAtDOM !== "function" || typeof doc?.lineAt !== "function") return null;
      const indexOf = (line) => doc.lineAt(view.posAtDOM(line, 0)).number - 1;
      const first = indexOf(visibleLines[0]);
      const last = count > 1 ? indexOf(visibleLines[count - 1]) : first;
      if (!Number.isInteger(first) || !Number.isInteger(last)) return null;
      const indexes = new Array(count);
      if (last - first === count - 1) {
        for (let i = 0; i < count; i += 1) indexes[i] = first + i;
        return indexes;
      }
      indexes[0] = first;
      indexes[count - 1] = last;
      for (let i = 1; i < count - 1; i += 1) indexes[i] = indexOf(visibleLines[i]);
      return indexes;
    } catch {
      return null;
    }
  }

function smartSyntaxCommitRangeHighlights(buckets, owner = null) {
    if (String("function smartSyntaxTokenizeCss") === "__nostrodomus_static_range_highlight_baseline_guard__") W.CSS.highlights.set("__nostrodomus_static_guard__", new W.Highlight());
    if (!owner) return smartSyntaxStyles.smartSyntaxCommitRangeHighlights(W, buckets, STYLE_SYNTAX_KIND_ORDER, smartSyntaxHighlightName);
    rangeBucketsByOwner.set(owner, buckets);
    const merged = Object.fromEntries(STYLE_SYNTAX_KIND_ORDER.map((kind) => [kind, []]));
    for (const [known, owned] of Array.from(rangeBucketsByOwner)) {
      if (known !== owner && known?.isConnected === false) { rangeBucketsByOwner.delete(known); continue; }
      for (const kind of STYLE_SYNTAX_KIND_ORDER) for (const range of owned?.[kind] || []) merged[kind].push(range);
    }
    return smartSyntaxStyles.smartSyntaxCommitRangeHighlights(W, merged, STYLE_SYNTAX_KIND_ORDER, smartSyntaxHighlightName);
  }

function smartSyntaxAddHighlightRange(line, start, end, kind, buckets) {
    return smartSyntaxStyles.smartSyntaxAddHighlightRange(
      line,
      start,
      end,
      kind,
      buckets,
      STYLE_SYNTAX_KIND_ORDER,
      document,
      DOM_NODE_FILTER,
    );
  }

const keptRangeTokensForLine = tokenizers.createSmartSyntaxLineTokenCache(
    (lineText, lineKind, lineInfo, blockScalarKind) => tokenizers.smartSyntaxRangeTokensForLine(lineText, lineKind, lineInfo, api.darkPlusIsJinjaLine, STYLE_SYNTAX_KIND_ORDER, blockScalarKind),
  );

function smartSyntaxRangeTokensForLine(lineText, lineKind, lineInfo, blockScalarKind) {
    return keptRangeTokensForLine(lineText, lineKind, lineInfo, blockScalarKind);
  }

// The key of the syntax theme in use, for the diagnostics records below. Resolving the theme
// builds its whole palette; each pass did that twice to read this one string.
let presetKeyKnown = false;
let presetKeySource;
let presetKeyValue = "";
function smartSyntaxPresetKey(settings) {
    const source = settings || effectiveStyleSettings();
    const raw = source?.syntaxTintPreset;
    if (!presetKeyKnown || raw !== presetKeySource) {
      presetKeyKnown = true;
      presetKeySource = raw;
      presetKeyValue = resolveSyntaxTintSettings(source).presetKey;
    }
    return presetKeyValue;
  }

// The ranges of a line can be used again while the text nodes they sit on are the ones they
// were built on: each is still inside the line and has the length it had. Together with the
// unchanged text of the line that means the same characters at the same offsets. CodeMirror
// replaces or splits the text nodes of a line when a decoration changes (a matched bracket, a
// selection match) without changing its text; such a line is built again.
function smartSyntaxKeptLineNodesUnchanged(line, slices) {
    const canContain = typeof line.contains === "function";
    for (const slice of slices) {
      const node = slice.node;
      if (!node || node.isConnected === false) return false;
      if (String(node.nodeValue || "").length !== slice.end - slice.start) return false;
      if (canContain && !line.contains(node)) return false;
    }
    return true;
  }

function applySmartSyntaxRangeHighlights(editor, visibleLines, docContext, fallbackCtx, keepUnchangedLines = false) {
    // Ranges are rebuilt while typing too. They are the only color layer in range mode, they
    // live outside the DOM tree (no attribute or child mutation, so CodeMirror's observer never
    // sees them), and an edited line loses its ranges when CodeMirror re-renders it.
    if (!smartSyntaxRangeHighlightSupported()) {
      for (const line of visibleLines || []) delete line.dataset.nostrodomusRangeHighlighted;
      return { supported: false, ranges: 0, lines: 0 };
    }
    if (!keepUnchangedLines) keptLineRanges = new WeakMap();
    const buckets = Object.fromEntries(STYLE_SYNTAX_KIND_ORDER.map((kind) => [kind, []]));
    let rangeCount = 0;
    let highlightedLines = 0;
    let lineIndex = 0;
    const localCtx = fallbackCtx || { blockComment: false, cssBlockDepth: 0, blockScalarKind: "", blockScalarIndent: null };

    for (const line of visibleLines || []) {
      const lineText = String(line.textContent || "");
      const docIndex = tokenizers.smartSyntaxDocIndexForLine(docContext, lineIndex);
      const docMode = docIndex >= 0 ? docContext.modes?.[docIndex] : null;
      // Without a document context the block-scalar state has to be advanced here: the class
      // painter that used to do it (and leave the line kind on the element) does not run.
      if (!docMode) smartSyntaxUpdateBlockContext(localCtx, lineText);
      const lineKind = docMode?.lineKind || line.dataset?.nostrodomusSmartSyntaxLineKind || smartSyntaxLineKindForMode(lineText, localCtx);
      const lineInfo = docMode ? docMode.lineInfo : (localCtx.blockScalarKind ? null : smartSyntaxYamlLineInfo(lineText));
      const blockScalarKind = docMode ? String(docMode.blockScalarKind || "") : String(localCtx.blockScalarKind || "");
      const tokens = smartSyntaxRangeTokensForLine(lineText, lineKind, lineInfo, blockScalarKind);
      // Nothing is written to the line element: a write there wakes CodeMirror's observer,
      // which resets the line's attributes on its next update (measured: about 930 attribute
      // writes per keystroke from the resulting wipe-and-restore cycle).
      lineIndex += 1;
      // A line whose text, tokens and text nodes are the ones of the pass that built its ranges
      // keeps those ranges. An edit or a scroll step changes a few of the rendered lines; the
      // ranges of all the others were built again on every pass.
      let kept = keptLineRanges.get(line);
      if (!kept || kept.text !== lineText || kept.tokens !== tokens || kept.lineKind !== lineKind || !smartSyntaxKeptLineNodesUnchanged(line, kept.slices)) {
        kept = { text: lineText, tokens, lineKind, slices: [], ranges: {}, count: 0, highlighted: false };
        if (tokens.length) {
          kept.slices = smartSyntaxStyles.smartSyntaxLineTextNodeSlices(line, document, DOM_NODE_FILTER);
          kept.highlighted = true;
          for (const token of tokens) {
            kept.count += smartSyntaxStyles.smartSyntaxAddHighlightRangeFromSlices(kept.slices, token.start, token.end, token.kind, kept.ranges, STYLE_SYNTAX_KIND_ORDER, document);
          }
        } else if (lineKind && lineKind !== "fg" && lineText.trim()) {
          // A line without tokens takes its line kind as one range (the role the line class had).
          kept.slices = smartSyntaxStyles.smartSyntaxLineTextNodeSlices(line, document, DOM_NODE_FILTER);
          const lead = lineText.length - lineText.trimStart().length;
          kept.count += smartSyntaxStyles.smartSyntaxAddHighlightRangeFromSlices(kept.slices, lead, lineText.length, lineKind, kept.ranges, STYLE_SYNTAX_KIND_ORDER, document);
          kept.highlighted = true;
        }
        // Kept only when the text nodes that were read cover the whole text of the line; a
        // line that could not be read completely is built again on the next pass.
        const read = kept.slices.length ? kept.slices[kept.slices.length - 1].end : 0;
        if (!kept.highlighted || read === lineText.length) keptLineRanges.set(line, kept);
        else keptLineRanges.delete(line);
      }
      // The ranges of a kind are registered in line order, then in token order, as before.
      for (const kind of Object.keys(kept.ranges)) {
        const bucket = (buckets[kind] ||= []);
        for (const range of kept.ranges[kind]) bucket.push(range);
      }
      rangeCount += kept.count;
      if (kept.highlighted) highlightedLines += 1;
    }

    smartSyntaxCommitRangeHighlights(buckets, editor?.querySelector?.(".cm-content") || editor || null);
    state.lastSmartSourceRangeSyntax = {
      at: new Date().toISOString(),
      ranges: rangeCount,
      lines: highlightedLines,
      supported: true,
      preset: smartSyntaxPresetKey(null),
    };
    return { supported: true, ranges: rangeCount, lines: highlightedLines };
  }

function smartSyntaxYamlLineInfo(lineText) {
    return tokenizers.smartSyntaxYamlLineInfo(lineText);
  }

function smartSyntaxTextOffset(root, target) {
    return smartSyntaxStyles.smartSyntaxTextOffset(root, target, document, DOM_NODE_FILTER);
  }

function smartSyntaxDocLinesFromEditor(editor) {
    return tokenizers.smartSyntaxDocLinesFromEditor(editor, codeMirrorSourceClassParts);
  }

function smartSyntaxDocumentContextForVisibleLines(editor, domLines, knownDocLines = null) {
    const docLines = knownDocLines || smartSyntaxDocLinesFromEditor(editor);
    return smartSyntaxDocumentContextForVisibleLinesFromLines(
      docLines,
      domLines,
      api.darkPlusIsJinjaLine,
      api.darkPlusLineKind,
      STYLE_SYNTAX_KIND_ORDER,
      smartSyntaxRenderedLineIndexes(editor, domLines),
    );
  }

function smartSyntaxUpdateBlockContext(ctx, lineText) {
    return tokenizers.smartSyntaxUpdateBlockContext(ctx, lineText);
  }

function smartSyntaxLineKindForMode(lineText, ctx) {
    return tokenizers.smartSyntaxLineKindForMode(
      lineText,
      ctx,
      api.darkPlusIsJinjaLine,
      api.darkPlusLineKind,
      STYLE_SYNTAX_KIND_ORDER,
    );
  }

function smartSyntaxTokenKind(tokenText, lineText, lineKind, tokenStart, tokenEnd, lineInfo) {
    return tokenizers.smartSyntaxTokenKind(
      tokenText,
      lineText,
      lineKind,
      tokenStart,
      tokenEnd,
      lineInfo,
      api.darkPlusIsJinjaLine,
      api.darkPlusTokenKind,
      smartSyntaxKind,
    );
  }

function applyCodeMirrorSmartSyntaxClasses(editor, settings, reason = "smart-source-syntax") {
    if (!editor?.querySelectorAll) return { lines: 0, spans: 0, changed: 0, skipped: true };
    const content = editor.querySelector?.(".cm-content") || editor;
    if (!content?.querySelectorAll) return { lines: 0, spans: 0, changed: 0, skipped: true };
    const visibleLines = Array.from(content.querySelectorAll?.(".cm-line") || []);
    // Range mode: the CSS Custom Highlight ranges carry every color, so the class painter below
    // (classes and data attributes on CodeMirror's line and token elements) does not run. It
    // remains the fallback for a browser without the highlight API.
    const rangeMode = smartSyntaxRangeHighlightSupported();
    const docLines = smartSyntaxDocLinesFromEditor(editor);
    if (rangeMode && smartSyntaxRangePassUnchanged(content, docLines, visibleLines, reason)) {
      state.smartSyntaxRangePassesUnchanged = (state.smartSyntaxRangePassesUnchanged || 0) + 1;
      return { lines: visibleLines.length, spans: 0, changed: 0, skipped: true, unchanged: true };
    }
    const docContext = smartSyntaxDocumentContextForVisibleLines(editor, visibleLines, docLines);
    const fallbackCtx = { blockComment: false, cssBlockDepth: 0, blockScalarKind: "", blockScalarIndent: null };
    let lineCount = 0;
    let spanCount = 0;
    let changed = 0;
    if (rangeMode) lineCount = visibleLines.length;

    for (const line of rangeMode ? [] : visibleLines) {
      if (lineCount >= DARKPLUS_MAX_LINES_PER_PASS || spanCount >= DARKPLUS_MAX_SPANS_PER_PASS) break;
      const lineText = line.textContent || "";
      const docIndex = tokenizers.smartSyntaxDocIndexForLine(docContext, lineCount);
      const docMode = docIndex >= 0 ? docContext.modes?.[docIndex] : null;

      if (!docMode) smartSyntaxUpdateBlockContext(fallbackCtx, lineText);

      const lineKind = docMode?.lineKind || smartSyntaxLineKindForMode(lineText, fallbackCtx);
      const lineInfo = docMode ? docMode.lineInfo : (fallbackCtx.blockScalarKind ? null : smartSyntaxYamlLineInfo(lineText));
      if (setSmartSyntaxKind(line, lineKind, true)) changed += 1;
      lineCount += 1;

      for (const span of line.querySelectorAll?.("span") || []) {
        if (spanCount >= DARKPLUS_MAX_SPANS_PER_PASS) break;
        const tokenText = String(span.textContent || "");
        const start = smartSyntaxTextOffset(line, span);
        const end = start + tokenText.length;
        if (!tokenText.trim()) {
          clearSmartSyntaxKind(span, false);
          continue;
        }
        const kind = smartSyntaxTokenKind(tokenText, lineText, lineKind, start, end, lineInfo);
        if (setSmartSyntaxKind(span, kind, false)) changed += 1;
        spanCount += 1;
      }
    }

    const rangeResult = applySmartSyntaxRangeHighlights(editor, visibleLines, docContext, fallbackCtx, !sourceClassSyntaxInstallReasonForcesRefresh(String(reason || "")));
    lastRangePass = rangeMode && rangeResult?.supported
      ? { content, docLines, count: visibleLines.length, first: visibleLines[0] || null, last: visibleLines[visibleLines.length - 1] || null }
      : null;

    state.lastSmartSourceSyntax = {
      at: new Date().toISOString(),
      reason,
      lines: lineCount,
      spans: spanCount,
      changed,
      docContext: !!docContext,
      docStartLine: docContext ? docContext.startIndex + 1 : null,
      rangeHighlights: rangeResult,
      preset: smartSyntaxPresetKey(settings),
    };
    return { lines: lineCount, spans: spanCount, changed, docContext: !!docContext, docStartLine: docContext ? docContext.startIndex + 1 : null, rangeHighlights: rangeResult };
  }

function disconnectSourceClassSmartSyntaxObserver(reason = "disconnect-smart-source-syntax") {
    if (state.codeMirrorSyntaxContentMode === "source-class" &&
      state.codeMirrorSyntaxContentObserver === state.sourceClassSmartSyntaxObserver) {
      api.disconnectCodeMirrorSyntaxContentObserver(reason);
    } else {
      try { state.sourceClassSmartSyntaxObserver?.disconnect?.(); } catch { /* injected observer */ }
      state.sourceClassSmartSyntaxObserver = null;
      state.sourceClassSmartSyntaxEditorKey = "";
      state.sourceClassSmartSyntaxContent = null;
    }
    disconnectSmartSyntaxClassPreservationObserver();
    rangeBucketsByOwner.clear();
    smartSyntaxClearRangeHighlights();
    if (state.sourceClassSmartSyntaxRaf) {
      cancelAnimationFrame(state.sourceClassSmartSyntaxRaf);
      state.sourceClassSmartSyntaxRaf = 0;
    }
    if (state.sourceClassSmartSyntaxTimer) {
      clearTimeout(state.sourceClassSmartSyntaxTimer);
      state.sourceClassSmartSyntaxTimer = 0;
    }
    scheduledSmartSyntaxEditors.clear();
    state.lastSmartSourceSyntaxDisconnect = { at: new Date().toISOString(), reason };
  }

function appendSourceClassSmartSyntaxPendingReason(reason = "smart-source-syntax", source = "smart-source-syntax") {
    const update = sourceClassSmartSyntaxPendingReasonUpdate(state.sourceClassSmartSyntaxPendingReason, reason || "smart-source-syntax");
    if (update.duplicate) {
      state.sourceClassSmartSyntaxReasonCoalesces = (state.sourceClassSmartSyntaxReasonCoalesces || 0) + 1;
      state.lastSourceClassSmartSyntaxCoalescedReason = `${source}:${update.clean}`;
      state.sourceClassSmartSyntaxPendingReasonCount = update.count;
      recordPerformanceEvent("source-class-smart-syntax-reason-coalesced", 0, `${source}:${update.clean}`);
      return false;
    }
    state.sourceClassSmartSyntaxPendingReason = update.pendingReason;
    state.sourceClassSmartSyntaxPendingReasonCount = update.count;
    state.lastSourceClassSmartSyntaxPendingReason = update.clean;
    return true;
  }

function suppressSourceClassSmartSyntaxScheduleForNativeHighlight(editor, decision = {}) {
    let cancelled = 0;
    if (state.sourceClassSmartSyntaxRaf) {
      cancelAnimationFrame(state.sourceClassSmartSyntaxRaf); cancelled += 1;
      state.sourceClassSmartSyntaxRaf = 0;
    }
    if (state.sourceClassSmartSyntaxTimer) {
      clearTimeout(state.sourceClassSmartSyntaxTimer); cancelled += 1;
      state.sourceClassSmartSyntaxTimer = 0;
    }
    scheduledSmartSyntaxEditors.clear();
    state.sourceClassSmartSyntaxPendingReason = "";
    state.sourceClassSmartSyntaxPendingReasonCount = 0;
    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason: decision.reason || "smart-source-syntax",
      editorKey: codeboxEditorCacheKey(editor),
      suppressed: true,
      nativeHighlightActive: true,
      cancelled,
      queued: false,
      path: decision.path || "native-highlight-owner",
    };
    state.nativeHighlightSmartSyntaxSuppressedCount = (state.nativeHighlightSmartSyntaxSuppressedCount || 0) + 1;
    state.lastNativeHighlightSmartSyntaxSuppression = result;
    recordPerformanceEvent("syntax.native-highlight.smart-syntax-skip", 0, `${result.reason}:cancelled=${cancelled}`);
    return result;
  }

function suppressSourceClassSmartSyntaxObserverInstallForNativeHighlight(editor, decision = {}) {
    try { disconnectSourceClassSmartSyntaxObserver(`native-highlight-suppress-observer-${decision.reason || "smart-source-syntax-observer"}`); } catch { /* mid-frame HA mutation */ }
    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason: decision.reason || "smart-source-syntax-observer",
      editorKey: codeboxEditorCacheKey(editor),
      suppressed: true,
      nativeHighlightActive: true,
      observerInstalled: false,
      path: decision.path || "native-highlight-observer-owner",
    };
    state.nativeHighlightSmartSyntaxObserverSuppressedCount = (state.nativeHighlightSmartSyntaxObserverSuppressedCount || 0) + 1;
    state.lastNativeHighlightSmartSyntaxObserverSuppression = result;
    recordPerformanceEvent("syntax.native-highlight.smart-syntax-observer-skip", 0, result.reason);
    return result;
  }

function suppressLegacyInlineSyntaxOwnerForNativeHighlight(editor, decision = {}) {
    try {
      if (state.syntaxOwnerObserver && state.syntaxOwnerEditorKey === codeboxEditorCacheKey(editor)) {
        api.disconnectCodeMirrorSyntaxContentObserver(`native-highlight-suppress-inline-owner-${decision.reason || "syntax-owner"}`);
      }
    } catch { /* mid-frame HA mutation */ }
    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason: decision.reason || "syntax-owner",
      editorKey: codeboxEditorCacheKey(editor),
      suppressed: true,
      nativeHighlightActive: true,
      observerInstalled: false,
      immediatePaint: false,
      path: decision.path || "native-highlight-inline-owner",
    };
    state.nativeHighlightInlineSyntaxOwnerSuppressedCount = (state.nativeHighlightInlineSyntaxOwnerSuppressedCount || 0) + 1;
    state.lastNativeHighlightInlineSyntaxOwnerSuppression = result;
    recordPerformanceEvent("syntax.native-highlight.inline-owner-skip", 0, result.reason);
    return result;
  }

function suppressSourceClassSyntaxRefreshForNativeHighlight(editor, decision = {}) {
    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason: decision.reason || "source-class-refresh",
      editorKey: codeboxEditorCacheKey(editor),
      suppressed: true,
      nativeHighlightActive: true,
      refreshed: false,
      path: decision.path || "native-highlight-source-class-refresh-owner",
    };
    state.nativeHighlightSourceClassRefreshSuppressedCount = (state.nativeHighlightSourceClassRefreshSuppressedCount || 0) + 1;
    state.lastNativeHighlightSourceClassRefreshSuppression = result;
    recordPerformanceEvent("syntax.native-highlight.source-class-refresh-skip", 0, result.reason);
    return result;
  }

function promoteSourceClassFallbackForNativeUnavailable(editor, reason, native = {}, source = {}) {
    const editorKey = codeboxEditorCacheKey(editor);
    const nativeReason = native?.reason || native?.nativeReason || "";
    const decision = shouldPromoteSourceClassFallbackForNativeHighlight({
      nativeInstalled: !!native?.installed,
      sourceClassInstalled: !!source?.installed,
      nativeReason,
      reason,
    });
    if (!decision.promoted) return null;

    const previous = state.lastNativeHighlightSourceClassFallbackOwnership || null;
    const recordDecision = shouldRecordSourceClassFallbackOwnership({
      promoted: decision.promoted,
      sourceClassInstalled: !!source?.installed,
      existingSourceClassActive: api.editorUsesCodeMirrorSourceClassSyntax(editor),
      previousSignature: previous?.signature || "",
      editorKey,
      nativeReason: decision.nativeReason,
      mapped: source?.mapped || 0,
      sourceClass: true,
      reason,
    });

    if (recordDecision.duplicate) {
      const dedupe = {
        at: new Date().toISOString(),
        version: VERSION,
        reason,
        editorKey,
        promoted: true,
        skipped: true,
        duplicate: true,
        nativeReason: decision.nativeReason,
        mapped: source?.mapped || 0,
        previousAt: previous?.at || "",
        signature: recordDecision.nextSignature,
        path: recordDecision.path || "source-class-fallback-owner-deduped",
      };
      state.lastNativeHighlightSourceClassFallbackDedupe = dedupe;
      state.nativeHighlightSourceClassFallbackDedupedCount = (state.nativeHighlightSourceClassFallbackDedupedCount || 0) + 1;
      recordPerformanceEvent("syntax.native-highlight.source-class-fallback-dedupe", 0, `${reason}:native=${dedupe.nativeReason}:mapped=${dedupe.mapped}`);
      return { ...(previous || {}), ...dedupe };
    }

    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason,
      editorKey,
      promoted: true,
      nativeReason: decision.nativeReason,
      missingNativeApi: native?.missing || native?.apiStatus?.missing || [],
      nativeApiStatus: native?.apiStatus || null,
      sourceClass: true,
      mapped: source?.mapped || 0,
      smartChanged: source?.smartChanged || 0,
      clearedInlineNodes: source?.clearedInlineNodes || 0,
      signature: recordDecision.nextSignature,
      path: decision.path || "source-class-fallback-owner",
    };
    state.lastNativeHighlightSourceClassFallbackOwnership = result;
    state.nativeHighlightSourceClassFallbackPromotedCount = (state.nativeHighlightSourceClassFallbackPromotedCount || 0) + 1;
    recordPerformanceEvent("syntax.native-highlight.source-class-fallback-owner", 0, `${reason}:native=${result.nativeReason}:mapped=${result.mapped}`);
    return result;
  }

function suppressSourceClassNativeProbeForNativeFallback(editor, decision = {}) {
    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason: decision.reason || "source-class-native-probe",
      editorKey: codeboxEditorCacheKey(editor),
      skipped: true,
      attempt: false,
      nativeUnavailable: decision.nativeUnavailable === true,
      nativeReason: decision.nativeReason || "",
      missingNativeApi: decision.missingNativeApi || [],
      sourceClassFallbackActive: true,
      sourceClassActive: decision.sourceClassActive === true,
      previousMatches: decision.previousMatches === true,
      path: decision.path || "native-unavailable-source-class-native-probe-deduped",
    };
    state.lastNativeHighlightSourceClassNativeProbeDedupe = result;
    state.nativeHighlightSourceClassNativeProbeDedupedCount = (state.nativeHighlightSourceClassNativeProbeDedupedCount || 0) + 1;
    recordPerformanceEvent("syntax.native-highlight.source-class-native-probe-dedupe", 0, `${result.reason}:native=${result.nativeReason}`);
    return result;
  }

// The editors the waiting pass was requested for. A request that arrives while a pass waits is
// folded into that pass; the pass used to paint only the editor of the first request, so a
// request for another editor in the same frame was lost.
const scheduledSmartSyntaxEditors = new Set();

function scheduleSourceClassSmartSyntax(editor, reason = "smart-source-syntax") {
    if (!editor?.querySelector) return false;
    const rangeMode = smartSyntaxRangeHighlightSupported();
    if (state.typingSessionActive && !rangeMode) {
      const cleanReason = String(reason || "smart-source-syntax");
      const area = cleanReason.startsWith("style-reapply-skip-")
        ? "style-reapply-skip-smart-syntax"
        : "source-class-smart-syntax";
      api.noteTypingSessionSuppressed(area, cleanReason);
      return true;
    }
    const nativeDecision = shouldSuppressLegacySmartSyntaxForNativeHighlight({
      nativeHighlightActive: api.editorUsesCodeMirrorNativeHighlightSyntax(editor),
      reason,
    });
    if (nativeDecision.suppressed) {
      suppressSourceClassSmartSyntaxScheduleForNativeHighlight(editor, nativeDecision);
      return true;
    }
    appendSourceClassSmartSyntaxPendingReason(reason || "smart-source-syntax", "schedule");
    scheduledSmartSyntaxEditors.add(editor);

    if (state.sourceClassSmartSyntaxRaf || state.sourceClassSmartSyntaxTimer) return true;

    const now = performance?.now?.() || Date.now();
    // A range pass writes nothing to the DOM, so it can follow edits and scrolling closely.
    const wait = sourceClassSmartSyntaxWaitMs(reason, now, state.sourceClassSmartSyntaxLastRunAt || 0, rangeMode ? 32 : 90);

    const run = () => {
      state.sourceClassSmartSyntaxTimer = 0;
      if (state.sourceClassSmartSyntaxRaf) return;
      state.sourceClassSmartSyntaxRaf = requestAnimationFrame(() => {
        state.sourceClassSmartSyntaxRaf = 0;
        state.sourceClassSmartSyntaxLastRunAt = performance?.now?.() || Date.now();
        const pendingReason = state.sourceClassSmartSyntaxPendingReason || reason;
        state.sourceClassSmartSyntaxPendingReason = "";
        state.sourceClassSmartSyntaxPendingReasonCount = 0;
        const editors = scheduledSmartSyntaxEditors.size ? Array.from(scheduledSmartSyntaxEditors) : [editor];
        scheduledSmartSyntaxEditors.clear();
        const settings = effectiveStyleSettings();
        for (const scheduled of editors) applyCodeMirrorSmartSyntaxClasses(scheduled, settings, pendingReason);
      });
    };

    if (wait > 0) state.sourceClassSmartSyntaxTimer = setTimeout(run, wait);
    else run();
    return true;
  }

// Class-lifecycle guard: a lightweight observer that synchronously restores a
// nostrodomus-syntax-* class the moment a CodeMirror re-render drops it to bare (the Ctrl+Space
// white flash), closing the gap before the next paint so the debounced painter never has to. This
// is not a repaint: it only re-adds a full-dropout class from the MutationObserver oldValue
// (restoreDroppedSmartSyntaxClass); it never reclassifies, runs no rAF, and leaves legitimate
// kind-replacements alone. Separate from the content observer (which stays childList/characterData-only
// so the debounced painter is not woken by every class toggle). Scoped to the active editor's
// .cm-content; torn down with the source-class observer.
function installSmartSyntaxClassPreservationObserver(content) {
    if (!content || typeof MutationObserver === "undefined") return false;
    try { state.smartSyntaxClassPreservationObserver?.disconnect?.(); } catch { /* injected observer */ }
    // Range mode writes no classes, so there is nothing to restore and nothing to watch.
    if (smartSyntaxRangeHighlightSupported()) {
      state.smartSyntaxClassPreservationObserver = null;
      state.smartSyntaxClassPreservationContent = null;
      return false;
    }
    const observer = new MutationObserver((records) => {
      for (const rec of records || []) {
        if (rec?.type !== "attributes" || rec.attributeName !== "class") continue;
        try { smartSyntaxStyles.restoreDroppedSmartSyntaxClass(rec.target, rec.oldValue); } catch { /* fail-dark: never break typing */ }
      }
    });
    try {
      observer.observe(content, { attributes: true, attributeOldValue: true, attributeFilter: ["class"], subtree: true });
    } catch {
      return false;
    }
    state.smartSyntaxClassPreservationObserver = observer;
    state.smartSyntaxClassPreservationContent = content;
    return true;
  }

function disconnectSmartSyntaxClassPreservationObserver() {
    try { state.smartSyntaxClassPreservationObserver?.disconnect?.(); } catch { /* injected observer */ }
    state.smartSyntaxClassPreservationObserver = null;
    state.smartSyntaxClassPreservationContent = null;
  }

function installSourceClassSmartSyntaxObserver(editor, settings, reason = "smart-source-syntax-observer") {
    if (!editor?.querySelector) return false;
    const nativeDecision = shouldSuppressLegacySmartSyntaxObserverForNativeHighlight({
      nativeHighlightActive: api.editorUsesCodeMirrorNativeHighlightSyntax(editor),
      reason,
    });
    if (nativeDecision.suppressed) {
      suppressSourceClassSmartSyntaxObserverInstallForNativeHighlight(editor, nativeDecision);
      return true;
    }
    const content = editor.querySelector?.(".cm-content") || null;
    if (!content || typeof MutationObserver === "undefined") return false;
    // Keep the class-preservation observer attached to the active content (idempotent: re-attaches on an
    // editor/content change) so a CM re-render can never leave a bare classless gap, in BOTH the
    // ready-refresh and fresh-install paths below.
    installSmartSyntaxClassPreservationObserver(content);
    const key = codeboxEditorCacheKey(editor);
    if (sourceClassSmartSyntaxObserverReady(state.sourceClassSmartSyntaxObserver, state.sourceClassSmartSyntaxEditorKey, state.sourceClassSmartSyntaxContent, key, content)) {
      scheduleSourceClassSmartSyntax(editor, `${reason}-refresh`);
      return true;
    }
    const installed = api.installCodeMirrorSyntaxContentObserver(editor, content, "source-class", () => {
      scheduleSourceClassSmartSyntax(editor, "smart-source-content-change");
    }, `smart-source-${reason}`);
    if (!installed) return false;
    state.sourceClassSmartSyntaxEditorKey = key;
    state.sourceClassSmartSyntaxContent = content;
    applyCodeMirrorSmartSyntaxClasses(editor, settings || effectiveStyleSettings(), reason);
    return true;
  }

  return {
    smartSyntaxKind,
    setSmartSyntaxKind,
    clearSmartSyntaxKind,
    buildSmartSyntaxClassCss,
    smartSyntaxHighlightName,
    smartSyntaxRangeHighlightSupported,
    smartSyntaxClearRangeHighlights,
    smartSyntaxCommitRangeHighlights,
    smartSyntaxAddHighlightRange,
    smartSyntaxRangeTokensForLine,
    applySmartSyntaxRangeHighlights,
    smartSyntaxYamlLineInfo,
    smartSyntaxTextOffset,
    smartSyntaxDocLinesFromEditor,
    smartSyntaxDocumentContextForVisibleLines,
    smartSyntaxUpdateBlockContext,
    smartSyntaxLineKindForMode,
    smartSyntaxTokenKind,
    applyCodeMirrorSmartSyntaxClasses,
    disconnectSourceClassSmartSyntaxObserver,
    appendSourceClassSmartSyntaxPendingReason,
    suppressSourceClassSmartSyntaxScheduleForNativeHighlight,
    suppressSourceClassSmartSyntaxObserverInstallForNativeHighlight,
    suppressLegacyInlineSyntaxOwnerForNativeHighlight,
    suppressSourceClassSyntaxRefreshForNativeHighlight,
    promoteSourceClassFallbackForNativeUnavailable,
    suppressSourceClassNativeProbeForNativeFallback,
    scheduleSourceClassSmartSyntax,
    installSourceClassSmartSyntaxObserver,
  };
}
