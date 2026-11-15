// The ha-runtime-value provider's Jinja entity arm. canHandle and provide fire for a template
// entity argument only when ctx carries the jinjaLane flag; otherwise the provider behaves as it does
// for YAML alone. Entity rows insert the bare id (no added quotes; the cursor is already inside the
// string literal). Empty or hostile runtime data gives no rows.

import test from 'node:test';
import assert from 'node:assert/strict';

import { haRuntimeValueProvider } from '../../src/providers/haRuntimeProvider.js';

const jinjaEntityCtx = (over = {}) => ({ lang: 'jinja', jinjaLaneEnabled: true, jinjaArg: { fn: 'states', argIndex: 0, expectKind: 'entity' }, ...over });

const liveData = () => ({ entities: ['light.kitchen', 'sensor.temp'], entityNames: { 'light.kitchen': 'Kitchen' } });

test('canHandle: a jinja entity argument with the lane on is handled', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  assert.equal(p.canHandle(jinjaEntityCtx()), true);
});

test('canHandle: a jinja entity argument with the lane off is not handled', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  assert.equal(p.canHandle(jinjaEntityCtx({ jinjaLaneEnabled: false })), false);
  assert.equal(p.canHandle(jinjaEntityCtx({ jinjaLaneEnabled: undefined })), false);
});

test('canHandle: jinja but not an entity position → false (attribute deferred; no jinjaArg → false)', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  assert.equal(p.canHandle(jinjaEntityCtx({ jinjaArg: { fn: 'state_attr', argIndex: 1, expectKind: 'attribute' } })), false);
  assert.equal(p.canHandle(jinjaEntityCtx({ jinjaArg: undefined })), false);
});

test('canHandle: a plain jinja context without the lane is not handled', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  assert.equal(p.canHandle({ lang: 'jinja' }), false);
  assert.equal(p.canHandle(null), false);
});

test('provide: returns live entity rows that insert the bare id (no doubled quotes)', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  const rows = p.provide(jinjaEntityCtx());
  assert.ok(Array.isArray(rows) && rows.length >= 2, 'live entities surfaced');
  const kitchen = rows.find((r) => r.insert === 'light.kitchen');
  assert.ok(kitchen, 'entity row present with the bare id as insert');
  assert.equal(/['"()]/.test(kitchen.insert), false, 'insert carries no quotes or parens');
});

test('provide: empty data or data without entities yields [] (as for the YAML contexts)', () => {
  // runtimeData() is contractually non-throwing (the cache is guarded); the registry catches any
  // provider exception. So the meaningful check is that a degraded data shape gives [].
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({}) }).provide(jinjaEntityCtx()), []);
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({ entities: undefined }) }).provide(jinjaEntityCtx()), []);
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({ entities: [] }) }).provide(jinjaEntityCtx()), []);
});
