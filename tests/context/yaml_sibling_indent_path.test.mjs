import test from 'node:test';
import assert from 'node:assert/strict';

import { currentYamlPath } from '../../src/yaml/yamlCompletionContext.js';

// The path stack pops by the cursor line's own column, also when that line does not parse as a
// key yet (a partial key with no colon, a blank line, a dedent). Otherwise the previous sibling
// would stay on the stack as a leaf that is not there, and every consumer of the path would see
// the wrong container. Two exceptions are pinned below: the content of an open block scalar stays
// anchored to its opener, and a dash line pops only strictly deeper entries (a `- item` may sit at
// its parent key's own indent).
function path(doc) {
  return currentYamlPath(doc, doc.length);
}

test('a partial second key pops the completed sibling', () => {
  assert.deepEqual(path('data:\n  brightness: 120\n  tr'), ['data']);
});

test('dedents pop everything at or below the cursor column', () => {
  assert.deepEqual(path('tap_action:\n  action: call-service\n  service: light.turn_on\nty'), []);
  assert.deepEqual(path('tap_action:\n  data:\n    brightness_pct: 50\n    tr'), ['tap_action', 'data']);
  assert.deepEqual(path('actions:\n  - action: light.turn_on\n    data:\n      transition: 1\n    tr'), ['actions', 'action']);
  // A dedented non-key line below a block scalar closes the scalar and pops normally.
  assert.deepEqual(path('card_mod:\n  style: |\n    ha-card { }\ntr'), []);
});

test('blank cursor lines pop by their committed indentation', () => {
  // A whitespace-only line commits an indent: siblings at that column pop.
  assert.deepEqual(path('data:\n  brightness: 120\n  '), ['data']);
  // An empty line at column 0 is a root position.
  assert.deepEqual(path('data:\n  brightness: 120\n'), []);
});

test('the first field and a nested parent keep their paths', () => {
  assert.deepEqual(path('data:\n  '), ['data']);
  assert.deepEqual(path('tap_action:\n  action: call-service\n  data:\n    '), ['tap_action', 'data']);
});

test('dash lists keep their container', () => {
  // Typed scalar items keep the list container.
  assert.deepEqual(path('entities:\n  - light.kitchen\n  - sen'), ['entities']);
  // A new dash item after a mapping item keeps the previous item key as leaf, on purpose: a dash
  // line pops only strictly deeper keys.
  assert.deepEqual(path('entities:\n  - entity: light.kitchen\n  - na'), ['entities', 'entity']);
  // Zero-indent sequences keep their parent key.
  assert.deepEqual(path('entities:\n- se'), ['entities']);
});

test('block-scalar content stays anchored to its opener', () => {
  const doc = 'card_mod:\n  style: |\n    ha-card {\n      color: red;\n    }\n  extra: true\n';
  const atColor = doc.indexOf('color: red') + 'color: red'.length;
  assert.deepEqual(currentYamlPath(doc, atColor), ['card_mod', 'style']);
  // An empty line inside an open scalar must not re-anchor the path to root.
  const open = 'card_mod:\n  style: |\n    ha-card { }\n';
  assert.deepEqual(currentYamlPath(open, open.length), ['card_mod', 'style']);
});
