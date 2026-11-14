import test from 'node:test';
import assert from 'node:assert/strict';

import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import { haRuntimeValueProvider, runtimeData, serviceFieldCatalog } from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// The service field catalog of a data snapshot stops after maxServicesWithFields services, in
// the order Home Assistant registered them. A service past that point still has to get its field
// rows in a data: block.

const CAP = SECURITY_LIMITS.maxServicesWithFields;

function bigServices(count = CAP + 60) {
  const services = {};
  for (let i = 0; i < count; i += 1) {
    services[`domain_${String(i).padStart(4, '0')}`] = {
      run: { fields: { [`option_${i}`]: { description: `Option ${i}`, required: i % 2 === 0, selector: { number: {} } } } },
    };
  }
  // Registered last: far past the catalog cap.
  services.zz_last = {
    do_it: {
      fields: {
        speed: { description: 'How fast', required: true, selector: { select: { options: ['slow', 'fast'] } } },
        advanced_fields: { collapsed: true, fields: { retries: { selector: { number: {} } } } },
      },
    },
    no_fields: {},
  };
  return services;
}

function setup(services = bigServices()) {
  const hass = { states: { 'light.kitchen': { attributes: {} } }, services };
  const state = {};
  let now = 1_000;
  const snapshot = () => runtimeData({ state, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => hass, now: () => now });
  return { hass, state, snapshot, provider: haRuntimeValueProvider({ runtimeData: snapshot }), advance: ms => { now += ms; } };
}

function ctxAt(doc, extra = {}) {
  return { ...detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' }), ...extra };
}

const labels = rows => rows.map(row => row.label);

test('the catalog of a snapshot keeps its cap', () => {
  const catalog = serviceFieldCatalog({ services: bigServices(), limits: SECURITY_LIMITS });
  assert.equal(Object.keys(catalog).length, CAP);
  assert.equal(catalog['zz_last.do_it'], undefined);
  const { snapshot } = setup();
  assert.equal(Object.keys(snapshot().serviceFields).length, CAP);
});

test('a service past the cap gets its field rows in a data block', () => {
  const { provider } = setup();
  for (const doc of [
    'actions:\n  - action: zz_last.do_it\n    data:\n      ',
    'type: button\ntap_action:\n  action: perform-action\n  perform_action: zz_last.do_it\n  data:\n    ',
    `actions:\n  - action: domain_${String(CAP + 20).padStart(4, '0')}.run\n    data:\n      `,
  ]) {
    const ctx = ctxAt(doc);
    assert.equal(provider.canHandle(ctx), true);
    const rows = provider.provide(ctx);
    assert.ok(rows.length > 0, `no field rows at ${JSON.stringify(doc)}`);
    assert.ok(rows.every(row => row.type === 'key'));
  }
  const rows = provider.provide(ctxAt('actions:\n  - action: zz_last.do_it\n    data:\n      '));
  assert.deepEqual(labels(rows).sort(), ['retries:', 'speed:'], 'the fields of a collapsed section are flattened here too');
  assert.equal(rows.find(row => row.label === 'speed:').meta.required, true);
  assert.equal(rows.find(row => row.label === 'speed:').meta.documentation, 'How fast');
});

test('a service inside the cap is answered from the catalog as before', () => {
  const { provider, snapshot } = setup();
  const rows = provider.provide(ctxAt('actions:\n  - action: domain_0003.run\n    data:\n      '));
  assert.deepEqual(labels(rows), ['option_3:']);
  assert.equal(Object.keys(snapshot().serviceFields).length, CAP, 'nothing was added for it');
});

test('the rows of a late service are read once per snapshot and kept for its other readers', () => {
  const { provider, snapshot } = setup();
  const ctx = ctxAt('actions:\n  - action: zz_last.do_it\n    data:\n      ');
  provider.provide(ctx);
  const kept = snapshot().serviceFields['zz_last.do_it'];
  assert.ok(Array.isArray(kept) && kept.length === 2, 'signature help and item details read the same snapshot');
  provider.provide(ctx);
  assert.equal(snapshot().serviceFields['zz_last.do_it'], kept);
});

test('the value options of a field of a late service are offered', () => {
  const { provider } = setup();
  const ctx = ctxAt('actions:\n  - action: zz_last.do_it\n    data:\n      speed: ', { schemaValuesEnabled: true });
  assert.equal(provider.canHandle(ctx), true);
  assert.deepEqual(labels(provider.provide(ctx)), ['slow', 'fast']);
});

test('a new snapshot reads the service again', () => {
  const env = setup();
  const ctx = ctxAt('actions:\n  - action: zz_last.do_it\n    data:\n      ');
  assert.deepEqual(labels(env.provider.provide(ctx)).sort(), ['retries:', 'speed:']);
  // Home Assistant replaces the services object when a service changes.
  const next = bigServices();
  next.zz_last.do_it = { fields: { volume: { selector: { number: {} } } } };
  env.hass.services = next;
  env.advance(SECURITY_LIMITS.runtimeCacheMs + 1);
  assert.deepEqual(labels(env.provider.provide(ctx)), ['volume:']);
});

test('unknown, field-less and hostile services give no rows and do not throw', () => {
  const services = bigServices();
  Object.defineProperty(services, 'zz_trap', { enumerable: true, get() { throw new Error('boom'); } });
  const { provider, snapshot } = setup(services);
  for (const service of ['zz_last.no_fields', 'zz_last.missing', 'nowhere.run', 'zz_trap.run', 'constructor.name', 'zz_last.constructor', '__proto__.x']) {
    const ctx = ctxAt(`actions:\n  - action: ${service}\n    data:\n      `);
    assert.deepEqual(provider.provide(ctx), [], service);
  }
  assert.equal(Object.keys(snapshot().serviceFields).length, CAP);
});

test('data that did not come from runtimeData is used as it is', () => {
  const provider = haRuntimeValueProvider({ runtimeData: () => ({ entities: [], services: [], serviceFields: { 'light.turn_on': [{ field: 'transition', description: '', selectorKind: 'number', required: false, advanced: false, options: [] }] } }) });
  assert.deepEqual(labels(provider.provide(ctxAt('actions:\n  - action: light.turn_on\n    data:\n      '))), ['transition:']);
  assert.deepEqual(provider.provide(ctxAt('actions:\n  - action: light.turn_off\n    data:\n      ')), []);
});
