import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipSyntaxOwnerSourceClassInstallForNativeFallback } from '../../src/syntax/codeMirrorNativeHighlight.js';

test('syntax-owner source-class install dedupes after native API is unavailable and fallback observer is ready', () => {
  const previousOwnership = {
    promoted: true,
    sourceClass: true,
    editorKey: 'editor-a',
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
  };

  const duplicate = shouldSkipSyntaxOwnerSourceClassInstallForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-a',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
    sourceClassActive: true,
    sourceClassObserverReady: true,
    previousOwnership,
    reason: 'syntax-owner-companion-editor-ready',
  });

  assert.equal(duplicate.skip, true);
  assert.equal(duplicate.path, 'native-unavailable-syntax-owner-source-class-deduped');
  assert.equal(duplicate.previousMatches, true);

  const observerMissing = shouldSkipSyntaxOwnerSourceClassInstallForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-a',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
    sourceClassActive: true,
    sourceClassObserverReady: false,
    previousOwnership,
  });
  assert.equal(observerMissing.skip, false);

  const differentEditor = shouldSkipSyntaxOwnerSourceClassInstallForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-b',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
    sourceClassActive: true,
    sourceClassObserverReady: true,
    previousOwnership,
  });
  assert.equal(differentEditor.skip, false);
});
