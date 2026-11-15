import test from 'node:test';
import assert from 'node:assert/strict';

import {
  diagnosticsReadoutBool,
  diagnosticsReadoutBundle,
  diagnosticsReadoutSafeWarnings,
  diagnosticsReadoutString,
  diagnosticsReadoutSummary,
  safeContextSummary,
} from '../../src/diagnostics/diagnosticsCore.js';

test('safeContextSummary keeps the public context fields, reports prefix and path lengths and drops the rest', () => {
  const summary = safeContextSummary({
    lang: 'yaml',
    scope: 'lovelace',
    confidence: 0.75,
    yamlRole: 'key',
    yamlKey: 'tap_action',
    triggerKind: 'manual',
    isTriggerChar: true,
    isBlankLine: false,
    shouldSuggest: true,
    prefix: 'tap',
    yamlPath: ['cards', '0', 'tap_action'],
    inComment: false,
    extra: 'ignored',
  });

  assert.deepEqual(summary, {
    lang: 'yaml',
    scope: 'lovelace',
    confidence: 0.75,
    yamlRole: 'key',
    yamlKey: 'tap_action',
    triggerKind: 'manual',
    isTriggerChar: true,
    isBlankLine: false,
    shouldSuggest: true,
    prefixLength: 3,
    yamlPathDepth: 3,
    inComment: false,
  });
  assert.equal(safeContextSummary(null), null);
});

test('diagnostics readout coercion helpers truncate strings, accept only true booleans and keep at most 10 warnings', () => {
  assert.equal(diagnosticsReadoutString('abcdef', 4), 'abcd…');
  assert.equal(diagnosticsReadoutString(null), '');
  assert.equal(diagnosticsReadoutBool(true), true);
  assert.equal(diagnosticsReadoutBool('true'), false);

  const warnings = Array.from({ length: 12 }, (_, index) => ({
    code: `code-${index}`,
    legacy: `legacy-${index}`,
    snapshot: `snapshot-${index}`,
  }));
  const safe = diagnosticsReadoutSafeWarnings(warnings);
  assert.equal(safe.length, 10);
  assert.deepEqual(safe[0], { code: 'code-0', legacy: 'legacy-0', snapshot: 'snapshot-0' });
  assert.deepEqual(diagnosticsReadoutSafeWarnings(null), []);
});

test('diagnosticsReadoutSummary reports the API flags and the active editor readout', () => {
  const api = {
    stage: 'loaded',
    isEnabled: () => true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    networkAccess: false,
    readActiveEditor: () => ({ ok: true, editorFound: true, warning: 'none' }),
  };

  assert.deepEqual(diagnosticsReadoutSummary(api), {
    available: true,
    stage: 'loaded',
    enabled: true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    networkAccess: false,
    activeEditorOk: true,
    activeEditorFound: true,
    activeEditorWarning: 'none',
  });
});

test('diagnosticsReadoutSummary reads the editor readout inside the envelope readActiveEditor returns', () => {
  const found = diagnosticsReadoutSummary({ readActiveEditor: () => ({ ok: true, stage: 'envelope', activeEditor: { ok: true, editorFound: true } }) });
  assert.equal(found.activeEditorFound, true);
  assert.equal(found.activeEditorWarning, 'none');
  const missing = diagnosticsReadoutSummary({ readActiveEditor: () => ({ ok: false, activeEditor: { ok: false, editorFound: false, warning: 'no-active-codemirror-view-found' } }) });
  assert.equal(missing.activeEditorFound, false);
  assert.equal(missing.activeEditorWarning, 'no-active-codemirror-view-found');
});

test('diagnosticsReadoutBundle reports an available readout with the active editor found', () => {
  const api = {
    stage: 'loaded',
    isEnabled: () => true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    networkAccess: false,
    readActiveEditor: () => ({ ok: true, editorFound: true, warning: 'none' }),
  };

  const bundle = diagnosticsReadoutBundle({ api });

  assert.equal(bundle.readout.available, true);
  assert.equal(bundle.readout.activeEditorFound, true);
});
