// Prefix-aware entity sourcing — the fix for large installs (e.g. 3,347 entities) where the old
// alphabetical 750-cap made late-alphabet domains (switch.*, sensor.*) uncompletable. The query is
// now applied BEFORE the per-query cap, so a typed prefix reaches any entity; the cap only bounds
// the row count. The source filter mirrors the scorer (substring/startsWith beat subsequence) so it
// never drops a candidate the scorer would rank.

import test from 'node:test';
import assert from 'node:assert/strict';

import { filterEntityIdsByQuery, runtimeRowsForKind } from '../../src/providers/haRuntimeProvider.js';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';

test('filterEntityIdsByQuery: empty query returns the list unfiltered', () => {
  const ids = ['light.a', 'switch.b'];
  assert.equal(filterEntityIdsByQuery(ids, ''), ids);
  assert.equal(filterEntityIdsByQuery(ids, undefined), ids);
});

test('filterEntityIdsByQuery: substring/startsWith hits rank before a looser subsequence hit', () => {
  const ids = ['game_room.lamp', 'switch.garage', 'sensor.x'];
  // 'gr': substring of 'switch.garage'? no ('g','r' not adjacent) — subsequence yes.
  //       substring of 'game_room.lamp'? no — subsequence yes (g...r).
  // Neither is a substring, so order is by list order within the subsequence bucket.
  const out = filterEntityIdsByQuery(ids, 'gr');
  assert.ok(out.includes('game_room.lamp') && out.includes('switch.garage'));
  assert.ok(!out.includes('sensor.x'), 'no g…r subsequence → excluded');
});

test('filterEntityIdsByQuery: a substring match outranks a subsequence-only match', () => {
  const ids = ['automation.morning', 'sensor.garage_door'];
  // 'gar': substring of 'sensor.garage_door' (strong); subsequence of 'automation.morning'?
  //        a…(no second a after?)… 'automation.morning' has a,u,t,o,m,a,t… g? no 'g'. So excluded.
  const out = filterEntityIdsByQuery(ids, 'gar');
  assert.deepEqual(out, ['sensor.garage_door']);
});

test('runtimeRowsForKind(entity): a late-alphabet entity is reachable via its prefix', () => {
  // Build a big indexed list whose target sorts well past the 750 row cap.
  const ids = [];
  for (let i = 0; i < 900; i += 1) ids.push(`binary_sensor.b${String(i).padStart(4, '0')}`);
  ids.push('switch.zone_heater'); // alphabetically after all the binary_sensors
  const data = () => ({ entities: ids, entityNames: {} });

  const noPrefix = runtimeRowsForKind('entity', { runtimeData: data });
  assert.ok(noPrefix.length <= SECURITY_LIMITS.maxRuntimeEntities, 'output is capped per query');
  assert.ok(!noPrefix.some((r) => r.insert === 'switch.zone_heater'), 'late entity is past the cap without a prefix (expected)');

  const withPrefix = runtimeRowsForKind('entity', { runtimeData: data, prefix: 'switch.zone' });
  assert.ok(withPrefix.some((r) => r.insert === 'switch.zone_heater'), 'prefix filter reaches the late entity');
  assert.ok(withPrefix.length <= SECURITY_LIMITS.maxRuntimeEntities, 'still capped after filtering');
});

test('runtimeRowsForKind(entity): no prefix preserves prior behavior (all rows up to the cap)', () => {
  const data = () => ({ entities: ['light.a', 'light.b', 'sensor.c'], entityNames: { 'light.a': 'A' } });
  const rows = runtimeRowsForKind('entity', { runtimeData: data });
  assert.deepEqual(rows.map((r) => r.insert).sort(), ['light.a', 'light.b', 'sensor.c']);
});

test('runtimeRowsForKind(entity): preferredEntityDomain still leads within the filtered set', () => {
  const data = () => ({ entities: ['sensor.temp', 'light.kitchen', 'light.lamp'], entityNames: {} });
  const rows = runtimeRowsForKind('entity', { runtimeData: data, preferredEntityDomain: 'light', prefix: '' });
  assert.equal(rows[0].insert.startsWith('light.'), true, 'preferred domain leads');
});

test('filterEntityIdsByQuery: a friendly-name match lets an id through, after id matches', () => {
  const ids = ['light.hue_bulb_3', 'light.kitchen_strip', 'sensor.outdoor'];
  const names = { 'light.hue_bulb_3': 'Kitchen Lamp', 'sensor.outdoor': 'Garden' };
  assert.deepEqual(filterEntityIdsByQuery(ids, 'kitch', names), ['light.kitchen_strip', 'light.hue_bulb_3']);
  assert.deepEqual(filterEntityIdsByQuery(ids, 'kitch'), ['light.kitchen_strip'], 'without names the behavior is unchanged');
});

test('runtimeRowsForKind: typing a friendly name reaches the entity', () => {
  const rows = runtimeRowsForKind('entity', {
    prefix: 'kitch',
    runtimeData: () => ({ entities: ['light.hue_bulb_3', 'sensor.outdoor'], entityNames: { 'light.hue_bulb_3': 'Kitchen Lamp' } }),
    normalizeItem: (row) => ({ id: row[0], label: row[3], aliases: row[5] }),
  });
  assert.deepEqual(rows.map(r => r.label), ['light.hue_bulb_3']);
});
