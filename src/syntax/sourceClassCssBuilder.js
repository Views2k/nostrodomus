// Nostrodomus Source-class stylesheet builder: maps highlight tags to stable class rules.
// Cross-module calls go through the shared syntax runtime api object.

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

function codeMirrorSpecialTag(tags, helperName, baseTag) {
    try {
      const helper = tags?.[helperName];
      return typeof helper === "function" && baseTag ? helper(baseTag) : null;
    } catch {
      return null;
    }
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

// important-override registry — source-class token color rules.

// external rules overridden: CodeMirror's injected theme stylesheet (same roots,

//   class-specificity color rules) and HA theme text rules.

// owner: source-class stylesheet (CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID block).

// reason: source-class colors are the fallback syntax path when the native highlight

//   extension is unavailable; they must beat CM theme defaults.

// removal condition: source-class fallback retirement (native-only syntax).

// verification: source-class runtime owner static tests; browser smoke syntax items.

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
    // The base/fallback foreground must be the neutral codebox fg, never the theme palette fg.
    // darkPlusColor("fg", syntax) resolves to the active preset's foreground (a light tint of the
    // theme color, near-white for several themes), and the syntax-opacity slider turns it into
    // rgba(255,255,255,0.67); emitted on .cm-content / .cm-line it flashes a token/line white for ~1
    // frame whenever a Ctrl+Space re-render drops the Nostrodomus semantic classes. The var is wired to
    // #d4d4d4 (codeboxPreflight.js / styleDomRuntime.js) so it stays neutral, never the palette fg.
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
      /* Base editor foreground belongs on the LINE CONTAINER, NOT on every token span (a broad
         \`.cm-content .cm-line span { color: ... }\` whited out semantic tokens whenever a Ctrl+Space
         re-render briefly dropped a token's Nostrodomus kind class). It carries the NEUTRAL codebox fg
         (\`var(--nostrodomus-codebox-syntax-fg, #d4d4d4)\`), NEVER the theme palette fg — the latter can be
         white (\`#ffffff\` x opacity -> \`rgba(255,255,255,0.67)\`) and would flash white during that
         repaint gap (the line-level white-out). Plain text inherits this neutral color; token/line
         semantic rules still win when present; no broad span \`-webkit-text-fill-color\` here. */
      .cm-content .cm-line {
        color: ${neutralFg} !important;
        transition: none !important;
      }
      /* Stable CM token-class color floor (the Ctrl+Space white-out fix). HA's CodeMirror YAML mode tags
         string/number tokens with the PERSISTENT classes .yaml-string / .yaml-number — they survive an
         autocomplete re-render — but highlightingFor() yields no class in this build, so the per-tag
         source rules above are empty and these tokens carry no Nostrodomus color of their own. Normally the
         smart-syntax kind overlay (.nostrodomus-syntax-kind-*) colors them, but a Ctrl+Space re-render briefly
         DROPS that overlay class, after which the token would fall to the neutral line fg instead of its
         proper string/number color. Color the stable classes directly so a de-classed string/number token
         keeps its proper color: color + -webkit-text-fill-color set explicitly here (the container now uses
         currentColor, so these override the inherited neutral fg). Specificity 0,3,1 beats the base line
         fallback (0,2,1); the smart-syntax kind rules are appended later in the
         same sheet at the same specificity, so they still WIN when present (distinct entity/service/number
         colors) — this is only the no-white floor for the gap when the overlay class is momentarily gone. */
      .cm-content .cm-line span.yaml-string {
        color: ${stringColor} !important;
        -webkit-text-fill-color: ${stringColor} !important;
      }
      .cm-content .cm-line span.yaml-number {
        color: ${numberColor} !important;
        -webkit-text-fill-color: ${numberColor} !important;
      }
    `);

    const specialString = codeMirrorSpecialTag(tags, "special", tags.string);
    const localVariable = codeMirrorSpecialTag(tags, "local", tags.variableName);
    const definitionVariable = codeMirrorSpecialTag(tags, "definition", tags.variableName);
    const functionVariable = codeMirrorSpecialTag(tags, "function", tags.variableName);
    const functionProperty = codeMirrorSpecialTag(tags, "function", tags.propertyName);

    addCodeMirrorSourceClassRule(classRules, cm, view, "comment", tags.comment, "comment", syntax, "font-style: italic !important;");
    addCodeMirrorSourceClassRule(classRules, cm, view, "lineComment", tags.lineComment, "comment", syntax, "font-style: italic !important;");
    addCodeMirrorSourceClassRule(classRules, cm, view, "blockComment", tags.blockComment, "comment", syntax, "font-style: italic !important;");
    addCodeMirrorSourceClassRule(classRules, cm, view, "docComment", tags.docComment, "comment", syntax, "font-style: italic !important;");

    addCodeMirrorSourceClassRule(classRules, cm, view, "keyword", tags.keyword, "keyword", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "controlKeyword", tags.controlKeyword, "keyword", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "definitionKeyword", tags.definitionKeyword, "keyword", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "operatorKeyword", tags.operatorKeyword, "op", syntax);

    addCodeMirrorSourceClassRule(classRules, cm, view, "string", tags.string, "string", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "specialString", specialString, "string", syntax);

    addCodeMirrorSourceClassRule(classRules, cm, view, "number", tags.number, "number", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "integer", tags.integer, "number", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "float", tags.float, "number", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "bool", tags.bool, "bool", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "null", tags.null, "bool", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "atom", tags.atom, "keyword", syntax);

    addCodeMirrorSourceClassRule(classRules, cm, view, "variableName", tags.variableName, "string", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "localVariable", localVariable, "string", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "definitionVariable", definitionVariable, "key", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "propertyName", tags.propertyName, "key", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "attributeName", tags.attributeName, "key", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "typeName", tags.typeName, "cssValue", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "className", tags.className, "cssValue", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "functionVariable", functionVariable, "jinja", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "functionProperty", functionProperty, "jinja", syntax);

    addCodeMirrorSourceClassRule(classRules, cm, view, "operator", tags.operator, "op", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "punctuation", tags.punctuation, "punct", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "separator", tags.separator, "punct", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "bracket", tags.bracket, "punct", syntax);
    addCodeMirrorSourceClassRule(classRules, cm, view, "invalid", tags.invalid, "cssGlow", syntax);

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
    codeMirrorSpecialTag,
    addCodeMirrorSourceClassRule,
    buildCodeMirrorSourceClassSyntaxCss,
  };
}
