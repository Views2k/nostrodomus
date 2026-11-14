import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipRememberActiveEditorNativeHighlightInstall } from '../../src/syntax/codeMirrorNativeHighlight.js';

test('remember-active editor native highlight install is skipped when source-class fallback already owns the same native-unavailable editor', () => {
  const previousOwnership = {
    promoted: true,
    sourceClass: true,
    editorKey: 'editor-a',
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting', 'hasCompartment', 'hasAppendConfig'],
  };

  const duplicate = shouldSkipRememberActiveEditorNativeHighlightInstall({
    hasEditor: true,
    editorKey: 'editor-a',
    sourceClassActive: true,
    previousOwnership,
    reason: 'companion-editor-ready',
  });

  assert.equal(duplicate.skip, true);
  assert.equal(duplicate.path, 'native-unavailable-remember-active-editor-deduped');
  assert.equal(duplicate.previousMatches, true);
  assert.equal(duplicate.nativeReason, 'missing-native-codemirror-api');

  const differentEditor = shouldSkipRememberActiveEditorNativeHighlightInstall({
    hasEditor: true,
    editorKey: 'editor-b',
    sourceClassActive: true,
    previousOwnership,
  });
  assert.equal(differentEditor.skip, false);

  const inactiveSourceClass = shouldSkipRememberActiveEditorNativeHighlightInstall({
    hasEditor: true,
    editorKey: 'editor-a',
    sourceClassActive: false,
    previousOwnership,
  });
  assert.equal(inactiveSourceClass.skip, false);

  const noOwnership = shouldSkipRememberActiveEditorNativeHighlightInstall({
    hasEditor: true,
    editorKey: 'editor-a',
    sourceClassActive: true,
  });
  assert.equal(noOwnership.skip, false);
});
