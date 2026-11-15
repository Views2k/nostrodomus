import test from "node:test";
import assert from "node:assert/strict";

import {
  smartSyntaxBestDocumentStartIndex,
  smartSyntaxCssBlockScalarStart,
  smartSyntaxCssDeclarationBounds,
  smartSyntaxCssDeclarationInfo,
  smartSyntaxDocumentContextForVisibleLinesFromLines,
  smartSyntaxDocLinesFromEditor,
  smartSyntaxCssFunctionName,
  smartSyntaxCssNumericToken,
  smartSyntaxCssTokenKind,
  smartSyntaxCssValueKeyword,
  smartSyntaxIsCssContextLine,
  smartSyntaxLeadingSpaces,
  smartSyntaxLineKindForMode,
  smartSyntaxOffsetInQuotedString,
  smartSyntaxPushRange,
  smartSyntaxRangeTokensForLine,
  smartSyntaxScalarKind,
  smartSyntaxTokenizeCssLine,
  smartSyntaxTokenizeJinjaInsideCss,
  smartSyntaxTokenizeJinjaSegment,
  smartSyntaxTokenizeYamlLine,
  smartSyntaxTokenKind,
  smartSyntaxUpdateBlockContext,
  smartSyntaxYamlLineInfo,
} from "../../src/syntax/smartSyntaxTokenizers.js";

test("smart syntax push range merges touching ranges of a kind, clamps at 0, drops empty ranges and files an unknown kind under fg", () => {
  const tokens = [];
  smartSyntaxPushRange(tokens, -5, 3, "cssValue");
  smartSyntaxPushRange(tokens, 3, 8, "cssValue");
  smartSyntaxPushRange(tokens, 8, 8, "cssValue");
  smartSyntaxPushRange(tokens, 8, 10, "not-real");
  assert.deepEqual(tokens, [
    { start: 0, end: 8, kind: "cssValue" },
    { start: 8, end: 10, kind: "fg" },
  ]);
});

test("smart syntax CSS context classifier detects CSS lines and contexts", () => {
  assert.equal(smartSyntaxCssValueKeyword("transparent"), true);
  assert.equal(smartSyntaxCssValueKeyword("not-a-keyword"), false);
  assert.equal(smartSyntaxIsCssContextLine("ha-card { color: red; }", ""), true);
  assert.equal(
    smartSyntaxIsCssContextLine("    --nostrodomus-codebox-frame-glow: rgba(1,2,3,.5)", ""),
    true,
  );
  assert.equal(smartSyntaxIsCssContextLine("plain yaml text", ""), false);
  assert.equal(smartSyntaxIsCssContextLine("anything", "cssValue"), true);
});

test("smart syntax Jinja tokenizer gives each token its offset and kind, also inside CSS", () => {
  assert.deepEqual(smartSyntaxTokenizeJinjaSegment('{{ states("sensor.temp") | float }}', 2), [
    { start: 2, end: 4, kind: "jinja" },
    { start: 5, end: 11, kind: "keyword" },
    { start: 11, end: 12, kind: "punct" },
    { start: 12, end: 25, kind: "string" },
    { start: 25, end: 26, kind: "punct" },
    { start: 27, end: 28, kind: "op" },
    { start: 29, end: 34, kind: "keyword" },
    { start: 35, end: 37, kind: "jinja" },
  ]);

  const tokens = [];
  const end = smartSyntaxTokenizeJinjaInsideCss("color: {{ value }};", 7, tokens);
  assert.equal(end, 18);
  assert.deepEqual(tokens, [
    { start: 7, end: 9, kind: "jinja" },
    { start: 10, end: 15, kind: "filter" },
    { start: 16, end: 18, kind: "jinja" },
  ]);
});

test("smart syntax CSS tokenizer marks selectors, properties, values, functions and Jinja", () => {
  assert.deepEqual(
    smartSyntaxTokenizeCssLine("ha-card { color: #ff00aa !important; }", "cssSelector"),
    [
      { start: 0, end: 7, kind: "cssSelector" },
      { start: 8, end: 9, kind: "punct" },
      { start: 10, end: 15, kind: "cssProp" },
      { start: 15, end: 16, kind: "punct" },
      { start: 17, end: 24, kind: "cssValue" },
      { start: 25, end: 35, kind: "cssGlow" },
      { start: 35, end: 36, kind: "punct" },
      { start: 37, end: 38, kind: "punct" },
    ],
  );

  assert.deepEqual(smartSyntaxTokenizeCssLine("filter: blur(12px) saturate(135%);", "cssValue"), [
    { start: 0, end: 6, kind: "cssProp" },
    { start: 6, end: 7, kind: "punct" },
    { start: 8, end: 12, kind: "filter" },
    { start: 12, end: 13, kind: "punct" },
    { start: 13, end: 17, kind: "number" },
    { start: 17, end: 18, kind: "punct" },
    { start: 19, end: 27, kind: "filter" },
    { start: 27, end: 28, kind: "punct" },
    { start: 28, end: 31, kind: "number" },
    { start: 31, end: 32, kind: "cssValue" },
    { start: 32, end: 34, kind: "punct" },
  ]);

  assert.deepEqual(smartSyntaxTokenizeCssLine('color: {{ states("sensor.color") }};', "cssValue"), [
    { start: 0, end: 5, kind: "cssSelector" },
    { start: 5, end: 6, kind: "punct" },
    { start: 7, end: 9, kind: "jinja" },
    { start: 10, end: 16, kind: "keyword" },
    { start: 16, end: 17, kind: "punct" },
    { start: 17, end: 31, kind: "string" },
    { start: 31, end: 32, kind: "punct" },
    { start: 33, end: 35, kind: "jinja" },
    { start: 35, end: 36, kind: "punct" },
  ]);
});

test("smart syntax YAML and CSS context helpers parse lines", () => {
  assert.equal(smartSyntaxLeadingSpaces("    key: value"), 4);
  assert.equal(smartSyntaxLeadingSpaces(null), 0);

  assert.deepEqual(smartSyntaxYamlLineInfo("  - card_mod: |"), {
    lead: 2,
    listPrefix: "- ",
    key: "card_mod",
    cleanKey: "card_mod",
    keyStart: 4,
    keyEnd: 12,
    colonIndex: 12,
    valueStart: 13,
    valueText: "|",
  });

  assert.deepEqual(smartSyntaxYamlLineInfo('    "extra_styles": >'), {
    lead: 4,
    listPrefix: "",
    key: '"extra_styles"',
    cleanKey: "extra_styles",
    keyStart: 4,
    keyEnd: 18,
    colonIndex: 18,
    valueStart: 19,
    valueText: ">",
  });

  assert.equal(smartSyntaxYamlLineInfo("plain text"), null);

  assert.deepEqual(smartSyntaxCssDeclarationInfo("  --nostrodomus-glow: rgba(1, 2, 3, .4);"), {
    prop: "--nostrodomus-glow",
    propStart: 2,
    propEnd: 20,
    colonIndex: 20,
    valueStart: 21,
  });
  assert.equal(smartSyntaxCssDeclarationInfo("ha-card { color: red; }"), null);

  assert.equal(smartSyntaxCssBlockScalarStart(smartSyntaxYamlLineInfo("style: |")), true);
  assert.equal(smartSyntaxCssBlockScalarStart(smartSyntaxYamlLineInfo("name: |")), false);
  assert.equal(smartSyntaxCssBlockScalarStart(null), false);
});

test("smart syntax quoted-string helper finds offsets inside quoted strings", () => {
  assert.equal(smartSyntaxOffsetInQuotedString('color: "red blue";', 9), true);
  assert.equal(smartSyntaxOffsetInQuotedString('color: "red blue";', 17), false);
  assert.equal(smartSyntaxOffsetInQuotedString("value: 'a\\'b' end", 11), true);
  assert.equal(smartSyntaxOffsetInQuotedString("plain text", 3), false);
});

test("smart syntax visible-document alignment scores the best start", () => {
  const docLines = [
    "type: custom:mushroom-template-card",
    "primary: Kitchen",
    "",
    "card_mod:",
    "  style: |",
    "    ha-card {",
    "      color: red;",
    "    }",
  ];

  assert.equal(
    smartSyntaxBestDocumentStartIndex(docLines, [
      { textContent: "card_mod:" },
      { textContent: "  style: |" },
      { textContent: "    ha-card {" },
    ]),
    3,
  );

  assert.equal(
    smartSyntaxBestDocumentStartIndex(docLines, [
      { textContent: "  card_mod:" },
      { textContent: "  style: |" },
    ]),
    3,
  );

  assert.equal(smartSyntaxBestDocumentStartIndex([], [{ textContent: "x" }]), 0);
  assert.equal(smartSyntaxBestDocumentStartIndex(docLines, []), 0);
  assert.equal(smartSyntaxBestDocumentStartIndex(null, null), 0);
});

test("smart syntax editor document-lines helper reads the lines of the CodeMirror document", () => {
  const calls = [];
  const editor = { id: "editor-1" };
  const docLines = ["type: custom:mushroom-template-card", "primary: Kitchen", "", "card_mod:"];
  const codeMirrorSourceClassParts = (inputEditor) => {
    calls.push(inputEditor);
    return {
      view: {
        state: {
          doc: {
            lines: docLines.length,
            line(lineNo) {
              return { text: docLines[lineNo - 1] };
            },
          },
        },
      },
    };
  };

  assert.deepEqual(smartSyntaxDocLinesFromEditor(editor, codeMirrorSourceClassParts), docLines);
  assert.deepEqual(calls, [editor]);
});

test("smart syntax editor document-lines helper returns null without a document or on an error, and empty text for a missing line", () => {
  assert.equal(smartSyntaxDocLinesFromEditor({ id: "no-doc" }, () => ({ view: { state: {} } })), null);
  assert.equal(
    smartSyntaxDocLinesFromEditor({ id: "bad-lines" }, () => ({
      view: { state: { doc: { lines: Number.NaN, line: () => ({ text: "x" }) } } },
    })),
    null,
  );
  assert.equal(
    smartSyntaxDocLinesFromEditor({ id: "throws" }, () => {
      throw new Error("blocked");
    }),
    null,
  );

  assert.deepEqual(
    smartSyntaxDocLinesFromEditor({ id: "missing-text" }, () => ({
      view: { state: { doc: { lines: 2, line: (lineNo) => (lineNo === 1 ? null : {}) } } },
    })),
    ["", ""],
  );
});

test("smart syntax scalar and CSS token-kind helpers classify tokens", () => {
  assert.equal(smartSyntaxScalarKind("", "cssValue"), "cssValue");
  assert.equal(smartSyntaxScalarKind("# comment"), "comment");
  assert.equal(smartSyntaxScalarKind("&anchor"), "keyword");
  assert.equal(smartSyntaxScalarKind("*anchor"), "keyword");
  assert.equal(smartSyntaxScalarKind("!include"), "keyword");
  assert.equal(smartSyntaxScalarKind('"hello"'), "string");
  assert.equal(smartSyntaxScalarKind("false"), "bool");
  assert.equal(smartSyntaxScalarKind("12px"), "number");
  assert.equal(
    smartSyntaxScalarKind("sensor.kitchen_temp", "fg", { cleanKey: "entity" }),
    "filter",
  );
  assert.equal(smartSyntaxScalarKind("#ff00aa", "cssValue"), "comment");
  assert.equal(smartSyntaxScalarKind("#ff00aa", "fg"), "comment");
  assert.equal(smartSyntaxScalarKind("rgba(1,2,3,.5)"), "filter");
  assert.equal(smartSyntaxScalarKind("--nostrodomus-token"), "cssProp");
  assert.equal(smartSyntaxScalarKind(":", "fg"), "punct");
  assert.equal(smartSyntaxScalarKind(">=", "fg"), "op");
  assert.equal(smartSyntaxScalarKind("|default", "fg"), "filter");
  assert.equal(smartSyntaxScalarKind("plain", "cssSelector"), "cssSelector");

  assert.equal(smartSyntaxCssFunctionName("color-mix("), true);
  assert.equal(smartSyntaxCssFunctionName("not-a-function"), false);
  assert.equal(smartSyntaxCssNumericToken("12px"), true);
  assert.equal(smartSyntaxCssNumericToken("1, 2, 3, .4"), true);
  assert.equal(smartSyntaxCssNumericToken("twelve"), false);

  assert.deepEqual(smartSyntaxCssDeclarationBounds("ha-card { color: red; opacity: .8; }", 11), {
    segmentStart: 9,
    segmentEnd: 20,
    colon: 15,
    lastOpen: 8,
  });

  assert.equal(smartSyntaxCssTokenKind("/*", "/* comment */", "cssValue", 0, 2), "comment");
  assert.equal(smartSyntaxCssTokenKind(":", "color: red", "cssValue", 5, 6), "punct");
  assert.equal(
    smartSyntaxCssTokenKind("!important", "color: red !important;", "cssValue", 11, 21),
    "cssGlow",
  );
  assert.equal(smartSyntaxCssTokenKind("12px", "margin: 12px;", "cssValue", 8, 12), "number");
  assert.equal(smartSyntaxCssTokenKind("#fff", "color: #fff;", "cssValue", 7, 11), "cssValue");
  assert.equal(smartSyntaxCssTokenKind("blur", "filter: blur(12px);", "cssValue", 8, 12), "filter");
  assert.equal(
    smartSyntaxCssTokenKind("ha-card", "ha-card { color: red; }", "cssSelector", 0, 7),
    "cssSelector",
  );
  assert.equal(
    smartSyntaxCssTokenKind("color", "ha-card { color: red; }", "cssValue", 10, 15),
    "filter",
  );
  assert.equal(
    smartSyntaxCssTokenKind("red", "ha-card { color: red; }", "cssValue", 17, 20),
    "cssValue",
  );
});

test("smart syntax YAML tokenizer marks list dashes, keys, values and comments", () => {
  const info = smartSyntaxYamlLineInfo("  - entity: sensor.kitchen_temp # active sensor");
  assert.deepEqual(
    smartSyntaxTokenizeYamlLine("  - entity: sensor.kitchen_temp # active sensor", info, "fg"),
    [
      { start: 2, end: 4, kind: "yamlList" },
      { start: 4, end: 10, kind: "key" },
      { start: 10, end: 11, kind: "punct" },
      { start: 12, end: 31, kind: "filter" },
      { start: 32, end: 47, kind: "comment" },
    ],
  );

  const listInfo = smartSyntaxYamlLineInfo("    values: [true, 12px, red]");
  assert.deepEqual(smartSyntaxTokenizeYamlLine("    values: [true, 12px, red]", listInfo, "fg"), [
    { start: 4, end: 10, kind: "key" },
    { start: 10, end: 11, kind: "punct" },
    { start: 12, end: 13, kind: "punct" },
    { start: 13, end: 17, kind: "bool" },
    { start: 17, end: 18, kind: "punct" },
    { start: 19, end: 23, kind: "number" },
    { start: 23, end: 24, kind: "punct" },
    { start: 25, end: 28, kind: "string" },
    { start: 28, end: 29, kind: "punct" },
  ]);

  assert.deepEqual(smartSyntaxTokenizeYamlLine("    # comment only", null, "comment"), [
    { start: 0, end: 18, kind: "comment" },
  ]);
  assert.deepEqual(smartSyntaxTokenizeYamlLine("plain text", null, "fg"), []);
});

test("smart syntax full token-kind helper resolves quoted, Jinja, YAML, CSS and fallback tokens", () => {
  const jinjaLine = "{{ value | float }}";
  const jinjaCalls = [];
  const fakeDarkPlusTokenKind = (node, raw, kind) => {
    jinjaCalls.push({ textContent: node.textContent, raw, kind });
    return kind === "jinja" ? "filter" : "not-real-kind";
  };
  const fakeDarkPlusIsJinjaLine = (raw) => raw.includes("{{");
  const normalizeKind = (kind) => (kind === "not-real-kind" ? "fg" : kind);

  assert.equal(
    smartSyntaxTokenKind(
      "red blue",
      'color: "red blue";',
      "cssValue",
      8,
      16,
      null,
      fakeDarkPlusIsJinjaLine,
      fakeDarkPlusTokenKind,
      normalizeKind,
    ),
    "string",
  );

  assert.equal(
    smartSyntaxTokenKind(
      "value",
      jinjaLine,
      "fg",
      3,
      8,
      null,
      fakeDarkPlusIsJinjaLine,
      fakeDarkPlusTokenKind,
      normalizeKind,
    ),
    "filter",
  );
  assert.deepEqual(jinjaCalls[0], { textContent: "value", raw: jinjaLine, kind: "jinja" });

  const info = smartSyntaxYamlLineInfo("  - entity: sensor.kitchen_temp");
  assert.equal(
    smartSyntaxTokenKind(
      "-",
      "  - entity: sensor.kitchen_temp",
      "fg",
      2,
      3,
      info,
      fakeDarkPlusIsJinjaLine,
      fakeDarkPlusTokenKind,
      normalizeKind,
    ),
    "yamlList",
  );
  assert.equal(
    smartSyntaxTokenKind(
      "entity",
      "  - entity: sensor.kitchen_temp",
      "fg",
      4,
      10,
      info,
      fakeDarkPlusIsJinjaLine,
      fakeDarkPlusTokenKind,
      normalizeKind,
    ),
    "key",
  );
  assert.equal(
    smartSyntaxTokenKind(
      ":",
      "  - entity: sensor.kitchen_temp",
      "fg",
      10,
      11,
      info,
      fakeDarkPlusIsJinjaLine,
      fakeDarkPlusTokenKind,
      normalizeKind,
    ),
    "punct",
  );
  assert.equal(
    smartSyntaxTokenKind(
      "sensor.kitchen_temp",
      "  - entity: sensor.kitchen_temp",
      "fg",
      12,
      31,
      info,
      fakeDarkPlusIsJinjaLine,
      fakeDarkPlusTokenKind,
      normalizeKind,
    ),
    "filter",
  );

  assert.equal(
    smartSyntaxTokenKind(
      "color",
      "ha-card { color: red; }",
      "cssValue",
      10,
      15,
      null,
      fakeDarkPlusIsJinjaLine,
      fakeDarkPlusTokenKind,
      normalizeKind,
    ),
    "filter",
  );

  assert.equal(
    smartSyntaxTokenKind(
      "plain",
      "plain text",
      "fg",
      0,
      5,
      null,
      () => false,
      fakeDarkPlusTokenKind,
      normalizeKind,
    ),
    "fg",
  );
});
test("smart syntax range-token router sends blank, comment, CSS, Jinja and YAML lines to their tokenizers", () => {
  assert.deepEqual(
    smartSyntaxRangeTokensForLine("", "fg", null, () => false),
    [],
  );

  assert.deepEqual(
    smartSyntaxRangeTokensForLine("  # full line comment", "fg", null, () => false),
    [{ start: 0, end: 21, kind: "comment" }],
  );

  assert.deepEqual(
    smartSyntaxRangeTokensForLine("color: red;", "cssValue", null, () => false),
    [
      { start: 0, end: 5, kind: "cssProp" },
      { start: 5, end: 6, kind: "punct" },
      { start: 7, end: 10, kind: "cssValue" },
      { start: 10, end: 11, kind: "punct" },
    ],
  );

  assert.deepEqual(
    smartSyntaxRangeTokensForLine("{{ value | float }}", "fg", null, (raw) => raw.includes("{{")),
    [
      { start: 0, end: 2, kind: "jinja" },
      { start: 3, end: 8, kind: "filter" },
      { start: 9, end: 10, kind: "op" },
      { start: 11, end: 16, kind: "keyword" },
      { start: 17, end: 19, kind: "jinja" },
    ],
  );

  const info = smartSyntaxYamlLineInfo("  - entity: sensor.kitchen_temp");
  assert.deepEqual(
    smartSyntaxRangeTokensForLine("  - entity: sensor.kitchen_temp", "fg", info, () => false),
    [
      { start: 2, end: 4, kind: "yamlList" },
      { start: 4, end: 10, kind: "key" },
      { start: 10, end: 11, kind: "punct" },
      { start: 12, end: 31, kind: "filter" },
    ],
  );
});



test("smart syntax visible-document context helper marks the lines of a CSS block scalar", () => {
  const docLines = [
    "type: custom:mushroom-template-card",
    "primary: Kitchen",
    "card_mod:",
    "  style: |",
    "    ha-card {",
    "      color: {{ states('sensor.theme_color') }};",
    "    }",
    "secondary: Done",
  ];

  const darkPlusIsJinjaLine = (line) => /{{|{%|{#/.test(String(line || ""));
  const darkPlusLineKind = (line, ctx) => {
    const raw = String(line || "");
    if (raw.includes("{")) ctx.cssBlockDepth = (ctx.cssBlockDepth || 0) + 1;
    if (raw.includes("}")) ctx.cssBlockDepth = Math.max(0, (ctx.cssBlockDepth || 0) - 1);
    if (/ha-card/.test(raw)) return "cssSelector";
    if (/color:/.test(raw)) return "cssProp";
    if (/^\s*}/.test(raw)) return "punct";
    return "fg";
  };

  const context = smartSyntaxDocumentContextForVisibleLinesFromLines(
    docLines,
    [
      { textContent: "card_mod:" },
      { textContent: "  style: |" },
      { textContent: "    ha-card {" },
      { textContent: "      color: {{ states('sensor.theme_color') }};" },
    ],
    darkPlusIsJinjaLine,
    darkPlusLineKind,
  );

  assert.equal(context.startIndex, 2);
  assert.deepEqual(
    context.modes.slice(2, 8).map((mode) => ({
      lineKind: mode.lineKind,
      blockScalarKind: mode.blockScalarKind,
      docLineNumber: mode.docLineNumber,
      hasLineInfo: !!mode.lineInfo,
    })),
    [
      { lineKind: "key", blockScalarKind: "", docLineNumber: 3, hasLineInfo: true },
      { lineKind: "fg", blockScalarKind: "", docLineNumber: 4, hasLineInfo: true },
      { lineKind: "cssSelector", blockScalarKind: "css", docLineNumber: 5, hasLineInfo: false },
      { lineKind: "jinja", blockScalarKind: "css", docLineNumber: 6, hasLineInfo: false },
      { lineKind: "punct", blockScalarKind: "css", docLineNumber: 7, hasLineInfo: false },
      { lineKind: "fg", blockScalarKind: "", docLineNumber: 8, hasLineInfo: true },
    ],
  );

  assert.equal(smartSyntaxDocumentContextForVisibleLinesFromLines([], [{ textContent: "x" }]), null);
  assert.equal(smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, []), null);
});

test("smart syntax block-context helper opens a CSS block scalar at the key's column and closes it at a sibling key", () => {
  const ctx = { blockComment: true, cssBlockDepth: 2, blockScalarKind: "", blockScalarIndent: null };
  smartSyntaxUpdateBlockContext(ctx, "  - card_mod: |");
  assert.deepEqual(ctx, {
    blockComment: false,
    cssBlockDepth: 0,
    blockScalarKind: "css",
    // The bound is the key's column (dash segment included), matching the
    // completion lane: sibling keys of the same list item close the scalar.
    blockScalarIndent: 4,
  });

  smartSyntaxUpdateBlockContext(ctx, "      color: red;");
  assert.equal(ctx.blockScalarKind, "css");
  smartSyntaxUpdateBlockContext(ctx, "  name: done");
  assert.equal(ctx.blockScalarKind, "");
  assert.equal(ctx.blockScalarIndent, null);
});

test("smart syntax line-mode helper classifies YAML, CSS block, Jinja and fallback lines", () => {
  const calls = [];
  const fakeDarkPlusLineKind = (raw, ctx) => {
    calls.push({ raw, blockScalarKind: ctx.blockScalarKind || "" });
    if (raw.includes("ha-card")) return "cssSelector";
    if (raw.includes("???")) return "not-real";
    return "comment";
  };
  const fakeDarkPlusIsJinjaLine = (raw) => raw.includes("{{");

  assert.equal(
    smartSyntaxLineKindForMode("", { blockScalarKind: "" }, fakeDarkPlusIsJinjaLine, fakeDarkPlusLineKind),
    "fg",
  );
  assert.equal(
    smartSyntaxLineKindForMode("  - entity: sensor.kitchen", { blockScalarKind: "" }, fakeDarkPlusIsJinjaLine, fakeDarkPlusLineKind),
    "yamlList",
  );
  assert.equal(
    smartSyntaxLineKindForMode("  name:", { blockScalarKind: "" }, fakeDarkPlusIsJinjaLine, fakeDarkPlusLineKind),
    "key",
  );
  assert.equal(
    smartSyntaxLineKindForMode("  name: Kitchen", { blockScalarKind: "" }, fakeDarkPlusIsJinjaLine, fakeDarkPlusLineKind),
    "fg",
  );
  assert.equal(
    smartSyntaxLineKindForMode("    {{ value }}", { blockScalarKind: "css" }, fakeDarkPlusIsJinjaLine, fakeDarkPlusLineKind),
    "jinja",
  );
  assert.equal(
    smartSyntaxLineKindForMode("    ha-card {", { blockScalarKind: "css" }, fakeDarkPlusIsJinjaLine, fakeDarkPlusLineKind),
    "cssSelector",
  );
  assert.equal(
    smartSyntaxLineKindForMode("???", { blockScalarKind: "" }, fakeDarkPlusIsJinjaLine, fakeDarkPlusLineKind),
    "fg",
  );
  assert.deepEqual(calls, [
    { raw: "    ha-card {", blockScalarKind: "css" },
    { raw: "???", blockScalarKind: "" },
  ]);
});
