import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// The entity-shape check (`humidity: sensor.x` under a key that has no value kind) asks which
// domains exist. That answer depends only on the entities array of the data snapshot, so it is
// built once per array and built again when a new snapshot brings a new array.

function countedEntities(ids) {
  const list = [...ids];
  let walks = 0;
  const walk = Array.prototype[Symbol.iterator];
  Object.defineProperty(list, Symbol.iterator, { value() { walks += 1; return walk.call(this); } });
  return { list, walks: () => walks };
}

function valueKindAt(doc, runtimeData) {
  return detectRuntimeContext(doc, doc.length, { triggerKind: 'typing', runtimeData }).valueKind;
}

test('the domain set is built once for one entities array', () => {
  const counted = countedEntities(['sensor.kitchen_humidity', 'light.kitchen', 'vacuum_cleaner.robot']);
  const data = { entities: counted.list };
  assert.equal(valueKindAt('humidity: s', data), '');
  assert.equal(valueKindAt('humidity: sensor.', data), 'entity');
  assert.equal(valueKindAt('humidity: sensor.k', data), 'entity');
  assert.equal(valueKindAt('humidity: sensor.ki', () => data), 'entity');
  assert.equal(valueKindAt('thing:\n  - vacuum_cleaner.ro', data), 'entity');
  assert.equal(counted.walks(), 1, 'every keystroke reused the set of the first one');
});

test('a new entities array gets its own domain set', () => {
  const first = { entities: ['sensor.kitchen_humidity'] };
  const second = { entities: ['sensor.kitchen_humidity', 'my_integration.thing'] };
  assert.equal(valueKindAt('source: my_integration.th', first), '');
  assert.equal(valueKindAt('source: my_integration.th', second), 'entity');
  assert.equal(valueKindAt('source: my_integration.th', first), '', 'the first array keeps its own answer');
});

test('without entities the built-in domain list still decides', () => {
  assert.equal(valueKindAt('source: sensor.kit', null), 'entity');
  assert.equal(valueKindAt('source: sensor.kit', { entities: [] }), 'entity');
  assert.equal(valueKindAt('source: sensor.kit', { entities: 'garbage' }), 'entity');
  assert.equal(valueKindAt('source: not_a_domain.kit', { entities: [] }), '');
});
