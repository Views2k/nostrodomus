import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxStyleSettle } from '../../src/ui/codebox/codeboxStyleSettle.js';

// After uninstall (the only writer of state.enabled = false), a
// surviving trigger must not be able to re-arm the style reapply lane -- the reapply
// re-injects style nodes and re-installs observers, so uninstall would not stick.
// enabled === undefined (every existing stub harness) must keep scheduling.
function buildSettle(enabled) {
  const state = {
    codeboxStylePendingReasons: new Set(),
    codeboxStyleSettleTimers: new Set(),
    codeboxStyleReapplyRaf: 0,
  };
  if (enabled !== undefined) state.enabled = enabled;
  const rafCalls = [];
  const settle = createCodeboxStyleSettle({
    state,
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: fn => { rafCalls.push(fn); return rafCalls.length; },
    recordPerformanceEvent: () => {},
    styleRangeGroupTouchesSyntax: () => false,
    clearStyleRangeLivePreviewCache: () => {},
    scheduleSourceClassSyntaxRefresh: () => {},
    codeboxStyleSettleReasonCoalesceDecision: () => ({ coalesce: false }),
    codeboxStyleReasonNeedsSettle: () => false,
    maybeSkipSourceClassSteadyStateStyleReapply: () => false,
    applyCodeboxStyleSettings: () => {},
  });
  return { settle, state, rafCalls };
}

test('scheduleCodeboxStyleReapply is dead after uninstall (enabled === false)', () => {
  const { settle, state, rafCalls } = buildSettle(false);
  assert.equal(settle.scheduleCodeboxStyleReapply('style-mutation'), false);
  assert.equal(rafCalls.length, 0, 'no reapply frame may be scheduled after uninstall');
  assert.equal(state.codeboxStylePendingReasons.size, 0, 'no pending reason may be recorded after uninstall');
});

test('scheduleCodeboxStyleReapply still schedules while enabled', () => {
  const { settle, state, rafCalls } = buildSettle(true);
  settle.scheduleCodeboxStyleReapply('style-mutation');
  assert.equal(rafCalls.length, 1);
  assert.equal(state.codeboxStylePendingReasons.has('style-mutation'), true);
});

test('scheduleCodeboxStyleReapply still schedules when enabled is absent (stub states)', () => {
  const { settle, rafCalls } = buildSettle(undefined);
  settle.scheduleCodeboxStyleReapply('style-mutation');
  assert.equal(rafCalls.length, 1);
});
