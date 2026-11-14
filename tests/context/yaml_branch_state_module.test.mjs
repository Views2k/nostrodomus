import test from 'node:test';
import assert from 'node:assert/strict';
import * as branchState from '../../src/yaml/yamlBranchState.js';
import { yamlBranchState as yamlBranchStateFromContext, describeYamlCompletionContext } from '../../src/yaml/yamlCompletionContext.js';
import { yamlBranchState as yamlBranchStateFromScanner } from '../../src/yaml/yamlScanner.js';

test('yamlBranchState module matches the public context/scanner export', () => {
  const source = 'action:\n  - service: light.turn_on # keep\n    target:\n      entity_id: light.kitchen\n    data:\n      brightness: 100\n';
  const pos = source.length;
  const fromModule = branchState.yamlBranchState(source, pos);
  assert.deepEqual(yamlBranchStateFromContext(source, pos), fromModule);
  assert.deepEqual(yamlBranchStateFromScanner(source, pos), fromModule);
  assert.equal(fromModule.parentKey, 'action');
  assert.equal(fromModule.parentIndent, 0);
  assert.equal(fromModule.siblings.service.value, 'light.turn_on');
  assert.equal(fromModule.action, 'light.turn_on');
});

test('describeYamlCompletionContext uses the wired YAML branch-state module', () => {
  const source = 'sequence:\n  - action: light.turn_off\n    target:\n      entity_id: light.kitchen\n';
  const ctx = describeYamlCompletionContext(source, source.length);
  assert.equal(ctx.branchState.parentKey, 'action');
  assert.equal(ctx.branchState.parentIndent, 2);
  assert.equal(ctx.branchState.siblings.target.value, '');
});

test('yamlBranchState module handles partial YAML without browser/runtime dependencies', () => {
  const source = 'action:\n  service: light.turn_on # keep\n  data:\n    value: "Status #1" # comment\n';
  const state = branchState.yamlBranchState(source, source.length);
  assert.equal(state.parentKey, 'action');
  assert.equal(state.siblings.service.value, 'light.turn_on');
  assert.equal(state.siblings.data.value, '');
});
