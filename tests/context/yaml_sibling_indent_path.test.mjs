import test from 'node:test';
import assert from 'node:assert/strict';

import { currentYamlPath } from '../../src/yaml/yamlCompletionContext.js';

// Sibling-indent phantom leaf: the path stack popped only when a line PARSED as a
// key, so the cursor line while typing a partial key (no colon yet), a blank, or a
// dedent never consulted its own indent -- the previous sibling stayed on the stack
// as a phantom leaf and every path consumer downstream saw the wrong container.
// The fix pops by the cursor line's own column, with two deliberate carve-outs
// pinned below: content of an open block scalar stays anchored to its opener, and
// dash lines pop only strictly-deeper entries (a `- item` legally sits at its
// parent key's own indent, so dash-list behavior is byte-identical to before).
function path(doc) {
  return currentYamlPath(doc, doc.length);
}

test('a partial second key pops the completed sibling (the ledger repro)', () => {
  assert.deepEqual(path('data:\n  brightness: 120\n  tr'), ['data']);
});

test('dedents pop everything at or below the cursor column', () => {
  assert.deepEqual(path('tap_action:\n  action: call-service\n  service: light.turn_on\nty'), []);
  assert.deepEqual(path('tap_action:\n  data:\n    brightness_pct: 50\n    tr'), ['tap_action', 'data']);
  assert.deepEqual(path('actions:\n  - action: light.turn_on\n    data:\n      transition: 1\n    tr'), ['actions', 'action']);
  // A dedented non-key line below a block scalar CLOSES the scalar and pops normally.
  assert.deepEqual(path('card_mod:\n  style: |\n    ha-card { }\ntr'), []);
});

test('blank cursor lines pop by their committed indentation', () => {
  // A whitespace-only line commits an indent: siblings at that column pop.
  assert.deepEqual(path('data:\n  brightness: 120\n  '), ['data']);
  // An empty line at column 0 is a root position.
  assert.deepEqual(path('data:\n  brightness: 120\n'), []);
});

test('pins: first-field and nested-parent paths are unchanged', () => {
  assert.deepEqual(path('data:\n  '), ['data']);
  assert.deepEqual(path('tap_action:\n  action: call-service\n  data:\n    '), ['tap_action', 'data']);
});

test('pins: dash-list behavior is unchanged', () => {
  // Typed scalar items keep the list container.
  assert.deepEqual(path('entities:\n  - light.kitchen\n  - sen'), ['entities']);
  // A new dash item after a mapping item keeps the previous item key as leaf --
  // the pre-fix shape, deliberately preserved: dash lines pop strictly-deeper only.
  assert.deepEqual(path('entities:\n  - entity: light.kitchen\n  - na'), ['entities', 'entity']);
  // Zero-indent sequences keep their parent key.
  assert.deepEqual(path('entities:\n- se'), ['entities']);
});

test('pins: block-scalar content stays anchored to its opener', () => {
  const doc = 'card_mod:\n  style: |\n    ha-card {\n      color: red;\n    }\n  extra: true\n';
  const atColor = doc.indexOf('color: red') + 'color: red'.length;
  assert.deepEqual(currentYamlPath(doc, atColor), ['card_mod', 'style']);
  // An EMPTY line inside an open scalar must not re-anchor the path to root.
  const open = 'card_mod:\n  style: |\n    ha-card { }\n';
  assert.deepEqual(currentYamlPath(open, open.length), ['card_mod', 'style']);
});
