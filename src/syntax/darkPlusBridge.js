// Nostrodomus Dark+ classifier bridge: binds the palette and settings into the pure classifier
// module and classifies lines and tokens for the class painter.
// Cross-module calls go through the shared syntax runtime api object.

import * as darkPlus from './darkPlusClassifiers.js';

export function createDarkPlusBridge(deps) {
  const {
    DARKPLUS_SYNTAX_COLORS,
    syntaxColorWithOpacity,
    api,
  } = deps;

  function darkPlusColor(kind, syntax) {
    const color = syntax?.palette?.[kind] || DARKPLUS_SYNTAX_COLORS[kind] || DARKPLUS_SYNTAX_COLORS.fg;
    return syntaxColorWithOpacity(color, syntax?.themeOpacity ?? 1);
  }

  function darkPlusCssDepthDelta(text) {
    return darkPlus.darkPlusCssDepthDelta(text);
  }

  function darkPlusCommitCssDepth(ctx, text) {
    if (!ctx) return;
    const next = Math.max(0, (ctx.cssBlockDepth || 0) + darkPlusCssDepthDelta(text));
    ctx.cssBlockDepth = next;
  }

  function darkPlusLooksCssSelector(text) {
    return darkPlus.darkPlusLooksCssSelector(text);
  }

  function darkPlusLooksCssDeclaration(text) {
    return darkPlus.darkPlusLooksCssDeclaration(text);
  }

  function darkPlusLooksCssContinuation(text) {
    return darkPlus.darkPlusLooksCssContinuation(text);
  }

  function darkPlusIsJinjaLine(text) {
    return darkPlus.darkPlusIsJinjaLine(text);
  }

  function darkPlusIsJinjaKeyword(token) {
    return darkPlus.darkPlusIsJinjaKeyword(token);
  }

  function darkPlusLineKind(text, ctx) {
    const raw = String(text || "");
    const t = raw.trim();
    const cssDepth = ctx?.cssBlockDepth || 0;
    if (!t) return "fg";
    if (ctx.blockComment) {
      if (t.includes("*/")) ctx.blockComment = false;
      darkPlusCommitCssDepth(ctx, t);
      return "comment";
    }
    if (t.includes("/*") && !t.includes("*/")) {
      ctx.blockComment = true;
      darkPlusCommitCssDepth(ctx, t);
      return "comment";
    }
    // Inside a CSS block scalar '#' starts an id selector or a hex color and '*' is the universal
    // selector. Only the CSS and JS comment openers are comments there; '#' and a leading '*'
    // are YAML and block-comment conventions that do not apply to the scalar's content.
    const inCssScalar = ctx?.blockScalarKind === "css";
    if (inCssScalar ? /^(\/\/|\/\*|\*\/)/.test(t) : /^(#|\/\/|\/\*|\*|\*\/)/.test(t)) {
      darkPlusCommitCssDepth(ctx, t);
      return "comment";
    }
    if (inCssScalar && cssDepth > 0 && /^#[0-9a-f]{3,8}\b[^{]*$/i.test(t)) {
      darkPlusCommitCssDepth(ctx, t);
      return "cssValue";
    }
    if (darkPlusIsJinjaLine(raw)) {
      darkPlusCommitCssDepth(ctx, t);
      return "jinja";
    }
    if (/^[-]$/.test(t) || /^[-]\s+/.test(t)) return "yamlList";
    if (darkPlusLooksCssSelector(t)) {
      darkPlusCommitCssDepth(ctx, t);
      return "cssSelector";
    }
    if (darkPlusLooksCssDeclaration(t)) {
      darkPlusCommitCssDepth(ctx, t);
      return "cssProp";
    }
    if (cssDepth > 0 || darkPlusLooksCssContinuation(t)) {
      const kind = /^[:{}[\](),.;]+$/.test(t) ? "punct" : /!important/i.test(t) ? "cssGlow" : /^[-\w]+\s*:/.test(t) ? "cssProp" : "cssValue";
      darkPlusCommitCssDepth(ctx, t);
      return kind;
    }
    if (/^[:{}[\](),.;]+$/.test(t)) return "punct";
    if (/^(true|false|on|off|yes|no|null|none)$/i.test(t)) return "bool";
    if (/^-?\d+(\.\d+)?(px|em|rem|vh|vw|%|s|ms|fr|ch|deg)?$/i.test(t)) return "number";
    if (/^[\w$.-]+\s*:/.test(t)) return "key";
    if (/^\|\s*[a-z_][\w-]*/i.test(t)) return "filter";
    if (/^(if|else|elif|endif|for|endfor|set|in|not|and|or|is|defined)$/i.test(t)) return "keyword";
    if (/^[A-Za-z_][\w.-]*$/.test(t)) return "string";
    return "fg";
  }

  function darkPlusTokenKind(span, lineText, lineKind) {
    const text = String(span?.textContent || "");
    const t = text.trim();
    const full = String(lineText || "");
    if (!t) return lineKind || "fg";
    const cssLine = /^css/.test(String(lineKind || ""));
    if (/^(\/\/|\/\*|\*\/)/.test(t) || (!cssLine && /^[#*]/.test(t))) return "comment";
    if (darkPlusIsJinjaLine(full) || lineKind === "jinja") {
      if (/^\{[#%{]-?$|^-?[#%}]\}$|^\{\{|^\}\}|^\{%|^%\}|^\{#|^#\}/.test(t)) return "punct";
      if (/^['"]/.test(t)) return "string";
      if (/^-?\d+(\.\d+)?$/.test(t)) return "number";
      if (/^(true|false|none|null)$/i.test(t)) return "bool";
      if (/^\|[A-Za-z_][\w-]*$/.test(t)) return "filter";
      if (darkPlusIsJinjaKeyword(t)) return "keyword";
      if (/^[-|>=<~!+*/%]+$/.test(t)) return "op";
      return "jinja";
    }
    if (/^['"]/.test(t)) return "string";
    if (/^-?\d+(\.\d+)?(px|em|rem|vh|vw|%|s|ms|fr|ch|deg)?$/i.test(t)) return "number";
    if (/^(true|false|on|off|yes|no|null|none)$/i.test(t)) return "bool";
    if (/^--[A-Za-z0-9_-]+$/.test(t) || /^--[A-Za-z0-9_-]+\s*:/.test(t)) return "cssProp";
    if (/^(var|rgb|rgba|hsl|hsla|calc|linear-gradient|url)$/i.test(t) || /^(var|rgb|rgba|hsl|hsla|calc|linear-gradient|url)\(/i.test(t) || /^#[0-9a-f]{3,8}\b/i.test(t)) return "cssValue";
    if (/!important/i.test(t)) return "cssGlow";
    if (/^[:{}[\](),.;]+$/.test(t)) return "punct";
    if (/^[-|>=<~!+*/%]+$/.test(t)) return "op";
    if (lineKind === "cssSelector" && /^[.#]?[A-Za-z0-9_$:-]+$/.test(t)) return "cssSelector";
    if ((lineKind === "cssProp" || lineKind === "cssValue" || lineKind === "cssGlow") && /^[A-Za-z-]+\s*:/.test(t)) return "cssProp";
    if ((lineKind === "cssProp" || lineKind === "cssValue" || lineKind === "cssGlow") && /(;|\)|,|var\(|rgb\(|rgba\(|hsl\(|hsla\(|calc\()/i.test(t)) return "cssValue";
    if (/^[\w$.-]+:$/.test(t)) return "key";
    if (lineKind && lineKind !== "fg") return lineKind;
    if (/^[A-Za-z_][\w.-]*$/.test(t)) return "string";
    return lineKind || "fg";
  }

  function applyDarkPlusSyntaxColoring(editor, settings) {
    const source = api.installCodeMirrorSourceClassSyntax(editor, settings, "apply-darkplus-syntax-coloring");
    if (source?.installed) return source;
    return { lines: 0, spans: 0, skipped: true, sourceClassUnavailable: true };
  }

  return {
    darkPlusColor,
    darkPlusCssDepthDelta,
    darkPlusCommitCssDepth,
    darkPlusLooksCssSelector,
    darkPlusLooksCssDeclaration,
    darkPlusLooksCssContinuation,
    darkPlusIsJinjaLine,
    darkPlusIsJinjaKeyword,
    darkPlusLineKind,
    darkPlusTokenKind,
    applyDarkPlusSyntaxColoring,
  };
}
