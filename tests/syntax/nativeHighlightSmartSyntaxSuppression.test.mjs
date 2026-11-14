import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldSuppressLegacySmartSyntaxForNativeHighlight } from '../../src/syntax/codeMirrorNativeHighlight.js';

test('native highlight ownership suppresses legacy smart syntax scheduling', () => {
  const active = shouldSuppressLegacySmartSyntaxForNativeHighlight({
    nativeHighlightActive: true,
    reason: 'editor-focusout',
  });

  assert.equal(active.suppressed, true);
  assert.equal(active.nativeHighlightActive, true);
  assert.equal(active.reason, 'editor-focusout');
  assert.equal(active.path, 'native-highlight-owner');
});

test('legacy syntax scheduling remains available when native highlight is absent', () => {
  const inactive = shouldSuppressLegacySmartSyntaxForNativeHighlight({
    nativeHighlightActive: false,
    reason: 'fallback-refresh',
  });

  assert.equal(inactive.suppressed, false);
  assert.equal(inactive.nativeHighlightActive, false);
  assert.equal(inactive.reason, 'fallback-refresh');
  assert.equal(inactive.path, 'legacy-fallback');
});
