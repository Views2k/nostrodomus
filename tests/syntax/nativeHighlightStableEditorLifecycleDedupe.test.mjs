import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipStableEditorLifecycleForNativeFallback } from '../../src/syntax/codeMirrorNativeHighlight.js';

test('stable editor lifecycle is skipped after source-class fallback owns same native-unavailable editor', () => {
  const previousOwnership = {
    promoted: true,
    sourceClass: true,
    editorKey: 'editor-a',
    nativeReason: 'missing-native-codemirror-api',
    missingNativeApi: ['hasHighlightStyle', 'hasSyntaxHighlighting', 'hasCompartment', 'hasAppendConfig'],
  };

  const duplicate = shouldSkipStableEditorLifecycleForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-a',
    sourceClassActive: true,
    sourceClassObserverReady: true,
    previousOwnership,
    reason: 'companion-editor-ready-dialog-shadow-mutation',
  });

  assert.equal(duplicate.skip, true);
  assert.equal(duplicate.path, 'native-unavailable-stable-editor-lifecycle-deduped');
  assert.equal(duplicate.previousMatches, true);
  assert.equal(duplicate.stableReason, true);

  const observerMissing = shouldSkipStableEditorLifecycleForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-a',
    sourceClassActive: true,
    sourceClassObserverReady: false,
    previousOwnership,
    reason: 'companion-editor-ready-dialog-shadow-mutation',
  });
  assert.equal(observerMissing.skip, false);

  const newEditor = shouldSkipStableEditorLifecycleForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-b',
    sourceClassActive: true,
    sourceClassObserverReady: true,
    previousOwnership,
    reason: 'editor-sentinel-stable-hit',
  });
  assert.equal(newEditor.skip, false);

  const structuralReason = shouldSkipStableEditorLifecycleForNativeFallback({
    hasEditor: true,
    editorKey: 'editor-a',
    sourceClassActive: true,
    sourceClassObserverReady: true,
    previousOwnership,
    reason: 'editor-sentinel-new-editor',
  });
  assert.equal(structuralReason.skip, false);
});
