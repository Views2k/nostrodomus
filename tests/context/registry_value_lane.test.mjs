import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// The registry value lane: area_id:, device_id:, floor_id: and label_id: complete real registry
// names. It needs the registry branch in the adapter's own yamlValueKind (the copy the live valueKind
// path calls) and the registryLane flag passed into detectRuntimeContextImpl, not only added to the
// resolved descriptor afterwards. With the flag the *_id keys get their registry kind; without it
// they stay ''.
const vk = (doc, opts) => detectRuntimeContext(doc, doc.length, opts).valueKind;

test('registry lane on: *_id keys classify to their registry value kind', () => {
  assert.equal(vk('target:\n  area_id: ', { registryLane: true }), 'area');
  assert.equal(vk('target:\n  device_id: ', { registryLane: true }), 'device');
  assert.equal(vk('target:\n  floor_id: ', { registryLane: true }), 'floor');
  assert.equal(vk('target:\n  label_id: ', { registryLane: true }), 'label');
});

test('registry lane off: the same keys keep an empty kind', () => {
  assert.equal(vk('target:\n  area_id: ', {}), '');
  assert.equal(vk('target:\n  device_id: ', {}), '');
  assert.equal(vk('target:\n  floor_id: ', {}), '');
});

test('registry lane does not disturb the entity / service value kinds', () => {
  assert.equal(vk('foo: light.', {}), 'entity');
  assert.equal(vk('service: ', {}), 'service');
  // an entity value still classifies with the registry flag on (no cross-talk)
  assert.equal(vk('foo: light.', { registryLane: true }), 'entity');
});
