// When the syntax observer is not yet attached to an editor (the first editor, or a switch to
// another editor), installCodeMirrorSourceClassSyntax ran a full syntax pass and then attached
// the observer, which runs a full pass of its own. On a switch the first pass was also thrown
// away: attaching the observer to the new editor removes every registered range first.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeState } from '../../src/core/state.js';
import { createSyntaxRuntime } from '../../src/syntax/syntaxRuntime.js';

function fakeEditor(key, texts) {
  const lines = texts.map((text, index) => ({ textContent: text, docIndex: index, textNode: { nodeValue: text, isConnected: true }, dataset: {} }));
  const content = { isConnected: true, dataset: {}, querySelectorAll: (selector) => (selector === '.cm-line' ? lines : []) };
  const root = { querySelector: () => null };
  const doc = { lines: texts.length, line: (number) => ({ text: texts[number - 1] }), lineAt: (pos) => ({ number: pos + 1 }) };
  const editor = {
    key,
    isConnected: true,
    dataset: {},
    querySelector: (selector) => (selector === '.cm-content' ? content : null),
    querySelectorAll: () => [],
    getRootNode: () => root,
  };
  editor.parts = {
    cm: { tags: {} },
    view: { state: { doc, config: {} }, posAtDOM: (line) => line.docIndex, dispatch() {} },
    tags: {},
    root,
    content,
    host: { dataset: {} },
  };
  return { editor, content, lines };
}

function fixture() {
  class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
  const store = new Map();
  const sets = [];
  const highlights = {
    set: (name, value) => { sets.push(name); store.set(name, value); },
    delete: (name) => store.delete(name),
    get: (name) => store.get(name),
    values: () => store.values(),
  };
  const state = createRuntimeState({ version: 'test' });
  const style = { textContent: '' };
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
    codeboxEditorCacheKey: (editor) => editor.key,
    codeMirrorSourceClassParts: (editor) => editor.parts,
    cssEscapeSelectorPart: (value) => String(value),
    effectiveStyleSettings: () => ({}),
    ensureStyleElementAtEnd: () => style,
    recordPerformanceEvent: () => {},
    rememberActiveCodeboxEditor: () => {},
    resolveSyntaxTintSettings: () => ({ presetKey: 'test', palette: {}, themeOpacity: 1, themeSaturation: 1 }),
    nostrodomusPerfMode: () => false,
    styleEditorFromNode: () => null,
    nostrodomusWalkOpenRoots: () => {},
    visibleStyleEditorCandidate: () => true,
    syntaxColorWithOpacity: (color) => color,
  });
  // The sheet builder asks CodeMirror for classes; the pass count does not depend on the sheet.
  runtime.buildCodeMirrorSourceClassSyntaxCss = () => ({ css: '/* sheet */', classMap: [{ label: 'string' }] });
  const keyCommits = () => sets.filter((name) => name === 'nostrodomus-source-syntax-key').length;
  const highlightedNodes = () => {
    const nodes = new Set();
    for (const highlight of store.values()) for (const range of highlight.ranges) nodes.add(range.startContainer);
    return nodes;
  };
  return { state, runtime, keyCommits, highlightedNodes };
}

function withDom(run) {
  const previous = { document: globalThis.document, StaticRange: globalThis.StaticRange, MutationObserver: globalThis.MutationObserver };
  globalThis.document = {
    createTreeWalker: (line) => { let done = false; return { nextNode: () => (done ? null : ((done = true), line.textNode)) }; },
    createRange: () => ({ setStart() {}, setEnd() {} }),
  };
  globalThis.StaticRange = class { constructor(init) { Object.assign(this, init); } };
  globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} };
  try { run(); } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
}

test('the first install on an editor paints it once', () => {
  withDom(() => {
    const fx = fixture();
    const first = fakeEditor('first', ['entity: light.kitchen', 'name: Hall']);
    const result = fx.runtime.installCodeMirrorSourceClassSyntax(first.editor, {}, 'style-apply');
    assert.equal(result.installed, true);
    assert.equal(result.lines, 2, 'the result still reports the painted lines');
    assert.equal(fx.keyCommits(), 1, 'one pass registered the ranges');
    assert.ok(fx.state.sourceClassSmartSyntaxObserver, 'the observer is attached');
    assert.equal(fx.state.lastSourceClassSyntax.smartLines, 2);
    for (const line of first.lines) assert.ok(fx.highlightedNodes().has(line.textNode));
  });
});

test('a switch to another editor paints the new editor once and keeps the first one colored', () => {
  withDom(() => {
    const fx = fixture();
    const first = fakeEditor('first', ['entity: light.kitchen', 'name: Hall']);
    const second = fakeEditor('second', ['title: Home', 'path: home', 'icon: mdi:home']);
    fx.runtime.installCodeMirrorSourceClassSyntax(first.editor, {}, 'style-apply');
    const before = fx.keyCommits();

    const result = fx.runtime.installCodeMirrorSourceClassSyntax(second.editor, {}, 'style-apply');
    assert.equal(result.installed, true);
    assert.equal(result.lines, 3);
    assert.equal(fx.keyCommits(), before + 1, 'one pass for the new editor');
    assert.equal(fx.state.sourceClassSmartSyntaxContent, second.content);
    const nodes = fx.highlightedNodes();
    for (const line of second.lines) assert.ok(nodes.has(line.textNode), 'the new editor is colored');
    for (const line of first.lines) assert.ok(nodes.has(line.textNode), 'the first editor is still connected and keeps its ranges');

    // Later installs on the same editor take the skip path as before.
    const again = fx.runtime.installCodeMirrorSourceClassSyntax(second.editor, {}, 'pointer');
    assert.equal(again.skipped, true);
    assert.equal(fx.keyCommits(), before + 1);
  });
});
