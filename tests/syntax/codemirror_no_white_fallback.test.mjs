// The generated CodeMirror CSS must not hard-code a white or near-white fallback on the base line
// or container. During a Ctrl+Space repaint the Nostrodomus syntax classes (nostrodomus-syntax-kind-*,
// nostrodomus-syntax-line-*) drop for about one frame and the base `.cm-content .cm-line` rule wins;
// a white base (for example the palette fg of a white preset raised by the syntax opacity slider,
// `rgba(255,255,255,0.67)`) flashes the whole line white. The base fallback goes through the neutral
// var(--nostrodomus-codebox-syntax-fg, #d4d4d4) and uses -webkit-text-fill-color: currentColor.
//
// Both CSS builders are driven with a white foreground palette, the worst case. The checks read the
// generated text and touch no frozen stylesheet.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourceClassCssBuilder } from '../../src/syntax/sourceClassCssBuilder.js';
import { createNativeHighlightLifecycle } from '../../src/syntax/nativeHighlightLifecycle.js';
import { buildSmartSyntaxClassCss } from '../../src/syntax/smartSyntaxStyles.js';

// Worst case: a white-foreground preset + the syntax-opacity slider — exactly the traced value.
const WHITE_PALETTE = { fg: 'rgba(255, 255, 255, 0.67)', dim: '#7a7a7a', string: '#ce9178', number: '#b5cea8' };
const api = {
  darkPlusColor: (kind) => WHITE_PALETTE[kind] || '#ffffff',
  // The smart-syntax kind overlay is appended into the same sheet after the base block (a non-white
  // sample rule, mirroring the source_class_token_floor harness).
  buildSmartSyntaxClassCss: () => '.cm-content .cm-line span.nostrodomus-syntax-kind-string { color: #abc !important; }',
};

function sourceClassCss() {
  const builder = createSourceClassCssBuilder({ cssEscapeSelectorPart: (s) => s, api });
  const { css } = builder.buildCodeMirrorSourceClassSyntaxCss(
    { cm: { highlightingFor: () => '' }, view: { state: {} }, tags: {} },
    { active: false },
  );
  return css;
}

function nativeHighlightCss() {
  const lifecycle = createNativeHighlightLifecycle({ api });
  return lifecycle.buildCodeMirrorNativeHighlightBaseCss({ active: false });
}

// White color / -webkit-text-fill-color inside a .cm-content / .cm-line / .cm-activeLine block. The
// property name is boundary-anchored ([\s;{]) so the legitimate `caret-color: #ffffff` is not matched
// (its `color` is preceded by `-`), and caret-color is not text fill.
const WHITE = String.raw`(?:#fff(?:fff)?\b|white\b|rgba\(\s*255\s*,\s*255\s*,\s*255)`;
const WHITE_ON_CM_BASE = new RegExp(
  String.raw`\.cm-(?:content|line|activeLine)[^{}]*\{[^}]*[\s;{](?:color|-webkit-text-fill-color)\s*:\s*` + WHITE,
  'i',
);
const WHITE_TEXT_FILL_ANYWHERE = /-webkit-text-fill-color\s*:\s*rgba\(\s*255\s*,\s*255\s*,\s*255/i;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

for (const [name, build] of [['source-class', sourceClassCss], ['native-highlight', nativeHighlightCss]]) {
  test(`${name} CSS: no white/near-white fallback on .cm-content/.cm-line/.cm-activeLine (no Ctrl+Space flash)`, () => {
    const css = stripComments(build());
    assert.doesNotMatch(
      css,
      WHITE_ON_CM_BASE,
      `${name} base must not paint a white color / -webkit-text-fill-color on .cm-content/.cm-line/.cm-activeLine — it would flash white when the semantic classes drop during a Ctrl+Space repaint`,
    );
  });

  test(`${name} CSS: no -webkit-text-fill-color: rgba(255,255,255,...) anywhere`, () => {
    const css = stripComments(build());
    assert.doesNotMatch(css, WHITE_TEXT_FILL_ANYWHERE, `${name} must not hardcode a white -webkit-text-fill-color`);
  });
}

test('source-class base .cm-content .cm-line uses the neutral var, not the (possibly-white) palette fg', () => {
  const css = stripComments(sourceClassCss());
  // The base line fallback must thread the neutral var (wired to #d4d4d4), so a white-fg theme can never
  // make the line flash white.
  assert.match(
    css,
    /\.cm-content \.cm-line \{[^}]*color:\s*var\(--nostrodomus-codebox-syntax-fg,\s*#d4d4d4\)/i,
    'the .cm-content .cm-line base fallback must use var(--nostrodomus-codebox-syntax-fg, #d4d4d4)',
  );
});

// The smart-syntax "fg" kind/line classes are the default/fallback kind (smartSyntaxKind normalizes any
// unrecognized token to "fg"), so on a white-fg theme they render white and flash on a Ctrl+Space repaint
// (the bracket/curly/plain-template white). They must resolve to the neutral var; every
// other kind must stay palette-driven (no flattening). Force the worst case: darkPlusColor("fg") = white.
const whiteFgDarkPlus = (kind) => (kind === 'fg' ? 'rgba(255, 255, 255, 0.67)' : '#abc123');

test('smart-syntax fg kind/line classes resolve to the neutral var, never white', () => {
  const css = buildSmartSyntaxClassCss({ active: false }, undefined, whiteFgDarkPlus);
  for (const cls of ['nostrodomus-syntax-kind-fg', 'nostrodomus-syntax-line-fg']) {
    const block = new RegExp(cls + String.raw`[^{]*\{([^}]*)\}`).exec(css)?.[1];
    assert.ok(block, `${cls} rule block not found in the smart-syntax CSS`);
    assert.doesNotMatch(
      block,
      /(?:color|-webkit-text-fill-color)\s*:\s*(?:rgba\(\s*255\s*,\s*255\s*,\s*255|#fff(?:fff)?\b|white\b)/i,
      `${cls} must not resolve to white (would flash on Ctrl+Space)`,
    );
    assert.match(block, /color:\s*var\(--nostrodomus-codebox-syntax-fg,\s*#d4d4d4\)/i, `${cls} must use the neutral var`);
  }
});

test('the fg kind and line rules carry raised specificity so the neutral fg wins the override', () => {
  const css = buildSmartSyntaxClassCss({ active: false }, undefined, whiteFgDarkPlus);
  // A neutral fg rule at normal specificity is overridden to white on themes with a white fg, so the
  // fg is set at raised specificity by repeating the Nostrodomus fg class (registry safe: no doubled
  // .cm-* class). Without it the tokens would flash white.
  assert.match(css, /span\.nostrodomus-syntax-kind-fg\.nostrodomus-syntax-kind-fg\.nostrodomus-syntax-kind-fg/, 'fg kind rule must carry boosted (repeated-class) specificity');
  assert.match(css, /\.cm-line\.nostrodomus-syntax-line-fg\.nostrodomus-syntax-line-fg\.nostrodomus-syntax-line-fg/, 'fg line rule must carry boosted (repeated-class) specificity');
  // ...and non-fg kinds must not get the boost (kept surgical).
  assert.doesNotMatch(css, /nostrodomus-syntax-kind-number\.nostrodomus-syntax-kind-number/, 'non-fg kinds must keep normal specificity');
});

test('the raised fg rules leave the other syntax kinds alone (number, string and punct keep their palette color)', () => {
  const css = buildSmartSyntaxClassCss({ active: false }, undefined, whiteFgDarkPlus);
  for (const cls of ['nostrodomus-syntax-kind-number', 'nostrodomus-syntax-kind-string', 'nostrodomus-syntax-kind-punct']) {
    const block = new RegExp(cls + String.raw`[^{]*\{([^}]*)\}`).exec(css)?.[1];
    assert.ok(block, `${cls} rule block not found`);
    assert.match(block, /color:\s*#abc123/i, `${cls} must keep its palette color, not the neutral fg`);
  }
});
