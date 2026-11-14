import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMBEDDED_LANGUAGE_DIAGNOSTICS_STAGE,
  EMBEDDED_LANGUAGE_DIAGNOSTICS_VERSION,
  createEmbeddedLanguageDiagnostics,
  embeddedLanguageDetectorInputFromActiveEditorReadout,
  embeddedLanguageDetectorInputFromContext,
} from '../../src/languages/embeddedLanguageDiagnostics.js';

test('compact embedded language diagnostics remain observe-only and redacted', () => {
  const report = createEmbeddedLanguageDiagnostics({
    legacyContext: {
      lang: 'yaml',
      scope: 'card-mod-css',
      yamlPath: ['cards', '0', 'card_mod', 'style'],
      line: '    border-radius: 18px;',
      beforeCursor: '    border-radius: 18',
      afterCursor: 'px;',
    },
  });

  assert.equal(EMBEDDED_LANGUAGE_DIAGNOSTICS_VERSION, 2);
  assert.equal(EMBEDDED_LANGUAGE_DIAGNOSTICS_STAGE, 'embedded-language-diagnostics-compact');
  assert.equal(report.ok, true);
  assert.equal(report.localOnly, true);
  assert.equal(report.redacted, true);
  assert.equal(report.diagnosticsOnly, true);
  assert.equal(report.observeOnly, true);
  assert.equal(report.drivesAutocomplete, false);
  assert.equal(report.registersProviders, false);
  assert.equal(report.opensPopup, false);
  assert.equal(report.insertsText, false);
  assert.equal(report.mutatesScoring, false);
  assert.equal(report.legacyContext.result.laneId, 'css');
  assert.equal(report.legacyContext.shadowDecision.laneId, 'css');
  assert.equal(report.legacyContext.shadowDecision.topSurfaceIds[0], 'card-mod');
  assert.equal(report.legacyContext.shadowDecision.drivesAutocomplete, false);
  assert.equal(report.legacyContext.input.yamlPathText, 'cards.0.card_mod.style');
  assert.equal(Object.hasOwn(report.legacyContext.input, 'text'), false);
});

test('embedded language diagnostics build detector input from legacy context', () => {
  const input = embeddedLanguageDetectorInputFromContext({
    lang: 'yaml',
    yamlPath: ['cards', '0', 'secondary'],
    line: "secondary: {{ states('sensor.kitchen') }}",
    beforeCursor: "secondary: {{ states('sensor.",
    afterCursor: "kitchen') }}",
  });

  assert.equal(input.cursorOffset, "secondary: {{ states('sensor.".length);
  assert.deepEqual(input.yamlPath, ['cards', '0', 'secondary']);
  assert.equal(input.scalarStyle, 'plain');
});

test('embedded language diagnostics can read active editor readout snapshots', () => {
  const input = embeddedLanguageDetectorInputFromActiveEditorReadout({
    activeEditor: {
      snapshot: {
        snapshot: {
          language: 'yaml',
          scope: 'button-card-js',
          cursor: {
            linePreview: '  [[[ return entity.state ]]]',
            beforeCursorPreview: '  [[[ return entity',
            afterCursorPreview: '.state ]]]',
          },
          yaml: { path: ['cards', '0', 'label'] },
        },
      },
    },
  });

  const report = createEmbeddedLanguageDiagnostics({ activeDetectorInput: input });
  assert.equal(report.activeEditor.result.laneId, 'javascript');
  assert.equal(report.activeEditor.shadowDecision.laneId, 'javascript');
  assert.equal(report.activeEditor.shadowDecision.topSurfaceIds[0], 'button-card');
  assert.equal(report.activeEditor.shadowDecision.drivesAutocomplete, false);
  assert.equal(report.activeEditor.input.yamlPathText, 'cards.0.label');
});
