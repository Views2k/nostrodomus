import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// The CSS lane applies only inside a style block scalar that is open at the cursor
// (blockScalarContextAt, which returns null after a dedent). A test against the whole text before
// the cursor, such as `/style:\s*\|[\s\S]*$/`, would let one card_mod `style: |` near the top switch
// every line below it to CSS and stop YAML and entity completion there.
const settings = { triggerMode: 'auto', minChars: 1, suggestInComments: false };

function at(sourceWithCursor) {
  const i = sourceWithCursor.indexOf('__CURSOR__');
  assert.notEqual(i, -1, 'fixture needs __CURSOR__');
  const source = sourceWithCursor.slice(0, i) + sourceWithCursor.slice(i + '__CURSOR__'.length);
  return detectRuntimeContext(source, i, { triggerKind: 'typing', settings });
}

test('cursor inside an open style: | block is CSS', () => {
  const ctx = at('card_mod:\n  style: |\n    ha-card {\n      color: r__CURSOR__\n    }\n');
  assert.equal(ctx.lang, 'css');
  assert.equal(ctx.scope, 'card-mod-css');
});

test('cursor on a sibling key below a closed style: | block is YAML', () => {
  // entity: is dedented to root, so the style block has ended; the earlier `style: |` in the
  // text before the cursor does not make this line CSS.
  const ctx = at('type: custom:button-card\ncard_mod:\n  style: |\n    ha-card { color: red; }\nentity: __CURSOR__');
  assert.equal(ctx.lang, 'yaml');
});

test('a deeply nested open style: | block is CSS', () => {
  const ctx = at('views:\n  - cards:\n      - type: custom:button-card\n        card_mod:\n          style: |\n            .b { color: b__CURSOR__ }\n');
  assert.equal(ctx.lang, 'css');
});

test('cursor in a later open style block after an earlier closed one is CSS', () => {
  const ctx = at('card_mod:\n  style: |\n    .a { color: red; }\ntype: x\ncard_mod:\n  style: |\n    .b { color: b__CURSOR__ }\n');
  assert.equal(ctx.lang, 'css');
});

test("button-card extra_styles: | is the CSS lane, matching the syntax highlighter contract", () => {
  const doc = 'type: custom:button-card\nextra_styles: |\n  ha-card {\n    colo';
  assert.equal(detectRuntimeContext(doc, doc.length).lang, 'css', 'extra_styles block is CSS, not YAML');
  // a plain YAML value is still YAML
  const plain = 'type: custom:button-card\nname: foo';
  assert.equal(detectRuntimeContext(plain, plain.length).lang, 'yaml');
});

test('card_mod shadow-DOM style blocks (ha-card$: | and .: |) enter the CSS lane', () => {
  const shadow = 'card_mod:\n  style:\n    ha-card$: |\n      colo';
  assert.equal(detectRuntimeContext(shadow, shadow.length).lang, 'css', 'ha-card$: | shadow block is CSS');
  const element = 'card_mod:\n  style:\n    .: |\n      colo';
  assert.equal(detectRuntimeContext(element, element.length).lang, 'css', '.: | element block is CSS');
});
