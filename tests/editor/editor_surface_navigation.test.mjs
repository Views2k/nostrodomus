// Universal — on-open convergence for non-card-dialog panel editors.
// Guards onEditorSurfaceNavigation: when style.universalCodebox is on, an SPA route change
// arms a time-boxed opening window + a bounded settle-probe ladder so the panel editor styles
// on open (no click); when the flag is off it is a strict no-op (dialog-only behavior).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorLifecycleSentinelRuntime } from '../../src/editor/editorLifecycleSentinel.js';

function makeRuntime({ enabled = true } = {}) {
  const scheduledDelays = [];
  const state = {
    editorSentinelStats: {},
    editorSentinelProbeTimers: new Set(),
    editorSentinelDelayedProbeTimers: new Map(),
  };
  const rt = createEditorLifecycleSentinelRuntime({
    document: { documentElement: {} },
    window: { addEventListener() {}, removeEventListener() {} },
    universalCodeboxEnabled: () => enabled,
    state,
    setTimeout: (fn, ms) => { scheduledDelays.push(ms); return { fn, ms }; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => ({ fn }),
    cancelAnimationFrame: () => {},
    recordPerformanceEvent: () => {},
  });
  return { rt, state, scheduledDelays };
}

test('onEditorSurfaceNavigation (enabled) arms the opening window + the bounded probe ladder', () => {
  const { rt, state, scheduledDelays } = makeRuntime({ enabled: true });
  const before = Date.now();
  const result = rt.onEditorSurfaceNavigation('spa-navigation');
  assert.equal(result, true);
  // time-boxed opening window in the near future (so the no-editor backoff/teardown are paused)
  assert.ok(state.editorSentinelLikelyOpeningUntil >= before + 2000, 'opening window armed ~2.1s out');
  assert.ok(state.editorSentinelLikelyOpeningUntil <= Date.now() + 2100, 'window is bounded, not unbounded');
  // a bounded ladder of settle probes — exactly these delays, nothing unbounded
  assert.deepEqual(scheduledDelays, [60, 200, 450, 900, 1500, 2000]);
  assert.equal(state.editorSentinelStats.universalNavigations, 1);
});

test('onEditorSurfaceNavigation is a no-op when universalCodebox is off', () => {
  const { rt, state, scheduledDelays } = makeRuntime({ enabled: false });
  const result = rt.onEditorSurfaceNavigation('spa-navigation');
  assert.equal(result, false);
  assert.equal(state.editorSentinelLikelyOpeningUntil, undefined, 'no opening window when the flag is off');
  assert.equal(scheduledDelays.length, 0, 'no probes scheduled when the flag is off');
});

test('install/uninstall add and remove the SPA-navigation window listeners', () => {
  const added = [];
  const removed = [];
  const win = {
    addEventListener: (type) => added.push(type),
    removeEventListener: (type) => removed.push(type),
  };
  const state = {
    editorSentinelStats: {},
    editorSentinelProbeTimers: new Set(),
    editorSentinelDelayedProbeTimers: new Map(),
    editorSentinelObservers: new Map(),
  };
  const rt = createEditorLifecycleSentinelRuntime({
    document: { documentElement: {} },
    window: win,
    universalCodeboxEnabled: () => true,
    state,
    // MutationObserver stub so refreshEditorSentinelRoots (called by install) does not throw
    MutationObserver: class { observe() {} disconnect() {} takeRecords() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    homeRoot: () => null,
    recordPerformanceEvent: () => {},
  });

  rt.installEditorLifecycleSentinel('test-install');
  assert.deepEqual(added, ['location-changed', 'popstate', 'hashchange'], 'navigation listeners installed');

  rt.uninstallEditorLifecycleSentinel('test-uninstall');
  assert.deepEqual(removed, ['location-changed', 'popstate', 'hashchange'], 'navigation listeners removed on uninstall');
});
