// APPLY-ON-OPEN: the no-editor recovery heartbeat. On 2026.6 the wa-dialog opens 0-sized, so the
// codebox fails the visible-candidate gate at open-time and discovery returns null; the recovery loop used
// to dead-end (no reschedule, no reapply) so the chrome only landed on the first CLICK. The runtime keeps the
// discovery loop alive across the dialog's async settle (a bounded 120ms heartbeat) so the instant the
// editor sizes to a candidate it is found → chrome applies ON OPEN. CM-gated (no chrome with no editor),
// form-field skip untouched (it lives upstream in activeCodeboxStyleEditor), wall-clock ceiling (no spin).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorLifecycleSentinelRuntime } from '../../src/editor/editorLifecycleSentinel.js';

function makeRuntime({ editor = null, dialogCandidates = [], activeDialog = null } = {}) {
  const scheduledDelays = [];
  const reapplyReasons = [];
  let currentEditor = editor;
  const state = {
    editorSentinelStats: { noEditorRetries: 0 },
    editorSentinelProbeTimers: new Set(),
    editorSentinelDelayedProbeTimers: new Map(),
    editorSentinelObservers: new Map(),
  };
  const rt = createEditorLifecycleSentinelRuntime({
    document: { documentElement: {} },
    window: { addEventListener() {}, removeEventListener() {} },
    universalCodeboxEnabled: () => true,
    state,
    setTimeout: (fn, ms) => { scheduledDelays.push(ms); return { fn, ms }; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => ({ fn }),
    cancelAnimationFrame: () => {},
    recordPerformanceEvent: () => {},
    activeEditDialog: () => activeDialog,
    editCardDialogCandidates: () => dialogCandidates,
    activeCodeboxStyleEditor: () => currentEditor,
    codeboxEditorCacheKey: () => '',
    scheduleCodeboxStyleReapply: (reason) => { reapplyReasons.push(reason); },
  });
  return { rt, state, scheduledDelays, reapplyReasons, setEditor: (e) => { currentEditor = e; } };
}

const editorStub = () => ({ querySelector: () => null });

test('no editor while a card dialog is opening: arms a bounded heartbeat + wall-clock deadline, applies NO chrome (CM-gated)', () => {
  const { rt, state, scheduledDelays, reapplyReasons } = makeRuntime({ editor: null, dialogCandidates: [{}] });
  const before = Date.now();
  assert.equal(rt.runEditorPresenceProbe('open'), false, 'no editor yet → false');
  assert.ok(scheduledDelays.includes(120), 'reschedules the 120ms discovery heartbeat across the settle');
  assert.ok(state.editorSentinelOpeningRetryDeadline >= before + 3900, 'armed a ~4s wall-clock ceiling');
  assert.ok(state.editorSentinelOpeningRetryDeadline <= Date.now() + 4000, 'ceiling is bounded, not unbounded');
  assert.equal(reapplyReasons.length, 0, 'NO chrome applied while there is no codebox editor (CM-gated)');
});

test('the heartbeat finds the now-settled editor and applies chrome ON OPEN — no pointer event', () => {
  const { rt, state, reapplyReasons, setEditor } = makeRuntime({ editor: null, dialogCandidates: [{}] });
  rt.runEditorPresenceProbe('open');           // 0-sized phase: no editor
  assert.equal(reapplyReasons.length, 0);
  setEditor(editorStub());                       // wa-dialog settles → editor becomes a candidate
  assert.equal(rt.runEditorPresenceProbe('no-editor-opening-retry'), true, 'editor found on a heartbeat tick');
  assert.ok(reapplyReasons.some((r) => /editor-sentinel-new/.test(r)), 'chrome applied via the detection path, with NO click');
  assert.equal(state.editorSentinelOpeningRetryDeadline, 0, 'deadline cleared once the editor is found');
});

test('bounded: past the deadline the heartbeat stops rescheduling (a codeboxless visual tab cannot spin)', () => {
  const { rt, state, scheduledDelays } = makeRuntime({ editor: null, dialogCandidates: [{}] });
  state.editorSentinelOpeningRetryDeadline = Date.now() - 1; // ceiling already elapsed
  rt.runEditorPresenceProbe('no-editor-opening-retry');
  assert.ok(!scheduledDelays.includes(120), 'no new heartbeat once the ceiling has elapsed');
});

test('no dialog present: no heartbeat, and the deadline is cleared', () => {
  const { rt, state, scheduledDelays } = makeRuntime({ editor: null, dialogCandidates: [], activeDialog: null });
  state.editorSentinelOpeningRetryDeadline = 999999; // stale
  rt.runEditorPresenceProbe('idle');
  assert.ok(!scheduledDelays.includes(120), 'no heartbeat when no card dialog is opening');
  assert.equal(state.editorSentinelOpeningRetryDeadline, 0, 'stale deadline cleared');
});

// The 4 second ceiling belongs to one opening. It was only cleared by a probe that found an editor or
// found nothing opening, and no probe runs when a dialog closes on the visual tab or a panel never
// mounts an editor. The next opening then started with a ceiling that had already run out, so its
// heartbeat never ran. A new opening is announced by a mutation that adds something an editor can
// live in, or by a navigation.
function makeObservedRuntime({ pathname = '/lovelace/home', dialogCandidates = [{}] } = {}) {
  const scheduledDelays = [];
  const frames = [];
  const observers = [];
  class MockMutationObserver {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  const state = {
    editorSentinelStats: { noEditorRetries: 0 },
    editorSentinelProbeTimers: new Set(),
    editorSentinelDelayedProbeTimers: new Map(),
    editorSentinelObservers: new Map(),
  };
  const rt = createEditorLifecycleSentinelRuntime({
    document: { documentElement: { querySelector: () => null, querySelectorAll: () => [] } },
    window: { addEventListener() {}, removeEventListener() {}, location: { pathname } },
    universalCodeboxEnabled: () => true,
    state,
    MutationObserver: MockMutationObserver,
    setTimeout: (fn, ms) => { scheduledDelays.push(ms); return { fn, ms }; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    recordPerformanceEvent: () => {},
    activeEditDialog: () => null,
    editCardDialogCandidates: () => dialogCandidates,
    activeCodeboxStyleEditor: () => null,
    codeboxEditorCacheKey: () => '',
    homeRoot: () => null,
  });
  rt.refreshEditorSentinelRoots('test-boot');
  const runFrames = () => { for (const fn of frames.splice(0)) fn(); };
  const resetSchedule = () => { scheduledDelays.length = 0; state.editorSentinelDelayedProbeTimers.clear(); };
  return { rt, state, scheduledDelays, observer: observers[0], runFrames, resetSchedule };
}

const dialogAdded = () => [{ target: {}, addedNodes: [{ nodeType: 1, localName: 'ha-dialog', matches: (s) => String(s).includes('ha-dialog'), querySelector: () => null }], removedNodes: [] }];
const plainAdded = () => [{ target: {}, addedNodes: [{ nodeType: 1, localName: 'div', matches: () => false, querySelector: () => null }], removedNodes: [] }];

test('a ceiling that ran out in an earlier opening is re-armed when a dialog or an editor host is added', () => {
  const { rt, state, scheduledDelays, observer, runFrames, resetSchedule } = makeObservedRuntime();
  state.editorSentinelOpeningRetryDeadline = Date.now() - 5000; // left over from the previous opening
  rt.runEditorPresenceProbe('stale');
  assert.ok(!scheduledDelays.includes(120), 'the old ceiling still bounds a probe that nothing announced');
  resetSchedule();

  observer.cb(dialogAdded());   // the dialog opens again
  runFrames();                  // the probe the mutation scheduled
  assert.ok(state.editorSentinelOpeningRetryDeadline > Date.now() + 3000, 'a fresh 4 second ceiling');
  assert.ok(scheduledDelays.includes(120), 'the heartbeat runs for the new opening');
});

test('a mutation that adds no editor host leaves a ceiling that ran out alone', () => {
  const { state, scheduledDelays, observer, runFrames } = makeObservedRuntime();
  const stale = Date.now() - 5000;
  state.editorSentinelOpeningRetryDeadline = stale;
  observer.cb(plainAdded());
  runFrames();
  assert.equal(state.editorSentinelOpeningRetryDeadline, stale, 'the visual editor tab stays bounded');
  assert.ok(!scheduledDelays.includes(120));
});

test('a ceiling that is still running is not extended by further mounts', () => {
  const { state, observer } = makeObservedRuntime();
  const running = Date.now() + 1500;
  state.editorSentinelOpeningRetryDeadline = running;
  observer.cb(dialogAdded());
  assert.equal(state.editorSentinelOpeningRetryDeadline, running, 'one opening keeps one 4 second window');
});

test('a navigation starts a new opening: a ceiling from the previous page does not stop its heartbeat', () => {
  const { rt, state, scheduledDelays, resetSchedule } = makeObservedRuntime({ pathname: '/config/automation/edit/123', dialogCandidates: [] });
  state.editorSentinelOpeningRetryDeadline = Date.now() - 5000;
  rt.onEditorSurfaceNavigation('spa-navigation');
  resetSchedule();
  rt.runEditorPresenceProbe('universal-spa-navigation');
  assert.deepEqual(scheduledDelays, [120], 'the 120ms retry runs on the editor route');
  assert.ok(state.editorSentinelOpeningRetryDeadline > Date.now() + 3000);
});
