import test from 'node:test';
import assert from 'node:assert/strict';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import { haRuntimeValueProvider, runtimeData } from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { makeHassFixture } from '../fixtures/hassFixture.mjs';

// The context adapter classifies an entity-shaped value under an arbitrary key
// ('humidity: sensor.hum') as valueKind 'entity' through its domain-prefix lane. The provider uses
// that kind instead of deriving one from the key name alone: the 'entity' marking suppresses the
// word fallback, so a provider that declined would leave the popup empty at that cursor
// ("No suggestions").
function fixtureProvider() {
  const hass = makeHassFixture();
  return haRuntimeValueProvider({
    runtimeData: () =>
      runtimeData({ state: {}, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => hass, now: () => 1_000 }),
  });
}

function ctxAt(doc) {
  return detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
}

function labelsOf(rows) {
  return rows.map(row => row?.label ?? row?.insert ?? String(row));
}

test('an entity-shaped value under an arbitrary key reaches the entity rows', () => {
  const ctx = ctxAt('type: custom:some-card\nhumidity: sensor.hum');
  assert.equal(ctx.valueKind, 'entity', 'the adapter classifies the typed value shape as an entity');

  const provider = fixtureProvider();
  assert.equal(provider.canHandle(ctx), true, 'the provider must honor the adapter classification');
  const labels = labelsOf(provider.provide(ctx));
  assert.ok(labels.includes('sensor.humidity'), `entity rows expected, got: ${JSON.stringify(labels)}`);

  const scored = scoreItems(ctx, provider.provide(ctx), { settings: { enabledLangs: { yaml: true }, maxItems: 20 } });
  assert.ok(scored.some(item => item.label === 'sensor.humidity'), 'the row must survive scoring at this cursor');
});

test('canonical entity keys keep working through the classifier lane', () => {
  const ctx = ctxAt('entity: sensor.hum');
  const provider = fixtureProvider();
  assert.equal(provider.canHandle(ctx), true);
  assert.ok(labelsOf(provider.provide(ctx)).includes('sensor.humidity'));
});

test('non-entity values stay declined', () => {
  const provider = fixtureProvider();
  // title/brightness carry key-mapped scalar kinds ('string'/'number'), so the
  // scalar gate declines them; a kindless non-entity value declines on the empty kind.
  const plain = ctxAt('title: hello');
  assert.equal(plain.valueKind, 'string');
  assert.equal(provider.canHandle(plain), false);

  const numeric = ctxAt('brightness: 5');
  assert.equal(provider.canHandle(numeric), false, 'scalar-kind values stay with the scalar lane');

  const kindless = ctxAt('type: custom:some-card\nhumidity: hello');
  assert.equal(kindless.valueKind, '', 'a non-entity-shaped value under an unmapped key carries no kind');
  assert.equal(provider.canHandle(kindless), false);
});

test('only the entity marking is honored from the context', () => {
  const provider = fixtureProvider();
  const base = ctxAt('type: custom:some-card\nhumidity: sensor.hum');
  assert.equal(provider.canHandle({ ...base, lang: 'css' }), false, 'the yaml gate stays first');
  assert.equal(provider.canHandle({ ...base, valueKind: 'card-type' }), false, 'foreign kinds are not adopted');
});
