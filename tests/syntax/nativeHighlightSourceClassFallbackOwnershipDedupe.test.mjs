import assert from 'node:assert/strict';
import {
  shouldPromoteSourceClassFallbackForNativeHighlight,
  shouldRecordSourceClassFallbackOwnership,
  sourceClassFallbackOwnershipSignature,
} from '../../src/syntax/codeMirrorNativeHighlight.js';

const promoted = shouldPromoteSourceClassFallbackForNativeHighlight({
  nativeInstalled: false,
  sourceClassInstalled: true,
  nativeReason: 'missing-native-codemirror-api',
  reason: 'active-editor-smoke',
});
assert.equal(promoted.promoted, true);

const signature = sourceClassFallbackOwnershipSignature({
  editorKey: 'editor-a',
  nativeReason: 'missing-native-codemirror-api',
  mapped: 30,
  sourceClassInstalled: true,
});
assert.ok(signature.includes('editor-a'));

const first = shouldRecordSourceClassFallbackOwnership({
  promoted: true,
  sourceClassInstalled: true,
  existingSourceClassActive: true,
  previousSignature: '',
  editorKey: 'editor-a',
  nativeReason: 'missing-native-codemirror-api',
  mapped: 30,
});
assert.equal(first.record, true);
assert.equal(first.duplicate, false);

const duplicate = shouldRecordSourceClassFallbackOwnership({
  promoted: true,
  sourceClassInstalled: true,
  existingSourceClassActive: true,
  previousSignature: first.nextSignature,
  editorKey: 'editor-a',
  nativeReason: 'missing-native-codemirror-api',
  mapped: 30,
});
assert.equal(duplicate.record, false);
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.path, 'source-class-fallback-owner-deduped');

const newEditor = shouldRecordSourceClassFallbackOwnership({
  promoted: true,
  sourceClassInstalled: true,
  existingSourceClassActive: true,
  previousSignature: first.nextSignature,
  editorKey: 'editor-b',
  nativeReason: 'missing-native-codemirror-api',
  mapped: 30,
});
assert.equal(newEditor.record, true);
assert.equal(newEditor.duplicate, false);

const inactiveFallback = shouldRecordSourceClassFallbackOwnership({
  promoted: true,
  sourceClassInstalled: true,
  existingSourceClassActive: false,
  previousSignature: first.nextSignature,
  editorKey: 'editor-a',
  nativeReason: 'missing-native-codemirror-api',
  mapped: 30,
});
assert.equal(inactiveFallback.record, true);
assert.equal(inactiveFallback.duplicate, false);
