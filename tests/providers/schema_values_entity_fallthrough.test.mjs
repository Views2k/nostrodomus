import test from 'node:test';
import assert from 'node:assert/strict';

import { haRuntimeValueProvider } from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// With the schemaValues lane on, a service-data field VALUE position returned
// runtimeRowsForKind('service-field-value'), which only yields a field's enumerated select options.
// An entity/icon/etc.-selector field has none, so it returned []  — making entity/icon value
// completion under data:/service_data: WORSE with schemaValues on than off. provide() now falls
// through to the kind-based completion when the schema lane yields nothing.

const fakeRuntime = () => ({
  entities: ['light.a', 'light.b'],
  entityNames: { 'light.a': 'A', 'light.b': 'B' },
  services: [], serviceFields: {}, icons: ['mdi:home', 'mdi:lamp'], actions: [], themes: [],
  triggerTypes: [], conditionTypes: [], booleans: [], areas: [], devices: [], floors: [], labels: [],
});

function rowsFor(doc, key) {
  const provider = haRuntimeValueProvider({ runtimeData: fakeRuntime });
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit', runtimeData: fakeRuntime });
  ctx.schemaValuesEnabled = true; // the lane the bug lives in
  assert.equal(ctx.yamlRole, 'value', `${key} should be a value position`);
  assert.equal(provider.canHandle(ctx), true, `${key} value should be handled`);
  return provider.provide(ctx).map((r) => r.label);
}

test('schemaValues on: an entity-typed data field still completes real entity ids (fall-through)', () => {
  const rows = rowsFor('data:\n  entity_id: light.', 'entity_id');
  assert.deepEqual(rows, ['light.a', 'light.b'], 'entity ids served, not an empty schema list');
});

test('schemaValues on: an icon-typed data field still completes icons (fall-through)', () => {
  const rows = rowsFor('data:\n  icon: mdi', 'icon');
  assert.ok(rows.includes('mdi:home') && rows.includes('mdi:lamp'), `icons served, got ${JSON.stringify(rows)}`);
});
