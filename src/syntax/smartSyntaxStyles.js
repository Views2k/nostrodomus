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

// Class-lifecycle guard: a CodeMirror re-render (e.g. the Ctrl+Space autocomplete) resets a
// .cm-line / token span's className, dropping our nostrodomus-syntax-line-* / nostrodomus-syntax-kind-* class to
// bare for a frame before the debounced painter reclassifies, so bracket/punctuation washes out to the
// native CM color (white). Given the element and its previous className (the MutationObserver oldValue),
// restore the dropped semantic class synchronously only when it is a full dropout: the element had a
// class of that family and now has none. A legitimate kind replacement (setSmartSyntaxKind swaps old
// kind to new kind) leaves a class of that family present and is left untouched (current className is
// read live). Pure DOM helper: no observers/timers/repaint here; returns true if it restored a class.
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
// ranges, none without them). A StaticRange is plain data and costs nothing on mutation; the
// painter rebuilds its ranges after every edit, so it never needs them to track the DOM.
export function smartSyntaxCreateHighlightRange(node, startOffset, endOffset, doc = globalThis?.document) {
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
// collected. A line has many tokens; walking its text nodes once per token was the largest
// part of a paint pass.
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

// important-override registry (INSTRUCTIONS.md §11.9) — smart-syntax token color classes.
// external rules overridden: CodeMirror's per-editor injected theme stylesheet (sets
//   span colors with its own class specificity, later in document order) and HA theme
//   text/transition rules.
// owner: smart-syntax stable stylesheet (the range/source syntax baseline).
// reason: token classes are annotations; their colors must beat the CM theme defaults
//   or mixed YAML/card_mod/CSS lines lose highlighting.
// removal condition: native-highlight extension becoming the only syntax path (the
//   source-class fallback retiring).
// verification: tokenizer corpus gate; range-highlight/darkplus static baselines;
//   browser smoke item on mixed-syntax coloring.
export function buildSmartSyntaxClassCss(
  syntax,
  order = SMART_SYNTAX_KIND_ORDER,
  darkPlusColor = /** @type {(kind: string, syntax?: any) => string} */ (() => "inherit"),
) {
  // "fg" is the default/fallback kind (smartSyntaxKind normalizes unrecognized tokens to "fg"), so a
  // token/line classified fg renders darkPlusColor("fg"): the active theme palette fg, which is white
  // (#ffffff x opacity = rgba(255,255,255,0.67)) on white-fg presets and flashes white on a Ctrl+Space
  // repaint. Resolve the fg kind/line to the neutral codebox fg var instead; every other kind keeps its
  // palette color (no flattening). Fill follows the element's own color (currentColor) for fg.
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
        /* Line classes are fallback only. When the CSS Custom Highlight range
           layer is active, data-nostrodomus-range-highlighted prevents
           whole-line color from fighting selector/property/value ranges. */
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
  // The normal-specificity neutral "fg" rules above can still be overridden white on white-fg themes
  // when a higher-specificity or later rule wins. Re-assert the fallback "fg" kind/line at boosted
  // specificity by repeating the Nostrodomus fg class (registry-safe: no doubled .cm-* class), so the
  // neutral fg always beats the override. Only fg; semantic kinds untouched.
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
