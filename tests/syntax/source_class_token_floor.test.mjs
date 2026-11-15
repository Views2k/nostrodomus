import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourceClassCssBuilder } from '../../src/syntax/sourceClassCssBuilder.js';

function builder(colors = {}) {
  const palette = { fg: '#d4d4d4', dim: '#7a7a7a', string: '#ce9178', number: '#b5cea8', ...colors };
  const api = {
    darkPlusColor: (kind) => palette[kind] || '#ffffff',
    // The smart-syntax kind rules are appended to the same sheet after the base block.
    buildSmartSyntaxClassCss: () => '.cm-content .cm-line span.nostrodomus-syntax-kind-string { color: #abc !important; }',
  };
  return createSourceClassCssBuilder({ cssEscapeSelectorPart: (s) => s, api });
}

// Home Assistant's YAML mode gives strings and numbers the classes .yaml-string and .yaml-number,
// and highlightingFor() returns no class for them. The builder colors those classes directly, so the
// tokens keep their color while a re-render (Ctrl+Space) has dropped the smart-syntax kind class.
test('source-class builder gives the stable yaml token classes an explicit color + -webkit-text-fill-color floor', () => {
  const { css } = builder().buildCodeMirrorSourceClassSyntaxCss(
    { cm: { highlightingFor: () => '' }, view: { state: {} }, tags: {} },
    { active: false },
  );
  assert.match(css, /\.cm-content \.cm-line span\.yaml-string \{\s*color: #ce9178 !important;\s*-webkit-text-fill-color: #ce9178 !important;/);
  assert.match(css, /\.cm-content \.cm-line span\.yaml-number \{\s*color: #b5cea8 !important;\s*-webkit-text-fill-color: #b5cea8 !important;/);
});

test('the yaml token color rules come before the smart-syntax kind rules, so a kind rule wins when present', () => {
  const { css } = builder().buildCodeMirrorSourceClassSyntaxCss(
    { cm: { highlightingFor: () => '' }, view: { state: {} }, tags: {} },
    { active: false },
  );
  assert.ok(
    css.indexOf('span.yaml-string') < css.indexOf('nostrodomus-syntax-kind-string'),
    'the floor precedes the kind overlay so the distinct overlay color wins at equal specificity when present',
  );
});

test('the base foreground does not target every token span', () => {
  const { css } = builder().buildCodeMirrorSourceClassSyntaxCss(
    { cm: { highlightingFor: () => '' }, view: { state: {} }, tags: {} },
    { active: false },
  );
  // A `.cm-content .cm-line span { ... }` rule would give every token the base color whenever its
  // kind class is missing. Comments are stripped so the notes inside the sheet cannot match.
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(cssNoComments, /\.cm-content \.cm-line span \{/);
});
