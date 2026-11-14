import test from 'node:test';
import assert from 'node:assert/strict';

import {
  directYamlKey,
  stripYamlComment,
  yamlCurrentKey,
} from '../../src/yaml/legacyYamlKey.js';

test('stripYamlComment preserves current legacy comment stripping semantics', () => {
  assert.equal(stripYamlComment('name: test # comment'), 'name: test');
  assert.equal(stripYamlComment('name: test'), 'name: test');
  assert.equal(stripYamlComment('  value  # comment'), 'value');
  assert.equal(stripYamlComment(null), '');
  assert.equal(stripYamlComment(undefined), '');
});

test('stripYamlComment intentionally preserves legacy quoted-hash behavior', () => {
  assert.equal(stripYamlComment("name: '# not comment'"), "name: '# not comment'");
  assert.equal(stripYamlComment('name: "# not comment"'), 'name: "# not comment"');
  assert.equal(stripYamlComment('label: "Status #1" # real comment'), 'label: "Status');
});

test('directYamlKey preserves current key parsing descriptor shape', () => {
  assert.deepEqual(directYamlKey('name: test'), { indent: 0, key: 'name', value: 'test' });
  assert.deepEqual(directYamlKey('  entity: light.kitchen'), { indent: 2, key: 'entity', value: 'light.kitchen' });
  assert.deepEqual(directYamlKey('- type: custom:button-card'), { indent: 0, key: 'type', value: 'custom:button-card' });
  assert.deepEqual(directYamlKey('    - service: light.turn_on # comment'), { indent: 4, key: 'service', value: 'light.turn_on' });
});

test('directYamlKey preserves invalid and nullable input behavior', () => {
  assert.equal(directYamlKey('not a key'), null);
  assert.equal(directYamlKey('  - just-list-item'), null);
  assert.equal(directYamlKey(null), null);
  assert.equal(directYamlKey(undefined), null);
});


test('yamlCurrentKey preserves legacy current-key regex behavior', () => {
  assert.equal(yamlCurrentKey({ line: 'name: test' }), 'name');
  assert.equal(yamlCurrentKey({ line: '  entity_id: light.kitchen' }), 'entity_id');
  assert.equal(yamlCurrentKey({ line: '- service: light.turn_on' }), 'service');
  assert.equal(yamlCurrentKey({ line: '-service: light.turn_on' }), 'service');
  assert.equal(yamlCurrentKey({ line: 'not a key' }), '');
  assert.equal(yamlCurrentKey({ line: '' }), '');
  assert.equal(yamlCurrentKey(null), '');
});
