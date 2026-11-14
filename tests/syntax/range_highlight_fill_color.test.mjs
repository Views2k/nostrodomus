import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSmartSyntaxClassCss } from '../../src/syntax/smartSyntaxStyles.js';

// The source-class sheet sets -webkit-text-fill-color with !important on CodeMirror's own token
// spans. In range mode the highlight is the only Nostrodomus color layer, so its rule has to
// state the fill color itself instead of relying on the engine deriving it from `color`.
test('each ::highlight rule sets the text fill color as well as the color', () => {
  const css = buildSmartSyntaxClassCss(
    { active: false },
    ['fg', 'comment', 'cssValue'],
    (kind) => ({ comment: '#888', cssValue: '#0af' })[kind] || '#fff',
  );
  assert.match(css, /::highlight\(nostrodomus-source-syntax-cssValue\) \{\s*color: #0af;\s*-webkit-text-fill-color: #0af;/);
  assert.match(css, /::highlight\(nostrodomus-source-syntax-comment\) \{\s*color: #888;\s*-webkit-text-fill-color: #888;/);
});
