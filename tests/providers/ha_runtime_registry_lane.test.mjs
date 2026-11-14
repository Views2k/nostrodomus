// P4: the ha-runtime-value provider's registry value lane. area_id:/device_id:/floor_id:/label_id:
// complete real registry ids ONLY when the registryLane gate rode in on ctx (ctx.registryLaneEnabled,
// set when engineV2 + registryLane are on). Otherwise yamlValueKind returns '' for those keys and the
// provider is byte-identical to its pre-P4 self (no rows). Rows insert the bare id; the human name is
// detail + a fuzzy keyword. Fail-dark on empty/missing registry data.

import test from 'node:test';
import assert from 'node:assert/strict';

import { haRuntimeValueProvider } from '../../src/providers/haRuntimeProvider.js';

const regCtx = (yamlKey, over = {}) => ({
  lang: 'yaml', yamlRole: 'value', yamlKey, yamlPath: ['target'], registryLaneEnabled: true, ...over,
});

const liveData = () => ({
  areas: ['kitchen', 'living_room'], areaNames: { living_room: 'Living Room' },
  devices: ['abc123'], deviceNames: { abc123: 'Living Room Hub' },
  floors: ['ground'], floorNames: { ground: 'Ground Floor' },
  labels: ['cozy'], labelNames: { cozy: 'Cozy' },
});

test('canHandle: area_id/device_id/floor_id/label_id with the lane ON → true', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  for (const key of ['area_id', 'device_id', 'floor_id', 'label_id']) {
    assert.equal(p.canHandle(regCtx(key)), true, `${key} engages the lane`);
  }
  assert.equal(p.canHandle(regCtx('area')), true, 'bare area: (area card) also routes');
});

test('canHandle: with the lane OFF the registry keys stay inert (pre-P4 behavior)', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  for (const key of ['area_id', 'device_id', 'floor_id', 'label_id', 'area']) {
    assert.equal(p.canHandle(regCtx(key, { registryLaneEnabled: false })), false, `${key} OFF → no lane`);
    assert.equal(p.canHandle(regCtx(key, { registryLaneEnabled: undefined })), false, `${key} unset → no lane`);
  }
});

test('provide: returns LIVE registry rows that insert the bare id', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });

  const areas = p.provide(regCtx('area_id'));
  const lr = areas.find(r => r.insert === 'living_room');
  assert.ok(lr, 'area row present with the bare id as insert');
  assert.equal(lr.meta.sourceDetail, 'Living Room');
  assert.equal(/['"()]/.test(lr.insert), false, 'insert carries no quotes or parens');

  assert.ok(p.provide(regCtx('device_id')).some(r => r.insert === 'abc123'), 'device id surfaced');
  assert.ok(p.provide(regCtx('floor_id')).some(r => r.insert === 'ground'), 'floor id surfaced');
  assert.ok(p.provide(regCtx('label_id')).some(r => r.insert === 'cozy'), 'label id surfaced');
});

test('provide: fail-dark — empty / missing registry data yields []', () => {
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({}) }).provide(regCtx('area_id')), []);
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({ areas: undefined }) }).provide(regCtx('area_id')), []);
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({ areas: [] }) }).provide(regCtx('area_id')), []);
});
