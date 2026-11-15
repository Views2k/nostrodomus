import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createEditorLifecycleSentinelRuntime } from '../../src/editor/editorLifecycleSentinel.js';

// The editor-warning reconcile reads every element of every shadow root of the dialog outside
// the preview. A presence probe ran it itself and then again through the companion layer it
// applies for the editor it found, so each probe with an open code editor walked the dialog
// twice. The probe's own call is for the dialog without a code editor (the visual editor tab),
// where no companion layer is applied.

function makeRuntime({ editor = null, stableSkip = false } = {}) {
  const calls = { warningHide: 0, companionLayer: 0 };
  const state = {
    editorSentinelStats: { noEditorRetries: 0, duplicateDetections: 0, stableSkips: 0, detections: 0 },
    editorSentinelProbeTimers: new Set(),
    editorSentinelDelayedProbeTimers: new Map(),
    editorSentinelObservers: new Map(),
    activeEditorCache: { key: '', stableSkips: 0 },
  };
  // The same wiring as app.js: the companion layer ends with the warning reconcile, and
  // remembering an editor applies the companion layer once.
  const applyEditorWarningHide = () => { calls.warningHide += 1; };
  const applyCompanionEditorLayer = () => { calls.companionLayer += 1; applyEditorWarningHide(); };
  const rememberActiveCodeboxEditor = (found) => {
    state.activeEditorCache.key = 'editor-key';
    applyCompanionEditorLayer(found);
  };
  const rt = createEditorLifecycleSentinelRuntime({
    document: { documentElement: {} },
    window: { addEventListener() {}, removeEventListener() {} },
    universalCodeboxEnabled: () => true,
    state,
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    activeEditDialog: () => ({}),
    editCardDialogCandidates: () => [{}],
    activeCodeboxStyleEditor: () => editor,
    codeboxEditorCacheKey: () => 'editor-key',
    rememberActiveCodeboxEditor,
    applyCompanionEditorLayer,
    applyEditorWarningHide,
    stableNativeFallbackLifecycleDecisionForEditor: () => ({ skip: stableSkip }),
    scheduleCodeboxStyleReapply: () => { state.codeboxStyleLastEditorKey = 'editor-key'; state.codeboxStyleCacheInvalidated = false; },
  });
  return { rt, state, calls };
}

const editorStub = () => ({ querySelector: () => null });

test('a probe that finds a new editor reconciles the warnings once', () => {
  const { rt, calls } = makeRuntime({ editor: editorStub() });
  assert.equal(rt.runEditorPresenceProbe('open'), true, 'new editor detected');
  assert.equal(calls.companionLayer, 1);
  assert.equal(calls.warningHide, 1, 'one walk of the dialog, through the companion layer');
});

test('a probe that finds the known editor again reconciles the warnings once', () => {
  for (const stableSkip of [false, true]) {
    const { rt, calls } = makeRuntime({ editor: editorStub(), stableSkip });
    rt.runEditorPresenceProbe('open');
    calls.warningHide = 0;
    calls.companionLayer = 0;
    assert.equal(rt.runEditorPresenceProbe('editor-sentinel-settle-60'), false, 'stable hit');
    assert.equal(calls.companionLayer, 1, `companion layer applied once (stableSkip=${stableSkip})`);
    assert.equal(calls.warningHide, 1, `one walk of the dialog per probe (stableSkip=${stableSkip})`);
  }
});

test('a probe in a dialog without a code editor still reconciles the warnings itself', () => {
  const { rt, calls } = makeRuntime({ editor: null });
  assert.equal(rt.runEditorPresenceProbe('open'), false);
  assert.equal(calls.companionLayer, 0, 'no editor, no companion layer');
  assert.equal(calls.warningHide, 1, 'the visual editor tab is covered by the probe');
});

test('main wires the warning reconcile into the companion layer the probe relies on', () => {
  const main = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  const layer = main.slice(main.indexOf('const applyCompanionEditorLayer = (editor) => {'));
  const body = layer.slice(0, layer.indexOf('};'));
  assert.ok(body.includes('companionStyleRuntime.applyForEditor(editor);'));
  assert.ok(body.includes('applyEditorWarningHide();'), 'the companion layer reconciles the warnings');
});
