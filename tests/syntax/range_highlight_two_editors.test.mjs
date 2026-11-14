import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeState } from '../../src/core/state.js';
import { createSyntaxRuntime } from '../../src/syntax/syntaxRuntime.js';

function rangeRuntime(highlights) {
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
    codeMirrorSourceClassParts: () => null,
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

function fakeEditor(texts) {
  const lines = texts.map((text) => ({ textContent: text, textNode: { nodeValue: text }, dataset: {} }));
  const content = { isConnected: true, querySelectorAll: (selector) => (selector === '.cm-line' ? lines : []) };
  const editor = { querySelector: (selector) => (selector === '.cm-content' ? content : null), querySelectorAll: () => [] };
  return { editor, content, lines };
}

function withDocument(run) {
  const previous = globalThis.document;
  globalThis.document = {
    createTreeWalker: (line) => { let done = false; return { nextNode: () => (done ? null : ((done = true), line.textNode)) }; },
    createRange: () => ({ setStart(node, offset) { this.start = [node, offset]; }, setEnd(node, offset) { this.end = [node, offset]; } }),
  };
  try { run(); } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

const highlightedNodes = (highlights) => {
  const nodes = new Set();
  for (const highlight of highlights.values()) for (const range of highlight.ranges) nodes.add(range.start[0]);
  return nodes;
};

test('painting a second editor keeps the first editor highlighted (CSS.highlights is per document)', () => {
  const highlights = new Map();
  const { runtime } = rangeRuntime(highlights);
  const first = fakeEditor(['entity: light.kitchen']);
  const second = fakeEditor(['name: Hall']);
  withDocument(() => {
    runtime.applyCodeMirrorSmartSyntaxClasses(first.editor, {}, 'first-editor');
    assert.ok(highlightedNodes(highlights).has(first.lines[0].textNode));

    runtime.applyCodeMirrorSmartSyntaxClasses(second.editor, {}, 'second-editor');
    const nodes = highlightedNodes(highlights);
    assert.ok(nodes.has(second.lines[0].textNode), 'the second editor is highlighted');
    assert.ok(nodes.has(first.lines[0].textNode), 'the first editor keeps its ranges');

    // A closed editor's ranges are dropped on the next pass.
    first.content.isConnected = false;
    runtime.applyCodeMirrorSmartSyntaxClasses(second.editor, {}, 'second-editor-again');
    assert.equal(highlightedNodes(highlights).has(first.lines[0].textNode), false);
  });
});

test('without a document context the range pass still tracks a text block scalar', () => {
  // codeMirrorSourceClassParts returns null here, so there is no document context and the pass
  // classifies the visible lines itself. `# Heading` inside `content: |` is text, not a comment.
  const highlights = new Map();
  const { runtime } = rangeRuntime(highlights);
  const { editor, lines } = fakeEditor(['content: |', '  # Heading']);
  withDocument(() => {
    runtime.applyCodeMirrorSmartSyntaxClasses(editor, {}, 'no-doc-context');
    const commentNodes = (highlights.get('nostrodomus-source-syntax-comment')?.ranges || []).map((range) => range.start[0]);
    const stringNodes = (highlights.get('nostrodomus-source-syntax-string')?.ranges || []).map((range) => range.start[0]);
    assert.equal(commentNodes.includes(lines[1].textNode), false, 'the heading line is not painted as a comment');
    assert.ok(stringNodes.includes(lines[1].textNode), 'it is painted as block text');
  });
});
