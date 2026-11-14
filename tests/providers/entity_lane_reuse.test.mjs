// The entity list rebuilt and sanitized up to 750 rows on every refresh and lowercased the
// friendly name of every entity for every typed character.

import test from 'node:test';
import assert from 'node:assert/strict';

import { filterEntityIdsByQuery, runtimeRowsForKind } from '../../src/providers/haRuntimeProvider.js';
import { normalizeItem } from '../../src/providers/staticLibraryProvider.js';

function snapshot(count, names = {}) {
  const entities = [];
  for (let i = 0; i < count; i += 1) entities.push(`light.lamp_${String(i).padStart(4, '0')}`);
  return { entities, entityNames: names, services: [], serviceFields: {} };
}

test('entity rows are built once and reused until the friendly name changes', () => {
  let builds = 0;
  const counted = (row, source) => { builds += 1; return normalizeItem(row, source); };
  const data = snapshot(300, { 'light.lamp_0001': 'Kitchen Lamp' });
  const options = { runtimeData: () => data, normalizeItem: counted, providerId: 'ha-runtime-values' };

  const first = runtimeRowsForKind('entity', { ...options, prefix: '' });
  assert.equal(first.length, 300);
  assert.equal(builds, 300);
  const second = runtimeRowsForKind('entity', { ...options, prefix: 'lamp_00' });
  assert.equal(builds, 300, 'a later refresh builds no row again');
  assert.equal(second[0], first[0], 'the same row object is handed out');

  // A new snapshot with one renamed entity: only that row is rebuilt.
  const renamed = snapshot(300, { 'light.lamp_0001': 'Hall Lamp' });
  const third = runtimeRowsForKind('entity', { ...options, runtimeData: () => renamed, prefix: '' });
  assert.equal(builds, 301);
  assert.equal(third[1].meta.friendly, 'Hall Lamp');
  assert.equal(third[0], first[0]);
});

test('a reused row has the fields a freshly built one had', () => {
  const data = snapshot(2, { 'light.lamp_0001': 'Kitchen Lamp' });
  const rows = runtimeRowsForKind('entity', { runtimeData: () => data, normalizeItem, providerId: 'ha-runtime-values', prefix: '' });
  const expected = normalizeItem(['ha.entity.light.lamp_0001', 'yaml', 'entity', 'light.lamp_0001', 'light.lamp_0001', ['entity', 'light', 'Kitchen Lamp']], 'ha-runtime-values');
  expected.meta = { domain: 'light', friendly: 'Kitchen Lamp', sourceDetail: 'Kitchen Lamp (light)' };
  assert.deepEqual(rows[1], expected);
  assert.deepEqual(rows[0].meta, { domain: 'light', friendly: '', sourceDetail: 'light' });
  assert.ok(Object.isFrozen(rows[0]) && Object.isFrozen(rows[0].meta), 'shared rows cannot be changed by a caller');
});

test('friendly names are lowercased once per names object, and the filter result is unchanged', () => {
  let reads = 0;
  const name = (text) => ({ toString() { reads += 1; return text; } });
  const names = { 'light.hue_bulb_3': name('Kitchen Lamp'), 'switch.garage': name('Garage Door'), 'sensor.x': name('Outside') };
  const ids = ['light.hue_bulb_3', 'switch.garage', 'sensor.x', 'light.kitchen_main'];
  assert.deepEqual(filterEntityIdsByQuery(ids, 'kitch', names), ['light.kitchen_main', 'light.hue_bulb_3']);
  const afterFirst = reads;
  assert.equal(afterFirst, 3);
  assert.deepEqual(filterEntityIdsByQuery(ids, 'gar', names), ['switch.garage']);
  assert.deepEqual(filterEntityIdsByQuery(ids, 'OUT', names), ['sensor.x']);
  assert.equal(reads, afterFirst, 'later queries read no name again');
  assert.deepEqual(filterEntityIdsByQuery(ids, 'kitch'), ['light.kitchen_main'], 'without names only ids are matched');
});
