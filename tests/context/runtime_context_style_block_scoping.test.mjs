import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// Finding 2A: the css lane was `/style:\s*\|[\s\S]*$/.test(info.before)` where info.before is the
// WHOLE document prefix, so one card_mod `style: |` near the top forced lang='css' for every line
// below it, killing YAML/entity completion. The fix bounds it to an ACTUALLY-OPEN style block
// scalar at the cursor (blockScalarContextAt, which nulls on dedent).
const settings = { triggerMode: 'auto', minChars: 1, suggestInComments: false };

function at(sourceWithCursor) {
  const i = sourceWithCursor.indexOf('__CURSOR__');
  assert.notEqual(i, -1, 'fixture needs __CURSOR__');
  const source = sourceWithCursor.slice(0, i) + sourceWithCursor.slice(i + '__CURSOR__'.length);
  return detectRuntimeContext(source, i, { triggerKind: 'typing', settings });
}

test('2A(a): cursor inside an open style: | block is CSS', () => {
  const ctx = at('card_mod:\n  style: |\n    ha-card {\n      color: r__CURSOR__\n    }\n');
  assert.equal(ctx.lang, 'css');
  assert.equal(ctx.scope, 'card-mod-css');
});

test('2A(b): cursor on a sibling key BELOW a closed style: | block is YAML (the bug)', () => {
  // entity: is dedented to root, so the style block has ended. Old code matched the earlier
  // `style: |` against the whole prefix and wrongly returned css; must be yaml now.
  const ctx = at('type: custom:button-card\ncard_mod:\n  style: |\n    ha-card { color: red; }\nentity: __CURSOR__');
  assert.equal(ctx.lang, 'yaml');
});

test('2A(c): a deeply-nested open style: | block is still CSS', () => {
  const ctx = at('views:\n  - cards:\n      - type: custom:button-card\n        card_mod:\n          style: |\n            .b { color: b__CURSOR__ }\n');
  assert.equal(ctx.lang, 'css');
});

test('2A(d): cursor in a later open style block after an earlier closed one is CSS', () => {
  const ctx = at('card_mod:\n  style: |\n    .a { color: red; }\ntype: x\ncard_mod:\n  style: |\n    .b { color: b__CURSOR__ }\n');
  assert.equal(ctx.lang, 'css');
});

test("button-card extra_styles: | is the CSS lane, matching the syntax highlighter contract (bug hunt 4)", () => {
  const doc = 'type: custom:button-card\nextra_styles: |\n  ha-card {\n    colo';
  assert.equal(detectRuntimeContext(doc, doc.length).lang, 'css', 'extra_styles block is CSS, not YAML');
  // a plain YAML value is still YAML
  const plain = 'type: custom:button-card\nname: foo';
  assert.equal(detectRuntimeContext(plain, plain.length).lang, 'yaml');
});

test('card_mod shadow-DOM style blocks (ha-card$: | and .: |) enter the CSS lane (bug hunt 4)', () => {
  const shadow = 'card_mod:\n  style:\n    ha-card$: |\n      colo';
  assert.equal(detectRuntimeContext(shadow, shadow.length).lang, 'css', 'ha-card$: | shadow block is CSS');
  const element = 'card_mod:\n  style:\n    .: |\n      colo';
  assert.equal(detectRuntimeContext(element, element.length).lang, 'css', '.: | element block is CSS');
});
