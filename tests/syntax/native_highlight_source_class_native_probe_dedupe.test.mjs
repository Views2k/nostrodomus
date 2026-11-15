import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipSourceClassNativeProbeForNativeFallback } from '../../src/syntax/codeMirrorNativeHighlight.js';

test('source-class native probe is skipped when native APIs are known unavailable for the same fallback-owned editor', () => {
  const previousOwnership = {
    promoted: true,
    sourceClass: true,
    editorKey: 'editor-a',
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting', 'hasCompartment', 'hasAppendConfig'],
  };

  const duplicate = shouldSkipSourceClassNativeProbeForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-a',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting', 'hasCompartment', 'hasAppendConfig'],
    sourceClassActive: true,
    previousOwnership,
    reason: 'apply-text-color-preset',
  });

  assert.equal(duplicate.skip, true);
  assert.equal(duplicate.path, 'native-unavailable-source-class-native-probe-deduped');
  assert.equal(duplicate.previousMatches, true);
  assert.equal(duplicate.nativeUnavailable, true);

  const differentEditor = shouldSkipSourceClassNativeProbeForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-b',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting', 'hasCompartment', 'hasAppendConfig'],
    sourceClassActive: true,
    previousOwnership,
  });
  assert.equal(differentEditor.skip, false);

  const nativeAvailable = shouldSkipSourceClassNativeProbeForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-a',
    nativeAvailable: true,
    nativeReason: '',
    sourceClassActive: true,
    previousOwnership,
  });
  assert.equal(nativeAvailable.skip, false);
});
