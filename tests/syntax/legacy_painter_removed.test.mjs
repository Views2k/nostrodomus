import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeState } from '../../src/core/state.js';
import { createSyntaxRuntime } from '../../src/syntax/syntaxRuntime.js';

function createRuntime(events = []) {
  const state = createRuntimeState({ version: 'test' });
  state.enabled = true;
  const runtime = createSyntaxRuntime({
    state,
    VERSION: 'nostrodomus-test',
    W: { NodeFilter: {} },
    DARKPLUS_SYNTAX_COLORS: { fg: '#ffffff', dim: '#999999' },
    DARKPLUS_MAX_LINES_PER_PASS: 50,
    DARKPLUS_MAX_SPANS_PER_PASS: 200,
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'nostrodomus-test-source-class',
    STYLE_SYNTAX_KIND_ORDER: ['fg', 'key', 'string'],
    activeCodeboxStyleEditor: () => ({ querySelector: () => null, dataset: {}, getRootNode: () => ({ querySelector: () => null }) }),
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
    scheduleDiagnosticsRefresh: () => false,
  });
  return { state, runtime, events };
}

test('the syntax runtime API has no inline painter or syntax recovery entry points', () => {
  const { runtime } = createRuntime();
  assert.equal('legacyPainterEnabled' in runtime, false);
  assert.equal('scheduleSyntaxRecovery' in runtime, false);
  assert.equal('paintDarkPlusMutationNow' in runtime, false);
  assert.equal('paintDarkPlusLinesNow' in runtime, false);
  assert.equal('paintDarkPlusNode' in runtime, false);
  assert.equal('cancelSyntaxRecoveryTimersForNativeHighlight' in runtime, false);
});

test('the runtime state has no syntax recovery fields', () => {
  const { state } = createRuntime();
  assert.equal('syntaxRecoveryRaf' in state, false);
  assert.equal('syntaxRecoveryTimers' in state, false);
  assert.equal('syntaxRecoveryDelayTimers' in state, false);
  assert.equal('syntaxRecoveryTimerCoalesces' in state, false);
});

test('applyDarkPlusSyntaxColoring routes only through source-class CSS', () => {
  const { runtime, events } = createRuntime();
  const result = runtime.applyDarkPlusSyntaxColoring({ querySelector: () => null }, {});
  assert.equal(result.skipped, true);
  assert.equal(result.sourceClassUnavailable, true);
  assert.equal(events.some(event => event.name === 'syntax.legacy-painter.blocked'), false);
});
