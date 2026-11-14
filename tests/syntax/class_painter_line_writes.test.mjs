// The class painter runs where the browser has no CSS Custom Highlight API. On every pass it
// wrote data-nostrodomus-smart-syntax-doc-line on every rendered line. Nothing reads that
// attribute, and a write to a line element wakes CodeMirror's own observer.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeState } from '../../src/core/state.js';
import { createSyntaxRuntime } from '../../src/syntax/syntaxRuntime.js';

function classRuntime(view) {
  const state = createRuntimeState({ version: 'test' });
  const runtime = createSyntaxRuntime({
    state,
    VERSION: 'nostrodomus-test',
    // No CSS.highlights and no Highlight: the class painter is the color layer.
    W: { NodeFilter: {} },
    DARKPLUS_SYNTAX_COLORS: { fg: '#ffffff', dim: '#999999' },
    DARKPLUS_MAX_LINES_PER_PASS: 50,
    DARKPLUS_MAX_SPANS_PER_PASS: 200,
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'nostrodomus-test-source-class',
    SYNTAX_RECOVERY_DEFAULT_DELAYS: [48, 180],
    STYLE_SYNTAX_KIND_ORDER: ['fg', 'key', 'string', 'punct', 'filter', 'comment', 'yamlList'],
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

function fakeClassList() {
  const names = new Set();
  return {
    add: (name) => names.add(name),
    remove: (name) => names.delete(name),
    contains: (name) => names.has(name),
    [Symbol.iterator]: () => names[Symbol.iterator](),
    names,
  };
}

function fixture(texts) {
  const writes = [];
  const lines = texts.map((text, index) => ({
    textContent: text,
    docIndex: index,
    classList: fakeClassList(),
    dataset: new Proxy({}, { set(target, key, value) { writes.push(String(key)); target[key] = value; return true; } }),
    querySelectorAll: () => [],
  }));
  const content = { isConnected: true, querySelectorAll: (selector) => (selector === '.cm-line' ? lines : []) };
  const editor = { querySelector: (selector) => (selector === '.cm-content' ? content : null), querySelectorAll: () => [] };
  const view = {
    state: { doc: { lines: texts.length, line: (number) => ({ text: texts[number - 1] }), lineAt: (pos) => ({ number: pos + 1 }) } },
    posAtDOM: (line) => line.docIndex,
  };
  const { runtime, state } = classRuntime(view);
  return { lines, editor, runtime, state, writes };
}

test('the class painter writes the line kind once and no document line attribute', () => {
  const fx = fixture(['# note', 'entity: light.kitchen', '  - 42']);
  const first = fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, 'first');
  assert.equal(first.lines, 3);
  assert.equal(first.rangeHighlights.supported, false, 'this is the class painter');
  assert.deepEqual(fx.lines.map((line) => line.dataset.nostrodomusSmartSyntaxLineKind), ['comment', 'fg', 'yamlList']);
  assert.ok(fx.lines[0].classList.contains('nostrodomus-syntax-line-comment'));
  assert.deepEqual(fx.writes, ['nostrodomusSmartSyntaxLineKind', 'nostrodomusSmartSyntaxLineKind', 'nostrodomusSmartSyntaxLineKind']);
  for (const line of fx.lines) assert.equal('nostrodomusSmartSyntaxDocLine' in line.dataset, false);

  fx.writes.length = 0;
  const second = fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, 'second');
  assert.equal(second.changed, 0);
  assert.deepEqual(fx.writes, [], 'a pass that changes no line kind writes nothing to the lines');
  assert.equal(fx.state.lastSmartSourceSyntax.docStartLine, 1, 'the document position is still reported in the pass record');
});
