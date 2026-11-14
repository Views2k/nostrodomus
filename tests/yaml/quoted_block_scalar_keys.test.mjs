import test from 'node:test';
import assert from 'node:assert/strict';

import { yamlKeyFromLine } from '../../src/yaml/yamlCompletionContext.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// card_mod selectors used as keys can be quoted or contain spaces. They were not read as keys, so
// the block scalar under them was not seen and its CSS got YAML card keys.
test('quoted keys and spaced block-scalar keys are read as keys', () => {
  assert.deepEqual(yamlKeyFromLine('    "ha-card $": |'), { indent: 4, key: 'ha-card $', value: '|' });
  assert.deepEqual(yamlKeyFromLine("  'ha-icon': |-"), { indent: 2, key: 'ha-icon', value: '|-' });
  assert.deepEqual(yamlKeyFromLine('    ha-icon $ ha-svg-icon: |'), { indent: 4, key: 'ha-icon $ ha-svg-icon', value: '|' });
  assert.equal(yamlKeyFromLine('    some words: not a block scalar'), null, 'spaces are accepted only in front of a block scalar');
  assert.deepEqual(yamlKeyFromLine('  name: Kitchen'), { indent: 2, key: 'name', value: 'Kitchen' });
});

test('CSS under a quoted or spaced card_mod selector key is CSS', () => {
  for (const key of ['"ha-card $"', 'ha-icon $ ha-svg-icon', '.']) {
    const doc = `type: tile\nentity: light.a\ncard_mod:\n  style:\n    ${key}: |\n      col`;
    const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' });
    assert.equal(ctx.lang, 'css', `under ${key}`);
  }
});
