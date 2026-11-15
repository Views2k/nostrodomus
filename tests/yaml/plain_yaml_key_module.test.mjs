import test from 'node:test';
import assert from 'node:assert/strict';

import {
  directYamlKey,
  stripYamlComment,
  yamlCurrentKey,
} from '../../src/yaml/plainYamlKey.js';

test('stripYamlComment strips comments', () => {
  assert.equal(stripYamlComment('name: test # comment'), 'name: test');
  assert.equal(stripYamlComment('name: test'), 'name: test');
  assert.equal(stripYamlComment('  value  # comment'), 'value');
  assert.equal(stripYamlComment(null), '');
  assert.equal(stripYamlComment(undefined), '');
});

test('stripYamlComment keeps a quoted hash, but cuts inside the quotes when a comment follows on the line', () => {
  assert.equal(stripYamlComment("name: '# not comment'"), "name: '# not comment'");
  assert.equal(stripYamlComment('name: "# not comment"'), 'name: "# not comment"');
  assert.equal(stripYamlComment('label: "Status #1" # real comment'), 'label: "Status');
});

test('directYamlKey returns the indent, key and value of a line', () => {
  assert.deepEqual(directYamlKey('name: test'), { indent: 0, key: 'name', value: 'test' });
  assert.deepEqual(directYamlKey('  entity: light.kitchen'), { indent: 2, key: 'entity', value: 'light.kitchen' });
  assert.deepEqual(directYamlKey('- type: custom:button-card'), { indent: 0, key: 'type', value: 'custom:button-card' });
  assert.deepEqual(directYamlKey('    - service: light.turn_on # comment'), { indent: 4, key: 'service', value: 'light.turn_on' });
});

test('directYamlKey reads a key followed only by a comment as a key without a value', () => {
  assert.deepEqual(directYamlKey('action: # pick one'), { indent: 0, key: 'action', value: '' });
  assert.deepEqual(directYamlKey('  tap_action:   # opens the dialog'), { indent: 2, key: 'tap_action', value: '' });
  // Without a space after the colon the "#" belongs to the value, as in YAML.
  assert.deepEqual(directYamlKey('key:#x'), { indent: 0, key: 'key', value: '#x' });
  assert.deepEqual(directYamlKey('color: "#ff0000"'), { indent: 0, key: 'color', value: '"#ff0000"' });
});

test('directYamlKey returns null for a line without a key, a bare list item and nullish input', () => {
  assert.equal(directYamlKey('not a key'), null);
  assert.equal(directYamlKey('  - just-list-item'), null);
  assert.equal(directYamlKey(null), null);
  assert.equal(directYamlKey(undefined), null);
});


test('yamlCurrentKey reads the current key', () => {
  assert.equal(yamlCurrentKey({ line: 'name: test' }), 'name');
  assert.equal(yamlCurrentKey({ line: '  entity_id: light.kitchen' }), 'entity_id');
  assert.equal(yamlCurrentKey({ line: '- service: light.turn_on' }), 'service');
  assert.equal(yamlCurrentKey({ line: '-service: light.turn_on' }), 'service');
  assert.equal(yamlCurrentKey({ line: 'not a key' }), '');
  assert.equal(yamlCurrentKey({ line: '' }), '');
  assert.equal(yamlCurrentKey(null), '');
});
