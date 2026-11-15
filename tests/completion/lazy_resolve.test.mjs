import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveItemDetail,
  resolveServiceDetail,
  resolveEntityDetail,
  resolveRegistryDetail,
} from '../../src/completion/lazyResolve.js';

const SNAPSHOT = {
  entityNames: { 'light.kitchen': 'Kitchen Light' },
  serviceFields: {
    'light.turn_on': [
      { field: 'entity_id', description: 'The light to turn on', required: true },
      { field: 'brightness_pct', description: 'Brightness percentage', required: false },
      { field: 'color_name', description: '', required: false },
    ],
  },
  areaNames: { kitchen: 'Kitchen' },
  deviceNames: { abc123def456: 'Hue Bridge' },
};

test('service detail lists fields, marks required, includes descriptions', () => {
  const out = resolveServiceDetail({ type: 'service', label: 'light.turn_on', insert: 'light.turn_on' }, SNAPSHOT);
  assert.ok(out, 'returns a model');
  assert.match(out.documentation, /^light\.turn_on/);
  assert.match(out.documentation, /entity_id\*/); // required marked with *
  assert.match(out.documentation, /brightness_pct/);
  assert.match(out.documentation, /The light to turn on/);
  assert.equal(out.detail, '3 fields');
});

test('entity detail resolves friendly name + domain', () => {
  const out = resolveEntityDetail({ type: 'entity', label: 'light.kitchen', insert: 'light.kitchen' }, SNAPSHOT);
  assert.match(out.documentation, /Kitchen Light \(light\.kitchen\)/);
  assert.match(out.documentation, /Domain: light/);
});

test('registry detail resolves id -> human name', () => {
  const area = resolveRegistryDetail({ type: 'area', label: 'kitchen', insert: 'kitchen' }, SNAPSHOT);
  assert.deepEqual(area, { documentation: 'Kitchen (kitchen)', detail: 'Kitchen' });
  const device = resolveRegistryDetail({ type: 'device', label: 'abc123def456', insert: 'abc123def456' }, SNAPSHOT);
  assert.match(device.documentation, /Hue Bridge \(abc123def456\)/);
});

test('resolveItemDetail dispatches by type and returns null for unknown/no-data', () => {
  assert.equal(resolveItemDetail({ type: 'service', label: 'light.turn_on' }, SNAPSHOT).detail, '3 fields');
  assert.equal(resolveItemDetail({ type: 'key', label: 'type' }, SNAPSHOT), null);
  // service with no field catalog entry -> null (caller keeps generic doc)
  assert.equal(resolveItemDetail({ type: 'service', label: 'foo.bar' }, SNAPSHOT), null);
});

test('hostile, partial or missing input never throws and returns null', () => {
  assert.equal(resolveItemDetail(null, SNAPSHOT), null);
  assert.equal(resolveItemDetail({ type: 'service', label: 'light.turn_on' }, null), null);
  assert.equal(resolveItemDetail({ type: 'entity', label: 'light.kitchen' }, {}), null);
  assert.doesNotThrow(() => resolveItemDetail({ type: 'service', label: 'x.y' }, { serviceFields: 'nope' }));
  assert.equal(resolveItemDetail({ type: 'entity' }, SNAPSHOT), null); // no id
});
