import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { yamlValueKind as adapterVK } from '../../src/yaml/runtimeContextAdapter.js';
import { yamlValueKind as classifierVK } from '../../src/yaml/yamlContextClassifier.js';

// Value kinds in automation YAML that are easy to lose:
//   - legacy `platform:` triggers complete as trigger types;
//   - `condition:` under a card's `visibility:`, in a legacy singular `condition:` list and under
//     `repeat.while/until` completes as a condition type;
//   - a root-level `action:` (Developer Tools actions, per-step YAML) is a service call, not the
//     dashboard action enum.
// Each case is checked at the columns CodeMirror's auto-indent produces (0/2/4/6), and the two live
// classifier copies (adapter and classifier) must agree at each, so a change cannot land in one only.
const vk = (doc) => detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' }).valueKind;

test('platform: legacy trigger key completes as trigger-type at the under-triggers indents (2/4/6)', () => {
  // A dash indented under triggers: (columns 2/4/6) is where CodeMirror puts it after Enter and a
  // space, or a manual indent. A dash at column 0 (a block sequence at the parent key's own column)
  // is a separate currentYamlPath limitation that the modern `trigger:` has too (the path becomes
  // ["trigger"], not ["triggers","trigger"]); it is pinned below as a known limitation.
  for (const n of [2, 4, 6]) {
    const doc = `triggers:\n${' '.repeat(n)}- platform: `;
    assert.equal(vk(doc), 'trigger-type', `no trigger-type for platform at indent ${n}:\n${doc}`);
  }
});

test('platform: under the legacy singular trigger: key completes as trigger-type', () => {
  // Legacy automations (still supported by Home Assistant) use a singular `trigger:` list key with
  // `- platform: <type>`. The platform key accepts that singular parent as well as `triggers`.
  // Columns 2/4/6, as CodeMirror's auto-indent produces them.
  for (const n of [2, 4, 6]) {
    const doc = `trigger:\n${' '.repeat(n)}- platform: `;
    assert.equal(vk(doc), 'trigger-type', `no trigger-type for the singular platform form at indent ${n}:\n${doc}`);
  }
  // The modern `trigger:` key still requires a plural `triggers:` parent (it must not fire on a bare
  // singular `trigger:` scalar), and a non-automation platform key stays kindless.
  assert.equal(vk('trigger:\n  - trigger: '), '', 'trigger key needs a plural triggers parent');
  assert.equal(vk('sensor:\n  - platform: '), '', 'a non-automation platform: does not over-fire');
});

test('known limitation: a col-0 dash under a key is not seen as nested', () => {
  // Pins the current behavior; when currentYamlPath handles a list at its parent's indent, these
  // change. The modern trigger: is affected the same way, so this is a path scanner limitation.
  assert.equal(vk('triggers:\n- trigger: '), '', 'modern trigger at a col-0 dash: same limitation');
  assert.equal(vk('triggers:\n- platform: '), '', 'legacy platform at a col-0 dash: same limitation');
});

test('condition: completes as condition-type under visibility / legacy list / repeat.while+until', () => {
  const cases = [
    'type: button\nvisibility:\n  - condition: ',      // card visibility block
    'condition:\n  - condition: ',                      // legacy singular condition list
    'repeat:\n  while:\n    - condition: ',             // repeat.while
    'repeat:\n  until:\n    - condition: ',             // repeat.until
    'conditions:\n  - condition: ',                     // modern (control — must stay working)
    'choose:\n  - conditions:\n      - condition: ',    // choose branch (control)
  ];
  for (const doc of cases) assert.equal(vk(doc), 'condition-type', `no condition-type at:\n${doc}`);
});

test('root-level action: completes as a service call, not the dashboard action enum', () => {
  assert.equal(vk('action: '), 'service', 'root action: should be a service (Dev Tools / per-step YAML)');
  assert.equal(vk('action: light.tu'), 'service', 'root action value keeps the service lane');
  // automation step action stays a service; dashboard tap_action.action stays the action enum.
  assert.equal(vk('actions:\n  - action: '), 'service', 'automation step action stays a service');
  assert.equal(vk('type: button\ntap_action:\n  action: '), 'action', 'dashboard tap_action.action stays the action enum');
  assert.equal(vk('type: button\nhold_action:\n  action: '), 'action', 'dashboard hold_action.action stays the action enum');
});

test('the plain trigger, condition and service positions keep their kinds', () => {
  assert.equal(vk('triggers:\n  - trigger: '), 'trigger-type');
  assert.equal(vk('conditions:\n  - condition: '), 'condition-type');
  assert.equal(vk('tap_action:\n  perform_action: '), 'service');
  assert.equal(vk('foo: light.'), 'entity');
});

test('both live classifier copies agree (adapter and classifier)', () => {
  const ctxs = [
    { yamlKey: 'platform', yamlPath: ['triggers'], yamlRole: 'value' },
    { yamlKey: 'condition', yamlPath: ['visibility'], yamlRole: 'value' },
    { yamlKey: 'condition', yamlPath: ['repeat', 'while'], yamlRole: 'value' },
    { yamlKey: 'action', yamlPath: [], yamlRole: 'value' },
    { yamlKey: 'action', yamlPath: ['tap_action'], yamlRole: 'value' },
  ];
  for (const ctx of ctxs) {
    assert.equal(adapterVK(ctx), classifierVK(ctx), `copies diverged for ${JSON.stringify(ctx)}`);
  }
});

test('mode: under a service data block is not the automation run mode', () => {
  // A bare `mode:` must not always be automation-mode, which would filter out a service field's
  // real values (e.g. humidifier.set_mode). Under data: it falls through to the value lane.
  assert.notEqual(vk('actions:\n  - action: humidifier.set_mode\n    data:\n      mode: '), 'automation-mode');
  assert.equal(vk('actions:\n  - action: humidifier.set_mode\n    data:\n      mode: '), '');
  // At automation/script config scope it stays the run-mode.
  assert.equal(vk('alias: t\ntriggers: []\nmode: '), 'automation-mode');
  assert.equal(vk('sequence: []\nmode: '), 'automation-mode');
  // Both live classifier copies agree for mode under data.
  const dataMode = { yamlKey: 'mode', yamlPath: ['actions', 'action', 'data'], yamlRole: 'value' };
  assert.equal(adapterVK(dataMode), classifierVK(dataMode), 'copies diverged for mode under data');
});
