import test from 'node:test';
import assert from 'node:assert/strict';

import { currentYamlPath } from '../../src/yaml/yamlCompletionContext.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { isServiceDataFieldContext } from '../../src/providers/haRuntimeProvider.js';
import { createProviderRuntime } from '../../src/providers/providerRuntime.js';
import { cloneDefaultSettings } from '../../src/core/settings.js';
import { makeHassFixture } from '../fixtures/hassFixture.mjs';
import { isServiceDataFieldKeyContext } from '../../src/completion/scoring.js';

// Auto-indent hole: a CodeMirror editor lands a new line at the previous line's OWN
// column, not one level deeper. So pressing Enter after `target:` (col 4) puts the
// cursor at col 4 -- the key's own column. The sibling-pop treated that as a dedent
// to a sibling and dropped `target` from the path, defeating every downstream lane
// at the exact position real editing produces. These matrices exercise the realistic
// auto-indent column, never only a hand-typed deeper indent.
//
// Rule: completion/context tests MUST include the CM-auto-indent position.
function path(doc) {
  return currentYamlPath(doc, doc.length);
}

// `data:` sits at column 4 in an automation action step; its auto-indent landing is
// column 4. Columns 4 and 6 both open its block; 2 and 0 are real dedents.
const AUTOMATION_DATA = 'actions:\n  - action: light.turn_on\n    data:\n';
const DASHBOARD_TARGET = 'type: button\ntap_action:\n  action: perform-action\n  target:\n';

test('an empty-valued key keeps its block at the auto-indent column and deeper', () => {
  // automation data: (key at col 4)
  assert.deepEqual(path(`${AUTOMATION_DATA}    `), ['actions', 'action', 'data'], 'col4 = auto-indent landing');
  assert.deepEqual(path(`${AUTOMATION_DATA}      `), ['actions', 'action', 'data'], 'col6 = hand-indented deeper');
  assert.deepEqual(path(`${AUTOMATION_DATA}  `), ['actions'], 'col2 dedents out of the list item');
  assert.deepEqual(path(`${AUTOMATION_DATA}`), [], 'col0 dedents to root');

  // dashboard target: (key at col 2)
  assert.deepEqual(path(`${DASHBOARD_TARGET}  `), ['tap_action', 'target'], 'col2 = auto-indent landing');
  assert.deepEqual(path(`${DASHBOARD_TARGET}    `), ['tap_action', 'target'], 'col4 = hand-indented deeper');
  assert.deepEqual(path(`${DASHBOARD_TARGET}`), [], 'col0 dedents to root');
});

test('a partial key typed at the auto-indent column still opens the block', () => {
  assert.deepEqual(path(`${AUTOMATION_DATA}    tr`), ['actions', 'action', 'data']);
  assert.deepEqual(path(`${DASHBOARD_TARGET}  ar`), ['tap_action', 'target']);
});

test('the service-field lane and ranking predicate recover at the auto-indent column', () => {
  const ctx = detectRuntimeContext(`${AUTOMATION_DATA}    `, `${AUTOMATION_DATA}    `.length, { triggerKind: 'explicit' });
  assert.deepEqual(ctx.yamlPath, ['actions', 'action', 'data']);
  assert.equal(isServiceDataFieldContext(ctx), true, '0.1.260 lane must fire at auto-indent');
  assert.equal(isServiceDataFieldKeyContext(ctx), true, '0.1.261 ranking privilege must fire at auto-indent');

  const target = detectRuntimeContext(`${DASHBOARD_TARGET}  `, `${DASHBOARD_TARGET}  `.length, { triggerKind: 'explicit' });
  assert.equal(target.yamlPath[target.yamlPath.length - 1], 'target', 'target leaf must survive auto-indent');
});

test('keep-green: a filled sibling above still pops (the phantom-leaf fix)', () => {
  // The line above the cursor carries a value, so it is a completed sibling, not an
  // open block -- it must still be popped.
  assert.deepEqual(path('data:\n  brightness: 120\n  tr'), ['data']);
  assert.deepEqual(path('actions:\n  - action: light.turn_on\n    data:\n      transition: 1\n      tr'), ['actions', 'action', 'data']);
  // dedent below a filled child clears back out
  assert.deepEqual(path('actions:\n  - action: light.turn_on\n    data:\n      transition: 1\n    '), ['actions', 'action']);
});

test('an empty SCALAR field pops at the auto-indent column (moving to a sibling field)', () => {
  // Typing a field, leaving its value empty, and pressing Enter lands the cursor at the
  // field's own column -- but the user is adding a SIBLING field, not descending into a
  // scalar. Only block-container keys (data/target/...) are descended; a scalar field
  // (transition/brightness_pct/name/...) must pop, or the whole data-field lane dies.
  assert.deepEqual(path('actions:\n  - action: light.turn_on\n    data:\n      transition:\n      '), ['actions', 'action', 'data']);
  assert.deepEqual(path('actions:\n  - action: light.turn_on\n    data:\n      brightness_pct: 50\n      transition:\n      '), ['actions', 'action', 'data']);
  assert.deepEqual(path('type: custom:some-card\nname:\n'), []);
  // a scalar-capable key (columns is also a NUMBER_KEY) is not a container and pops
  assert.deepEqual(path('type: grid\ncolumns:\n'), []);
  // a block container left empty still descends
  assert.deepEqual(path('tap_action:\n  action: perform-action\n  target:\n  '), ['tap_action', 'target']);
});

test('the service-field lane and its rows survive an empty scalar sibling at the auto-indent column', async () => {
  const doc = 'actions:\n  - action: light.turn_on\n    data:\n      transition:\n      ';
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
  assert.deepEqual(ctx.yamlPath, ['actions', 'action', 'data']);
  assert.equal(isServiceDataFieldContext(ctx), true, 'the lane must survive an empty scalar sibling');
  assert.equal(isServiceDataFieldKeyContext(ctx), true);

  const settings = cloneDefaultSettings();
  const runtime = createProviderRuntime({ state: { settings }, window: { hass: makeHassFixture(), localStorage: { getItem: () => null } }, now: () => 1_000 });
  await runtime.loadLibrary();
  const labels = runtime.providerCandidates(detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit', settings })).map(r => r.label);
  assert.ok(labels.includes('brightness_pct:') || labels.includes('rgb_color:'), `service fields must serve, got ${JSON.stringify(labels)}`);
  assert.ok(!labels.includes('wait_for_trigger:') && !labels.includes('choose:'), 'no automation action-step hijack');
});

test('keep-green: block scalars and dash lists are unchanged', () => {
  // an empty line inside an open style scalar stays anchored to its opener
  const scalar = 'card_mod:\n  style: |\n    ha-card { }\n';
  assert.deepEqual(currentYamlPath(scalar, scalar.length), ['card_mod', 'style']);
  // typed dash items keep their list container
  assert.deepEqual(path('entities:\n  - light.kitchen\n  - sen'), ['entities']);
});
