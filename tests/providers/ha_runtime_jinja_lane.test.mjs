// The ha-runtime-value provider's Jinja entity arm. canHandle/provide fire for a template
// entity-arg ONLY when the jinjaLane flag rode in on ctx; otherwise the provider is byte-identical
// to its yaml-only self. Entity rows insert the BARE id (no added quotes — the cursor is already
// inside the string literal). Fail-dark on empty/hostile runtime data.

import test from 'node:test';
import assert from 'node:assert/strict';

import { haRuntimeValueProvider } from '../../src/providers/haRuntimeProvider.js';

const jinjaEntityCtx = (over = {}) => ({ lang: 'jinja', jinjaLaneEnabled: true, jinjaArg: { fn: 'states', argIndex: 0, expectKind: 'entity' }, ...over });

const liveData = () => ({ entities: ['light.kitchen', 'sensor.temp'], entityNames: { 'light.kitchen': 'Kitchen' } });

test('canHandle: jinja entity-arg with the lane ON → true', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  assert.equal(p.canHandle(jinjaEntityCtx()), true);
});

test('canHandle: jinja entity-arg with the lane OFF → false (flag-gated)', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  assert.equal(p.canHandle(jinjaEntityCtx({ jinjaLaneEnabled: false })), false);
  assert.equal(p.canHandle(jinjaEntityCtx({ jinjaLaneEnabled: undefined })), false);
});

test('canHandle: jinja but not an entity position → false (attribute deferred; no jinjaArg → false)', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  assert.equal(p.canHandle(jinjaEntityCtx({ jinjaArg: { fn: 'state_attr', argIndex: 1, expectKind: 'attribute' } })), false);
  assert.equal(p.canHandle(jinjaEntityCtx({ jinjaArg: undefined })), false);
});

test('canHandle: a plain jinja context without the lane stays false (yaml-only behavior preserved)', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  assert.equal(p.canHandle({ lang: 'jinja' }), false);
  assert.equal(p.canHandle(null), false);
});

test('provide: returns LIVE entity rows that insert the bare id (no quote-doubling)', () => {
  const p = haRuntimeValueProvider({ runtimeData: liveData });
  const rows = p.provide(jinjaEntityCtx());
  assert.ok(Array.isArray(rows) && rows.length >= 2, 'live entities surfaced');
  const kitchen = rows.find((r) => r.insert === 'light.kitchen');
  assert.ok(kitchen, 'entity row present with the bare id as insert');
  assert.equal(/['"()]/.test(kitchen.insert), false, 'insert carries no quotes or parens');
});

test('provide: fail-dark — empty / missing-entities data yields [] (same boundary as the yaml arms)', () => {
  // runtimeData() is contractually non-throwing (the cache is guarded); the registry catches any
  // provider exception. So the meaningful fail-dark assertion is a degraded DATA SHAPE → [].
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({}) }).provide(jinjaEntityCtx()), []);
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({ entities: undefined }) }).provide(jinjaEntityCtx()), []);
  assert.deepEqual(haRuntimeValueProvider({ runtimeData: () => ({ entities: [] }) }).provide(jinjaEntityCtx()), []);
});
