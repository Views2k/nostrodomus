import assert from 'node:assert/strict';
import { shouldSuppressLegacySourceClassRefreshForNativeHighlight } from '../../src/syntax/codeMirrorNativeHighlight.js';

const active = shouldSuppressLegacySourceClassRefreshForNativeHighlight({
  nativeHighlightActive: true,
  reason: 'source-class-refresh-smoke',
});
assert.equal(active.suppressed, true);
assert.equal(active.nativeHighlightActive, true);
assert.equal(active.reason, 'source-class-refresh-smoke');
assert.equal(active.path, 'native-highlight-source-class-refresh-owner');

const fallback = shouldSuppressLegacySourceClassRefreshForNativeHighlight({
  nativeHighlightActive: false,
  reason: 'source-class-refresh-fallback',
});
assert.equal(fallback.suppressed, false);
assert.equal(fallback.nativeHighlightActive, false);
assert.equal(fallback.path, 'legacy-source-class-refresh-fallback');
