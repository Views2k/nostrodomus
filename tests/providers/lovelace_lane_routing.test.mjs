import test from 'node:test';
import assert from 'node:assert/strict';

import { lovelaceContextProvider } from '../../src/providers/lovelaceContextProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// Lane routing at the provider seam: every cursor position must receive its OWN
// block's rowset. The old ordered if-chain let doc-text sniffing (recent
// "triggers:"/"actions:"/"sequence:") and the tap_action path check outrank the
// data:/target: path checks, so nested data/target blocks inside automations got
// trigger/action-step keys and dashboard target blocks got action-block keys.
// These tests assert rowset IDENTITY through the real pipeline (detectRuntimeContext
// + provider with getDoc/getPos), never scoring order.
function rowsAt(doc) {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
  const provider = lovelaceContextProvider({ getDoc: () => doc, getPos: () => doc.length });
  assert.equal(provider.canHandle(ctx), true, 'key/blank/list-key positions are the provider lane');
  return provider.provide(ctx).map(row => row?.label ?? String(row));
}

const TARGET_KEYS = ['entity_id:', 'device_id:', 'area_id:'];

function assertTargetLane(labels, where) {
  for (const key of TARGET_KEYS) {
    assert.ok(labels.includes(key), `${key} expected in the ${where} target block, got ${JSON.stringify(labels)}`);
  }
  assert.ok(!labels.includes('wait_for_trigger:'), `action-step keys must not leak into the ${where} target block`);
  assert.ok(!labels.includes('platform:'), `trigger keys must not leak into the ${where} target block`);
  assert.ok(!labels.includes('perform_action:'), `dashboard action keys must not leak into the ${where} target block`);
}

test('automation target: a blank first key serves the target rowset', () => {
  assertTargetLane(rowsAt('actions:\n  - action: light.turn_on\n    target:\n      '), 'automation');
});

test('automation target: the second key keeps the target rowset', () => {
  assertTargetLane(rowsAt('actions:\n  - action: light.turn_on\n    target:\n      entity_id: light.kitchen\n      ar'), 'automation');
});

test('automation target: triggers earlier in the document must not hijack the block', () => {
  const doc = 'triggers:\n  - trigger: state\n    entity_id: binary_sensor.motion\n    to: "on"\nactions:\n  - action: light.turn_on\n    target:\n      ';
  assertTargetLane(rowsAt(doc), 'full-document automation');
});

test('CM auto-indent: target and data lanes route correctly at the opener own column', () => {
  // Enter after `target:`/`data:` lands the cursor at the KEY'S own column (not a level
  // deeper) -- the position real editing produces. The lanes must route there, not only
  // at a hand-typed deeper indent.
  assertTargetLane(rowsAt('actions:\n  - action: light.turn_on\n    target:\n    '), 'automation target auto-indent');
  assertTargetLane(rowsAt('triggers:\n  - trigger: state\nactions:\n  - action: light.turn_on\n    target:\n    '), 'automation target auto-indent under triggers');
  assertTargetLane(rowsAt('type: button\ntap_action:\n  action: perform-action\n  target:\n  '), 'dashboard target auto-indent');
  const autoData = rowsAt('actions:\n  - action: light.turn_on\n    data:\n    ');
  assert.ok(autoData.includes('message:'), `data-block rows at the auto-indent column, got ${JSON.stringify(autoData)}`);
  assert.ok(!autoData.includes('wait_for_trigger:') && !autoData.includes('platform:'), 'no trigger/action-step hijack at the auto-indent column');
});

test('script sequence target: the target rowset serves under sequence steps', () => {
  assertTargetLane(rowsAt('sequence:\n  - action: light.turn_off\n    target:\n      '), 'script');
});

test('automation data: data rows serve; trigger and action-step keys are absent', () => {
  const labels = rowsAt('actions:\n  - action: light.turn_on\n    data:\n      ');
  assert.ok(labels.includes('message:') && labels.includes('title:'), `service-agnostic data-block rows expected, got ${JSON.stringify(labels)}`);
  assert.ok(!labels.includes('wait_for_trigger:'), 'action-step keys must not leak into a data block');
  assert.ok(!labels.includes('platform:') && !labels.includes('id:'), 'trigger keys must not leak into a data block');
});

test('automation data: triggers earlier in the document must not hijack the block', () => {
  const doc = 'triggers:\n  - trigger: state\n    entity_id: binary_sensor.motion\n    to: "on"\nactions:\n  - action: light.turn_on\n    data:\n      ';
  const labels = rowsAt(doc);
  assert.ok(labels.includes('message:'), `data-block rows expected, got ${JSON.stringify(labels)}`);
  assert.ok(!labels.includes('platform:') && !labels.includes('at:'), 'trigger keys must not leak into a data block');
});

test('dashboard tap_action target: blank and typed positions serve the target rowset', () => {
  const base = 'type: button\ntap_action:\n  action: perform-action\n  perform_action: light.turn_on\n  target:\n    ';
  assertTargetLane(rowsAt(base), 'dashboard');
  assertTargetLane(rowsAt(`${base}entity_id: light.kitchen\n    ar`), 'dashboard');
  const labels = rowsAt(base);
  assert.ok(!labels.includes('navigation_path:'), 'the action-block rowset must not serve inside target:');
  // Deep/list positions under target carry a target-block branch state while the
  // path leaf is entity_id -- the branch-state limb alone keeps action rows out.
  assertTargetLane(rowsAt('type: button\ntap_action:\n  action: perform-action\n  target:\n    entity_id:\n      - '), 'dashboard entity-list');
});

// ---- keep-green pins: the lanes the fix must NOT move ----

test('keep-green: top-level automation/script steps keep the action-step rowset', () => {
  for (const doc of ['actions:\n  - ', 'actions:\n  - action: light.turn_on\n    ', 'sequence:\n  - ']) {
    const labels = rowsAt(doc);
    for (const key of ['wait_for_trigger:', 'choose:', 'response_variable:', 'target:', 'data:']) {
      assert.ok(labels.includes(key), `${key} expected at a step position, got ${JSON.stringify(labels)}`);
    }
    assert.ok(!labels.includes('device_id:'), 'target rows must not replace the step rowset');
  }
});

test('keep-green: trigger and condition steps keep their rowsets', () => {
  const trigger = rowsAt('triggers:\n  - trigger: state\n    ');
  assert.ok(trigger.includes('platform:') && trigger.includes('at:'), `trigger rows expected, got ${JSON.stringify(trigger)}`);
  const condition = rowsAt('conditions:\n  - ');
  assert.ok(condition.includes('above:') && condition.includes('below:'), `condition rows expected, got ${JSON.stringify(condition)}`);
  // event_data ends in "data" but is a trigger child: only exact segment matching
  // keeps it in the trigger lane (an endsWith check would hijack it to data rows).
  const eventData = rowsAt('triggers:\n  - trigger: event\n    event_type: my_event\n    event_data:\n      ');
  assert.ok(eventData.includes('platform:'), `event_data under a trigger stays in the trigger lane, got ${JSON.stringify(eventData)}`);
  assert.ok(!eventData.includes('message:'), 'data rows must not hijack event_data');
});

test('keep-green: tap_action key positions keep the branch-state action rowset', () => {
  const open = rowsAt('type: button\ntap_action:\n  ');
  for (const key of ['action:', 'perform_action:', 'navigation_path:', 'target:']) {
    assert.ok(open.includes(key), `${key} expected at the tap_action key position, got ${JSON.stringify(open)}`);
  }
  const chosen = rowsAt('type: button\ntap_action:\n  action: perform-action\n  ');
  assert.ok(chosen.includes('perform_action:') && chosen.includes('target:'), `branch keys expected, got ${JSON.stringify(chosen)}`);
  assert.ok(!chosen.includes('action:'), 'the already-chosen action key stays filtered');
});

test('keep-green: root card keys and entities lists are untouched', () => {
  const root = rowsAt('ty');
  assert.ok(root.includes('type:') && root.includes('card_mod:'), `card keys expected at root, got ${JSON.stringify(root.slice(0, 8))}`);
  assert.ok(!root.includes('wait_for_trigger:'), 'automation step keys must not serve at card root');
  const entities = rowsAt('entities:\n  - ');
  assert.ok(entities.includes('secondary_info:'), `entity-row keys expected, got ${JSON.stringify(entities)}`);
});

test('keep-green: root-level data/target blocks keep their 0.1.260 rowsets', () => {
  const data = rowsAt('data:\n  message: hi\n  ti');
  assert.ok(data.includes('title:') && !data.includes('type:'), `data rows expected, got ${JSON.stringify(data)}`);
  assertTargetLane(rowsAt('target:\n  entity_id: light.kitchen\n  ar'), 'root-level');
});

// The recent-text fallback must line-anchor block keys. A bare recent.includes("triggers:")
// matched the word inside a string value and mis-routed the whole block to the trigger/action lane.
test('a block-key word inside a string value does not hijack the fallback lane', () => {
  const nameWithTriggers = rowsAt('type: entities\nname: "set up your triggers: here"\n');
  assert.ok(!nameWithTriggers.includes('platform:'), `"triggers:" inside a value must not serve trigger rows, got ${JSON.stringify(nameWithTriggers.slice(0, 8))}`);
  const titleWithActions = rowsAt('type: markdown\ntitle: "actions: a how-to"\n');
  assert.ok(!titleWithActions.includes('wait_for_trigger:'), `"actions:" inside a value must not serve action-step rows, got ${JSON.stringify(titleWithActions.slice(0, 8))}`);
  // A real block opener at line start still routes through the same fallback.
  assert.ok(rowsAt('triggers:\n  - trigger: state\n    ').includes('platform:'), 'a real triggers: opener still serves trigger rows');
});
