import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeState } from '../../src/core/state.js';
import { createSyntaxRuntime } from '../../src/syntax/syntaxRuntime.js';

// A key press that changes nothing in the editor (an arrow key in the suggestion list, a click
// in the dialog) can still schedule a syntax pass. The pass returns early when the document, the
// rendered lines and the text nodes under the ranges are the ones it painted last time, instead
// of rebuilding every range of the viewport.

function rangeRuntime(highlights, view) {
  class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
  const state = createRuntimeState({ version: 'test' });
  const runtime = createSyntaxRuntime({
    state,
    VERSION: 'nostrodomus-test',
    W: { NodeFilter: {}, CSS: { highlights }, Highlight: FakeHighlight },
    DARKPLUS_SYNTAX_COLORS: { fg: '#ffffff', dim: '#999999' },
    DARKPLUS_MAX_LINES_PER_PASS: 50,
    DARKPLUS_MAX_SPANS_PER_PASS: 200,
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'nostrodomus-test-source-class',
    SYNTAX_RECOVERY_DEFAULT_DELAYS: [48, 180],
    STYLE_SYNTAX_KIND_ORDER: ['fg', 'key', 'string', 'punct', 'filter', 'comment'],
    syntaxRecoveryDelaysForStageA3: (_reason, delays) => delays,
    activeCodeboxStyleEditor: () => null,
    activeEditDialog: () => null,
    activeTopLayerDialog: () => null,
    applyTextColorPreset: () => false,
    codeboxEditorCacheKey: () => 'editor-key',
    codeMirrorSourceClassParts: () => ({ view }),
    cssEscapeSelectorPart: (value) => String(value),
    effectiveStyleSettings: () => ({}),
    ensureStyleElementAtEnd: () => null,
    recordPerformanceEvent: () => {},
    rememberActiveCodeboxEditor: () => {},
    resolveSyntaxTintSettings: () => ({ presetKey: 'test', palette: {}, themeOpacity: 1, themeSaturation: 1 }),
    nostrodomusPerfMode: () => false,
    styleEditorFromNode: () => null,
    nostrodomusWalkOpenRoots: () => {},
    visibleStyleEditorCandidate: () => true,
    syntaxColorWithOpacity: (color) => color,
  });
  return { state, runtime };
}

function fakeDoc(texts) {
  return { lines: texts.length, line: (number) => ({ text: texts[number - 1] }), lineAt: (pos) => ({ number: pos + 1 }) };
}

function fixture(texts) {
  const lines = texts.map((text, index) => ({ textContent: text, docIndex: index, textNode: { nodeValue: text, isConnected: true }, dataset: {} }));
  const content = { isConnected: true, querySelectorAll: (selector) => (selector === '.cm-line' ? lines : []) };
  const editor = { querySelector: (selector) => (selector === '.cm-content' ? content : null), querySelectorAll: () => [] };
  // The fake editor answers posAtDOM with the document index of the line; lineAt maps it back.
  const view = { state: { doc: fakeDoc(texts) }, posAtDOM: (line) => line.docIndex };
  let commits = 0;
  const store = new Map();
  const highlights = { set: (name, value) => { commits += 1; store.set(name, value); }, delete: (name) => store.delete(name), get: (name) => store.get(name), has: (name) => store.has(name), values: () => store.values(), keys: () => store.keys() };
  const { state, runtime } = rangeRuntime(highlights, view);
  // The pass relies on the content observer to report re-rendered lines.
  const watch = () => { state.sourceClassSmartSyntaxObserver = { disconnect() {} }; state.sourceClassSmartSyntaxContent = content; };
  return { lines, content, editor, view, state, runtime, watch, commits: () => commits, highlight: (name) => store.get(name) };
}

function withDom(run) {
  const previousDocument = globalThis.document;
  const previousStaticRange = globalThis.StaticRange;
  globalThis.document = {
    createTreeWalker: (line) => { let done = false; return { nextNode: () => (done ? null : ((done = true), line.textNode)) }; },
    // Range support is detected by createRange; the ranges themselves are StaticRange objects.
    createRange: () => ({ setStart() {}, setEnd() {} }),
  };
  globalThis.StaticRange = class { constructor(init) { Object.assign(this, init); } };
  try { run(); } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousStaticRange === undefined) delete globalThis.StaticRange; else globalThis.StaticRange = previousStaticRange;
  }
}

const pass = (fx, reason) => fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, reason);

test('a pass with nothing changed since the last one does not rebuild the ranges', () => {
  withDom(() => {
    const fx = fixture(['entity: light.kitchen', 'name: Hall']);
    const first = pass(fx, 'first');
    assert.ok(first.rangeHighlights.ranges > 0);
    fx.watch();
    const painted = fx.commits();

    const second = pass(fx, 'style-reapply-skip-keydown');
    assert.equal(second.unchanged, true);
    assert.equal(fx.commits(), painted, 'no highlight is written');
    assert.equal(fx.state.smartSyntaxRangePassesUnchanged, 1);
  });
});

test('a pass repaints when the content changed, a text node was replaced, or the document is new', () => {
  withDom(() => {
    const fx = fixture(['entity: light.kitchen', 'name: Hall']);
    pass(fx, 'first');
    fx.watch();
    let painted = fx.commits();
    const repaints = (reason, label) => {
      const result = pass(fx, reason);
      assert.notEqual(result.unchanged, true, label);
      assert.ok(fx.commits() > painted, label);
      painted = fx.commits();
    };

    repaints('style-reapply-skip-keydown+smart-source-content-change', 'the content observer reported a change');
    repaints('typing-session-exit', 'the end of a typing session');

    assert.equal(pass(fx, 'style-reapply-skip-keydown').unchanged, true);
    // CodeMirror re-rendered a line: its old text node left the document.
    fx.lines[1].textNode.isConnected = false;
    repaints('style-reapply-skip-keydown', 'a range sits on a removed text node');
    fx.lines[1].textNode.isConnected = true;
    assert.equal(pass(fx, 'style-reapply-skip-keydown').unchanged, true);

    // An edit: CodeMirror has a new document object.
    fx.view.state = { doc: fakeDoc(['entity: light.kitchen', 'name: Hall']) };
    repaints('style-reapply-skip-keydown', 'a new document');

    // Scrolling: another line element is first.
    const moved = { textContent: 'entity: light.kitchen', docIndex: 0, textNode: { nodeValue: 'entity: light.kitchen', isConnected: true }, dataset: {} };
    fx.lines[0] = moved;
    repaints('style-reapply-skip-keydown', 'another first line element');
  });
});

test('a pass repaints while no content observer is attached and after the ranges were cleared', () => {
  withDom(() => {
    const fx = fixture(['entity: light.kitchen']);
    pass(fx, 'first');
    const painted = fx.commits();
    assert.notEqual(pass(fx, 'style-reapply-skip-keydown').unchanged, true, 'no observer yet');
    assert.ok(fx.commits() > painted);

    fx.watch();
    assert.equal(pass(fx, 'style-reapply-skip-keydown').unchanged, true);
    fx.runtime.disconnectSourceClassSmartSyntaxObserver('test');
    fx.watch();
    assert.notEqual(pass(fx, 'style-reapply-skip-keydown').unchanged, true, 'the ranges were removed with the observer');
  });
});

test('a cursor line kept in the DOM above the viewport does not shift the colors of the visible lines', () => {
  // The rendered lines are document line 1 (the cursor, scrolled out of view) and lines 4 and 5.
  // Counted as one block from line 1, the heading lines would take the modes of lines 2 and 3,
  // which are outside the text block, and be painted as comments.
  withDom(() => {
    const doc = ['title: Card', 'footer: none', 'content: |', '  # Heading one', '  # Heading two'];
    const fx = fixture(doc);
    const kept = [0, 3, 4].map((index) => fx.lines[index]);
    fx.lines.length = 0;
    fx.lines.push(...kept);
    pass(fx, 'first');
    const nodesOf = (kind) => (fx.highlight(`nostrodomus-source-syntax-${kind}`)?.ranges || []).map((range) => range.startContainer);
    for (const line of [fx.lines[1], fx.lines[2]]) {
      assert.equal(nodesOf('comment').includes(line.textNode), false, `"${line.textContent}" is not a comment`);
      assert.ok(nodesOf('string').includes(line.textNode), `"${line.textContent}" is block text`);
    }
  });
});

test('a fold on the first rendered line does not shift the colors of the lines below it', () => {
  // `views:` and `footer:` are folded, so their rendered lines end in the fold placeholder and
  // lines 1, 2 and 6 are not rendered. Taken as one block, the rendered lines are matched to the
  // document by their text, the three last lines win the match, and the heading takes the mode
  // of `footer:`, a YAML line: its '#' was painted as a comment.
  withDom(() => {
    const doc = ['views:', '  - title: Home', '    path: home', 'content: |', '  # One', 'footer:', '  text: x', 'title: A', 'theme: b', 'icon: c'];
    const fx = fixture(doc);
    const kept = [0, 3, 4, 5, 7, 8, 9].map((index) => fx.lines[index]);
    for (const line of [kept[0], kept[3]]) {
      line.textContent = `${line.textContent}\u2026`;
      line.textNode.nodeValue = line.textContent;
    }
    fx.lines.length = 0;
    fx.lines.push(...kept);
    pass(fx, 'first');
    const rangesOf = (kind) => fx.highlight(`nostrodomus-source-syntax-${kind}`)?.ranges || [];
    const heading = fx.lines[2];
    assert.equal(rangesOf('comment').some((range) => range.startContainer === heading.textNode), false, 'the heading is not a comment');
    assert.deepEqual(
      rangesOf('string').filter((range) => range.startContainer === heading.textNode).map((range) => [range.startOffset, range.endOffset]),
      [[2, 7]],
      'the heading is one range of block text',
    );
    const title = fx.lines[4];
    assert.deepEqual(
      rangesOf('key').filter((range) => range.startContainer === title.textNode).map((range) => [range.startOffset, range.endOffset]),
      [[0, 5]],
      'the key of the line after the second fold is colored at its own offsets',
    );
  });
});
