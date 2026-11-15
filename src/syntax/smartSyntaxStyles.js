// Nostrodomus smart syntax style/class helpers.
//
// Keep these helpers deterministic and dependency-injected. No browser storage,
// events, observers, timers, logging, network calls, or Home Assistant runtime reads.
// DOM-compatible helpers accept explicit document/NodeFilter handles from the
// wrapper so tests can characterize behavior without globals.

import { SMART_SYNTAX_KIND_ORDER, smartSyntaxKind } from "./smartSyntaxTokenizers.js";

export const SMART_SOURCE_SYNTAX_CLASS_PREFIX = "nostrodomus-syntax-kind-";
export const SMART_SOURCE_SYNTAX_LINE_CLASS_PREFIX = "nostrodomus-syntax-line-";
export const SMART_SOURCE_SYNTAX_HIGHLIGHT_PREFIX = "nostrodomus-source-syntax-";

export function smartSyntaxClassName(
  kind,
  order = SMART_SYNTAX_KIND_ORDER,
  prefix = SMART_SOURCE_SYNTAX_CLASS_PREFIX,
) {
  return `${prefix}${smartSyntaxKind(kind, order)}`;
}

export function smartSyntaxLineClassName(
  kind,
  order = SMART_SYNTAX_KIND_ORDER,
  prefix = SMART_SOURCE_SYNTAX_LINE_CLASS_PREFIX,
) {
  return `${prefix}${smartSyntaxKind(kind, order)}`;
}

export function smartSyntaxHighlightName(
  kind,
  order = SMART_SYNTAX_KIND_ORDER,
  prefix = SMART_SOURCE_SYNTAX_HIGHLIGHT_PREFIX,
) {
  return `${prefix}${smartSyntaxKind(kind, order)}`;
}

export function removeClassPrefix(node, prefix) {
  if (!node?.classList) return;
  for (const cls of Array.from(node.classList)) {
    if (String(cls || "").startsWith(prefix)) node.classList.remove(cls);
  }
}

export function setSmartSyntaxKind(node, kind, line = false, order = SMART_SYNTAX_KIND_ORDER) {
  if (!node?.classList) return false;
  const safeKind = smartSyntaxKind(kind, order);
  const attr = line ? "nostrodomusSmartSyntaxLineKind" : "nostrodomusSmartSyntaxKind";
  const prefix = line ? SMART_SOURCE_SYNTAX_LINE_CLASS_PREFIX : SMART_SOURCE_SYNTAX_CLASS_PREFIX;
  const nextClass = line ? smartSyntaxLineClassName(safeKind, order) : smartSyntaxClassName(safeKind, order);
  if (node.dataset?.[attr] === safeKind && node.classList.contains(nextClass)) return false;
  removeClassPrefix(node, prefix);
  node.classList.add(nextClass);
  if (node.dataset) node.dataset[attr] = safeKind;
  return true;
}

export function clearSmartSyntaxKind(node, line = false) {
  if (!node?.classList) return;
  removeClassPrefix(node, line ? SMART_SOURCE_SYNTAX_LINE_CLASS_PREFIX : SMART_SOURCE_SYNTAX_CLASS_PREFIX);
  if (node.dataset) {
    if (line) delete node.dataset.nostrodomusSmartSyntaxLineKind;
    else delete node.dataset.nostrodomusSmartSyntaxKind;
  }
}

// A CodeMirror re-render (the Ctrl+Space popup, for one) can reset the className of a .cm-line or
// token span and drop its nostrodomus-syntax-line-* or nostrodomus-syntax-kind-* class until the
// next pass. Given the element and its previous className (a MutationObserver oldValue), this puts
// the dropped class back when the element now has no class of that family. A kind change by
// setSmartSyntaxKind leaves a class of the family in place and is left alone. Returns true when a
// class was restored.
export function restoreDroppedSmartSyntaxClass(target, oldClassValue) {
  if (!target?.classList) return false;
  const isLine = typeof target.matches === "function" && target.matches(".cm-line");
  const isSpan = String(target.localName || "").toLowerCase() === "span";
  if (!isLine && !isSpan) return false;
  const prefix = isLine ? SMART_SOURCE_SYNTAX_LINE_CLASS_PREFIX : SMART_SOURCE_SYNTAX_CLASS_PREFIX;
  const dropped = String(oldClassValue || "").split(/\s+/).filter((c) => c.startsWith(prefix));
  if (!dropped.length) return false;
  const current = String(target.className || "").split(/\s+/);
  if (current.some((c) => c.startsWith(prefix))) return false; // still classified (kind replaced) — not a dropout
  let restored = false;
  for (const cls of dropped) {
    try {
      if (!target.classList.contains(cls)) {
        target.classList.add(cls);
        restored = true;
      }
    } catch { /* detached node */ }
  }
  return restored;
}

export function smartSyntaxRangeHighlightSupported(runtimeWindow = globalThis, doc = globalThis?.document) {
  try {
    return !!(
      runtimeWindow?.CSS?.highlights &&
      typeof runtimeWindow?.Highlight === "function" &&
      typeof doc?.createRange === "function"
    );
  } catch {
    return false;
  }
}

export function smartSyntaxClearRangeHighlights(
  runtimeWindow = globalThis,
  order = SMART_SYNTAX_KIND_ORDER,
  highlightName = (kind) => smartSyntaxHighlightName(kind, order),
) {
  try {
    const highlights = runtimeWindow?.CSS?.highlights;
    if (!highlights?.delete) return;
    for (const kind of order) highlights.delete(highlightName(kind));
  } catch { /* polyfilled highlights API */ }
}

export function smartSyntaxCommitRangeHighlights(
  runtimeWindow = globalThis,
  buckets = {},
  order = SMART_SYNTAX_KIND_ORDER,
  highlightName = (kind) => smartSyntaxHighlightName(kind, order),
) {
  try {
    const highlights = runtimeWindow?.CSS?.highlights;
    const HighlightCtor = runtimeWindow?.Highlight;
    if (!highlights || typeof HighlightCtor !== "function") return;
    for (const kind of order) {
      const name = highlightName(kind);
      try {
        const ranges = buckets?.[kind] || [];
        if (ranges.length) highlights.set(name, new HighlightCtor(...ranges));
        else highlights.delete(name);
      } catch { /* stale ranges */ }
    }
  } catch { /* stale ranges */ }
}

// Builds one highlight range. A StaticRange is used when the browser has it: a live Range
// (document.createRange) is registered with the document, and every DOM insertion or removal
// anywhere in the page then has to visit every live range to adjust its boundaries. With a few
// thousand syntax ranges alive, each rebuild of the card preview that Home Assistant does per
// keystroke cost about 75ms (measured: 2.2s of blocked main thread for 30 keystrokes with the
// ranges, none without them). A StaticRange is plain data and costs nothing on mutation. The
// painter never needs its ranges to follow the DOM: it builds new ones for a line whose text
// nodes changed.
function smartSyntaxCreateHighlightRange(node, startOffset, endOffset, doc = globalThis?.document) {
  const StaticRangeCtor = doc?.defaultView?.StaticRange || globalThis?.StaticRange;
  if (typeof StaticRangeCtor === "function") {
    return new StaticRangeCtor({ startContainer: node, startOffset, endContainer: node, endOffset });
  }
  const range = doc?.createRange?.();
  if (!range) return null;
  range.setStart(node, startOffset);
  range.setEnd(node, endOffset);
  return range;
}

export function smartSyntaxLineTextNodeSlices(
  line,
  doc = globalThis?.document,
  nodeFilter = globalThis?.NodeFilter,
) {
  const slices = [];
  if (!line || !doc?.createTreeWalker) return slices;
  let offset = 0;
  try {
    const walker = doc.createTreeWalker(line, nodeFilter?.SHOW_TEXT ?? 4, null);
    let node = walker.nextNode();
    while (node) {
      const length = String(node.nodeValue || "").length;
      if (length) slices.push({ node, start: offset, end: offset + length });
      offset += length;
      node = walker.nextNode();
    }
  } catch { /* detached node */ }
  return slices;
}

export function smartSyntaxAddHighlightRange(
  line,
  start,
  end,
  kind,
  buckets,
  order = SMART_SYNTAX_KIND_ORDER,
  doc = globalThis?.document,
  nodeFilter = globalThis?.NodeFilter,
) {
  if (!line || !buckets) return 0;
  const safeKind = smartSyntaxKind(kind, order);
  const slices = smartSyntaxLineTextNodeSlices(line, doc, nodeFilter);
  let added = 0;
  for (const slice of slices) {
    const from = Math.max(start, slice.start);
    const to = Math.min(end, slice.end);
    if (to <= from) continue;
    try {
      const range = smartSyntaxCreateHighlightRange(slice.node, from - slice.start, to - slice.start, doc);
      if (!range) continue;
      (buckets[safeKind] ||= []).push(range);
      added += 1;
    } catch { /* mid-frame text mutation */ }
  }
  return added;
}

// Same as smartSyntaxAddHighlightRange, for a line whose text-node slices were already
// collected. A line has many tokens, and walking its text nodes once per token would be the
// largest part of a paint pass.
export function smartSyntaxAddHighlightRangeFromSlices(
  slices,
  start,
  end,
  kind,
  buckets,
  order = SMART_SYNTAX_KIND_ORDER,
  doc = globalThis?.document,
) {
  if (!Array.isArray(slices) || !buckets) return 0;
  const safeKind = smartSyntaxKind(kind, order);
  let added = 0;
  for (const slice of slices) {
    if (slice.end <= start) continue;
    if (slice.start >= end) break;
    const from = Math.max(start, slice.start);
    const to = Math.min(end, slice.end);
    if (to <= from) continue;
    try {
      const range = smartSyntaxCreateHighlightRange(slice.node, from - slice.start, to - slice.start, doc);
      if (!range) continue;
      (buckets[safeKind] ||= []).push(range);
      added += 1;
    } catch { /* mid-frame text mutation */ }
  }
  return added;
}

export function smartSyntaxTextOffset(
  root,
  target,
  doc = globalThis?.document,
  nodeFilter = globalThis?.NodeFilter,
) {
  if (!root || !target || !root.contains?.(target) || !doc?.createTreeWalker) return 0;
  let offset = 0;
  try {
    const textMask = nodeFilter?.SHOW_TEXT ?? 4;
    const elementMask = nodeFilter?.SHOW_ELEMENT ?? 1;
    const walker = doc.createTreeWalker(root, textMask | elementMask, null);
    let node = walker.nextNode();
    while (node) {
      if (node === target || node.contains?.(target)) return offset;
      if (node.nodeType === 3) offset += String(node.nodeValue || "").length;
      node = walker.nextNode();
    }
  } catch { /* detached node */ }
  return offset;
}

export function sourceClassSyntaxContentPainted(
  content,
  version = "",
  styleId = "",
  sampleLimit = 80,
) {
  if (!content?.querySelectorAll) return false;
  if (content.dataset?.nostrodomusSourceClassSyntax !== version) return false;
  const root = content.getRootNode?.();
  if (!root?.querySelector?.(`#${styleId}`)) return false;
  const limit = Math.max(0, Number(sampleLimit) || 0);
  const spans = Array.from(content.querySelectorAll(".cm-line span"))
    .filter((span) => String(span.textContent || "").trim())
    .slice(0, limit);
  if (!spans.length) return false;
  return spans.some((span) => String(span.className || "").trim());
}

// The token colors use !important: CodeMirror injects its theme stylesheet into each editor
// later in document order with the same specificity, and Home Assistant themes set text rules.
// Without it, lines that mix YAML, card_mod and CSS lose their colors.
export function buildSmartSyntaxClassCss(
  syntax,
  order = SMART_SYNTAX_KIND_ORDER,
  darkPlusColor = /** @type {(kind: string, syntax?: any) => string} */ (() => "inherit"),
) {
  // "fg" is the kind of every unrecognized token. The palette fg is white on some presets and
  // flashes during a Ctrl+Space repaint, so fg uses the neutral codebox fg variable and its fill
  // follows the element's color. Every other kind keeps its palette color.
  const NEUTRAL_FG = "var(--nostrodomus-codebox-syntax-fg, #d4d4d4)";
  const colorForKind = (kind) => (kind === "fg" ? NEUTRAL_FG : darkPlusColor(kind, syntax));
  const fillForKind = (kind) => (kind === "fg" ? "currentColor" : colorForKind(kind));
  const rules = [
    `
      /* Nostrodomus smart semantic syntax overlay.
         Classes are annotations only; colors stay in this stable stylesheet.
         The overlay uses full document context plus CSS Custom Highlight ranges so visible card_mod/style block scalar
         CSS keeps the correct mode even when the viewport starts in the middle of the
         block. Line classes are fallbacks only; token classes remain authoritative. */
    `,
  ];
  for (const kind of order) {
    const color = colorForKind(kind);
    const fill = fillForKind(kind);
    const glow = syntax?.active ? syntax.textShadow || "none" : "none";
    const extra = kind === "comment" ? "font-style: italic !important;" : "font-style: inherit;";
    const cls = smartSyntaxClassName(kind, order);
    rules.push(`
        .cm-content .cm-line span.${cls},
        .cm-content .cm-line .${cls},
        .cm-line span.${cls},
        .cm-line .${cls} {
          color: ${color} !important;
          -webkit-text-fill-color: ${fill} !important;
          text-shadow: ${glow} !important;
          ${extra}
        }
      `);
  }
  for (const kind of order) {
    const color = colorForKind(kind);
    const fill = fillForKind(kind);
    const glow = syntax?.active ? syntax.textShadow || "none" : "none";
    const extra = kind === "comment" ? "font-style: italic !important;" : "font-style: inherit;";
    const lineCls = smartSyntaxLineClassName(kind, order);
    rules.push(`
        /* Line classes are a fallback for browsers without CSS Custom
           Highlights; range mode does not write them. */
        .cm-content .cm-line.${lineCls}:not([data-nostrodomus-range-highlighted="1"]),
        .cm-line.${lineCls}:not([data-nostrodomus-range-highlighted="1"]) {
          color: ${color} !important;
          -webkit-text-fill-color: ${fill} !important;
          text-shadow: ${glow} !important;
          ${extra}
        }
      `);
  }
  for (const kind of order) {
    const color = colorForKind(kind);
    const glow = syntax?.active ? syntax.textShadow || "none" : "none";
    const extra = kind === "comment" ? "font-style: italic;" : "font-style: inherit;";
    const highlightName = smartSyntaxHighlightName(kind, order);
    rules.push(`
        ::highlight(${highlightName}) {
          color: ${color};
          -webkit-text-fill-color: ${color};
          text-shadow: ${glow};
          ${extra}
        }
      `);
  }
  // A more specific or later rule can still turn the fg rules above white. The fg kind and line
  // rules are repeated with the Nostrodomus class tripled, which raises their specificity without
  // repeating a .cm-* class.
  if (order.includes("fg")) {
    const kindFg = smartSyntaxClassName("fg", order);
    const lineFg = smartSyntaxLineClassName("fg", order);
    rules.push(`
        .cm-content .cm-line span.${kindFg}.${kindFg}.${kindFg},
        .cm-content .cm-line .${kindFg}.${kindFg}.${kindFg},
        .cm-line span.${kindFg}.${kindFg}.${kindFg},
        .cm-line .${kindFg}.${kindFg}.${kindFg} {
          color: ${NEUTRAL_FG} !important;
          -webkit-text-fill-color: currentColor !important;
          text-shadow: none !important;
        }
        .cm-content .cm-line.${lineFg}.${lineFg}.${lineFg}:not([data-nostrodomus-range-highlighted="1"]),
        .cm-line.${lineFg}.${lineFg}.${lineFg}:not([data-nostrodomus-range-highlighted="1"]) {
          color: ${NEUTRAL_FG} !important;
          -webkit-text-fill-color: currentColor !important;
          text-shadow: none !important;
        }
      `);
  }
  return rules.join("\n");
}
