import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
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
} from '../../src/yaml/yamlContextClassifier.js';

test('YAML context classifier module is pure from browser/runtime globals', () => {
  const text = readFileSync('src/yaml/yamlContextClassifier.js', 'utf8');
  for (const forbidden of ['document', 'window', 'querySelector', 'addEventListener', 'localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'eval(', 'new Function']) {
    assert.equal(text.includes(forbidden), false, `must not reference ${forbidden}`);
  }
});

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

test('registry routing is flag-gated on ctx.registryLaneEnabled', () => {
  // Off (no gate): area_id/device_id/floor_id/label_id fall through to their legacy (no-row) kind,
  // so the engine-off path is byte-identical.
  assert.equal(yamlValueKind({ yamlKey: 'area_id', yamlPath: ['target'] }), '');
  assert.equal(yamlValueKind({ yamlKey: 'device_id' }), '');
  assert.equal(yamlValueKind({ yamlKey: 'floor_id' }), '');
  assert.equal(yamlValueKind({ yamlKey: 'label_id' }), '');

  // On: the gate routes the canonical reference keys to their registry kind.
  assert.equal(yamlValueKind({ yamlKey: 'area_id', yamlPath: ['target'], registryLaneEnabled: true }), 'area');
  assert.equal(yamlValueKind({ yamlKey: 'area', registryLaneEnabled: true }), 'area', 'area: card key routes too');
  assert.equal(yamlValueKind({ yamlKey: 'device_id', registryLaneEnabled: true }), 'device');
  assert.equal(yamlValueKind({ yamlKey: 'floor_id', registryLaneEnabled: true }), 'floor');
  assert.equal(yamlValueKind({ yamlKey: 'label_id', registryLaneEnabled: true }), 'label');

  // The gate never poaches an existing kind: entity_id stays entity even with the lane on.
  assert.equal(yamlValueKind({ yamlKey: 'entity_id', yamlPath: ['target'], registryLaneEnabled: true }), 'entity');
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
