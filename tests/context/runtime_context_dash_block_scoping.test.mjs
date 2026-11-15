import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { blockScalarContextAt, currentYamlPath } from '../../src/yaml/yamlCompletionContext.js';

// For a dash-prefixed opener like `- style: |` the block scalar closes at the key's column (the
// whitespace plus the dash segment), not at the whitespace before the dash; otherwise the sibling
// keys of the same list item, 2 columns deeper, would be taken as scalar content.
const settings = { triggerMode: 'auto', minChars: 1, suggestInComments: false };

function at(sourceWithCursor) {
  const i = sourceWithCursor.indexOf('__CURSOR__');
  assert.notEqual(i, -1, 'fixture needs __CURSOR__');
  const source = sourceWithCursor.slice(0, i) + sourceWithCursor.slice(i + '__CURSOR__'.length);
  return detectRuntimeContext(source, i, { triggerKind: 'typing', settings });
}

test('cursor inside a dash-prefixed `- style: |` body is CSS', () => {
  const ctx = at('cards:\n  - type: button\n    card_mod:\n      style: |\n        ha-card { color: r__CURSOR__ }\n');
  assert.equal(ctx.lang, 'css');
  assert.equal(ctx.scope, 'card-mod-css');
});

test('a sibling key of the same list item closes the scalar', () => {
  const ctx = at('cards:\n  - style: |\n      ha-card { color: red; }\n    entity: __CURSOR__\n');
  assert.equal(ctx.lang, 'yaml');
  assert.equal(ctx.yamlKey, 'entity');
  assert.equal(ctx.shouldSuggest, true);
});

test('the next list item closes the scalar', () => {
  const ctx = at('cards:\n  - style: |\n      ha-card { color: red; }\n  - type: __CURSOR__\n');
  assert.equal(ctx.lang, 'yaml');
  assert.equal(ctx.valueKind, 'card-type');
});

test('a style block without a dash is CSS', () => {
  const ctx = at('card_mod:\n  style: |\n    ha-card { color: r__CURSOR__ }\n');
  assert.equal(ctx.lang, 'css');
});

test('lines inside the scalar body that start with a dash stay CSS', () => {
  const ctx = at('cards:\n  - style: |\n      - foo\n      - b__CURSOR__\n');
  assert.equal(ctx.lang, 'css');
});

test('a key that only begins with a dash is not a list item', () => {
  // '-foo:' is a plain mapping key (the dash is a sequence indicator only when
  // whitespace follows it), so its block scalar stays bounded at the line indent
  // and the indented content line below remains inside the scalar.
  const source = '-foo: |\n x';
  const open = blockScalarContextAt(source, source.length);
  assert.ok(open, 'the scalar must stay open for its indented content');
  assert.equal(open.key, 'foo');
});

test('a sibling below a dash-prefixed `- content: |` is not scalar content', () => {
  const source = '- content: |\n    Hello\n  type: mark';
  const cursor = source.length;
  assert.equal(blockScalarContextAt(source, cursor), null, 'the sibling key line must close the scalar');
  const path = currentYamlPath(source, cursor);
  assert.equal(path[path.length - 1], 'type', `sibling key should be the path leaf, got: ${JSON.stringify(path)}`);
});
