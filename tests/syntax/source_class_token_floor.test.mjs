import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourceClassCssBuilder } from '../../src/syntax/sourceClassCssBuilder.js';

function builder(colors = {}) {
  const palette = { fg: '#d4d4d4', dim: '#7a7a7a', string: '#ce9178', number: '#b5cea8', ...colors };
  const api = {
    darkPlusColor: (kind) => palette[kind] || '#ffffff',
    // The smart-syntax kind overlay is appended into the same sheet AFTER the base block.
    buildSmartSyntaxClassCss: () => '.cm-content .cm-line span.nostrodomus-syntax-kind-string { color: #abc !important; }',
  };
  return createSourceClassCssBuilder({ cssEscapeSelectorPart: (s) => s, api });
}

// The Ctrl+Space white-out fix: HA's CodeMirror YAML mode tags string/number tokens with the persistent
// classes .yaml-string / .yaml-number, but highlightingFor() yields nothing here, so without an explicit
// floor those tokens fall to the broad white container fallback whenever a re-render drops the smart-syntax
// kind class. The floor colors the stable classes directly (color + -webkit-text-fill-color).
test('source-class builder gives the stable yaml token classes an explicit color + -webkit-text-fill-color floor', () => {
  const { css } = builder().buildCodeMirrorSourceClassSyntaxCss(
    { cm: { highlightingFor: () => '' }, view: { state: {} }, tags: {} },
    { active: false },
  );
  assert.match(css, /\.cm-content \.cm-line span\.yaml-string \{\s*color: #ce9178 !important;\s*-webkit-text-fill-color: #ce9178 !important;/);
  assert.match(css, /\.cm-content \.cm-line span\.yaml-number \{\s*color: #b5cea8 !important;\s*-webkit-text-fill-color: #b5cea8 !important;/);
});

test('the yaml token-color floor is emitted BEFORE the smart-syntax kind overlay (kind rule still wins when present)', () => {
  const { css } = builder().buildCodeMirrorSourceClassSyntaxCss(
    { cm: { highlightingFor: () => '' }, view: { state: {} }, tags: {} },
    { active: false },
  );
  assert.ok(
    css.indexOf('span.yaml-string') < css.indexOf('nostrodomus-syntax-kind-string'),
    'the floor precedes the kind overlay so the distinct overlay color wins at equal specificity when present',
  );
});

test('the base container foreground no longer targets every token span (v0.1.154 narrowing held)', () => {
  const { css } = builder().buildCodeMirrorSourceClassSyntaxCss(
    { cm: { highlightingFor: () => '' }, view: { state: {} }, tags: {} },
    { active: false },
  );
  // a bare `.cm-content .cm-line span { ... }` block is exactly the over-broad fallback that whited tokens
  // out — assert it's not a real rule (strip /* */ comments first so the explanatory note doesn't match)
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(cssNoComments, /\.cm-content \.cm-line span \{/);
});
