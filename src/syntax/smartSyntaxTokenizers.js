// Nostrodomus smart syntax tokenizer helpers.
//
// Keep these helpers pure. No DOM access, no browser storage, no events, no
// observers, no timers, no logging, and no Home Assistant runtime reads.

export const SMART_SYNTAX_KIND_ORDER = Object.freeze([
  "fg",
  "dim",
  "comment",
  "key",
  "yamlList",
  "string",
  "number",
  "bool",
  "keyword",
  "filter",
  "jinja",
  "cssSelector",
  "cssProp",
  "cssValue",
  "cssGlow",
  "cssDim",
  "punct",
  "op",
]);

export function smartSyntaxKind(kind, order = SMART_SYNTAX_KIND_ORDER) {
  const raw = String(kind || "fg");
  const known = typeof order?.includes === "function" ? order : SMART_SYNTAX_KIND_ORDER;
  return known.includes(raw) ? raw : "fg";
}

export function smartSyntaxPushRange(tokens, start, end, kind, order = SMART_SYNTAX_KIND_ORDER) {
  const from = Math.max(0, Number(start) || 0);
  const to = Math.max(from, Number(end) || 0);
  if (to <= from) return;
  const safeKind = smartSyntaxKind(kind, order);
  const last = tokens[tokens.length - 1];
  if (last && last.kind === safeKind && last.end === from) {
    last.end = to;
    return;
  }
  tokens.push({ start: from, end: to, kind: safeKind });
}

export function smartSyntaxCssValueKeyword(text) {
  return /^(inherit|initial|unset|revert|revert-layer|auto|none|normal|solid|dashed|dotted|double|hidden|transparent|currentColor|visible|collapse|relative|absolute|fixed|sticky|static|block|inline|inline-block|flex|grid|contents|center|left|right|top|bottom|cover|contain|repeat|no-repeat|baseline|middle|start|end|space-between|space-around|space-evenly)$/i.test(
    String(text || ""),
  );
}

export function smartSyntaxIsCssContextLine(text, lineKind) {
  const raw = String(text || "");
  if (/^css/.test(String(lineKind || ""))) return true;
  if (
    /\b(card_mod|ha-card|hui-|mushroom-|button-card|better-thermostat|paper-|ha-|:host|::?before|::?after)\b/i.test(
      raw,
    )
  )
    return true;
  if (
    /\b(?:rgba?|hsla?|var|calc|min|max|clamp|linear-gradient|radial-gradient|drop-shadow|blur|translate|translatez|scale|rotate)\s*\(/i.test(
      raw,
    )
  )
    return true;
  if (/^\s*(?:--)?[A-Za-z_-][\w-]*\s*:/.test(raw)) return true;
  if (/[{};]/.test(raw) && /[:.#$!-]/.test(raw)) return true;
  return false;
}

export function smartSyntaxLeadingSpaces(text) {
  const m = String(text || "").match(/^\s*/);
  return m ? m[0].length : 0;
}

export function smartSyntaxYamlLineInfo(lineText) {
  const raw = String(lineText || "");
  const lead = smartSyntaxLeadingSpaces(raw);
  const rest = raw.slice(lead);
  // A YAML mapping key ends in a colon followed by whitespace or the end of the line, so
  // `- https://example.com/a` is a list item, not the key `https`.
  const m = rest.match(/^(-\s*)?((?:[A-Za-z_][\w$.-]*)|(?:"[^"]+")|(?:'[^']+'))\s*:(?=\s|$)/);
  if (!m) return null;
  const listPrefix = m[1] || "";
  const key = m[2] || "";
  const keyStart = lead + listPrefix.length;
  const keyEnd = keyStart + key.length;
  const colonIndex = lead + m[0].lastIndexOf(":");
  const valueStart = colonIndex + 1;
  const valueText = raw.slice(valueStart).trim();
  const cleanKey = String(key || "")
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
  return { lead, listPrefix, key, cleanKey, keyStart, keyEnd, colonIndex, valueStart, valueText };
}

export function smartSyntaxCssDeclarationInfo(lineText) {
  const raw = String(lineText || "");
  const m = raw.match(/^(\s*)((?:--)?[A-Za-z_-][A-Za-z0-9_-]*)\s*:/);
  if (!m) return null;
  const propStart = m[1].length;
  const prop = m[2] || "";
  const propEnd = propStart + prop.length;
  const colonIndex = raw.indexOf(":", propEnd);
  return { prop, propStart, propEnd, colonIndex, valueStart: colonIndex + 1 };
}

export function smartSyntaxOffsetInQuotedString(text, offset) {
  const raw = String(text || "");
  let quote = "";
  let escaped = false;
  for (let i = 0; i < raw.length && i <= offset; i += 1) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
  }
  return !!quote;
}

// smartSyntaxOffsetInQuotedString for a YAML value: a quote opens a scalar only where a scalar
// can start. That is the start of the value (also after a list dash, an anchor or a tag), after
// a colon, and after `[`, `{` or `,` inside a flow collection. Anywhere else it is a character of
// a plain scalar, so the apostrophes in `Bob's` and in `rock 'n roll` open nothing.
//
// A colon counts only where it ends a key: followed by a space, a tab or the end of the text, or
// inside a flow collection directly after a closing quote or bracket (`{"a":"b"}`). The colon in
// `Light "Hall:" # main` is a character of the plain scalar, so the quote after it opens nothing
// and the comment is still found.
function smartSyntaxOffsetInYamlQuotedScalar(text, offset) {
  const raw = String(text || "");
  let quote = "";
  let scalarCanStart = true;
  let flowDepth = 0;
  let closedAt = -2;
  for (let i = 0; i < raw.length && i <= offset; i += 1) {
    const ch = raw[i];
    if (quote) {
      if (quote === '"' && ch === "\\") i += 1;
      // `''` is an escaped quote inside a single-quoted scalar.
      else if (quote === "'" && ch === "'" && raw[i + 1] === "'") i += 1;
      else if (ch === quote) { quote = ""; closedAt = i; }
      continue;
    }
    if (/\s/.test(ch)) continue;
    if (ch === "'" || ch === '"') {
      if (scalarCanStart) quote = ch;
      scalarCanStart = false;
    } else if (ch === "[" || ch === "{") {
      if (scalarCanStart || flowDepth > 0) {
        flowDepth += 1;
        scalarCanStart = true;
      }
    } else if (ch === "]" || ch === "}") {
      if (flowDepth > 0) flowDepth -= 1;
      scalarCanStart = false;
      closedAt = i;
    } else if (ch === ",") {
      scalarCanStart = flowDepth > 0;
    } else if (ch === ":") {
      const next = raw[i + 1];
      scalarCanStart = next === undefined || next === " " || next === "\t" || (flowDepth > 0 && closedAt === i - 1);
    } else if (scalarCanStart && (ch === "&" || ch === "!")) {
      // An anchor or a tag ends at the next space; the scalar follows it.
      while (i + 1 < raw.length && !/\s/.test(raw[i + 1])) i += 1;
    } else if (!(scalarCanStart && ch === "-" && (i + 1 >= raw.length || /\s/.test(raw[i + 1])))) {
      // Anything but the dash of a nested list item is the first character of a plain scalar.
      scalarCanStart = false;
    }
  }
  return !!quote;
}

export function smartSyntaxCssBlockScalarStart(info) {
  if (!info) return false;
  const key = String(info.cleanKey || "").toLowerCase();
  const value = String(info.valueText || "").trim();
  if (!/^[>|]/.test(value)) return false;
  return key === "style" || key === "card_mod" || key === "extra_styles" || key === "styles";
}

// Any other block scalar (`content: |`, `value_template: >`): its lines are literal text.
function smartSyntaxTextBlockScalarStart(info) {
  if (!info || smartSyntaxCssBlockScalarStart(info)) return false;
  return /^[>|][+-]?\d*[+-]?\s*(?:#.*)?$/.test(String(info.valueText || "").trim());
}

// In a text block scalar a line that starts with '#' or '*' is content (a markdown heading or
// list item), not a YAML comment. JS-style comment openers keep their meaning for templates.
function smartSyntaxTextBlockLineKind(lineKind, trimmed) {
  return lineKind === "comment" && /^[#*]/.test(trimmed) && !/^\*\//.test(trimmed) ? "string" : lineKind;
}

// A line counts as a comment when it was classified as one. The leading-'#' test is only a
// fallback for lines that were never classified.
function smartSyntaxLineIsComment(raw, lineKind, pattern) {
  if (lineKind === "comment") return true;
  return (!lineKind || lineKind === "fg") && pattern.test(raw);
}

// The column at or below which a line closes the block scalar opened by this key line. For
// `- style: |` the sibling keys of the list item sit at the key's column, after the dash, so the
// bound includes the dash and the blanks after it. `-style:` is a plain key at its own column.
// The completion context measures the same way (yamlKeyColumn in yamlCompletionContext.js).
function smartSyntaxBlockScalarBound(info) {
  const dash = /^(-[ \t]+)/.exec(String(info.listPrefix || ""));
  return dash ? info.lead + dash[1].length : info.lead;
}

// `style:` without a value opens a map. In card_mod that map has one key per selector path
// (`hui-generic-entity-row $`, `.`, `"ha-card $"`, nested to any depth) and the block scalar
// under each key is CSS.
function smartSyntaxCssMapStart(info) {
  if (!info || info.cleanKey !== "style") return false;
  return !info.valueText || info.valueText.startsWith("#");
}

// A line inside such a map that opens a block scalar: the column that closes the scalar, or -1.
// The key is taken as the text up to the colon in front of the block indicator, because a
// selector path is often not a plain YAML word and smartSyntaxYamlLineInfo does not read it.
function smartSyntaxCssMapBlockScalarBound(raw) {
  const m = /^(\s*)(-[ \t]+)?\S.*?:[ \t]+[>|][+-]?\d*[+-]?\s*(?:#.*)?$/.exec(String(raw || ""));
  return m ? m[1].length + (m[2] ? m[2].length : 0) : -1;
}

// A CodeMirror document object is immutable: the same object always has the same text. A pass
// that runs while nothing was edited (scrolling, a settle pass) reuses the lines of the last one.
const docLinesByDocument = new WeakMap();

/**
 * @param {any} editor
 * @param {(editor: any) => any} [codeMirrorSourceClassParts]
 */
export function smartSyntaxDocLinesFromEditor(editor, codeMirrorSourceClassParts = () => null) {
  try {
    const parts = codeMirrorSourceClassParts(editor);
    const doc = parts?.view?.state?.doc;
    if (!doc || !Number.isFinite(Number(doc.lines))) return null;
    const known = typeof doc === "object" ? docLinesByDocument.get(doc) : null;
    if (known && known.length === doc.lines) return known;
    // Every edit makes a new document object, so this copy runs once per edit. The editor's own
    // line export is one call; reading each line by number is the fallback.
    let lines = null;
    if (typeof doc.toJSON === "function") {
      const exported = doc.toJSON();
      if (Array.isArray(exported) && exported.length === doc.lines) lines = exported;
    }
    if (!lines) {
      lines = [];
      for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
        lines.push(String(doc.line(lineNo)?.text || ""));
      }
    }
    if (typeof doc === "object") docLinesByDocument.set(doc, lines);
    return lines;
  } catch {
    return null;
  }
}

export function smartSyntaxBestDocumentStartIndex(docLines, domLines) {
  if (!Array.isArray(docLines) || !Array.isArray(domLines) || !docLines.length || !domLines.length)
    return 0;
  const visible = domLines.map((line) => String(line?.textContent || ""));
  const sampleCount = Math.min(32, visible.length);
  let bestStart = 0;
  let bestScore = -1;
  const maxStart = Math.max(0, docLines.length - 1);

  for (let start = 0; start <= maxStart; start += 1) {
    let score = 0;
    let checked = 0;
    for (let i = 0; i < sampleCount && start + i < docLines.length; i += 1) {
      const a = String(docLines[start + i] || "");
      const b = String(visible[i] || "");
      if (!b.trim() && !a.trim()) {
        score += 0.25;
      } else if (a === b) {
        score += 3;
      } else if (a.trim() && a.trim() === b.trim()) {
        score += 1.5;
      }
      checked += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
    if (checked >= 6 && score >= checked * 2.8) break;
  }
  return bestStart;
}

// The document line of each rendered line, as supplied by the editor. The rendered lines are
// not always one block: CodeMirror keeps the line with the cursor in the DOM when it is scrolled
// out of view, and a folded range leaves a hole. The list is used when it is one index per
// rendered line, in rising order, and the first and last lines carry the text of their
// document lines. A line with a fold placeholder or another widget carries more than its own
// text, so when an edge line does not settle it, any line with text that starts with the text
// of its document line does. A fold on the first or last rendered line then keeps the list.
function smartSyntaxLineIndexesMatch(docLines, domLines, lineIndexes) {
  if (!Array.isArray(lineIndexes) || lineIndexes.length !== domLines.length || !lineIndexes.length) return false;
  let previous = -1;
  for (const index of lineIndexes) {
    if (!Number.isInteger(index) || index <= previous || index >= docLines.length) return false;
    previous = index;
  }
  const lastAt = lineIndexes.length - 1;
  const sameText = (at) => String(docLines[lineIndexes[at]] || "") === String(domLines[at]?.textContent || "");
  if (sameText(0) && sameText(lastAt)) return true;
  // The placeholder of a fold follows the text of the line it is on.
  const carriesText = (at) => {
    const docText = String(docLines[lineIndexes[at]] || "");
    return docText.trim() !== "" && String(domLines[at]?.textContent || "").startsWith(docText);
  };
  for (let at = 0; at <= lastAt; at += 1) if (carriesText(at)) return true;
  return false;
}

// The document line index of the rendered line at position lineIndex.
export function smartSyntaxDocIndexForLine(docContext, lineIndex) {
  if (!docContext) return -1;
  if (docContext.lineIndexes) return docContext.lineIndexes[lineIndex] ?? -1;
  return docContext.startIndex + lineIndex;
}

export function smartSyntaxTokenizeJinjaSegment(
  text,
  baseOffset = 0,
  tokens = [],
  order = SMART_SYNTAX_KIND_ORDER,
) {
  const raw = String(text || "");
  let i = 0;
  const keywords =
    /^(set|if|elif|else|endif|for|endfor|in|is|or|and|not|true|false|none|null|lower|upper|default|float|int|string|round|states|state_attr|is_state|now|as_timestamp|timestamp_custom)$/i;
  while (i < raw.length) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const close = raw.slice(i, i + 2);
    if (
      close === "{{" ||
      close === "}}" ||
      close === "{%" ||
      close === "%}" ||
      close === "{#" ||
      close === "#}"
    ) {
      smartSyntaxPushRange(tokens, baseOffset + i, baseOffset + i + 2, "jinja", order);
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let escaped = false;
      while (j < raw.length) {
        const c = raw[j];
        if (escaped) {
          escaped = false;
          j += 1;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          j += 1;
          continue;
        }
        j += 1;
        if (c === quote) break;
      }
      smartSyntaxPushRange(tokens, baseOffset + i, baseOffset + j, "string", order);
      i = j;
      continue;
    }
    const num = raw.slice(i).match(/^-?\d+(?:\.\d+)?\b/);
    if (num) {
      smartSyntaxPushRange(tokens, baseOffset + i, baseOffset + i + num[0].length, "number", order);
      i += num[0].length;
      continue;
    }
    const op = raw.slice(i).match(/^(==|!=|>=|<=|\|>|\|<|\|\||&&|[|=<>+*/%,.!?:()[\]{}-])/);
    if (op) {
      smartSyntaxPushRange(
        tokens,
        baseOffset + i,
        baseOffset + i + op[0].length,
        /[()[\]{},.:]/.test(op[0]) ? "punct" : "op",
        order,
      );
      i += op[0].length;
      continue;
    }
    const word = raw.slice(i).match(/^[A-Za-z_][\w.]*/);
    if (word) {
      const value = word[0];
      smartSyntaxPushRange(
        tokens,
        baseOffset + i,
        baseOffset + i + value.length,
        keywords.test(value) ? "keyword" : "filter",
        order,
      );
      i += value.length;
      continue;
    }
    smartSyntaxPushRange(tokens, baseOffset + i, baseOffset + i + 1, "jinja", order);
    i += 1;
  }
  return tokens;
}

export function smartSyntaxTokenizeJinjaInsideCss(
  text,
  start,
  tokens,
  order = SMART_SYNTAX_KIND_ORDER,
) {
  const raw = String(text || "");
  const open = raw.slice(start, start + 2);
  const close = open === "{{" ? "}}" : open === "{%" ? "%}" : open === "{#" ? "#}" : "";
  if (!close) return start;
  const end = raw.indexOf(close, start + 2);
  const finalEnd = end >= 0 ? end + 2 : raw.length;
  smartSyntaxTokenizeJinjaSegment(raw.slice(start, finalEnd), start, tokens, order);
  return finalEnd;
}

// The CSS tokenizer matches at the current position of the line with sticky patterns, so the
// time for a line grows with its length, not with the square of it.
const CSS_HEX_AT = /#[0-9a-f]{3,8}\b/iy;
const CSS_NUMBER_AT =
  /-?(?:\d*\.\d+|\d+)(?:%|px|em|rem|vh|vw|vmin|vmax|fr|s|ms|deg|turn|rad|dpi|dppx)?\b/iy;
const CSS_IDENT_AT = /-{0,2}[A-Za-z_][A-Za-z0-9_-]*/y;

function smartSyntaxMatchAt(pattern, text, index) {
  pattern.lastIndex = index;
  return pattern.exec(text);
}

export function smartSyntaxTokenizeCssLine(
  text,
  lineKind = "cssValue",
  order = SMART_SYNTAX_KIND_ORDER,
) {
  const raw = String(text || "");
  const tokens = [];
  let i = 0;
  let inDeclarationBlock = raw.includes("{")
    ? false
    : /^\s*(?:--)?[A-Za-z_-][\w-]*\s*:/.test(raw) ||
      lineKind === "cssProp" ||
      lineKind === "cssValue" ||
      lineKind === "cssGlow";
  const len = raw.length;

  const previousNonSpace = (index) => {
    for (let j = index - 1; j >= 0; j -= 1) if (!/\s/.test(raw[j])) return raw[j];
    return "";
  };
  const nextNonSpaceIndex = (index) => {
    for (let j = index; j < len; j += 1) if (!/\s/.test(raw[j])) return j;
    return -1;
  };
  // The first colon of the line when it is at or before `to` and no `;`, `{` or `}` before `to`
  // comes ahead of it. Both positions are the same for every identifier of the line.
  const firstColon = raw.indexOf(":");
  const firstTerminator = raw.search(/[;{}]/);
  const declarationColonBeforeTerminator = (to) => {
    if (firstColon < 0 || firstColon > to) return -1;
    return firstTerminator >= 0 && firstTerminator < to && firstTerminator < firstColon
      ? -1
      : firstColon;
  };

  while (i < len) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (raw.startsWith("/*", i)) {
      const end = raw.indexOf("*/", i + 2);
      const finalEnd = end >= 0 ? end + 2 : len;
      smartSyntaxPushRange(tokens, i, finalEnd, "comment", order);
      i = finalEnd;
      continue;
    }
    if (raw.startsWith("{{", i) || raw.startsWith("{%", i) || raw.startsWith("{#", i)) {
      i = smartSyntaxTokenizeJinjaInsideCss(raw, i, tokens, order);
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let escaped = false;
      while (j < len) {
        const c = raw[j];
        if (escaped) {
          escaped = false;
          j += 1;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          j += 1;
          continue;
        }
        j += 1;
        if (c === quote) break;
      }
      smartSyntaxPushRange(tokens, i, j, "string", order);
      i = j;
      continue;
    }
    if (ch === "!" && raw.slice(i, i + 10).toLowerCase() === "!important") {
      smartSyntaxPushRange(tokens, i, i + 10, "cssGlow", order);
      i += 10;
      continue;
    }
    const hex = smartSyntaxMatchAt(CSS_HEX_AT, raw, i);
    if (hex) {
      smartSyntaxPushRange(tokens, i, i + hex[0].length, "cssValue", order);
      i += hex[0].length;
      continue;
    }
    const num = smartSyntaxMatchAt(CSS_NUMBER_AT, raw, i);
    if (num) {
      smartSyntaxPushRange(tokens, i, i + num[0].length, "number", order);
      i += num[0].length;
      continue;
    }
    if (/[{}()[\],.;:]/.test(ch)) {
      smartSyntaxPushRange(tokens, i, i + 1, "punct", order);
      if (ch === "{") inDeclarationBlock = true;
      if (ch === "}") inDeclarationBlock = false;
      i += 1;
      continue;
    }
    if (/[>+~*=|^$]/.test(ch)) {
      smartSyntaxPushRange(tokens, i, i + 1, "op", order);
      i += 1;
      continue;
    }
    const ident = smartSyntaxMatchAt(CSS_IDENT_AT, raw, i);
    if (ident) {
      const value = ident[0];
      const start = i;
      const end = i + value.length;
      const nextIndex = nextNonSpaceIndex(end);
      const next = nextIndex >= 0 ? raw[nextIndex] : "";
      const prev = previousNonSpace(start);
      let kind = "cssValue";

      if (!inDeclarationBlock && (prev === "." || prev === "#" || /^[A-Za-z_-]/.test(value))) {
        kind = "cssSelector";
      }
      if (value.startsWith("--")) {
        kind = next === ":" ? "cssProp" : "cssValue";
      } else if (next === ":" && inDeclarationBlock) {
        kind = "cssProp";
      } else if (
        next === "(" &&
        /^(rgba?|hsla?|var|calc|min|max|clamp|linear-gradient|radial-gradient|drop-shadow|blur|translate|translate3d|translatex|translatey|translatez|scale|rotate|saturate|brightness|contrast|color-mix)$/i.test(
          value,
        )
      ) {
        kind = "filter";
      } else if (smartSyntaxCssValueKeyword(value)) {
        kind = inDeclarationBlock ? "cssValue" : kind;
      } else if (
        inDeclarationBlock &&
        (prev === ":" || declarationColonBeforeTerminator(start) >= 0)
      ) {
        kind = "cssValue";
      }
      smartSyntaxPushRange(tokens, start, end, kind, order);
      i = end;
      continue;
    }
    if (ch === "." || ch === "#" || ch === "$" || ch === "-") {
      smartSyntaxPushRange(tokens, i, i + 1, !inDeclarationBlock ? "cssSelector" : "op", order);
      i += 1;
      continue;
    }
    smartSyntaxPushRange(tokens, i, i + 1, inDeclarationBlock ? "cssValue" : "cssSelector", order);
    i += 1;
  }
  return tokens;
}

// Smart syntax scalar/token-kind helpers.

export function smartSyntaxScalarKind(token, lineKind = "fg", lineInfo = null) {
  const t = String(token || "").trim();
  if (!t) return lineKind || "fg";
  const yamlKey = String(lineInfo?.cleanKey || "").toLowerCase();
  // An anchor, an alias or a tag. This comes before the comment test: `*name` is an alias, and
  // the comment test takes every leading '*' as the continuation of a block comment.
  if (/^&[A-Za-z0-9_-]+$/.test(t) || /^\*[A-Za-z0-9_-]+$/.test(t) || /^![A-Za-z0-9_./:-]+$/.test(t))
    return "keyword";
  if (/^(#|\/\/|\/\*|\*|\*\/)/.test(t)) return "comment";
  if (/^['"]/.test(t) || /['"]$/.test(t)) return "string";
  if (/^(true|false|on|off|yes|no|null|none)$/i.test(t)) return "bool";
  if (
    /^-?\d+(?:\.\d+)?(?:px|em|rem|vh|vw|vmin|vmax|%|s|ms|fr|ch|deg|rad|turn|db|kb|mb|gb)?$/i.test(t)
  )
    return "number";
  if (
    /^[a-z_][\w-]*\.[a-z0-9_][\w.-]*$/i.test(t) &&
    /(entity|sensor|switch|light|climate|cover|media|person|device|area|target)/.test(
      yamlKey || "entity",
    )
  )
    return "filter";
  if (
    /^(var|env|rgb|rgba|hsl|hsla|calc|min|max|clamp|color-mix|linear-gradient|radial-gradient|conic-gradient|url|drop-shadow|blur|brightness|contrast|saturate|translate|translatex|translatey|translatez|scale|rotate)\b/i.test(
      t,
    )
  )
    return "filter";
  if (/^--[A-Za-z0-9_-]+/.test(t)) return "cssProp";
  if (/^[\][:{}(),.;[]+$/.test(t)) return "punct";
  if (/^[-|>=<~!+*/%]+$/.test(t)) return "op";
  if (/^\|[A-Za-z_][\w-]*$/.test(t)) return "filter";
  return lineKind && lineKind !== "fg" ? lineKind : "string";
}

export function smartSyntaxCssFunctionName(token) {
  return /^(var|env|rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|calc|min|max|clamp|url|linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|drop-shadow|blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|translate|translatex|translatey|translatez|translate3d|scale|scalex|scaley|scalez|scale3d|rotate|rotatex|rotatey|rotatez|rotate3d|skew|skewx|skewy|matrix|matrix3d)$/i.test(
    String(token || "").replace(/\($/, ""),
  );
}

export function smartSyntaxCssNumericToken(token) {
  const t = String(token || "").trim();
  if (/^-?\d+(?:\.\d+)?(?:px|em|rem|vh|vw|vmin|vmax|%|s|ms|fr|ch|deg|rad|turn|dpi|dppx)?$/i.test(t))
    return true;
  if (/^-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+(?:\s*,\s*(?:0|1|0?\.\d+|\d+%))?$/i.test(t))
    return true;
  return false;
}

export function smartSyntaxCssDeclarationBounds(raw, tokenStart) {
  const text = String(raw || "");
  const before = text.slice(0, Math.max(0, tokenStart));
  const lastOpen = before.lastIndexOf("{");
  const lastSemi = before.lastIndexOf(";");
  const segmentStart = Math.max(lastOpen, lastSemi) + 1;
  let segmentEnd = text.indexOf(";", tokenStart);
  const close = text.indexOf("}", tokenStart);
  if (segmentEnd < 0 || (close >= 0 && close < segmentEnd)) segmentEnd = close;
  if (segmentEnd < 0) segmentEnd = text.length;
  const colon = text.indexOf(":", segmentStart);
  return {
    segmentStart,
    segmentEnd,
    colon: colon >= 0 && colon < segmentEnd ? colon : -1,
    lastOpen,
  };
}

export function smartSyntaxCssTokenKind(tokenText, lineText, lineKind, tokenStart, tokenEnd) {
  const raw = String(lineText || "");
  const t = String(tokenText || "").trim();
  if (!t) return "fg";
  if (/^(\/\*|\*|\*\/|\/\/)/.test(t)) return "comment";
  if (/^[\][:{}(),.;[]+$/.test(t)) return "punct";
  if (/^[-|>=<~+*/%]+$/.test(t)) return "op";
  if (/!important/i.test(t)) return "cssGlow";
  if (smartSyntaxCssNumericToken(t)) return "number";
  if (/^#[0-9a-f]{3,8}\b/i.test(t)) return "cssValue";
  if (/^['"]/.test(t)) return "string";
  if (smartSyntaxCssFunctionName(t)) return "filter";

  const selectorEnd = raw.indexOf("{");
  if (selectorEnd >= 0 && tokenEnd <= selectorEnd) {
    if (/^[.#]?[A-Za-z_][\w-]*(?:[.#:][\w-]+)*$/.test(t) || /^[A-Za-z][\w-]*$/.test(t))
      return "cssSelector";
    if (/^\[[^\]]+\]$/.test(t)) return "cssSelector";
    return smartSyntaxScalarKind(t, "cssSelector");
  }

  const bounds = smartSyntaxCssDeclarationBounds(raw, tokenStart);
  if (bounds.colon >= 0) {
    if (tokenEnd <= bounds.colon && /^[A-Za-z_-][\w-]*$/.test(t)) return "cssProp";
    if (tokenStart <= bounds.colon && tokenEnd > bounds.colon && /^[A-Za-z_-][\w-]*\s*:/.test(t))
      return "cssProp";
    if (tokenStart > bounds.colon) {
      if (/^--[A-Za-z0-9_-]+$/.test(t)) return "cssValue";
      if (
        /^(inherit|initial|unset|revert|auto|none|solid|dashed|hidden|transparent|currentColor|visible|relative|absolute|fixed|sticky|block|inline|flex|grid|center|left|right|top|bottom|cover|contain)$/i.test(
          t,
        )
      )
        return "cssValue";
      return smartSyntaxScalarKind(t, "cssValue");
    }
  }

  if (/^--[A-Za-z0-9_-]+$/.test(t)) return "cssProp";
  if (lineKind === "cssSelector") return "cssSelector";
  if (lineKind === "cssProp") return "cssProp";
  if (lineKind === "cssValue" || lineKind === "cssGlow")
    return smartSyntaxScalarKind(t, "cssValue");
  return smartSyntaxScalarKind(t, lineKind || "cssValue");
}

// The offset in a YAML value of the `#` that starts its trailing comment: the first `#` after
// whitespace that is not inside a quoted scalar. -1 when the value has no comment.
function smartSyntaxYamlCommentOffset(value) {
  for (const candidate of value.matchAll(/\s+#/g)) {
    const hashAt = candidate.index + candidate[0].length - 1;
    if (!smartSyntaxOffsetInYamlQuotedScalar(value, hashAt)) return hashAt;
  }
  return -1;
}

// Tokens for the scalar part of a YAML line starting at valueStart: flow punctuation, scalars by
// kind, and the trailing comment.
function smartSyntaxPushYamlScalarTokens(tokens, raw, valueStart, lineInfo, order) {
  const value = raw.slice(valueStart);
  const commentAt = smartSyntaxYamlCommentOffset(value);
  const scalarText = commentAt >= 0 ? value.slice(0, commentAt) : value;
  for (const match of scalarText.matchAll(/[^\s,[\]{}]+|[\][{},]/g)) {
    const token = match[0];
    const start = valueStart + match.index;
    const end = start + token.length;
    if (/^[\][{},]$/.test(token)) smartSyntaxPushRange(tokens, start, end, "punct", order);
    // A word of a quoted scalar with spaces: `"Room #1"` is one string, not a string and a comment.
    else if (smartSyntaxOffsetInYamlQuotedScalar(value, match.index)) smartSyntaxPushRange(tokens, start, end, "string", order);
    else smartSyntaxPushRange(tokens, start, end, smartSyntaxScalarKind(token, "string", lineInfo), order);
  }
  if (commentAt >= 0) smartSyntaxPushRange(tokens, valueStart + commentAt, raw.length, "comment", order);
  return tokens;
}

// The list dash, the key and the colon of a `key: value` line.
function smartSyntaxPushYamlKeyTokens(tokens, lineInfo, order) {
  if (lineInfo.listPrefix)
    smartSyntaxPushRange(tokens, lineInfo.lead, lineInfo.lead + lineInfo.listPrefix.length, "yamlList", order);
  smartSyntaxPushRange(tokens, lineInfo.keyStart, lineInfo.keyEnd, "key", order);
  smartSyntaxPushRange(tokens, lineInfo.colonIndex, lineInfo.colonIndex + 1, "punct", order);
  return tokens;
}

export function smartSyntaxTokenizeYamlLine(
  text,
  lineInfo,
  lineKind,
  order = SMART_SYNTAX_KIND_ORDER,
) {
  const raw = String(text || "");
  const tokens = [];
  if (smartSyntaxLineIsComment(raw, lineKind, /^\s*#/)) {
    smartSyntaxPushRange(tokens, 0, raw.length, "comment", order);
    return tokens;
  }
  if (!lineInfo) {
    const item = /^(\s*)-(\s+)(?=\S)/.exec(raw);
    if (!item) return tokens;
    smartSyntaxPushRange(tokens, item[1].length, item[1].length + 1, "yamlList", order);
    return smartSyntaxPushYamlScalarTokens(tokens, raw, item[0].length, null, order);
  }
  smartSyntaxPushYamlKeyTokens(tokens, lineInfo, order);
  return smartSyntaxPushYamlScalarTokens(tokens, raw, lineInfo.valueStart, lineInfo, order);
}

// A YAML line whose value holds a template: the list dash, the key, the colon and a trailing
// comment are YAML, the value is a template. A line without a key or a dash is all template.
function smartSyntaxTokenizeYamlTemplateLine(raw, lineInfo, order) {
  const tokens = [];
  let valueStart = 0;
  if (lineInfo) {
    smartSyntaxPushYamlKeyTokens(tokens, lineInfo, order);
    valueStart = lineInfo.valueStart;
  } else {
    const item = /^(\s*)-(\s+)(?=\S)/.exec(raw);
    if (!item) return smartSyntaxTokenizeJinjaSegment(raw, 0, tokens, order);
    smartSyntaxPushRange(tokens, item[1].length, item[1].length + 1, "yamlList", order);
    valueStart = item[0].length;
  }
  const value = raw.slice(valueStart);
  const commentAt = smartSyntaxYamlCommentOffset(value);
  smartSyntaxTokenizeJinjaSegment(commentAt >= 0 ? value.slice(0, commentAt) : value, valueStart, tokens, order);
  if (commentAt >= 0) smartSyntaxPushRange(tokens, valueStart + commentAt, raw.length, "comment", order);
  return tokens;
}

const SMART_SYNTAX_CSS_FUNCTION_VALUE = /^\s*(?:-\s+)?[\w-]+\s*:\s+.*\b(?:rgba?|hsla?|var|calc|min|max|clamp|linear-gradient|radial-gradient|drop-shadow|blur|translate|translatez|scale|rotate)\s*\(/i;

// Keeps the tokens of lines already tokenized. The tokens of a line are decided by its text, its
// line kind, the block scalar it sits in and whether it is read as a `key: value` line (the key
// information itself is derived from the text). A pass covers every rendered line, about a
// hundred, while an edit changes one. Only the tokens are kept here; the ranges built from them
// belong to the elements on the page and are kept by the range pass.
// The same key returns the same array, which that pass uses to tell that a line is unchanged.
// `tokenize(lineText, lineKind, lineInfo, blockScalarKind)` is the tokenizer to remember.
export function createSmartSyntaxLineTokenCache(tokenize, limit = 3000, maxLineLength = 600) {
  const kept = new Map();
  return function tokensForLine(lineText, lineKind, lineInfo, blockScalarKind) {
    const text = String(lineText || "");
    if (text.length > maxLineLength) return tokenize(text, lineKind, lineInfo, blockScalarKind);
    const key = `${lineKind || ""}
${blockScalarKind === undefined ? "?" : blockScalarKind}
${lineInfo ? 1 : 0}
${text}`;
    let tokens = kept.get(key);
    if (!tokens) {
      tokens = Object.freeze(tokenize(text, lineKind, lineInfo, blockScalarKind) || []);
      if (kept.size >= limit) kept.clear();
      kept.set(key, tokens);
    }
    return tokens;
  };
}

export function smartSyntaxRangeTokensForLine(
  lineText,
  lineKind,
  lineInfo,
  darkPlusIsJinjaLine = /** @type {(line: string, opts?: any) => boolean} */ (() => false),
  order = SMART_SYNTAX_KIND_ORDER,
  blockScalarKind = /** @type {string | undefined} */ (undefined),
) {
  const raw = String(lineText || "");
  if (!raw.trim()) return [];
  if (smartSyntaxLineIsComment(raw, lineKind, /^\s*(#|\/\*)/))
    return [{ start: 0, end: raw.length, kind: "comment" }];
  // When the caller knows where the line sits (the document pass does), that decides the
  // tokenizer. Outside a block scalar the line is YAML structure: its keys, values, booleans,
  // entity ids and trailing comments are YAML, whatever the text looks like. Inside a text block
  // scalar the line is text or a template. Only a CSS block scalar (card_mod style and the like)
  // is CSS. The guess from the text further down is for callers that do not know.
  if (blockScalarKind === "" || blockScalarKind === "text") {
    if (darkPlusIsJinjaLine(raw) || lineKind === "jinja") {
      return blockScalarKind === ""
        ? smartSyntaxTokenizeYamlTemplateLine(raw, lineInfo, order)
        : smartSyntaxTokenizeJinjaSegment(raw, 0, [], order);
    }
    if (blockScalarKind === "text") {
      const start = smartSyntaxLeadingSpaces(raw);
      return [{ start, end: raw.trimEnd().length, kind: "string" }];
    }
    // A CSS value in a YAML list of CSS properties (button-card styles): the key is a YAML key,
    // the value keeps the CSS tokenizer for its functions, numbers and units.
    if (lineInfo && SMART_SYNTAX_CSS_FUNCTION_VALUE.test(raw)) {
      const colon = raw.indexOf(":");
      const valueStart = colon + 1 + smartSyntaxLeadingSpaces(raw.slice(colon + 1));
      const head = smartSyntaxTokenizeYamlLine(raw.slice(0, colon + 1), lineInfo, lineKind, order);
      const value = smartSyntaxTokenizeCssLine(raw.slice(valueStart), "cssValue", order)
        .map((token) => ({ ...token, start: token.start + valueStart, end: token.end + valueStart }));
      return [...head, ...value];
    }
    return smartSyntaxTokenizeYamlLine(raw, lineInfo, lineKind, order);
  }
  if (smartSyntaxIsCssContextLine(raw, lineKind))
    return smartSyntaxTokenizeCssLine(raw, lineKind, order);
  if (darkPlusIsJinjaLine(raw) || lineKind === "jinja")
    return smartSyntaxTokenizeJinjaSegment(raw, 0, [], order);
  return smartSyntaxTokenizeYamlLine(raw, lineInfo, lineKind, order);
}

// The line modes of the last document and the classifier state before each line. The mode of
// a line depends only on the lines above it, so a pass on the same document continues where
// the last one stopped, and a pass after an edit continues from the first line that differs,
// instead of classifying the document from line 1 down to the viewport each time.
let lineModeCache = null;

function smartSyntaxLineModeCacheFor(docLines, darkPlusIsJinjaLine, darkPlusLineKind, order) {
  const last = lineModeCache;
  if (!last || last.isJinjaLine !== darkPlusIsJinjaLine || last.lineKind !== darkPlusLineKind || last.order !== order) {
    lineModeCache = { docLines, isJinjaLine: darkPlusIsJinjaLine, lineKind: darkPlusLineKind, order, modes: [], before: [] };
    return lineModeCache;
  }
  if (last.docLines === docLines) return last;
  const limit = Math.min(last.modes.length, docLines.length);
  let same = 0;
  while (same < limit && last.docLines[same] === docLines[same]) same += 1;
  last.docLines = docLines;
  last.modes.length = same;
  last.before.length = Math.min(last.before.length, same + 1);
  return last;
}

export function smartSyntaxDocumentContextForVisibleLinesFromLines(
  docLines,
  domLines,
  darkPlusIsJinjaLine = /** @type {(line: string, opts?: any) => boolean} */ (() => false),
  darkPlusLineKind = /** @type {(line: string, opts?: any) => string} */ (() => "fg"),
  order = SMART_SYNTAX_KIND_ORDER,
  lineIndexHint = null,
) {
  if (!Array.isArray(docLines) || !docLines.length || !Array.isArray(domLines) || !domLines.length)
    return null;
  // The editor knows the document line of each rendered line. Without that answer the rendered
  // lines are taken as one block, found by a text search over the document.
  const lineIndexes = smartSyntaxLineIndexesMatch(docLines, domLines, lineIndexHint) ? lineIndexHint : null;
  const startIndex = lineIndexes ? lineIndexes[0] : smartSyntaxBestDocumentStartIndex(docLines, domLines);
  const lastIndex = lineIndexes ? lineIndexes[lineIndexes.length - 1] : startIndex + domLines.length - 1;
  const endIndex = Math.min(docLines.length, lastIndex + 5);
  const cache = smartSyntaxLineModeCacheFor(docLines, darkPlusIsJinjaLine, darkPlusLineKind, order);
  const modes = cache.modes;
  // Every classified line has the state that follows it. If that record is missing the cached
  // modes cannot be continued and the document is classified from its first line.
  if (modes.length && !cache.before[modes.length]) {
    modes.length = 0;
    cache.before.length = 0;
  }
  const resume = cache.before[modes.length] || null;
  let blockScalarKind = resume ? resume.blockScalarKind : "";
  let blockScalarIndent = resume ? resume.blockScalarIndent : null;
  let cssCtx = resume ? { ...resume.cssCtx } : { blockComment: false, cssBlockDepth: 0 };
  // The key column of the `style:` map the line is in, or null outside one.
  let cssMapIndent = resume ? (resume.cssMapIndent ?? null) : null;

  for (let i = modes.length; i < endIndex; i += 1) {
    cache.before[i] = { blockScalarKind, blockScalarIndent, cssCtx: { ...cssCtx }, cssMapIndent };
    const raw = String(docLines[i] || "");
    const lead = smartSyntaxLeadingSpaces(raw);
    const trimmed = raw.trim();

    if (blockScalarKind && trimmed && lead <= (blockScalarIndent ?? -1)) {
      blockScalarKind = "";
      blockScalarIndent = null;
      cssCtx = { blockComment: false, cssBlockDepth: 0 };
    }
    // The map ends at the first line that is not deeper than its key. A YAML comment may sit at
    // any column and ends nothing.
    if (!blockScalarKind && cssMapIndent !== null && trimmed && lead <= cssMapIndent && !trimmed.startsWith("#"))
      cssMapIndent = null;

    const info = smartSyntaxYamlLineInfo(raw);
    let lineKind = "fg";
    let lineInfo = info;

    if (blockScalarKind === "css") {
      lineInfo = null;
      cssCtx.blockScalarKind = "css";
      lineKind = trimmed
        ? (darkPlusIsJinjaLine(raw) ? "jinja" : smartSyntaxKind(darkPlusLineKind(raw, cssCtx), order))
        : "fg";
    } else if (blockScalarKind === "text") {
      lineInfo = null;
      const textCtx = { blockComment: false, cssBlockDepth: 0, blockScalarKind: "" };
      lineKind = smartSyntaxTextBlockLineKind(
        smartSyntaxLineKindForMode(raw, textCtx, darkPlusIsJinjaLine, darkPlusLineKind, order),
        trimmed,
      );
    } else {
      const fallbackCtx = { blockComment: false, cssBlockDepth: 0, blockScalarKind: "" };
      lineKind = smartSyntaxLineKindForMode(
        raw,
        fallbackCtx,
        darkPlusIsJinjaLine,
        darkPlusLineKind,
        order,
      );
    }

    modes[i] = { lineKind, lineInfo, blockScalarKind, docLineNumber: i + 1 };

    const cssMapBound = !blockScalarKind && cssMapIndent !== null ? smartSyntaxCssMapBlockScalarBound(raw) : -1;
    if (info && !blockScalarKind && smartSyntaxCssBlockScalarStart(info)) {
      blockScalarKind = "css";
      blockScalarIndent = smartSyntaxBlockScalarBound(info);
      cssCtx = { blockComment: false, cssBlockDepth: 0 };
    } else if (cssMapBound >= 0) {
      blockScalarKind = "css";
      blockScalarIndent = cssMapBound;
      cssCtx = { blockComment: false, cssBlockDepth: 0 };
    } else if (info && !blockScalarKind && smartSyntaxTextBlockScalarStart(info)) {
      blockScalarKind = "text";
      blockScalarIndent = smartSyntaxBlockScalarBound(info);
    } else if (!blockScalarKind && cssMapIndent === null && smartSyntaxCssMapStart(info)) {
      cssMapIndent = smartSyntaxBlockScalarBound(info);
    }
    cache.before[i + 1] = { blockScalarKind, blockScalarIndent, cssCtx: { ...cssCtx }, cssMapIndent };
  }

  return { docLines, startIndex, modes, lineIndexes };
}

export function smartSyntaxUpdateBlockContext(ctx, lineText) {
  const raw = String(lineText || "");
  const lead = smartSyntaxLeadingSpaces(raw);
  const trimmed = raw.trim();
  if (!trimmed) return;
  if (ctx.blockScalarKind && lead <= (ctx.blockScalarIndent || 0)) {
    ctx.blockScalarKind = "";
    ctx.blockScalarIndent = null;
  }
  if (ctx.blockScalarKind) return;
  // The `style:` map of card_mod, as in the document pass above.
  if (typeof ctx.cssMapIndent === "number" && lead <= ctx.cssMapIndent && !trimmed.startsWith("#"))
    ctx.cssMapIndent = null;
  const inCssMap = typeof ctx.cssMapIndent === "number";
  const cssMapBound = inCssMap ? smartSyntaxCssMapBlockScalarBound(raw) : -1;
  const info = smartSyntaxYamlLineInfo(raw);
  if (info && smartSyntaxCssBlockScalarStart(info)) {
    ctx.blockScalarKind = "css";
    ctx.blockScalarIndent = smartSyntaxBlockScalarBound(info);
    ctx.cssBlockDepth = 0;
    ctx.blockComment = false;
  } else if (cssMapBound >= 0) {
    ctx.blockScalarKind = "css";
    ctx.blockScalarIndent = cssMapBound;
    ctx.cssBlockDepth = 0;
    ctx.blockComment = false;
  } else if (info && smartSyntaxTextBlockScalarStart(info)) {
    ctx.blockScalarKind = "text";
    ctx.blockScalarIndent = smartSyntaxBlockScalarBound(info);
  } else if (!inCssMap && smartSyntaxCssMapStart(info)) {
    ctx.cssMapIndent = smartSyntaxBlockScalarBound(info);
  }
}

export function smartSyntaxLineKindForMode(
  lineText,
  ctx,
  darkPlusIsJinjaLine = /** @type {(line: string, opts?: any) => boolean} */ (() => false),
  darkPlusLineKind = /** @type {(line: string, opts?: any) => string} */ (() => "fg"),
  order = SMART_SYNTAX_KIND_ORDER,
) {
  const raw = String(lineText || "");
  const trimmed = raw.trim();
  if (!trimmed) return "fg";
  if (ctx.blockScalarKind === "css") {
    if (darkPlusIsJinjaLine(raw)) return "jinja";
    return smartSyntaxKind(darkPlusLineKind(raw, ctx), order);
  }
  if (ctx.blockScalarKind === "text") {
    const textCtx = { blockComment: false, cssBlockDepth: 0, blockScalarKind: "" };
    return smartSyntaxTextBlockLineKind(
      smartSyntaxLineKindForMode(raw, textCtx, darkPlusIsJinjaLine, darkPlusLineKind, order),
      trimmed,
    );
  }
  const info = smartSyntaxYamlLineInfo(raw);
  if (info) {
    if (info.listPrefix) return "yamlList";
    if (!info.valueText) return "key";
    return "fg";
  }
  if (/^[-]$/.test(trimmed) || /^[-]\s+/.test(trimmed)) return "yamlList";
  return smartSyntaxKind(darkPlusLineKind(raw, ctx), order);
}

export function smartSyntaxTokenKind(
  tokenText,
  lineText,
  lineKind,
  tokenStart,
  tokenEnd,
  lineInfo,
  darkPlusIsJinjaLine = /** @type {(line: string, opts?: any) => boolean} */ (() => false),
  darkPlusTokenKind = ({ textContent }, _raw, fallbackKind) =>
    smartSyntaxScalarKind(textContent, fallbackKind, lineInfo),
  normalizeKind = smartSyntaxKind,
) {
  const t = String(tokenText || "").trim();
  const raw = String(lineText || "");
  if (!t) return "fg";

  if (lineKind === "comment") return "comment";

  if (smartSyntaxOffsetInQuotedString(raw, tokenStart) && !/^['"]$/.test(t)) {
    return "string";
  }

  // On a `key: value` line the list dash, key and colon keep their YAML kinds when the value
  // holds a template.
  const inKeyPart = !!lineInfo && tokenStart < lineInfo.valueStart;
  if ((darkPlusIsJinjaLine(raw) || lineKind === "jinja") && !inKeyPart) {
    return darkPlusTokenKind({ textContent: tokenText }, raw, "jinja");
  }

  if (lineInfo) {
    if (t === "-" && tokenEnd <= lineInfo.keyStart) return "yamlList";
    if (tokenStart >= lineInfo.keyStart && tokenEnd <= lineInfo.keyEnd) return "key";
    if (tokenStart <= lineInfo.colonIndex && tokenEnd > lineInfo.colonIndex) return "punct";
    if (tokenStart < lineInfo.valueStart && /^[-\s:]+$/.test(String(tokenText || "")))
      return /-/.test(tokenText) ? "yamlList" : "punct";
    if (tokenStart >= lineInfo.valueStart) return smartSyntaxScalarKind(t, "fg", lineInfo);
    return "key";
  }

  if (
    lineKind === "cssSelector" ||
    lineKind === "cssProp" ||
    lineKind === "cssValue" ||
    lineKind === "cssGlow" ||
    /[{};]/.test(raw)
  ) {
    return smartSyntaxCssTokenKind(tokenText, raw, lineKind, tokenStart, tokenEnd);
  }

  const fallback = darkPlusTokenKind({ textContent: tokenText }, raw, lineKind);
  return normalizeKind(fallback);
}
