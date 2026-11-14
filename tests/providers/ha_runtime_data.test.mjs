import test from 'node:test';
import assert from 'node:assert/strict';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import {
  customCardCatalog,
  haRuntimeValueProvider,
  isServiceDataFieldContext,
  isServiceDataFieldValueContext,
  registryCatalog,
  runtimeData,
  runtimeRowsForKind,
  serviceFieldCatalog,
  serviceIdFromContext,
} from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { makeHassFixture, FIXTURE_SERVICE_IDS } from '../fixtures/hassFixture.mjs';
import { makeCustomCardsFixture } from '../fixtures/customCardsFixture.mjs';

// Frozen parity list of the runtimeData() cache surface.
// New keys may be ADDED — each addition must be itemized in the
// same commit that extends this list. Existing keys/shapes may not change.
// Additions: v0.1.80 added `cardMeta` (live custom-card type → {name, description}).
// Additions: v0.1.81 added `serviceFields` (service id → capped field descriptor list).
// Additions: v0.1.180 added the registry id-lists + name-maps:
//   areas/areaNames, devices/deviceNames, floors/floorNames, labels/labelNames.
const RUNTIME_CACHE_PARITY_KEYS = Object.freeze([
  'actions',
  'areaNames',
  'areas',
  'at',
  'automationModes',
  'booleans',
  'cardMeta',
  'cards',
  'conditionTypes',
  'deviceNames',
  'devices',
  'entities',
  'entityNames',
  'floorNames',
  'floors',
  'hasHass',
  'icons',
  'labelNames',
  'labels',
  'scriptActions',
  'serviceFields',
  'services',
  'themes',
  'triggerTypes',
]);

const ENTITY_ID_RX = /^[a-z_]+\.[a-z0-9_]+$/i;

function fixtureOptions(overrides = {}) {
  const hass = overrides.hass !== undefined ? overrides.hass : makeHassFixture();
  return {
    state: overrides.state !== undefined ? overrides.state : {},
    limits: overrides.limits || SECURITY_LIMITS,
    findHass: () => hass,
    now: overrides.now || (() => 1_000),
  };
}

test('runtimeData cache surface matches the frozen parity key list', () => {
  const data = runtimeData(fixtureOptions());
  assert.deepEqual(Object.keys(data).sort(), [...RUNTIME_CACHE_PARITY_KEYS]);
});

test('entities are regex-filtered, sorted, and capped', () => {
  const hass = makeHassFixture();
  const data = runtimeData(fixtureOptions({ hass }));

  const expected = Object.keys(hass.states).filter(id => ENTITY_ID_RX.test(id)).sort();
  assert.deepEqual(data.entities, expected);
  assert.ok(!data.entities.includes('light.bad-id!'), 'hostile entity id must be filtered out');
  assert.ok(data.entities.includes('light.kitchen'));
  assert.ok(data.entities.length >= 25, 'fixture should provide a realistic entity population');

  // The STORED/indexed list is now capped by maxRuntimeEntitiesIndexed (maxRuntimeEntities is the
  // per-QUERY row cap applied later in runtimeRowsForKind, so large installs can complete
  // late-alphabet entities via the prefix filter rather than being truncated at the source).
  const capped = runtimeData(fixtureOptions({ limits: { ...SECURITY_LIMITS, maxRuntimeEntitiesIndexed: 5 } }));
  assert.deepEqual(capped.entities, expected.slice(0, 5));
});

test('entity friendly names are mapped, capped, and fail dark on missing attributes', () => {
  const data = runtimeData(fixtureOptions());
  assert.equal(data.entityNames['light.kitchen'], 'Kitchen Light');
  assert.equal(data.entityNames['sensor.long_name'].length, 140, '300-char friendly_name must be capped');
  assert.ok(!('switch.no_attributes' in data.entityNames), 'state without attributes maps no name');
  assert.ok(!('sensor.humidity' in data.entityNames), 'state without friendly_name maps no name');
});

test('entity completion covers EVERY domain incl. automations/scripts/scenes, with friendly names as detail + keyword', () => {
  // Entity sourcing applies no domain filter, so automation./script./scene. flow
  // through like any entity, and their friendly_name rides as sourceDetail + a fuzzy keyword.
  const data = runtimeData(fixtureOptions());
  const rows = runtimeRowsForKind('entity', { runtimeData: () => data });
  const byId = new Map(rows.map(r => [r.insert, r]));
  for (const [id, name, domain] of [
    ['automation.wake_up', 'Wake Up', 'automation'],
    ['script.bedtime', 'Bedtime', 'script'],
    ['scene.movie_night', 'Movie Night', 'scene'],
  ]) {
    const row = byId.get(id);
    assert.ok(row, `${id} completes`);
    assert.equal(row.meta.sourceDetail, `${name} (${domain})`, `${id} shows its friendly name + domain as detail`);
    assert.ok(row.aliases.includes(name), `${id} is fuzzy-matchable by its friendly name`);
  }
});

test('services are flattened to sorted domain.service ids and capped', () => {
  const data = runtimeData(fixtureOptions());
  assert.deepEqual(data.services, FIXTURE_SERVICE_IDS);
  assert.ok(data.services.includes('light.turn_on'));
  assert.ok(data.services.includes('climate.set_temperature'));
  assert.ok(data.services.includes('script.turn_on'));

  // The STORED/indexed list is capped by maxRuntimeServicesIndexed (maxRuntimeServices is the
  // per-QUERY row cap applied after the prefix filter, so late-alphabet services stay reachable).
  const capped = runtimeData(fixtureOptions({ limits: { ...SECURITY_LIMITS, maxRuntimeServicesIndexed: 3 } }));
  assert.deepEqual(capped.services, FIXTURE_SERVICE_IDS.slice(0, 3));
});

test('the service value lane is prefix-aware so late-alphabet services stay reachable', () => {
  const services = {};
  for (let i = 0; i < 600; i += 1) services[`aaa${String(i).padStart(3, '0')}`] = { turn_on: {} };
  services.zwave_js = { set_value: {} };
  const data = runtimeData({ state: {}, limits: SECURITY_LIMITS, findHass: () => ({ services }), now: () => 1_000 });
  assert.ok(data.services.length > 500, 'more than the per-query cap is indexed');
  const rows = runtimeRowsForKind('service', { runtimeData: () => data, prefix: 'zwave' });
  assert.ok(rows.some(r => r.insert === 'zwave_js.set_value'), 'a late-alphabet service completes when typed');
});

test('themes are listed from hass.themes.themes', () => {
  const data = runtimeData(fixtureOptions());
  assert.deepEqual(data.themes, ['Dark Mode', 'Solarized', 'ios-dark'].sort());
});

// --- Registry sourcing (areas/devices/floors/labels) ---

test('registries are sourced into the cache: validated, sorted ids + name maps', () => {
  const data = runtimeData(fixtureOptions());

  assert.deepEqual(data.areas, ['kitchen', 'living_room'], 'hostile "bad area!" id filtered, sorted');
  assert.equal(data.areaNames.living_room, 'Living Room');
  assert.deepEqual(data.floors, ['ground', 'upstairs']);
  assert.equal(data.floorNames.upstairs, 'Upstairs');
  assert.deepEqual(data.labels, ['cozy', 'security']);
  assert.equal(data.labelNames.security, 'Security');

  assert.deepEqual(data.devices, ['abc123', 'def456']);
  assert.equal(data.deviceNames.abc123, 'Living Room Hub', 'device prefers name_by_user over name');
  assert.equal(data.deviceNames.def456, 'Thermostat', 'falls back to name when no user name');
});

test('registryCatalog caps, fails dark on absent/hostile registries, and degrades per-entry', () => {
  assert.deepEqual(registryCatalog(null), { ids: [], names: {} });
  assert.deepEqual(registryCatalog('garbage'), { ids: [], names: {} });
  assert.deepEqual(registryCatalog(undefined), { ids: [], names: {} });

  const capped = registryCatalog({ a: { name: 'A' }, b: { name: 'B' }, c: { name: 'C' } }, { max: 2 });
  assert.deepEqual(capped.ids, ['a', 'b']);

  // A throwing value getter degrades that id's NAME only — the id itself survives.
  const partial = registryCatalog({
    ok: { name: 'OK' },
    get boom() { throw new Error('hostile registry entry'); },
  });
  assert.deepEqual(partial.ids, ['boom', 'ok'], 'id key enumerates even when its value throws');
  assert.equal(partial.names.ok, 'OK');
  assert.ok(!('boom' in partial.names), 'throwing value maps no name');
});

test('cache registry caps honor the per-kind limits', () => {
  const capped = runtimeData(fixtureOptions({ limits: { ...SECURITY_LIMITS, maxRuntimeAreas: 1, maxRuntimeFloors: 1 } }));
  assert.equal(capped.areas.length, 1);
  assert.equal(capped.floors.length, 1);
});

test('registry rows insert the id and carry the human name as detail + fuzzy keyword', () => {
  const data = runtimeData(fixtureOptions());
  const areaRows = runtimeRowsForKind('area', { runtimeData: () => data });
  const lr = areaRows.find(r => r.insert === 'living_room');
  assert.ok(lr, 'area row inserts the bare id');
  assert.equal(lr.meta.sourceDetail, 'Living Room');
  assert.ok(lr.aliases.includes('Living Room'), 'human name is fuzzy-matchable');

  const deviceRows = runtimeRowsForKind('device', { runtimeData: () => data });
  const hub = deviceRows.find(r => r.insert === 'abc123');
  assert.ok(hub && hub.meta.sourceDetail === 'Living Room Hub', 'device name shown as detail');
});

test('cache hit within TTL returns the same object without re-walking hass', () => {
  const state = {};
  let walks = 0;
  const hass = makeHassFixture();
  const base = {
    state,
    limits: SECURITY_LIMITS,
    findHass: () => {
      walks += 1;
      return hass;
    },
  };

  const first = runtimeData({ ...base, now: () => 1_000 });
  assert.equal(walks, 1);
  assert.equal(state.runtimeCache, first);

  const second = runtimeData({ ...base, now: () => 1_000 + SECURITY_LIMITS.runtimeCacheMs - 1 });
  assert.equal(second, first, 'within TTL the cached object is returned');
  assert.equal(walks, 1, 'within TTL hass must not be walked again');

  // After the TTL hass is read again; the snapshot is rebuilt once Home Assistant has replaced
  // its states object (it does on every state change).
  hass.states = { ...hass.states };
  const third = runtimeData({ ...base, now: () => 1_000 + SECURITY_LIMITS.runtimeCacheMs });
  assert.notEqual(third, first, 'after TTL the cache is rebuilt');
  assert.equal(walks, 2);
});

// --- Live custom-card catalog ---

const PERSONAL_HARDCODES = [
  'custom:better-thermostat-ui-card',
  'custom:button-card',
  'custom:layout-card',
  'custom:mod-card',
  'custom:mushroom-template-card',
  'custom:stack-in-card',
];

test('customCardCatalog normalizes, validates, dedupes, sorts, and caps the registry', () => {
  const windowRef = { customCards: makeCustomCardsFixture() };
  const { cards, cardMeta } = customCardCatalog({ windowRef, limits: SECURITY_LIMITS });

  assert.ok(cards.includes('custom:button-card'), 'normal entry is custom:-prefixed');
  assert.equal(cards.filter(type => type === 'custom:button-card').length, 1, 'duplicate registration deduped');
  assert.ok(cards.includes('custom:mini-graph-card'), 'prefixed entry kept');
  assert.ok(!cards.includes('custom:custom:mini-graph-card'), 'prefixed entry not double-prefixed');
  assert.ok(cards.includes('custom:button'), 'native-name collision survives as a distinct custom type');
  assert.ok(!cards.some(type => !type.startsWith('custom:')), 'every catalog entry carries the custom: prefix');
  assert.deepEqual(cards, [...cards].sort(), 'catalog is sorted');

  assert.equal(cardMeta['custom:button-card'].name, 'Button Card', 'first registration wins meta');
  assert.equal(cardMeta['custom:long-desc-card'].description.length, 200, '500-char description capped');
  assert.ok(!cards.some(type => type.includes('No Type')), 'missing-type entry skipped');

  const capped = customCardCatalog({ windowRef, limits: { ...SECURITY_LIMITS, maxRuntimeCustomCards: 2 } });
  assert.equal(capped.cards.length, 2);
  assert.deepEqual(capped.cards, cards.slice(0, 2));
});

test('customCardCatalog fails dark on absent or malformed registries', () => {
  assert.deepEqual(customCardCatalog({ windowRef: {} }), { cards: [], cardMeta: {} });
  assert.deepEqual(customCardCatalog({ windowRef: { customCards: 'not-an-array' } }).cards, []);
  assert.deepEqual(customCardCatalog({ windowRef: { customCards: null } }).cards, []);
  assert.deepEqual(customCardCatalog({}).cards, []);
});

test('runtimeData cards merge native list with the live catalog, deduped', () => {
  const windowRef = { customCards: makeCustomCardsFixture() };
  const data = runtimeData({ ...fixtureOptions(), windowRef });

  assert.ok(data.cards.includes('button'), 'native card present');
  assert.ok(data.cards.includes('custom:button'), 'live custom card with a native name stays distinct');
  assert.ok(data.cards.includes('custom:button-card'));
  assert.ok(data.cards.includes('custom:mushroom-template-card'), 'installed card appears because it is registered');
  assert.equal(new Set(data.cards).size, data.cards.length, 'merged list is deduped');
  assert.deepEqual(data.cards, [...data.cards].sort(), 'merged list is sorted');
  assert.equal(data.cardMeta['custom:mushroom-template-card'].name, 'Mushroom Template Card');
});

test('without a customCards registry the cards list is exactly the native list', () => {
  const data = runtimeData({ ...fixtureOptions(), windowRef: {} });
  assert.ok(data.cards.length > 0);
  assert.ok(!data.cards.some(type => type.startsWith('custom:')), 'no custom entries without a registry');
  for (const personal of PERSONAL_HARDCODES) {
    assert.ok(!data.cards.includes(personal), `${personal} must not be hardcoded`);
  }
});

test('card-type rows carry the human card name as detail metadata', () => {
  const windowRef = { customCards: makeCustomCardsFixture() };
  const data = runtimeData({ ...fixtureOptions(), windowRef });
  const rows = runtimeRowsForKind('card-type', { runtimeData: () => data });

  const buttonCard = rows.find(row => row.label === 'custom:button-card');
  assert.ok(buttonCard, 'live card row exists');
  assert.equal(buttonCard.meta.sourceDetail, 'Button Card');
  assert.ok(buttonCard.meta.documentation.includes('Button Card'));
  assert.ok(buttonCard.aliases.includes('Button Card'), 'human name is fuzzy-matchable');

  const native = rows.find(row => row.label === 'button');
  assert.ok(native, 'native card row exists');
  assert.equal(native.meta.sourceDetail, undefined, 'native rows keep their previous metadata shape');
});

// --- Service field & target completion ---

// Build a real runtime context the way the live adapter does: doc text with a
// cursor at the end, classifier-backed branch state included.
function ctxAt(doc) {
  return detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
}

function fixtureProvider(state = {}) {
  const hass = makeHassFixture();
  let walks = 0;
  const provider = haRuntimeValueProvider({
    runtimeData: () =>
      runtimeData({
        state,
        limits: SECURITY_LIMITS,
        windowRef: {},
        findHass: () => {
          walks += 1;
          return hass;
        },
        now: () => 1_000,
      }),
  });
  return { provider, walkCount: () => walks };
}

test('serviceFieldCatalog shapes every fixture service correctly', () => {
  const fields = serviceFieldCatalog({ services: makeHassFixture().services, limits: SECURITY_LIMITS });

  const lightOn = fields['light.turn_on'];
  assert.deepEqual(lightOn.map(f => f.field), ['transition', 'rgb_color', 'brightness_pct', 'effect']);
  assert.equal(lightOn.find(f => f.field === 'transition').selectorKind, 'number');
  assert.equal(lightOn.find(f => f.field === 'rgb_color').selectorKind, 'color_rgb');
  assert.equal(lightOn.find(f => f.field === 'effect').selectorKind, 'select');

  // schemaValues: a `select` field captures its option VALUES (additive — other field keys intact).
  assert.deepEqual(lightOn.find(f => f.field === 'effect').options, [{ value: 'colorloop', label: '' }, { value: 'random', label: '' }]);
  assert.deepEqual(lightOn.find(f => f.field === 'transition').options, [], 'a number field has no enumerated options');

  assert.deepEqual(fields['climate.set_temperature'].map(f => f.field), ['temperature', 'hvac_mode']);
  assert.deepEqual(fields['climate.set_temperature'].find(f => f.field === 'hvac_mode').options, [{ value: 'off', label: '' }, { value: 'auto', label: '' }, { value: 'cool', label: '' }, { value: 'heat', label: '' }]);

  assert.ok(!('script.turn_on' in fields), 'empty-fields service has no catalog entry');
  assert.ok(!('homeassistant.turn_on' in fields), 'fieldless service has no catalog entry');

  const notify = fields['notify.notify'];
  assert.equal(notify.find(f => f.field === 'message').selectorKind, '', 'selector-absent field keeps empty selectorKind');
  assert.ok(notify.find(f => f.field === 'message').description.length > 0);

  const toggle = fields['light.toggle'];
  assert.equal(toggle.find(f => f.field === 'flash').advanced, true);

  const publish = fields['mqtt.publish'];
  assert.deepEqual(publish.map(f => f.field), ['topic'], 'hostile field name skipped silently');
  assert.equal(publish[0].required, true);

  const capped = serviceFieldCatalog({
    services: makeHassFixture().services,
    limits: { ...SECURITY_LIMITS, maxServiceFieldsPerService: 2 },
  });
  assert.equal(capped['light.turn_on'].length, 2);

  const cappedServices = serviceFieldCatalog({
    services: makeHassFixture().services,
    limits: { ...SECURITY_LIMITS, maxServicesWithFields: 1 },
  });
  assert.equal(Object.keys(cappedServices).length, 1);
});

test('serviceFieldCatalog fails dark on absent or malformed services', () => {
  assert.deepEqual(serviceFieldCatalog({ services: null }), {});
  assert.deepEqual(serviceFieldCatalog({ services: 'garbage' }), {});
  assert.deepEqual(serviceFieldCatalog({}), {});
});

test('serviceIdFromContext reads the adapter-parsed branch state, all syntaxes', () => {
  const dashboard = ctxAt('type: button\ntap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    ');
  assert.equal(serviceIdFromContext(dashboard), 'light.turn_on');

  const performAction = ctxAt('type: button\ntap_action:\n  action: perform-action\n  perform_action: climate.set_temperature\n  data:\n    ');
  assert.equal(serviceIdFromContext(performAction), 'climate.set_temperature');

  const modernAutomation = ctxAt('actions:\n  - action: light.turn_on\n    data:\n      ');
  assert.equal(serviceIdFromContext(modernAutomation), 'light.turn_on');

  const legacyAutomation = ctxAt('actions:\n  - service: light.turn_on\n    data:\n      ');
  assert.equal(serviceIdFromContext(legacyAutomation), 'light.turn_on');

  const noService = ctxAt('type: button\ntap_action:\n  action: navigate\n  data:\n    ');
  assert.equal(serviceIdFromContext(noService), '', 'dashboard action kinds are not service ids');
});

test('field-key completion fires only inside data mappings with a known service', () => {
  const { provider } = fixtureProvider();

  const inData = ctxAt('type: button\ntap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    ');
  assert.equal(isServiceDataFieldContext(inData), true);
  assert.equal(provider.canHandle(inData), true);
  const rows = provider.provide(inData);
  assert.deepEqual(rows.map(r => r.insert), ['transition: ', 'rgb_color: ', 'brightness_pct: ', 'effect: ']);
  assert.equal(rows[0].meta.sourceDetail, 'number');
  assert.equal(rows[0].meta.documentation, 'Duration it takes to get to next state.');

  const advanced = provider.provide(ctxAt('actions:\n  - action: light.toggle\n    data:\n      '));
  assert.ok(advanced[0].meta.sourceDetail.includes('advanced'));

  const required = provider.provide(ctxAt('actions:\n  - service: mqtt.publish\n    data:\n      '));
  assert.deepEqual(required.map(r => r.label), ['topic:'], 'hostile field name never becomes a row');
  assert.ok(required[0].meta.sourceDetail.includes('required'));

  const selectorAbsent = provider.provide(ctxAt('actions:\n  - service: notify.notify\n    data:\n      '));
  const message = selectorAbsent.find(r => r.label === 'message:');
  assert.ok(message, 'selector-absent field still completes');
  assert.equal(message.meta.sourceDetail, undefined, 'no selector decoration when selector is absent');
});

test('field-key completion yields zero rows and zero errors off the happy path', () => {
  const { provider } = fixtureProvider();

  const unknownService = ctxAt('actions:\n  - service: light.unknown_service\n    data:\n      ');
  assert.deepEqual(provider.provide(unknownService), []);

  const emptyFields = ctxAt('actions:\n  - service: script.turn_on\n    data:\n      ');
  assert.deepEqual(provider.provide(emptyFields), []);

  const noServiceSibling = ctxAt('type: button\ntap_action:\n  action: navigate\n  data:\n    ');
  assert.deepEqual(provider.provide(noServiceSibling), []);
});

test('no field suggestions outside data-mapping contexts', () => {
  const { provider } = fixtureProvider();

  const targetBlock = ctxAt('tap_action:\n  action: call-service\n  service: light.turn_on\n  target:\n    ');
  assert.equal(isServiceDataFieldContext(targetBlock), false);
  assert.equal(provider.canHandle(targetBlock), false, 'key context outside data does not engage the lane');

  const rootKey = ctxAt('type: button\n');
  assert.equal(isServiceDataFieldContext(rootKey), false);
  assert.equal(provider.canHandle(rootKey), false);

  const nestedUnderField = ctxAt('actions:\n  - action: light.turn_on\n    data:\n      rgb_color:\n        ');
  assert.equal(isServiceDataFieldContext(nestedUnderField), false, 'a mapping nested under a field is not the data mapping');

  const dataValue = ctxAt('actions:\n  - action: light.turn_on\n    data:\n      transition: ');
  assert.equal(isServiceDataFieldContext(dataValue), false, 'value position inside data is not a field-key context');
  // The value position IS a service-field VALUE context (distinct from the key context above).
  assert.equal(isServiceDataFieldValueContext(dataValue), true, 'a service-data field value position is a value context');
  assert.equal(isServiceDataFieldValueContext(nestedUnderField), false, 'a mapping nested under a field is not a field value context');
  assert.equal(isServiceDataFieldValueContext(rootKey), false);
});

test('schemaValues: a service-field value position completes the field enum options ONLY when the flag is on', () => {
  const { provider } = fixtureProvider();
  const effectValue = ctxAt('actions:\n  - action: light.turn_on\n    data:\n      effect: ');

  // Default-OFF byte-identity: with the flag absent, the provider does not handle a value position.
  assert.equal(provider.canHandle(effectValue), false, 'flag off: value position not handled (unchanged)');

  // Flag on (the context runtime would set this): the field's select options complete.
  const onCtx = { ...effectValue, schemaValuesEnabled: true };
  assert.equal(provider.canHandle(onCtx), true);
  const rows = provider.provide(onCtx);
  assert.deepEqual(rows.map(r => r.label), ['colorloop', 'random']);
  assert.deepEqual(rows.map(r => r.insert), ['colorloop', 'random']);

  // A field with no enumerated options (number) handles but yields no rows (harmless, additive).
  const transitionOn = { ...ctxAt('actions:\n  - action: light.turn_on\n    data:\n      transition: '), schemaValuesEnabled: true };
  assert.deepEqual(provider.provide(transitionOn), []);
});

test('surfaceScope: card-type values are surface-scoped (lovelace only) but only when the flag is on', () => {
  const { provider } = fixtureProvider();
  const cardType = ctxAt('type: '); // valueKind card-type, yamlRole value
  // default-OFF: handled regardless of surface — byte-identical.
  assert.equal(provider.canHandle(cardType), true, 'flag off: card-type handled (unchanged)');
  assert.equal(provider.canHandle({ ...cardType, surface: 'automation', surfaceScopeEnabled: true }), false, 'card-type suppressed on an automation surface');
  assert.equal(provider.canHandle({ ...cardType, surface: 'card-editor', surfaceScopeEnabled: true }), true, 'card-type allowed on a card surface');
  assert.equal(provider.canHandle({ ...cardType, surface: 'unknown', surfaceScopeEnabled: true }), true, 'fail-open on an unknown surface');
  // an entity value is cross-surface — never scoped, even on an automation surface with the flag on.
  const entityVal = ctxAt('tap_action:\n  service: light.turn_on\n  target:\n    entity_id: ');
  assert.equal(provider.canHandle({ ...entityVal, surface: 'automation', surfaceScopeEnabled: true }), true, 'entity values are never surface-scoped');
});

test('target entity_id values are ordered service-domain first', () => {
  const { provider } = fixtureProvider();

  const ctx = ctxAt('tap_action:\n  action: call-service\n  service: light.turn_on\n  target:\n    entity_id: ');
  assert.equal(provider.canHandle(ctx), true);
  const rows = provider.provide(ctx);
  const labels = rows.map(r => r.label);
  const lightCount = labels.filter(id => id.startsWith('light.')).length;
  assert.ok(lightCount > 0);
  assert.ok(labels.slice(0, lightCount).every(id => id.startsWith('light.')), 'light.* entities come first');
  assert.equal(labels.length, new Set(labels).size, 'all entities still offered exactly once');
  assert.ok(labels.includes('sensor.outdoor_temperature'), 'non-domain entities remain offered after');

  const ambiguous = provider.provide(ctxAt('actions:\n  - service: homeassistant.turn_on\n    target:\n      entity_id: '));
  assert.deepEqual(
    ambiguous.map(r => r.label),
    [...ambiguous.map(r => r.label)].sort(),
    'ambiguous homeassistant.* services keep the plain sorted entity order'
  );
});

test('one runtimeData pass populates card and service-field data from a single hass walk', () => {
  const state = {};
  const { provider, walkCount } = fixtureProvider(state);

  const rows = provider.provide(ctxAt('actions:\n  - action: light.turn_on\n    data:\n      '));
  assert.ok(rows.length > 0);
  assert.equal(walkCount(), 1);
  assert.ok(state.runtimeCache.cards.length > 0, 'same cache carries card data');
  assert.ok(Object.keys(state.runtimeCache.serviceFields).length > 0, 'same cache carries service field data');

  provider.provide(ctxAt('tap_action:\n  action: call-service\n  service: light.turn_on\n  target:\n    entity_id: '));
  provider.provide(ctxAt('actions:\n  - service: notify.notify\n    data:\n      '));
  assert.equal(walkCount(), 1, 'within the TTL no completion request walks hass again');
});

// --- Fail-dark hardening / degradation proof ---

function withConsoleCapture(run) {
  const calls = [];
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  for (const name of Object.keys(original)) {
    console[name] = (...args) => calls.push([name, ...args]);
  }
  try {
    return { result: run(), consoleCalls: calls };
  } finally {
    for (const [name, fn] of Object.entries(original)) console[name] = fn;
  }
}

function assertValidDegradedShape(data) {
  assert.deepEqual(Object.keys(data).sort(), [...RUNTIME_CACHE_PARITY_KEYS]);
  assert.ok(Array.isArray(data.entities));
  assert.ok(Array.isArray(data.services));
  assert.ok(data.serviceFields && typeof data.serviceFields === 'object');
  assert.ok(Array.isArray(data.cards) && data.cards.length > 0, 'static card list survives degradation');
  for (const kind of ['areas', 'devices', 'floors', 'labels']) {
    assert.ok(Array.isArray(data[kind]), `${kind} stays an array under degradation`);
    assert.ok(data[`${kind.slice(0, -1)}Names`] && typeof data[`${kind.slice(0, -1)}Names`] === 'object', `${kind} name map is an object`);
  }
}

test('runtimeData survives hostile hass shapes: null, non-object states, throwing getters', () => {
  const hostileCases = [
    null,
    { states: 'garbage-string', services: 42 },
    { states: 123, services: 'garbage' },
    {
      get states() {
        throw new Error('hostile states getter');
      },
      get services() {
        throw new Error('hostile services getter');
      },
    },
    {
      states: {
        'light.ok': { attributes: { friendly_name: 'OK' } },
        get 'light.boom'() {
          throw new Error('hostile state getter');
        },
      },
      services: {
        get light() {
          throw new Error('hostile domain getter');
        },
        climate: makeHassFixture().services.climate,
      },
    },
  ];

  for (const hass of hostileCases) {
    const { result, consoleCalls } = withConsoleCapture(() =>
      runtimeData({ state: {}, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => hass, now: () => 1_000 })
    );
    assertValidDegradedShape(result);
    assert.deepEqual(consoleCalls, [], 'degradation must be silent');
  }

  const partial = runtimeData({ state: {}, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => hostileCases[4], now: () => 1_000 });
  assert.ok(partial.services.includes('climate.set_temperature'), 'healthy domain survives a throwing sibling domain');
  assert.ok('climate.set_temperature' in partial.serviceFields, 'healthy field schemas survive a throwing sibling domain');

  const throwingFindHass = withConsoleCapture(() =>
    runtimeData({
      state: {},
      limits: SECURITY_LIMITS,
      windowRef: {},
      findHass: () => {
        throw new Error('hostile findHass');
      },
      now: () => 1_000,
    })
  );
  assertValidDegradedShape(throwingFindHass.result);
  assert.equal(throwingFindHass.result.hasHass, false);
  assert.deepEqual(throwingFindHass.consoleCalls, []);
});

test('a single hostile state entry degrades that entry only', () => {
  const hass = {
    states: {
      'light.ok': { attributes: { friendly_name: 'OK Light' } },
      get 'light.boom'() {
        throw new Error('hostile attributes getter');
      },
    },
    services: {},
  };
  const data = runtimeData({ state: {}, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => hass, now: () => 1_000 });
  assert.ok(data.entities.includes('light.ok'));
  assert.ok(data.entities.includes('light.boom'), 'id itself is valid; only its name read throws');
  assert.equal(data.entityNames['light.ok'], 'OK Light');
  assert.ok(!('light.boom' in data.entityNames), 'throwing name read maps no name');
});

test('serviceFieldCatalog skips throwing services and fields but keeps healthy ones', () => {
  const services = {
    light: {
      get turn_on() {
        throw new Error('hostile service getter');
      },
      turn_off: makeHassFixture().services.light.turn_off,
    },
    climate: {
      set_temperature: {
        fields: {
          temperature: makeHassFixture().services.climate.set_temperature.fields.temperature,
          get hvac_mode() {
            throw new Error('hostile field getter');
          },
        },
      },
    },
  };
  const { result, consoleCalls } = withConsoleCapture(() => serviceFieldCatalog({ services, limits: SECURITY_LIMITS }));
  assert.ok(!('light.turn_on' in result), 'throwing service skipped');
  assert.deepEqual(result['light.turn_off'].map(f => f.field), ['transition'], 'healthy sibling service kept');
  assert.deepEqual(result['climate.set_temperature'].map(f => f.field), ['temperature'], 'throwing field skipped, healthy field kept');
  assert.deepEqual(consoleCalls, []);
});

test('serviceFieldCatalog flattens HA collapsible field sections', () => {
  // Modern HA (2024.3+) nests optional fields in a { collapsed, fields: {...} } section.
  // The section key is NOT a valid service-data key; only the leaves are.
  const services = {
    light: {
      turn_on: {
        fields: {
          transition: { selector: { number: {} } },
          advanced_fields: {
            collapsed: true,
            fields: {
              flash: { selector: { select: { options: ['long', 'short'] } } },
              brightness: { selector: { number: {} } },
            },
          },
        },
      },
    },
  };
  const cat = serviceFieldCatalog({ services, limits: SECURITY_LIMITS });
  const rows = cat['light.turn_on'];
  const names = rows.map(r => r.field);
  assert.ok(!names.includes('advanced_fields'), 'the section key is not offered as a field');
  assert.deepEqual(names, ['transition', 'flash', 'brightness'], 'section leaves are flattened into the field list');
  assert.deepEqual(rows.find(r => r.field === 'flash').options.map(o => o.value), ['long', 'short'], 'a nested field keeps its value options');
});

test('customCardCatalog skips throwing registry entries but keeps healthy ones', () => {
  const windowRef = {
    customCards: [
      {
        get type() {
          throw new Error('hostile type getter');
        },
      },
      { type: 'healthy-card', name: 'Healthy Card' },
    ],
  };
  const { result, consoleCalls } = withConsoleCapture(() => customCardCatalog({ windowRef, limits: SECURITY_LIMITS }));
  assert.deepEqual(result.cards, ['custom:healthy-card']);
  assert.deepEqual(consoleCalls, []);

  const hostileWindow = withConsoleCapture(() =>
    customCardCatalog({
      windowRef: {
        get customCards() {
          throw new Error('hostile registry getter');
        },
      },
    })
  );
  assert.deepEqual(hostileWindow.result, { cards: [], cardMeta: {} });
  assert.deepEqual(hostileWindow.consoleCalls, []);
});

test('customCardCatalog fail-darks on a hostile array (throwing element getter / iterator)', () => {
  // The per-entry guard did not cover the for...of itself: a real array with a throwing index getter
  // or a throwing Symbol.iterator threw straight out and aborted the runtime-data build.
  const throwGetter = [];
  Object.defineProperty(throwGetter, '0', { enumerable: true, get() { throw new Error('index'); } });
  throwGetter.length = 1;
  const throwIterator = [];
  throwIterator[Symbol.iterator] = function () { throw new Error('iter'); };
  const mixed = [{ type: 'custom:good-card', name: 'Good' }];
  Object.defineProperty(mixed, '1', { enumerable: true, get() { throw new Error('bad'); } });
  mixed.length = 2;

  for (const customCards of [throwGetter, throwIterator]) {
    const out = withConsoleCapture(() => customCardCatalog({ windowRef: { customCards }, limits: SECURITY_LIMITS }));
    assert.deepEqual(out.result, { cards: [], cardMeta: {} }, 'hostile array degrades to empty, never throws');
    assert.deepEqual(out.consoleCalls, []);
  }
  // A healthy entry beside a throwing index is still kept (per-entry resilience preserved).
  const kept = withConsoleCapture(() => customCardCatalog({ windowRef: { customCards: mixed }, limits: SECURITY_LIMITS }));
  assert.deepEqual(kept.result.cards, ['custom:good-card']);
});

test('provider completion stays silent and empty-or-valid under a hostile hass', () => {
  const provider = haRuntimeValueProvider({
    runtimeData: () =>
      runtimeData({
        state: {},
        limits: SECURITY_LIMITS,
        windowRef: { customCards: 'garbage' },
        findHass: () => ({ states: 'garbage', get services() { throw new Error('boom'); } }),
        now: () => 1_000,
      }),
  });
  const { result, consoleCalls } = withConsoleCapture(() => ({
    fields: provider.provide(ctxAt('actions:\n  - action: light.turn_on\n    data:\n      ')),
    entities: provider.provide(ctxAt('tap_action:\n  service: light.turn_on\n  target:\n    entity_id: ')),
    cards: provider.provide(ctxAt('type: ')),
  }));
  assert.deepEqual(result.fields, []);
  assert.deepEqual(result.entities, []);
  assert.ok(result.cards.length > 0, 'static native card list still completes');
  assert.deepEqual(consoleCalls, []);
});

test('hasHass false path returns the degraded static shape', () => {
  const data = runtimeData(fixtureOptions({ hass: null }));
  assert.equal(data.hasHass, false);
  assert.deepEqual(data.entities, []);
  assert.deepEqual(data.entityNames, {});
  assert.deepEqual(data.services, []);
  assert.deepEqual(data.themes, []);
  for (const staticKey of ['cards', 'icons', 'actions', 'triggerTypes', 'conditionTypes', 'automationModes', 'booleans', 'scriptActions']) {
    assert.ok(Array.isArray(data[staticKey]) && data[staticKey].length > 0, `${staticKey} stays statically available without hass`);
  }
});

test('serviceFieldCatalog keeps bare numeric and boolean select options', () => {
  // HA select options can be plain numbers/booleans; the string-only branch dropped them, emptying
  // such a field or losing the numeric entries from a mixed list.
  const opts = (arr) => serviceFieldCatalog({ services: { x: { y: { fields: { f: { selector: { select: { options: arr } } } } } } }, limits: SECURITY_LIMITS })['x.y'][0].options.map(o => o.value);
  assert.deepEqual(opts([1, 2, 3]), ['1', '2', '3']);
  assert.deepEqual(opts([true, false]), ['true', 'false']);
  assert.deepEqual(opts(['a', 1, 'b']), ['a', '1', 'b'], 'mixed list keeps the numeric entry');
  assert.deepEqual(opts([{ value: 'z', label: 'Z' }]), ['z'], 'object options still work');
});


// The snapshot was rebuilt every 2.5 s inside a keystroke whether or not anything had changed.
test('an expired snapshot is kept while Home Assistant still holds the same objects', () => {
  const state = {};
  const hass = makeHassFixture();
  const base = { state, limits: SECURITY_LIMITS, findHass: () => hass };
  const first = runtimeData({ ...base, now: () => 1_000 });
  const later = runtimeData({ ...base, now: () => 1_000 + SECURITY_LIMITS.runtimeCacheMs + 500 });
  assert.equal(later, first, 'same states and services objects: no rebuild');

  // Home Assistant replaces hass.states on a state change: the snapshot is rebuilt.
  hass.states = { ...hass.states, 'light.new_one': { attributes: { friendly_name: 'New one' } } };
  const changed = runtimeData({ ...base, now: () => 1_000 + 2 * SECURITY_LIMITS.runtimeCacheMs + 1_000 });
  assert.notEqual(changed, first);
  assert.ok(changed.entities.includes('light.new_one'));

  // A kept snapshot is rebuilt after 30 seconds even without a change (custom cards register in a plain array).
  const stale = runtimeData({ ...base, now: () => 1_000 + 2 * SECURITY_LIMITS.runtimeCacheMs + 1_000 + 31_000 });
  assert.notEqual(stale, changed);
});