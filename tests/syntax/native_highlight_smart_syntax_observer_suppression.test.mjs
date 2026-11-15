import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldSuppressLegacySmartSyntaxObserverForNativeHighlight } from '../../src/syntax/codeMirrorNativeHighlight.js';

test('native highlight ownership suppresses legacy smart syntax observer installation', () => {
  const active = shouldSuppressLegacySmartSyntaxObserverForNativeHighlight({
    nativeHighlightActive: true,
    reason: 'smart-source-content-change',
  });

  assert.equal(active.suppressed, true);
  assert.equal(active.nativeHighlightActive, true);
  assert.equal(active.reason, 'smart-source-content-change');
  assert.equal(active.path, 'native-highlight-observer-owner');
});

test('legacy smart syntax observer remains available when native highlight is absent', () => {
  const inactive = shouldSuppressLegacySmartSyntaxObserverForNativeHighlight({
    nativeHighlightActive: false,
    reason: 'fallback-observer-install',
  });

  assert.equal(inactive.suppressed, false);
  assert.equal(inactive.nativeHighlightActive, false);
  assert.equal(inactive.reason, 'fallback-observer-install');
  assert.equal(inactive.path, 'legacy-observer-fallback');
});
