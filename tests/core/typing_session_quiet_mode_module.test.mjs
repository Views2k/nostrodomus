import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeState } from '../../src/core/state.js';
import { createSyntaxRuntime } from '../../src/syntax/syntaxRuntime.js';

function createMinimalSyntaxRuntime(state, events = []) {
  return createSyntaxRuntime({
    state,
    VERSION: 'nostrodomus-test',
    W: { NodeFilter: {} },
    DARKPLUS_SYNTAX_COLORS: { fg: '#ffffff', dim: '#999999' },
    DARKPLUS_MAX_LINES_PER_PASS: 50,
    DARKPLUS_MAX_SPANS_PER_PASS: 200,
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'nostrodomus-test-source-class',
    SYNTAX_RECOVERY_DEFAULT_DELAYS: [48, 180],
    STYLE_SYNTAX_KIND_ORDER: ['fg', 'key', 'string'],
    syntaxRecoveryDelaysForStageA3: (_reason, delays) => delays,
    activeCodeboxStyleEditor: () => null,
    activeEditDialog: () => null,
    activeTopLayerDialog: () => null,
    applyTextColorPreset: () => false,
    codeboxEditorCacheKey: () => 'editor-key',
    codeMirrorSourceClassParts: () => null,
    cssEscapeSelectorPart: value => String(value),
    effectiveStyleSettings: () => ({}),
    ensureStyleElementAtEnd: () => null,
    recordPerformanceEvent: (name, durationMs, detail) => events.push({ name, durationMs, detail }),
    rememberActiveCodeboxEditor: () => {},
    resolveSyntaxTintSettings: () => ({ presetKey: 'test', palette: {}, themeOpacity: 1, themeSaturation: 1 }),
    nostrodomusPerfMode: () => false,
    styleEditorFromNode: () => null,
    nostrodomusWalkOpenRoots: () => {},
    visibleStyleEditorCandidate: () => true,
    syntaxColorWithOpacity: color => color,
  });
}

test('runtime state includes typing-session quiet fields', () => {
  const state = createRuntimeState({ version: 'test' });
  assert.equal(state.typingSessionActive, false);
  assert.equal(state.typingSessionLastChangeTs, 0);
  assert.equal(state.typingSessionExitTimer, 0);
  assert.deepEqual({ ...state.typingSessionSuppressed }, {});
});

test('source-class smart syntax is suppressed while typing session is active', () => {
  const state = createRuntimeState({ version: 'test' });
  const events = [];
  const runtime = createMinimalSyntaxRuntime(state, events);
  const editor = { querySelector: () => null };

  state.typingSessionActive = true;
  assert.equal(runtime.scheduleSourceClassSmartSyntax(editor, 'smart-source-content-change'), true);
  assert.equal(state.typingSessionSuppressed['source-class-smart-syntax'], 1);
  assert.equal(events.at(-1).name, 'typing-session-suppressed');
});

test('style-reapply smart-syntax chain is counted separately during typing session', () => {
  const state = createRuntimeState({ version: 'test' });
  const events = [];
  const runtime = createMinimalSyntaxRuntime(state, events);
  const editor = { querySelector: () => null };

  state.typingSessionActive = true;
  assert.equal(runtime.scheduleSourceClassSmartSyntax(editor, 'style-reapply-skip-editor-dispatch'), true);
  assert.equal(state.typingSessionSuppressed['style-reapply-skip-smart-syntax'], 1);
});

test('CSS Custom Highlight ranges are rebuilt during a typing session and nothing is written to the line', () => {
  // Ranges are the only color layer in range mode and an edited line loses its ranges when
  // CodeMirror re-renders it, so the rebuild must not wait for typing to stop. Writing a class or
  // data attribute on the line would wake CodeMirror's observer; the pass must write none.
  const state = createRuntimeState({ version: 'test' });
  const events = [];
  const highlights = new Map();
  class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
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
    cssEscapeSelectorPart: value => String(value),
    effectiveStyleSettings: () => ({}),
    ensureStyleElementAtEnd: () => null,
    recordPerformanceEvent: (name, durationMs, detail) => events.push({ name, durationMs, detail }),
    rememberActiveCodeboxEditor: () => {},
    resolveSyntaxTintSettings: () => ({ presetKey: 'test', palette: {}, themeOpacity: 1, themeSaturation: 1 }),
    nostrodomusPerfMode: () => false,
    styleEditorFromNode: () => null,
    nostrodomusWalkOpenRoots: () => {},
    visibleStyleEditorCandidate: () => true,
    syntaxColorWithOpacity: color => color,
  });

  const textNode = { nodeValue: 'entity: light.kitchen' };
  const writes = [];
  const line = {
    textContent: textNode.nodeValue,
    dataset: new Proxy({}, { set(target, key, value) { writes.push(String(key)); target[key] = value; return true; }, deleteProperty(target, key) { writes.push(`delete:${String(key)}`); delete target[key]; return true; } }),
    classList: { add: (name) => writes.push(`class:${name}`), remove: (name) => writes.push(`class-remove:${name}`), contains: () => false },
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    createTreeWalker: () => { let done = false; return { nextNode: () => (done ? null : ((done = true), textNode)) }; },
    createRange: () => ({ setStart(node, offset) { this.start = [node, offset]; }, setEnd(node, offset) { this.end = [node, offset]; } }),
  };
  try {
    state.typingSessionActive = true;
    const result = runtime.applySmartSyntaxRangeHighlights({ querySelector: () => null }, [line], null, {});
    assert.equal(result.supported, true);
    assert.equal(result.suppressed, undefined, 'not suppressed while typing');
    assert.ok(result.ranges > 0, 'ranges were built');
    assert.ok(highlights.size > 0, 'and registered with CSS.highlights');
    assert.deepEqual(writes, [], 'no class or data attribute was written on the line element');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
