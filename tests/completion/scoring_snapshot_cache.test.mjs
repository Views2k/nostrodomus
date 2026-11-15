import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createScoringRuntime } from '../../src/completion/scoringRuntime.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import { haRuntimeValueProvider, runtimeData } from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// A scored list is cached under a key built from the context. Its Home Assistant rows come from a
// data snapshot (entities, services, registries), so the key must name the snapshot: on a cache hit
// the providers are not called, and a list cached before an entity was added would keep being served.

function live(entityIds) {
  const hass = { states: Object.fromEntries(entityIds.map(id => [id, { attributes: {} }])), services: {} };
  const state = { settings: { mode: 'both', enabledLangs: { yaml: true, css: true }, maxItems: 20 }, completionCache: new Map(), context: null, items: [] };
  let now = 10_000;
  let snapshotCalls = 0;
  const snapshot = () => {
    snapshotCalls += 1;
    return runtimeData({ state, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => hass, now: () => now });
  };
  const provider = haRuntimeValueProvider({ runtimeData: snapshot });
  let providerCalls = 0;
  const runtime = createScoringRuntime({
    state,
    ensureProviderSettings: () => ({}),
    providerCandidates: ctx => { providerCalls += 1; return provider.canHandle(ctx) ? provider.provide(ctx) : []; },
    runtimeData: snapshot,
  });
  const labelsAt = (doc) => runtime.scoreItems(detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' })).map(row => row.label);
  return {
    hass, state, labelsAt,
    providerCalls: () => providerCalls,
    snapshotCalls: () => snapshotCalls,
    advance: ms => { now += ms; },
    // Home Assistant replaces the states object when an entity is added or removed.
    setEntities: ids => { hass.states = Object.fromEntries(ids.map(id => [id, { attributes: {} }])); },
  };
}

test('a cached entity list is not served after the data snapshot changed', () => {
  const env = live(['light.kitchen', 'light.living_room']);
  assert.deepEqual(env.labelsAt('entity: li'), ['light.kitchen', 'light.living_room']);
  assert.deepEqual(env.labelsAt('entity: li'), ['light.kitchen', 'light.living_room']);
  assert.equal(env.providerCalls(), 1, 'the same position again is a cache hit');

  env.setEntities(['light.kitchen', 'light.library', 'light.living_room']);
  env.advance(SECURITY_LIMITS.runtimeCacheMs + 1);
  assert.deepEqual(env.labelsAt('entity: li'), ['light.kitchen', 'light.library', 'light.living_room'], 'the new entity is in the list');
  assert.equal(env.providerCalls(), 2);

  env.setEntities(['light.kitchen']);
  env.advance(SECURITY_LIMITS.runtimeCacheMs + 1);
  assert.deepEqual(env.labelsAt('entity: li'), ['light.kitchen'], 'a removed entity is gone');
});

test('while the snapshot is the same object the cache keeps working', () => {
  const env = live(['light.kitchen', 'light.living_room']);
  env.labelsAt('entity: li');
  // Later, with nothing changed in Home Assistant: the snapshot is checked and kept.
  env.advance(SECURITY_LIMITS.runtimeCacheMs + 1);
  env.labelsAt('entity: li');
  env.advance(SECURITY_LIMITS.runtimeCacheMs + 1);
  env.labelsAt('entity: li');
  assert.equal(env.providerCalls(), 1, 'three requests, one provider pass');
});

test('positions without Home Assistant rows do not ask for the snapshot', () => {
  const env = live(['light.kitchen']);
  env.labelsAt('type: entities\nen');                                   // a YAML key
  env.labelsAt('type: entities\ncard_mod:\n  style: |\n    ha');         // CSS text
  env.labelsAt('type: entities\n# a comment li');                        // nothing is suggested
  assert.equal(env.snapshotCalls(), 0);
  env.labelsAt('entity: li');
  assert.ok(env.snapshotCalls() > 0, 'a value position does');
});

test('scoreItems: the snapshot token is part of the cache key', () => {
  const cache = new Map();
  const ctx = { prefix: 'li', lang: 'yaml', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', triggerKind: 'typing', shouldSuggest: true };
  const settings = { enabledLangs: { yaml: true } };
  const row = label => ({ id: `ha.entity.${label}`, lang: 'yaml', type: 'entity', label, insert: label, source: 'ha-runtime-values', meta: {} });
  const first = scoreItems(ctx, { settings, cache, snapshotToken: 1, providerCandidates: () => [row('light.kitchen')] });
  const hit = scoreItems(ctx, { settings, cache, snapshotToken: 1, providerCandidates: () => [row('light.other')] });
  assert.equal(hit, first);
  const next = scoreItems(ctx, { settings, cache, snapshotToken: 2, providerCandidates: () => [row('light.library')] });
  assert.deepEqual(next.map(item => item.label), ['light.library']);
  const without = scoreItems(ctx, { settings, cache, providerCandidates: () => [row('light.plain')] });
  assert.deepEqual(without.map(item => item.label), ['light.plain'], 'no token is its own slot');
});

test('a snapshot source that throws or returns nothing leaves scoring as it was', () => {
  for (const source of [() => { throw new Error('boom'); }, () => null, () => 'text']) {
    const state = { settings: { enabledLangs: { yaml: true } }, completionCache: new Map(), context: null, items: [] };
    let calls = 0;
    const runtime = createScoringRuntime({
      state,
      runtimeData: source,
      providerCandidates: () => { calls += 1; return [{ id: 'a', lang: 'yaml', type: 'entity', label: 'light.kitchen', insert: 'light.kitchen', source: 'ha-runtime-values', meta: {} }]; },
    });
    const ctx = { prefix: 'li', lang: 'yaml', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', triggerKind: 'typing', shouldSuggest: true };
    assert.equal(runtime.scoreItems(ctx)[0].label, 'light.kitchen');
    runtime.scoreItems(ctx);
    assert.equal(calls, 1);
  }
});

test('the live runtime hands the snapshot source to the scoring runtime', () => {
  const main = readFileSync('src/app.js', 'utf8');
  const factory = readFileSync('src/composition/appCompletionRuntimeFactory.js', 'utf8');
  assert.match(main, /scoring: \{\s*ensureProviderSettings,\s*providerCandidates,\s*runtimeData,\s*\}/);
  assert.match(factory, /runtimeData: scoring\.runtimeData,/);
});
