import assert from 'node:assert/strict';
import { shouldSuppressLegacyInlineSyntaxOwnerForNativeHighlight } from '../../src/syntax/codeMirrorNativeHighlight.js';

const active = shouldSuppressLegacyInlineSyntaxOwnerForNativeHighlight({
  nativeHighlightActive: true,
  reason: 'syntax-owner-smoke',
});
assert.equal(active.suppressed, true);
assert.equal(active.nativeHighlightActive, true);
assert.equal(active.reason, 'syntax-owner-smoke');
assert.equal(active.path, 'native-highlight-inline-owner');

const fallback = shouldSuppressLegacyInlineSyntaxOwnerForNativeHighlight({
  nativeHighlightActive: false,
  reason: 'syntax-owner-fallback',
});
assert.equal(fallback.suppressed, false);
assert.equal(fallback.nativeHighlightActive, false);
assert.equal(fallback.path, 'legacy-inline-owner-fallback');
