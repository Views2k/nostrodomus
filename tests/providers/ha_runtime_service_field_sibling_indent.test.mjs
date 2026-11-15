import test from 'node:test';
import assert from 'node:assert/strict';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import { haRuntimeValueProvider, isServiceDataFieldContext, runtimeData } from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { makeHassFixture } from '../fixtures/hassFixture.mjs';

// A sibling field at the same indent must not be read as a leaf of the field above it:
// isServiceDataFieldContext (last path part === 'data') would then fail for every field after the
// first, and typing the second field (the usual case) would give no service-field rows and no
// required-first ordering.
function fixtureProvider(hass = makeHassFixture()) {
  return haRuntimeValueProvider({
    runtimeData: () =>
      runtimeData({ state: {}, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => hass, now: () => 1_000 }),
  });
}

function ctxAt(doc) {
  return detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
}

function labelsOf(rows) {
  return rows.map(row => row?.label ?? String(row));
}

const LIGHT_FIELDS = ['transition:', 'rgb_color:', 'brightness_pct:', 'effect:'];

test('the second field in a dashboard data block gets service-field rows', () => {
  const ctx = ctxAt('type: button\ntap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    brightness_pct: 50\n    ');
  assert.equal(isServiceDataFieldContext(ctx), true, 'the field-key lane must fire past the first field');
  const provider = fixtureProvider();
  assert.equal(provider.canHandle(ctx), true);
  assert.deepEqual(labelsOf(provider.provide(ctx)).sort(), [...LIGHT_FIELDS].sort());
});

test('the second field in an automation data block gets service-field rows', () => {
  const ctx = ctxAt('actions:\n  - action: light.turn_on\n    data:\n      transition: 1\n      ');
  assert.equal(isServiceDataFieldContext(ctx), true);
  assert.deepEqual(labelsOf(fixtureProvider().provide(ctx)).sort(), [...LIGHT_FIELDS].sort());
});

test('a partial second key filters the field rows', () => {
  const ctx = ctxAt('actions:\n  - action: light.turn_on\n    data:\n      brightness_pct: 50\n      tr');
  const provider = fixtureProvider();
  assert.equal(provider.canHandle(ctx), true);
  const rows = provider.provide(ctx);
  const scored = scoreItems(ctx, rows, { settings: { mode: 'both', maxItems: 25, fuzzy: true, enabledLangs: { yaml: true } } });
  assert.ok(scored.length > 0, 'typing tr on the second field must offer rows');
  assert.equal(scored[0].label, 'transition:', 'the prefix match must lead');
});

test('a blank line after a completed sibling keeps the field lane alive', () => {
  const ctx = ctxAt('actions:\n  - action: light.turn_on\n    data:\n      transition: 1\n\n      ');
  assert.equal(isServiceDataFieldContext(ctx), true);
  assert.deepEqual(labelsOf(fixtureProvider().provide(ctx)).sort(), [...LIGHT_FIELDS].sort());
});

test('required fields still lead on the second field', () => {
  const hass = makeHassFixture({
    services: {
      vacuum: {
        send_command: {
          fields: {
            aaa_params: { selector: { object: {} } },
            zzz_command: { required: true, selector: { text: {} } },
          },
        },
      },
    },
  });
  const ctx = ctxAt('actions:\n  - action: vacuum.send_command\n    data:\n      aaa_params: 1\n      ');
  const provider = fixtureProvider(hass);
  assert.equal(provider.canHandle(ctx), true);
  const scored = scoreItems(ctx, provider.provide(ctx), { settings: { mode: 'both', maxItems: 25, enabledLangs: { yaml: true } } });
  const labels = scored.map(item => item.label);
  assert.ok(labels.includes('zzz_command:') && labels.includes('aaa_params:'), `both fields expected, got ${JSON.stringify(labels)}`);
  assert.ok(labels.indexOf('zzz_command:') < labels.indexOf('aaa_params:'), 'the required field must rank above the optional one');
});

test('pins: first-field, nested-under-field, and the value lane are unchanged', () => {
  const provider = fixtureProvider();

  const first = ctxAt('type: button\ntap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    ');
  assert.equal(isServiceDataFieldContext(first), true);
  assert.deepEqual(labelsOf(provider.provide(first)).sort(), [...LIGHT_FIELDS].sort());

  const nested = ctxAt('actions:\n  - action: light.turn_on\n    data:\n      rgb_color:\n        ');
  assert.equal(isServiceDataFieldContext(nested), false, 'positions nested UNDER a field stay out of the key lane');

  const value = { ...ctxAt('actions:\n  - action: light.turn_on\n    data:\n      brightness_pct: 50\n      effect: '), schemaValuesEnabled: true };
  assert.equal(provider.canHandle(value), true, 'the value lane keeps working on second-field values');
  assert.ok(labelsOf(provider.provide(value)).includes('colorloop'), 'effect options must serve');
});
