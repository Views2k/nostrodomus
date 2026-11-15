import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAttemptNativeHighlightForActiveEditor } from '../../src/syntax/codeMirrorNativeHighlight.js';

test('active editor native highlight trigger attempts only when editor is present, not native-owned, and not already pending', () => {
  assert.equal(shouldAttemptNativeHighlightForActiveEditor({ hasEditor: false }).attempt, false);
  assert.equal(shouldAttemptNativeHighlightForActiveEditor({ hasEditor: true, nativeHighlightActive: true }).attempt, false);
  assert.equal(shouldAttemptNativeHighlightForActiveEditor({ hasEditor: true, pending: true }).attempt, false);

  const result = shouldAttemptNativeHighlightForActiveEditor({ hasEditor: true, reason: 'editor-detected' });
  assert.equal(result.attempt, true);
  assert.equal(result.path, 'active-editor-native-highlight-trigger');
  assert.equal(result.reason, 'editor-detected');
});
