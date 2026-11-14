import test from 'node:test';
import assert from 'node:assert/strict';
import { signatureHintModel, signatureHintText } from '../../src/completion/signatureHelp.js';

const SNAPSHOT = {
  serviceFields: {
    'light.turn_on': [
      { field: 'entity_id', description: 'The light to turn on', required: true },
      { field: 'brightness_pct', description: 'Brightness percentage', required: false },
      { field: 'color_name', description: '', required: false },
    ],
  },
};

// A service-data-field context: cursor on a key under data:, with the branch state carrying the service.
function serviceCtx(yamlKey) {
  return {
    lang: 'yaml',
    yamlRole: 'key',
    yamlKey,
    pathText: 'tap_action.data',
    yamlPath: ['tap_action', 'data'],
    branchState: { siblings: { perform_action: { value: 'light.turn_on' } } },
  };
}

test('service signature lists fields, marks required + active param, from the live catalog', () => {
  const model = signatureHintModel(serviceCtx('brightness_pct'), SNAPSHOT);
  assert.ok(model, 'returns a model');
  assert.equal(model.kind, 'service');
  assert.equal(model.title, 'light.turn_on');
  assert.equal(signatureHintText(model), 'light.turn_on(entity_id*, [brightness_pct], color_name)');
  assert.equal(model.doc, 'Brightness percentage'); // active param description surfaced
});

test('service signature marks the required param with * and the active one with []', () => {
  const onEntity = signatureHintModel(serviceCtx('entity_id'), SNAPSHOT);
  assert.equal(signatureHintText(onEntity), 'light.turn_on([entity_id*], brightness_pct, color_name)');
});

test('no service-field context, or unknown service, yields null', () => {
  assert.equal(signatureHintModel({ lang: 'yaml', yamlRole: 'key', yamlKey: 'name', yamlPath: ['x'] }, SNAPSHOT), null);
  const unknown = serviceCtx('foo');
  unknown.branchState = { siblings: { perform_action: { value: 'nope.missing' } } };
  assert.equal(signatureHintModel(unknown, SNAPSHOT), null);
});

test('jinja signature labels the active argument from a curated map', () => {
  const states = signatureHintModel({ lang: 'jinja', jinjaArg: { fn: 'states', argIndex: 0 } }, {});
  assert.equal(states.kind, 'jinja');
  assert.equal(signatureHintText(states), 'states([entity_id])');
  const attr = signatureHintModel({ lang: 'jinja', jinjaArg: { fn: 'state_attr', argIndex: 1 } }, {});
  assert.equal(signatureHintText(attr), 'state_attr(entity_id, [attribute])');
  // unknown function -> null
  assert.equal(signatureHintModel({ lang: 'jinja', jinjaArg: { fn: 'made_up_fn', argIndex: 0 } }, {}), null);
});

test('co-tenant: enriching serviceFields rows with schemaValues options does not change the signature', () => {
  // schemaValues adds an `options` array to each service-field row. signatureHelp reads only
  // field/required/description, so its output must be byte-identical with or without options.
  const enriched = {
    serviceFields: {
      'light.turn_on': SNAPSHOT.serviceFields['light.turn_on'].map((f) => ({ ...f, options: [{ value: 'x', label: 'X' }] })),
    },
  };
  assert.equal(
    signatureHintText(signatureHintModel(serviceCtx('brightness_pct'), enriched)),
    signatureHintText(signatureHintModel(serviceCtx('brightness_pct'), SNAPSHOT)),
  );
});

test('fail-dark: hostile/partial/missing input never throws and returns null or empty', () => {
  assert.equal(signatureHintModel(null, SNAPSHOT), null);
  assert.equal(signatureHintModel({ lang: 'yaml' }, null), null);
  assert.equal(signatureHintText(null), '');
  assert.equal(signatureHintText({ title: 'x', params: [] }), '');
  assert.doesNotThrow(() => signatureHintModel(serviceCtx('x'), { serviceFields: 'bad' }));
});
