import test from 'node:test';
import assert from 'node:assert/strict';
import { HA_VALUE_PROVIDER_ID } from '../../src/core/runtimeConstants.js';
import {
  haRuntimeValueProvider,
  runtimeRowsForKind,
  isAutomationScriptContext,
  isDashboardActionContext,
  isScalarConfigContext,
  isScalarValueKind,
  yamlBlockValueKeyKind,
  yamlFocusKind,
  yamlPathIncludes,
  yamlPathParts,
  yamlScalarValueKind,
  yamlValueKind,
} from '../../src/providers/haRuntimeProvider.js';

test('yaml path helpers normalize paths without mutating input', () => {
  const ctx = { yamlPath: ['Cards', 12, 'tap_action'] };
  assert.deepEqual(yamlPathParts(ctx), ['cards', '12', 'tap_action']);
  assert.equal(yamlPathIncludes(ctx, ['tap_action']), true);
  assert.equal(yamlPathIncludes(ctx, ['missing']), false);
});

test('dashboard and automation action contexts are separated', () => {
  assert.equal(isDashboardActionContext({ yamlKey: 'action', yamlPath: ['cards', 'tap_action'] }), true);
  assert.equal(isAutomationScriptContext({ yamlKey: 'action', yamlPath: ['automation', 'actions'] }), true);
  assert.equal(yamlValueKind({ lang: 'yaml', yamlKey: 'action', yamlPath: ['cards', 'tap_action'] }), 'action');
  assert.equal(yamlValueKind({ lang: 'yaml', yamlKey: 'action', yamlPath: ['automation', 'actions'] }), 'service');
});

test('value-kind classifier covers runtime and scalar keys', () => {
  assert.equal(yamlValueKind({ yamlKey: 'entity_id', yamlPath: ['target'] }), 'entity');
  assert.equal(yamlValueKind({ yamlKey: 'service' }), 'service');
  assert.equal(yamlValueKind({ yamlKey: 'type', yamlPath: ['triggers'] }), 'trigger-type');
  assert.equal(yamlValueKind({ yamlKey: 'condition', yamlPath: ['choose'] }), 'condition-type');
  assert.equal(yamlValueKind({ yamlKey: 'icon' }), 'icon');
  assert.equal(yamlValueKind({ yamlKey: 'theme' }), 'theme');
  assert.equal(yamlValueKind({ yamlKey: 'show_state' }), 'boolean');
  assert.equal(yamlValueKind({ yamlKey: 'height' }), 'number');
  assert.equal(yamlScalarValueKind({ yamlKey: 'timeout' }), 'duration');
  assert.equal(yamlScalarValueKind({ yamlKey: 'navigation_path' }), 'string');
  assert.equal(yamlValueKind({ yamlRole: 'list-key', yamlPath: ['entities'] }), 'entity');
});

test('scalar context and focus/block classifiers match runtime expectations', () => {
  assert.equal(isScalarValueKind('number'), true);
  assert.equal(isScalarConfigContext({ lang: 'yaml', yamlRole: 'value', yamlKey: 'name' }), true);
  assert.equal(yamlFocusKind({ yamlKey: 'target', yamlPath: ['tap_action'] }), 'target-block');
  assert.equal(yamlFocusKind({ yamlKey: 'styles', yamlPath: ['styles'] }), 'style-block');
  assert.equal(yamlFocusKind({ yamlKey: 'sequence', yamlPath: ['automation', 'sequence'] }), 'automation-action');
  assert.equal(yamlFocusKind({ yamlRole: 'list-key', yamlPath: ['entities'] }), 'entity');
  assert.equal(yamlBlockValueKeyKind({ yamlKey: 'tap_action' }), 'block-key');
  assert.equal(yamlBlockValueKeyKind({ yamlKey: 'unknown' }), '');
});


test('runtimeRowsForKind builds normalized Home Assistant runtime value rows', () => {
  const runtimeData = () => ({
    entities: ['light.kitchen', 'sensor.temp'],
    entityNames: { 'light.kitchen': 'Kitchen Light' },
    services: ['light.turn_on'],
    themes: ['Dark Mode'],
    cards: ['button'],
    icons: ['mdi:home'],
    actions: ['toggle'],
    triggerTypes: ['state'],
    conditionTypes: ['time'],
    automationModes: ['single'],
    booleans: ['true', 'false'],
    scriptActions: ['delay'],
  });

  const entities = runtimeRowsForKind('entity', { runtimeData });
  assert.equal(entities.length, 2);
  assert.deepEqual(
    {
      id: entities[0].id,
      type: entities[0].type,
      label: entities[0].label,
      insert: entities[0].insert,
      source: entities[0].source,
      meta: entities[0].meta,
    },
    {
      id: 'ha.entity.light.kitchen',
      type: 'entity',
      label: 'light.kitchen',
      insert: 'light.kitchen',
      source: HA_VALUE_PROVIDER_ID,
      meta: { domain: 'light', friendly: 'Kitchen Light', sourceDetail: 'Kitchen Light (light)' },
    }
  );

  assert.equal(runtimeRowsForKind('service', { runtimeData })[0].id, 'ha.service.light.turn_on');
  assert.equal(runtimeRowsForKind('card-type', { runtimeData })[0].type, 'card');
  assert.equal(runtimeRowsForKind('icon', { runtimeData })[0].insert, 'mdi:home');
  assert.equal(runtimeRowsForKind('action', { runtimeData })[0].meta.domain, 'action');
  assert.equal(runtimeRowsForKind('theme', { runtimeData })[0].label, 'Dark Mode');
  assert.equal(runtimeRowsForKind('trigger-type', { runtimeData })[0].type, 'trigger');
  assert.equal(runtimeRowsForKind('condition-type', { runtimeData })[0].type, 'condition');
  assert.equal(runtimeRowsForKind('automation-mode', { runtimeData })[0].insert, 'single');
  assert.deepEqual(runtimeRowsForKind('boolean', { runtimeData }).map(item => item.insert), ['true', 'false']);
  assert.equal(runtimeRowsForKind('script-action', { runtimeData })[0].id, 'ha.script_action.delay');
  assert.deepEqual(runtimeRowsForKind('unknown-kind', { runtimeData }), []);
});

test('haRuntimeValueProvider delegates value suggestions through runtimeRowsForKind seam', () => {
  const runtimeData = () => ({
    entities: ['light.kitchen'],
    entityNames: { 'light.kitchen': 'Kitchen Light' },
    services: ['light.turn_on'],
    themes: [],
    cards: [],
    icons: [],
    actions: [],
    triggerTypes: [],
    conditionTypes: [],
    automationModes: [],
    booleans: ['true', 'false'],
    scriptActions: [],
  });

  const provider = haRuntimeValueProvider({ runtimeData });
  assert.equal(provider.canHandle({ lang: 'yaml', yamlRole: 'value', yamlKey: 'entity_id' }), true);
  assert.equal(provider.canHandle({ lang: 'yaml', yamlRole: 'value', yamlKey: 'name' }), false);
  assert.equal(provider.provide({ lang: 'yaml', yamlRole: 'value', yamlKey: 'entity_id' })[0].id, 'ha.entity.light.kitchen');
  assert.equal(provider.provide({ lang: 'yaml', yamlRole: 'value', yamlKey: 'show_state' })[0].id, 'ha.boolean.true');
});
