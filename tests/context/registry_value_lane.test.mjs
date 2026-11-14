import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// The registry value lane (0.1.180: area_id:/device_id:/floor_id:/label_id: complete real registry
// names) was DEAD on 0.1.262 — found by the e2e backfill. Two causes: (1) the registry branch existed
// only in yamlContextClassifier.yamlValueKind, but the live EAGER valueKind path calls the adapter's own
// duplicate yamlValueKind, which lacked it; (2) the registryLane gate was never threaded into
// detectRuntimeContextImpl (only bolted onto the resolved descriptor afterwards, too late). This pins
// both halves: with the flag the *_id keys classify to their registry kind; without it they stay ''.
const vk = (doc, opts) => detectRuntimeContext(doc, doc.length, opts).valueKind;

test('registry lane ON: *_id keys classify to their registry value kind', () => {
  assert.equal(vk('target:\n  area_id: ', { registryLane: true }), 'area');
  assert.equal(vk('target:\n  device_id: ', { registryLane: true }), 'device');
  assert.equal(vk('target:\n  floor_id: ', { registryLane: true }), 'floor');
  assert.equal(vk('target:\n  label_id: ', { registryLane: true }), 'label');
});

test('registry lane OFF: the same keys keep the legacy empty kind (engine-off byte-identical)', () => {
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
