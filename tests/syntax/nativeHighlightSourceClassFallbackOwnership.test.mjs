import assert from 'node:assert/strict';
import {
  codeMirrorNativeHighlightApiStatus,
  shouldPromoteSourceClassFallbackForNativeHighlight,
} from '../../src/syntax/codeMirrorNativeHighlight.js';

const missing = codeMirrorNativeHighlightApiStatus({ cm: {}, view: { state: {}, dispatch() {} } });
assert.equal(missing.available, false);
assert.equal(missing.missing.includes('hasTags'), true);
assert.equal(missing.missing.includes('hasHighlightStyle'), true);
assert.equal(missing.missing.includes('hasSyntaxHighlighting'), true);

const promoted = shouldPromoteSourceClassFallbackForNativeHighlight({
  nativeInstalled: false,
  sourceClassInstalled: true,
  nativeReason: 'missing-native-codemirror-api',
  reason: 'active-editor-smoke',
});
assert.equal(promoted.promoted, true);
assert.equal(promoted.path, 'source-class-fallback-owner');
assert.equal(promoted.nativeReason, 'missing-native-codemirror-api');

const notPromotedWhenNativeWorks = shouldPromoteSourceClassFallbackForNativeHighlight({
  nativeInstalled: true,
  sourceClassInstalled: true,
  nativeReason: 'installed-native-highlight',
});
assert.equal(notPromotedWhenNativeWorks.promoted, false);

const notPromotedWithoutSource = shouldPromoteSourceClassFallbackForNativeHighlight({
  nativeInstalled: false,
  sourceClassInstalled: false,
  nativeReason: 'missing-native-codemirror-api',
});
assert.equal(notPromotedWithoutSource.promoted, false);
