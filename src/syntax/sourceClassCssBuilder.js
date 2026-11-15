// Nostrodomus Source-class stylesheet builder: maps highlight tags to stable class rules.
// Cross-module calls go through the shared syntax runtime api object.

import { CODEMIRROR_NATIVE_HIGHLIGHT_KIND_MAP, codeMirrorTagForLabel } from './codeMirrorNativeHighlight.js';

export function createSourceClassCssBuilder(deps) {
  const {
    cssEscapeSelectorPart,
    api,
  } = deps;

  function codeMirrorClassNamesForTag(cm, view, tag) {
    if (!tag || typeof cm?.highlightingFor !== "function" || !view?.state) return [];
    let result = "";
    try {
      result = cm.highlightingFor(view.state, [tag]) || "";
      if (!result) result = cm.highlightingFor(view.state, tag) || "";
    } catch {
      result = "";
    }
    return Array.from(new Set(String(result).trim().split(/\s+/).filter(Boolean)));
  }

  function addCodeMirrorSourceClassRule(classRules, cm, view, label, tag, kind, syntax, extraCss = "") {
    const classNames = codeMirrorClassNamesForTag(cm, view, tag);
    if (!classNames.length) return 0;
    const color = api.darkPlusColor(kind, syntax);
    const glow = syntax?.active ? (syntax.textShadow || "none") : "none";
    for (const className of classNames) {
      const key = String(className || "");
      if (!key) continue;
      const existing = classRules.get(key);
      if (existing) {
        existing.collidedWith = existing.collidedWith || [];
        existing.collidedWith.push(label);
        continue;
      }
      classRules.set(key, { className: key, label, kind, color, glow, extraCss, collidedWith: [] });
    }
    return classNames.length;
  }

  // These rules color the code where the CodeMirror highlight extension is not available. They
  // use !important to win over CodeMirror's theme stylesheet in the same root and over Home
  // Assistant theme text rules.
  function emitCodeMirrorSourceClassRules(classRules) {
    const rules = [];
    for (const entry of classRules.values()) {
      const selector = `.${cssEscapeSelectorPart(entry.className)}`;
      rules.push(`
        .cm-editor .cm-content .cm-line span${selector},
        .cm-editor .cm-content .cm-line ${selector},
        .cm-content .cm-line span${selector},
        .cm-content .cm-line ${selector},
        .cm-line span${selector},
        .cm-line ${selector},
        ${selector} {
          color: ${entry.color} !important;
          -webkit-text-fill-color: ${entry.color} !important;
          text-shadow: ${entry.glow} !important;
          ${entry.extraCss || ""}
        }
      `);
    }
    return rules;
  }

  function buildCodeMirrorSourceClassSyntaxCss(parts, syntax) {
    const { cm, view, tags } = parts || {};
    if (!cm || !view || !tags) return null;
    const rules = [];
    const classRules = new Map();
    // The base foreground is the neutral codebox fg variable (#d4d4d4 by default), not the palette
    // fg. The palette fg is near-white on several presets, and on .cm-content or .cm-line it would
    // flash a line white for a frame when a Ctrl+Space re-render drops the Nostrodomus classes.
    const neutralFg = "var(--nostrodomus-codebox-syntax-fg, #d4d4d4)";
    const dim = api.darkPlusColor("dim", syntax);
    const stringColor = api.darkPlusColor("string", syntax);
    const numberColor = api.darkPlusColor("number", syntax);

    rules.push(`
      /* Nostrodomus source-class syntax.
         Uses CodeMirror's own tag-to-class map via highlightingFor(); no per-span repaint. */
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
      /* The base color sits on the line, not on every token span, so a token that briefly loses
         its kind class shows the neutral line color. */
      .cm-content .cm-line {
        color: ${neutralFg} !important;
        transition: none !important;
      }
      /* Home Assistant's YAML mode gives strings and numbers the classes .yaml-string and
         .yaml-number, which survive a re-render; highlightingFor() returns no class for them.
         These rules keep their color while a re-render has dropped the kind class. The kind rules
         come later in this sheet at the same specificity and win when present. */
      .cm-content .cm-line span.yaml-string {
        color: ${stringColor} !important;
        -webkit-text-fill-color: ${stringColor} !important;
      }
      .cm-content .cm-line span.yaml-number {
        color: ${numberColor} !important;
        -webkit-text-fill-color: ${numberColor} !important;
      }
    `);

    // The same tags and kinds as the native highlight extension.
    for (const [label, kind, extra] of CODEMIRROR_NATIVE_HIGHLIGHT_KIND_MAP) {
      const extraCss = extra?.fontStyle ? `font-style: ${extra.fontStyle} !important;` : "";
      addCodeMirrorSourceClassRule(classRules, cm, view, label, codeMirrorTagForLabel(tags, label), kind, syntax, extraCss);
    }

    const classMap = Array.from(classRules.values()).map(entry => ({
      label: entry.label,
      kind: entry.kind,
      classes: [entry.className],
      color: entry.color,
      collidedWith: entry.collidedWith || [],
    }));
    const sourceClassRuleCollisions = classMap.reduce((total, entry) => total + (entry.collidedWith?.length || 0), 0);
    rules.push(...emitCodeMirrorSourceClassRules(classRules));
    rules.push(api.buildSmartSyntaxClassCss(syntax));

    return { css: rules.join("\n"), classMap, sourceClassRuleCollisions };
  }

  return {
    codeMirrorClassNamesForTag,
    addCodeMirrorSourceClassRule,
    buildCodeMirrorSourceClassSyntaxCss,
  };
}
