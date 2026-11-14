import test from "node:test";
import assert from "node:assert/strict";

import {
  SMART_SOURCE_SYNTAX_CLASS_PREFIX,
  SMART_SOURCE_SYNTAX_HIGHLIGHT_PREFIX,
  SMART_SOURCE_SYNTAX_LINE_CLASS_PREFIX,
  buildSmartSyntaxClassCss,
  clearSmartSyntaxKind,
  removeClassPrefix,
  setSmartSyntaxKind,
  smartSyntaxClassName,
  smartSyntaxClearRangeHighlights,
  smartSyntaxCommitRangeHighlights,
  smartSyntaxHighlightName,
  smartSyntaxLineClassName,
  smartSyntaxRangeHighlightSupported,
  sourceClassSyntaxContentPainted,
} from "../../src/syntax/smartSyntaxStyles.js";

test("smart syntax style prefixes and class names preserve legacy naming", () => {
  assert.equal(SMART_SOURCE_SYNTAX_CLASS_PREFIX, "nostrodomus-syntax-kind-");
  assert.equal(SMART_SOURCE_SYNTAX_LINE_CLASS_PREFIX, "nostrodomus-syntax-line-");
  assert.equal(SMART_SOURCE_SYNTAX_HIGHLIGHT_PREFIX, "nostrodomus-source-syntax-");
  assert.equal(smartSyntaxClassName("cssValue"), "nostrodomus-syntax-kind-cssValue");
  assert.equal(smartSyntaxLineClassName("comment"), "nostrodomus-syntax-line-comment");
  assert.equal(smartSyntaxHighlightName("jinja"), "nostrodomus-source-syntax-jinja");
  assert.equal(smartSyntaxClassName("not-real"), "nostrodomus-syntax-kind-fg");
});

test("smart syntax class CSS preserves token, line, and highlight rule structure", () => {
  const css = buildSmartSyntaxClassCss(
    { active: true, textShadow: "0 0 4px currentColor" },
    ["fg", "comment", "cssValue"],
    (kind) => ({ fg: "#fff", comment: "#888", cssValue: "#0af" })[kind] || "#fff",
  );

  assert.match(css, /smart semantic syntax overlay/);
  // Normal token-rule structure (sampled on a non-fg kind). The "fg" kind is intentionally emitted at
  // BOOSTED specificity (the Ctrl+Space white-flash fix); its structure is covered by
  // tests/syntax/codemirror_no_white_fallback.test.mjs.
  assert.match(css, /\.cm-content \.cm-line span\.nostrodomus-syntax-kind-cssValue/);
  assert.match(
    css,
    /\.cm-line\.nostrodomus-syntax-line-comment:not\(\[data-nostrodomus-range-highlighted="1"\]\)/,
  );
  assert.match(css, /::highlight\(nostrodomus-source-syntax-cssValue\)/);
  assert.match(css, /color: #888 !important;/);
  assert.match(css, /text-shadow: 0 0 4px currentColor !important;/);
  assert.match(css, /font-style: italic !important;/);
  assert.match(css, /font-style: italic;/);
});

test("smart syntax class CSS preserves inactive no-shadow fallback", () => {
  // Uses a NORMAL palette-driven kind (the inactive no-shadow behavior is kind-independent). The "fg"
  // kind is intentionally special-cased to the neutral var (the Ctrl+Space white-flash fix) and its
  // color behavior is covered by tests/syntax/codemirror_no_white_fallback.test.mjs.
  const css = buildSmartSyntaxClassCss(
    { active: false, textShadow: "ignored" },
    ["number"],
    () => "#123",
  );
  assert.match(css, /color: #123 !important;/);
  assert.match(css, /text-shadow: none !important;/);
  assert.match(css, /text-shadow: none;/);
});


test("smart syntax range highlight support helper preserves CSS Highlight capability checks", () => {
  const supportedWindow = { CSS: { highlights: new Map() }, Highlight: function Highlight() {} };
  const supportedDocument = { createRange() {} };
  assert.equal(smartSyntaxRangeHighlightSupported(supportedWindow, supportedDocument), true);
  assert.equal(smartSyntaxRangeHighlightSupported({ CSS: { highlights: new Map() } }, supportedDocument), false);
  assert.equal(smartSyntaxRangeHighlightSupported(supportedWindow, {}), false);
  assert.equal(smartSyntaxRangeHighlightSupported({ get CSS() { throw new Error("blocked"); } }, supportedDocument), false);
});


test("smart syntax commit range highlights helper preserves set/delete behavior", () => {
  const operations = [];
  function Highlight(...ranges) {
    this.ranges = ranges;
  }
  const runtimeWindow = {
    Highlight,
    CSS: {
      highlights: {
        set(name, highlight) {
          operations.push({ op: "set", name, ranges: highlight.ranges });
        },
        delete(name) {
          operations.push({ op: "delete", name });
        },
      },
    },
  };

  const one = { id: 1 };
  const two = { id: 2 };
  smartSyntaxCommitRangeHighlights(
    runtimeWindow,
    { fg: [one, two], cssValue: [] },
    ["fg", "cssValue"],
    (kind) => `custom-${kind}`,
  );

  assert.deepEqual(operations, [
    { op: "set", name: "custom-fg", ranges: [one, two] },
    { op: "delete", name: "custom-cssValue" },
  ]);

  assert.doesNotThrow(() => smartSyntaxCommitRangeHighlights({}, { fg: [one] }, ["fg"], (kind) => kind));
  assert.doesNotThrow(() =>
    smartSyntaxCommitRangeHighlights(
      {
        Highlight,
        CSS: {
          highlights: {
            set() {
              throw new Error("blocked");
            },
            delete() {
              throw new Error("blocked");
            },
          },
        },
      },
      { fg: [one], cssValue: [] },
      ["fg", "cssValue"],
      (kind) => kind,
    ),
  );
});

test("smart syntax clear range highlights helper preserves per-kind highlight deletion", () => {
  const deleted = [];
  const runtimeWindow = {
    CSS: {
      highlights: {
        delete(name) {
          deleted.push(name);
        },
      },
    },
  };

  smartSyntaxClearRangeHighlights(runtimeWindow, ["fg", "cssValue"], (kind) => `custom-${kind}`);
  assert.deepEqual(deleted, ["custom-fg", "custom-cssValue"]);

  assert.doesNotThrow(() => smartSyntaxClearRangeHighlights({}, ["fg"], (kind) => kind));
  assert.doesNotThrow(() =>
    smartSyntaxClearRangeHighlights(
      { CSS: { highlights: { delete() { throw new Error("blocked"); } } } },
      ["fg"],
      (kind) => kind,
    ),
  );
});


function fakeNode(initialClasses = []) {
  const classes = new Set(initialClasses);
  return {
    dataset: {},
    classList: {
      add(cls) {
        classes.add(cls);
      },
      remove(cls) {
        classes.delete(cls);
      },
      contains(cls) {
        return classes.has(cls);
      },
      [Symbol.iterator]() {
        return classes[Symbol.iterator]();
      },
    },
    classNames() {
      return Array.from(classes).sort();
    },
  };
}

test("smart syntax DOM class helpers preserve token class replacement behavior", () => {
  const node = fakeNode(["keep-me", "nostrodomus-syntax-kind-comment"]);

  assert.equal(setSmartSyntaxKind(node, "cssValue", false), true);
  assert.deepEqual(node.classNames(), ["keep-me", "nostrodomus-syntax-kind-cssValue"]);
  assert.equal(node.dataset.nostrodomusSmartSyntaxKind, "cssValue");

  assert.equal(setSmartSyntaxKind(node, "cssValue", false), false);
  assert.deepEqual(node.classNames(), ["keep-me", "nostrodomus-syntax-kind-cssValue"]);

  clearSmartSyntaxKind(node, false);
  assert.deepEqual(node.classNames(), ["keep-me"]);
  assert.equal("nostrodomusSmartSyntaxKind" in node.dataset, false);
});

test("smart syntax DOM class helpers preserve line class and fallback normalization", () => {
  const node = fakeNode(["cm-line", "nostrodomus-syntax-line-comment", "nostrodomus-syntax-kind-key"]);

  assert.equal(setSmartSyntaxKind(node, "not-real", true), true);
  assert.deepEqual(node.classNames(), ["cm-line", "nostrodomus-syntax-kind-key", "nostrodomus-syntax-line-fg"]);
  assert.equal(node.dataset.nostrodomusSmartSyntaxLineKind, "fg");

  clearSmartSyntaxKind(node, true);
  assert.deepEqual(node.classNames(), ["cm-line", "nostrodomus-syntax-kind-key"]);
  assert.equal("nostrodomusSmartSyntaxLineKind" in node.dataset, false);
});

test("smart syntax removeClassPrefix preserves non-matching classes", () => {
  const node = fakeNode(["alpha", "nostrodomus-syntax-kind-fg", "nostrodomus-syntax-line-key"]);
  removeClassPrefix(node, "nostrodomus-syntax-kind-");
  assert.deepEqual(node.classNames(), ["alpha", "nostrodomus-syntax-line-key"]);
});

test("smart syntax DOM class helpers tolerate missing classList and dataset", () => {
  assert.equal(setSmartSyntaxKind(null, "fg"), false);
  assert.equal(setSmartSyntaxKind({}, "fg"), false);

  const node = { classList: fakeNode(["nostrodomus-syntax-kind-comment"]).classList };
  assert.equal(setSmartSyntaxKind(node, "key"), true);
  clearSmartSyntaxKind(node, false);
});

function makeTextNode(value) {
  return {
    nodeType: 3,
    nodeValue: value,
    contains() {
      return false;
    },
  };
}

function makeElementNode(children = [], containsTarget = null) {
  return {
    nodeType: 1,
    __walkNodes: children,
    __textNodes: children.filter((node) => node.nodeType === 3),
    contains(target) {
      if (target === containsTarget) return true;
      return children.includes(target) || children.some((node) => node.contains?.(target));
    },
  };
}

function makeFakeDocument() {
  return {
    createTreeWalker(root, mask) {
      const nodes = mask === 4 ? root.__textNodes || [] : root.__walkNodes || [];
      let index = 0;
      return {
        nextNode() {
          return nodes[index++] || null;
        },
      };
    },
    createRange() {
      return {
        start: null,
        end: null,
        setStart(node, offset) {
          this.start = { node, offset };
        },
        setEnd(node, offset) {
          this.end = { node, offset };
        },
      };
    },
  };
}

const fakeNodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };

test("smart syntax text-node slice helper preserves visible line offsets", async () => {
  const { smartSyntaxLineTextNodeSlices } = await import("../../src/syntax/smartSyntaxStyles.js");
  const a = makeTextNode("ha-card");
  const empty = makeTextNode("");
  const b = makeTextNode(" { color: red; }");
  const line = makeElementNode([a, empty, b]);

  assert.deepEqual(
    smartSyntaxLineTextNodeSlices(line, makeFakeDocument(), fakeNodeFilter).map((slice) => ({
      text: slice.node.nodeValue,
      start: slice.start,
      end: slice.end,
    })),
    [
      { text: "ha-card", start: 0, end: 7 },
      { text: " { color: red; }", start: 7, end: 23 },
    ],
  );

  assert.deepEqual(smartSyntaxLineTextNodeSlices(null, makeFakeDocument(), fakeNodeFilter), []);
  assert.deepEqual(smartSyntaxLineTextNodeSlices(line, {}, fakeNodeFilter), []);
});

test("smart syntax highlight range helper preserves split text-node range behavior", async () => {
  const { smartSyntaxAddHighlightRange } = await import("../../src/syntax/smartSyntaxStyles.js");
  const a = makeTextNode("color");
  const b = makeTextNode(": red;");
  const line = makeElementNode([a, b]);
  const buckets = { fg: [], cssProp: [] };

  assert.equal(
    smartSyntaxAddHighlightRange(
      line,
      1,
      8,
      "cssProp",
      buckets,
      ["fg", "cssProp"],
      makeFakeDocument(),
      fakeNodeFilter,
    ),
    2,
  );

  assert.equal(buckets.cssProp.length, 2);
  assert.deepEqual(buckets.cssProp[0].start, { node: a, offset: 1 });
  assert.deepEqual(buckets.cssProp[0].end, { node: a, offset: 5 });
  assert.deepEqual(buckets.cssProp[1].start, { node: b, offset: 0 });
  assert.deepEqual(buckets.cssProp[1].end, { node: b, offset: 3 });

  assert.equal(
    smartSyntaxAddHighlightRange(line, 0, 2, "not-real", buckets, ["fg", "cssProp"], makeFakeDocument(), fakeNodeFilter),
    1,
  );
  assert.equal(buckets.fg.length, 1);
  assert.equal(smartSyntaxAddHighlightRange(null, 0, 2, "fg", buckets, ["fg"], makeFakeDocument(), fakeNodeFilter), 0);
});

test("smart syntax text offset helper preserves tree-walker offset behavior", async () => {
  const { smartSyntaxTextOffset } = await import("../../src/syntax/smartSyntaxStyles.js");
  const first = makeTextNode("abc");
  const nestedTarget = { nodeType: 1 };
  const container = makeElementNode([], nestedTarget);
  const second = makeTextNode("defg");
  const root = makeElementNode([first, container, second]);

  assert.equal(smartSyntaxTextOffset(root, nestedTarget, makeFakeDocument(), fakeNodeFilter), 3);
  assert.equal(smartSyntaxTextOffset(root, second, makeFakeDocument(), fakeNodeFilter), 3);
  assert.equal(smartSyntaxTextOffset(null, second, makeFakeDocument(), fakeNodeFilter), 0);
  assert.equal(smartSyntaxTextOffset(root, { nodeType: 1 }, makeFakeDocument(), fakeNodeFilter), 0);
});


function fakeSyntaxContent({ version = "v-test", hasStyle = true, spans = [] } = {}) {
  const root = {
    querySelector(selector) {
      return hasStyle && selector === "#nostrodomus-source-style" ? { id: "nostrodomus-source-style" } : null;
    },
  };
  return {
    dataset: { nostrodomusSourceClassSyntax: version },
    getRootNode() {
      return root;
    },
    querySelectorAll(selector) {
      if (selector !== ".cm-line span") return [];
      return spans;
    },
  };
}

test("source-class syntax content painted helper preserves legacy readiness checks", () => {
  const content = fakeSyntaxContent({
    version: "v-test",
    hasStyle: true,
    spans: [
      { textContent: "   ", className: "ignored-empty" },
      { textContent: "type: custom:mushroom-card", className: "cm-property nostrodomus-syntax-kind-key" },
    ],
  });

  assert.equal(sourceClassSyntaxContentPainted(content, "v-test", "nostrodomus-source-style"), true);
  assert.equal(sourceClassSyntaxContentPainted(content, "other-version", "nostrodomus-source-style"), false);
  assert.equal(
    sourceClassSyntaxContentPainted(fakeSyntaxContent({ version: "v-test", hasStyle: false, spans: [{ textContent: "x", className: "cm-key" }] }), "v-test", "nostrodomus-source-style"),
    false,
  );
  assert.equal(
    sourceClassSyntaxContentPainted(fakeSyntaxContent({ version: "v-test", hasStyle: true, spans: [{ textContent: "x", className: "" }] }), "v-test", "nostrodomus-source-style"),
    false,
  );
  assert.equal(sourceClassSyntaxContentPainted(null, "v-test", "nostrodomus-source-style"), false);
});

test("source-class syntax content painted helper preserves sample limit behavior", () => {
  const content = fakeSyntaxContent({
    version: "v-test",
    hasStyle: true,
    spans: [
      { textContent: "first", className: "" },
      { textContent: "second", className: "nostrodomus-syntax-kind-key" },
    ],
  });

  assert.equal(sourceClassSyntaxContentPainted(content, "v-test", "nostrodomus-source-style", 1), false);
  assert.equal(sourceClassSyntaxContentPainted(content, "v-test", "nostrodomus-source-style", 2), true);
});
