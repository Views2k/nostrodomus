import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorLifecycleSentinelRuntime } from '../../src/editor/editorLifecycleSentinel.js';

// A page change opens a 2.1 second window and schedules six probes for an editor panel that is
// still mounting. Each probe that found no editor also extended the window and scheduled a 120ms
// retry, so every navigation, including one between two dashboards, ran about thirty probes over
// four seconds. The retry now needs something that can mount an editor: an edit dialog in the
// document or a route with an editor panel.

function makeRuntime({ pathname = '/lovelace/home', dialogCandidates = [] } = {}) {
  const scheduledDelays = [];
  const state = {
    editorSentinelStats: { noEditorRetries: 0 },
    editorSentinelProbeTimers: new Set(),
    editorSentinelDelayedProbeTimers: new Map(),
    editorSentinelObservers: new Map(),
  };
  const rt = createEditorLifecycleSentinelRuntime({
    document: { documentElement: {} },
    window: { addEventListener() {}, removeEventListener() {}, location: { pathname } },
    universalCodeboxEnabled: () => true,
    state,
    setTimeout: (fn, ms) => { scheduledDelays.push(ms); return { fn, ms }; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => ({ fn }),
    cancelAnimationFrame: () => {},
    recordPerformanceEvent: () => {},
    activeEditDialog: () => null,
    editCardDialogCandidates: () => dialogCandidates,
    activeCodeboxStyleEditor: () => null,
    codeboxEditorCacheKey: () => '',
    scheduleCodeboxStyleReapply: () => {},
  });
  // The six probes of the ladder stay pending in the real runtime. Their record is cleared so
  // the assertions see only what a probe schedules.
  const navigate = () => {
    rt.onEditorSurfaceNavigation('spa-navigation');
    scheduledDelays.length = 0;
    state.editorSentinelDelayedProbeTimers.clear();
  };
  return { rt, state, scheduledDelays, navigate };
}

test('after a navigation between dashboards a probe without an editor starts no retry loop', () => {
  const { rt, state, scheduledDelays, navigate } = makeRuntime();
  navigate();
  const windowEnd = state.editorSentinelLikelyOpeningUntil;
  assert.equal(rt.runEditorPresenceProbe('universal-spa-navigation'), false);
  assert.deepEqual(scheduledDelays, [], 'no 120ms retry');
  assert.equal(state.editorSentinelLikelyOpeningUntil, windowEnd, 'the window is not extended');
  assert.ok(!state.editorSentinelOpeningRetryDeadline, 'no four second deadline is armed');
});

test('a navigation to an editor panel route keeps the retry', () => {
  for (const pathname of ['/config/automation/edit/123', '/developer-tools/template', '/config/script/edit/abc']) {
    const { rt, scheduledDelays, navigate } = makeRuntime({ pathname });
    navigate();
    rt.runEditorPresenceProbe('universal-spa-navigation');
    assert.deepEqual(scheduledDelays, [120], pathname);
  }
});

test('an edit dialog in the document keeps the retry after a navigation', () => {
  const { rt, scheduledDelays, navigate } = makeRuntime({ dialogCandidates: [{}] });
  navigate();
  rt.runEditorPresenceProbe('universal-spa-navigation');
  assert.deepEqual(scheduledDelays, [120]);
});

test('a window re-armed by something other than the navigation keeps the retry', () => {
  const { rt, state, scheduledDelays, navigate } = makeRuntime();
  navigate();
  // The companion layer or a mounted editor wrapper re-arms the window with its own deadline.
  state.editorSentinelLikelyOpeningUntil = Date.now() + 900;
  rt.runEditorPresenceProbe('companion-editor-ready');
  assert.deepEqual(scheduledDelays, [120]);
});


// The retry loop was kept on every /config/ and /developer-tools page; only the routes that can
// host an editor need it.
test('Settings and Developer Tools pages without an editor start no retry loop', () => {
  for (const pathname of ['/config/dashboard', '/config/automation/dashboard', '/config/devices/dashboard', '/developer-tools/state', '/developer-tools/yaml', '/config/script/dashboard']) {
    const { rt, scheduledDelays, navigate } = makeRuntime({ pathname });
    navigate();
    scheduledDelays.length = 0;
    rt.runEditorPresenceProbe('after-navigation');
    assert.deepEqual(scheduledDelays, [], pathname);
  }
});