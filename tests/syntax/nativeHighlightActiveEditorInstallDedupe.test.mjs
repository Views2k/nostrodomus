import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipNativeUnavailableActiveEditorInstall } from '../../src/syntax/codeMirrorNativeHighlight.js';

test('active-editor native highlight install dedupes when native API is unavailable and source-class fallback already owns editor', () => {
  const previousOwnership = {
    promoted: true,
    sourceClass: true,
    editorKey: 'editor-a',
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
  };

  const duplicate = shouldSkipNativeUnavailableActiveEditorInstall({
    hasEditor: true,
    pending: false,
    editorKey: 'editor-a',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
    sourceClassActive: true,
    previousOwnership,
    reason: 'companion-editor-ready',
  });

  assert.equal(duplicate.skip, true);
  assert.equal(duplicate.path, 'native-unavailable-active-editor-deduped');
  assert.equal(duplicate.previousMatches, true);

  const differentEditor = shouldSkipNativeUnavailableActiveEditorInstall({
    hasEditor: true,
    pending: false,
    editorKey: 'editor-b',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
    sourceClassActive: true,
    previousOwnership,
  });
  assert.equal(differentEditor.skip, false);

  const inactiveSourceClass = shouldSkipNativeUnavailableActiveEditorInstall({
    hasEditor: true,
    pending: false,
    editorKey: 'editor-a',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
    sourceClassActive: false,
    previousOwnership,
  });
  assert.equal(inactiveSourceClass.skip, false);

  const pending = shouldSkipNativeUnavailableActiveEditorInstall({
    hasEditor: true,
    pending: true,
    editorKey: 'editor-a',
    nativeAvailable: false,
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting'],
    sourceClassActive: true,
    previousOwnership,
  });
  assert.equal(pending.skip, false);
});
