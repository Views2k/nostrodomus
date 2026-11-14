import test from 'node:test';
import assert from 'node:assert/strict';

import { filterEntityIdsByQuery, runtimeRowsForKind } from '../../src/providers/haRuntimeProvider.js';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';

// The entity list is filtered by the typed query and then cut at the per-query row cap. Ids that
// start with the query have to come before ids that only contain it, or the cut drops them: every
// binary_sensor id contains "sensor.", so with more binary sensors than the cap, `sensor.` never
// reached a sensor.

function bigInstall() {
  const ids = [];
  for (let i = 0; i < 900; i += 1) ids.push(`binary_sensor.window_${String(i).padStart(4, '0')}`);
  for (let i = 0; i < 40; i += 1) ids.push(`sensor.room_${String(i).padStart(2, '0')}_temperature`);
  ids.push('switch.sensor_power');
  return ids.sort();
}

test('ids that start with the query come before ids that only contain it', () => {
  const ids = ['binary_sensor.door', 'light.sensor_lamp', 'sensor.humidity', 'sensor.temperature', 'switch.x'];
  assert.deepEqual(filterEntityIdsByQuery(ids, 'sensor.'), ['sensor.humidity', 'sensor.temperature', 'binary_sensor.door']);
  assert.deepEqual(filterEntityIdsByQuery(ids, 'SEN'), ['sensor.humidity', 'sensor.temperature', 'binary_sensor.door', 'light.sensor_lamp']);
  assert.deepEqual(filterEntityIdsByQuery(ids, 's'), ['sensor.humidity', 'sensor.temperature', 'switch.x', 'binary_sensor.door', 'light.sensor_lamp']);
});

test('the full order is: starts with, contains, friendly name, characters in order', () => {
  const ids = ['cover.garage', 'light.hue_bulb_3', 'sensor.garage_door', 'garage.main', 'switch.g_a_r'];
  const names = { 'light.hue_bulb_3': 'Garage Lamp' };
  assert.deepEqual(filterEntityIdsByQuery(ids, 'gar', names), ['garage.main', 'cover.garage', 'sensor.garage_door', 'light.hue_bulb_3', 'switch.g_a_r']);
});

test('on a large instance the typed domain reaches its entities within the cap', () => {
  const ids = bigInstall();
  assert.ok(ids.filter(id => id.includes('sensor.')).length > SECURITY_LIMITS.maxRuntimeEntities, 'more matches than the cap');
  const data = () => ({ entities: ids, entityNames: {} });
  for (const prefix of ['sensor.', 'sens', 's']) {
    const rows = runtimeRowsForKind('entity', { runtimeData: data, prefix });
    assert.equal(rows.length, SECURITY_LIMITS.maxRuntimeEntities, 'the cap itself is unchanged');
    const sensors = rows.filter(row => row.insert.startsWith('sensor.'));
    assert.equal(sensors.length, 40, `all sensor entities are offered for ${JSON.stringify(prefix)}`);
    if (prefix === 's') assert.ok(rows.some(row => row.insert === 'switch.sensor_power'));
  }
});

test('the preferred domain still leads, then ids that start with the query', () => {
  const data = () => ({ entities: ['binary_sensor.light_on', 'light.kitchen', 'light.lamp', 'sensor.light_level'], entityNames: {} });
  const rows = runtimeRowsForKind('entity', { runtimeData: data, preferredEntityDomain: 'sensor', prefix: 'li' });
  assert.deepEqual(rows.map(row => row.insert), ['sensor.light_level', 'light.kitchen', 'light.lamp', 'binary_sensor.light_on']);
});

test('services: a typed domain reaches its services before services that only contain it', () => {
  const services = [];
  for (let i = 0; i < 600; i += 1) services.push(`aaa_light_helper.s${String(i).padStart(3, '0')}`);
  services.push('light.toggle', 'light.turn_on');
  services.sort();
  for (const prefix of ['light', 'light.']) {
    const rows = runtimeRowsForKind('service', { runtimeData: () => ({ services }), prefix });
    assert.equal(rows.length, SECURITY_LIMITS.maxRuntimeServices, 'more matches than the cap, cut at the cap');
    assert.deepEqual(rows.slice(0, 2).map(row => row.insert), ['light.toggle', 'light.turn_on'], prefix);
  }
});
