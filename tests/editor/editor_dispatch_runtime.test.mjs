import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEditorDispatchRuntime,
  EDITOR_DISPATCH_REPEAT_PRESSURE_MS,
} from '../../src/editor/editorDispatchRuntime.js';

test('editor dispatch runtime owns view memory and post-dispatch hot path', () => {
  const calls = [];
  let now = 1000;
  const state = {
    settings: { keepOpen: true },
    view: null,
    hookedView: null,
    originalDispatch: null,
  };
  const view = {
    dom: { nodeType: 1, getBoundingClientRect: () => ({ width: 100, height: 40 }), getRootNode: () => ({}) },
    state: {
      doc: { length: 3, toString: () => 'abc' },
      selection: { main: { anchor: 1, head: 1 } },
    },
    coordsAtPos: () => ({ left: 0, top: 0, bottom: 10 }),
    dispatch(change) {
      calls.push(['original', change]);
      this.state = {
        doc: { length: 4, toString: () => 'abcd' },
        selection: { main: { anchor: 2, head: 2 } },
      };
      return 'ok';
    },
  };
  const runtime = createEditorDispatchRuntime({
    state,
    now: () => now,
    recordPerformanceEvent: (...args) => calls.push(['perf', ...args]),
    recordRuntimeErrorOnce: (...args) => calls.push(['error', ...args]),
    logDebug: (...args) => calls.push(['debug', ...args]),
    codeboxEditorCacheKey: () => 'editor-a',
    scheduleCodeboxStyleReapply: reason => calls.push(['style', reason]),
    scheduleDiagnosticsRefresh: reason => calls.push(['diagnostics', reason]),
    activeContextDiagnosticsSection: () => true,
    typingSessionOwnsEditorDispatchSettling: () => false,
    enterTypingSession: (candidate, reason) => calls.push(['typing', candidate === view, reason]),
    updateSnippetSessionAfterDispatch: (candidate, oldLen, oldSel) => calls.push(['snippet', candidate === view, oldLen, oldSel]),
    requestLiveUpdate: () => calls.push(['live-update']),
    popupIsOpen: () => false,
    setTimeout: _fn => { calls.push(['timer-set']); return 7; },
    clearTimeout: id => calls.push(['timer-clear', id]),
  });

  assert.equal(runtime.hookDispatch(view), true);
  assert.equal(state.hookedView, view);
  assert.equal(view.dispatch({ changes: true }), 'ok');

  assert.deepEqual(calls.find(row => row[0] === 'snippet')?.slice(0, 3), ['snippet', true, 3]);
  assert.deepEqual(calls.find(row => row[0] === 'typing'), ['typing', true, 'editor-dispatch']);
  assert.ok(calls.some(row => row[0] === 'style' && row[1] === 'editor-dispatch'));
  assert.ok(calls.some(row => row[0] === 'diagnostics' && row[1] === 'editor-dispatch'));
  assert.ok(calls.some(row => row[0] === 'live-update'));
});

test('editor dispatch runtime owns repeat-pressure quiet telemetry', () => {
  const calls = [];
  let now = 1000;
  const state = { settings: {}, editorDispatchLastDocChangeAt: 960 };
  let timerFn = null;
  const runtime = createEditorDispatchRuntime({
    state,
    now: () => now,
    runtimeCoordinator: { markQuiet: (...args) => calls.push(['quiet', ...args]) },
    recordPerformanceEvent: (...args) => calls.push(['perf', ...args]),
    codeboxEditorCacheKey: () => 'editor-b',
    scheduleCodeboxStyleReapply: reason => calls.push(['style', reason]),
    scheduleDiagnosticsRefresh: reason => calls.push(['diagnostics', reason]),
    activeContextDiagnosticsSection: () => true,
    typingSessionOwnsEditorDispatchSettling: () => false,
    setTimeout: fn => { timerFn = fn; return 9; },
    clearTimeout: id => calls.push(['clear', id]),
  });

  assert.equal(runtime.noteEditorDispatchRepeatPressure({ dom: {} }, 5, 6), true);
  assert.equal(state.editorDispatchRepeatPressureUntil, 1000 + EDITOR_DISPATCH_REPEAT_PRESSURE_MS);
  assert.ok(runtime.editorDispatchRepeatPressureActive(1001));
  assert.ok(calls.some(row => row[0] === 'quiet' && row[1] === 'editor-input'));
  assert.equal(runtime.shouldQuietEditorDispatchTelemetryEvent('active-editor-cache-hit', 0), true);
  runtime.quietEditorDispatchTelemetryEvent('active-editor-cache-hit', 'cached');

  now = state.editorDispatchRepeatPressureUntil + 50;
  timerFn();
  assert.ok(calls.some(row => row[0] === 'perf' && row[1] === 'editor-dispatch-repeat-pressure-quieted'));
  assert.ok(calls.some(row => row[0] === 'diagnostics' && row[1] === 'editor-dispatch-repeat-pressure-quiet'));
  assert.ok(calls.some(row => row[0] === 'style' && row[1] === 'editor-dispatch-repeat-pressure-quiet'));
});

test('Bug 3 regression: unhookDispatch clears the armed repeat-pressure flush timer (no post-teardown fire)', () => {
  const cleared = [];
  const state = { settings: {}, hookedView: null, originalDispatch: null };
  const runtime = createEditorDispatchRuntime({
    state,
    now: () => 1000,
    recordPerformanceEvent: () => {},
    recordRuntimeErrorOnce: () => {},
    codeboxEditorCacheKey: () => 'editor-c',
    scheduleCodeboxStyleReapply: () => {},
    scheduleDiagnosticsRefresh: () => {},
    activeContextDiagnosticsSection: () => false,
    typingSessionOwnsEditorDispatchSettling: () => false,
    setTimeout: () => 99,
    clearTimeout: id => cleared.push(id),
  });
  // Arm the repeat-pressure flush timer through the real scheduling path.
  runtime.scheduleEditorDispatchRepeatPressureFlush();
  assert.equal(state.editorDispatchRepeatPressureFlushTimer, 99, 'flush timer armed');
  // Teardown must cancel it, or it later fires scheduleCodeboxStyleReapply/scheduleDiagnosticsRefresh
  // against a torn-down view.
  runtime.unhookDispatch();
  assert.deepEqual(cleared, [99], 'teardown clears the armed flush timer');
  assert.equal(state.editorDispatchRepeatPressureFlushTimer, 0, 'and resets the handle');
});

// --- breadcrumbs are for the diagnostics readers; with diagnostics off none is built ---
function breadcrumbHarness(diagnosticsRecording) {
  let now = 1000;
  let isoDates = 0;
  const state = { settings: {}, view: null, hookedView: null, originalDispatch: null };
  const calls = [];
  let flush = null;
  const deps = {
    state,
    now: () => now,
    recordPerformanceEvent: (...args) => calls.push(['perf', ...args]),
    codeboxEditorCacheKey: () => { calls.push(['cache-key']); return 'editor-d'; },
    scheduleCodeboxStyleReapply: reason => calls.push(['style', reason]),
    scheduleDiagnosticsRefresh: reason => calls.push(['diagnostics', reason]),
    enterTypingSession: () => calls.push(['typing']),
    setTimeout: (fn) => { flush = fn; return 5; },
    clearTimeout: () => {},
  };
  if (diagnosticsRecording) deps.diagnosticsRecording = diagnosticsRecording;
  const runtime = createEditorDispatchRuntime(deps);
  let docLength = 3;
  const view = {
    dom: {},
    state: { doc: { length: docLength }, selection: { main: { anchor: 1, head: 1 } } },
    coordsAtPos: () => ({ left: 0, top: 0, bottom: 10 }),
    dispatch(change) {
      if (change.typed) {
        docLength += 1;
        this.state = { doc: { length: docLength }, selection: { main: { anchor: docLength, head: docLength } } };
      }
      return 'ok';
    },
  };
  runtime.hookDispatch(view);
  const originalToISOString = Date.prototype.toISOString;
  const run = (fn) => {
    Date.prototype.toISOString = function toISOString() { isoDates += 1; return originalToISOString.call(this); };
    try { fn(); } finally { Date.prototype.toISOString = originalToISOString; }
  };
  const type = (times) => run(() => {
    for (let i = 0; i < times; i += 1) { now += 30; view.dispatch({ typed: true }); }
  });
  const moveCursor = () => run(() => { now += 30; view.dispatch({ selection: true }); });
  const quiet = () => run(() => runtime.quietEditorDispatchTelemetryEvent('active-editor-cache-hit', 'cached'));
  const runFlush = () => run(() => { now = state.editorDispatchRepeatPressureUntil + 50; flush(); });
  return { state, calls, type, moveCursor, quiet, runFlush, isoDates: () => isoDates };
}

const BREADCRUMBS = [
  'lastEditorDispatchQuietTelemetry',
  'lastEditorDispatchRepeatPressure',
  'lastEditorDispatchRepeatPressureImmediateSkip',
  'lastEditorDispatchHotpathSkip',
  'lastEditorDispatchRepeatPressureFlush',
];

test('with diagnostics off, typing builds no breadcrumb object and no ISO date', () => {
  const h = breadcrumbHarness(() => false);
  h.type(6);
  h.moveCursor();
  h.quiet();
  h.runFlush();

  for (const name of BREADCRUMBS) assert.equal(h.state[name], undefined, `${name} must not be built`);
  assert.equal(h.isoDates(), 0);
  assert.equal(h.calls.filter(row => row[0] === 'cache-key').length, 0, 'the editor key is only looked up for the breadcrumb');

  // What typing does is unchanged: counters, quiet window, scheduling, telemetry calls.
  assert.equal(h.state.editorDispatchRepeatPressureChangeCount, 5);
  assert.equal(h.state.editorDispatchRepeatPressureImmediateSkips, 5);
  assert.equal(h.state.editorDispatchHotpathSkipped, 1);
  assert.equal(h.state.editorDispatchRepeatPressureFlushes, 1);
  assert.equal(h.state.editorDispatchQuietTelemetryTotal, 0, 'reset by the flush');
  assert.equal(h.calls.filter(row => row[0] === 'typing').length, 6);
  assert.deepEqual(h.calls.filter(row => row[0] === 'style').map(row => row[1]), ['editor-dispatch', 'editor-dispatch-repeat-pressure-quiet']);
  assert.ok(h.calls.some(row => row[0] === 'perf' && row[1] === 'editor-dispatch-hotpath-skipped'));
  assert.ok(h.calls.some(row => row[0] === 'perf' && row[1] === 'editor-dispatch-repeat-pressure-quieted' && row[3] === 'events=1:active-editor-cache-hit:1'));
});

test('with diagnostics on, the breadcrumbs are what they were', () => {
  for (const gate of [undefined, () => true]) {
    const h = breadcrumbHarness(gate);
    h.type(6);
    h.moveCursor();
    h.quiet();
    assert.deepEqual(h.state.lastEditorDispatchQuietTelemetry, { at: new Date(1210).toISOString(), name: 'active-editor-cache-hit', detail: 'cached', count: 1 });
    h.runFlush();

    assert.deepEqual(h.state.lastEditorDispatchRepeatPressure, { at: new Date(1180).toISOString(), deltaMs: 30, oldDocLength: 8, newDocLength: 9, editorKey: 'editor-d' });
    assert.deepEqual(h.state.lastEditorDispatchRepeatPressureImmediateSkip, { at: new Date(1180).toISOString(), reason: 'editor-dispatch-repeat-pressure' });
    assert.deepEqual(h.state.lastEditorDispatchHotpathSkip, { at: new Date(1210).toISOString(), reason: 'doc-unchanged' });
    assert.deepEqual(h.state.lastEditorDispatchRepeatPressureFlush, {
      at: new Date(1650).toISOString(), quietedEvents: 1, summary: 'active-editor-cache-hit:1', changes: 5,
    });
    assert.equal(h.state.editorDispatchRepeatPressureChangeCount, 5);
    assert.equal(h.state.editorDispatchHotpathSkipped, 1);
  }
});
