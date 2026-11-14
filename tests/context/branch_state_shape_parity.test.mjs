import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { serviceIdFromContext } from '../../src/providers/haRuntimeProvider.js';
import { lovelaceContextProvider } from '../../src/providers/lovelaceContextProvider.js';

// branchState shape parity: dashboardActionBranchState emits a `kind` for dashboard
// tap_action shapes but its automation/script fallback returned a kind-less shape, so
// any consumer dispatching on branchState.kind was structurally dead in the automation
// lane. This unifies the shape (kind always present) WITHOUT changing the rows either
// lane serves -- the dual-path rule: the kind limb is mutation-covered in BOTH lanes.
// Cursors sit at the CM auto-indent column (blank line at the opener's own column).
function ctxAt(doc) {
  return detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
}

function rowsAt(doc) {
  const provider = lovelaceContextProvider({ getDoc: () => doc, getPos: () => doc.length });
  const ctx = ctxAt(doc);
  return provider.provide(ctx).map(row => row?.label ?? String(row));
}

// dashboard tap_action (kind present today) and automation action step (kindless today).
const DASH_ACTION = 'type: button\ntap_action:\n  action: light.turn_on\n  ';
const DASH_TARGET = 'type: button\ntap_action:\n  action: light.turn_on\n  target:\n    ';
const AUTO_ACTION = 'actions:\n  - action: light.turn_on\n    ';
const AUTO_TARGET = 'actions:\n  - action: light.turn_on\n    target:\n    ';

test('action-block kind is present in both the dashboard and automation lanes', () => {
  assert.equal(ctxAt(DASH_ACTION).branchState?.kind, 'action-block', 'dashboard action step');
  assert.equal(ctxAt(AUTO_ACTION).branchState?.kind, 'action-block', 'automation action step');
});

test('target-block kind is present in both lanes', () => {
  assert.equal(ctxAt(DASH_TARGET).branchState?.kind, 'target-block', 'dashboard target');
  assert.equal(ctxAt(AUTO_TARGET).branchState?.kind, 'target-block', 'automation target');
});

test('the preserved fields keep serviceIdFromContext working across the unification', () => {
  for (const doc of [DASH_ACTION, DASH_TARGET, AUTO_ACTION, AUTO_TARGET]) {
    assert.equal(serviceIdFromContext(ctxAt(doc)), 'light.turn_on', `serviceId for ${JSON.stringify(doc)}`);
  }
});

test('dual-lane row parity: the kind unification does not change the rows either lane serves', () => {
  // automation action step keeps its automation vocab, NOT dashboard action keys --
  // the consumer guard must require the dashboard-only missingKeys array.
  const auto = rowsAt(AUTO_ACTION);
  assert.ok(auto.includes('choose:'), `automation step keeps automation vocab, got ${JSON.stringify(auto)}`);
  assert.ok(!auto.includes('navigation_path:'), 'dashboard-only keys must not leak into the automation step');

  // dashboard action step keeps its dashboard action-block rows (the filtered lane).
  const dash = rowsAt(DASH_ACTION);
  assert.ok(dash.includes('perform_action:') || dash.includes('navigation_path:'), `dashboard action keys expected, got ${JSON.stringify(dash)}`);
});
