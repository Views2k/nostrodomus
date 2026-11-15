// Sync-on-mount detection for panel editors, so they are styled before the first paint.
// Checks the two sentinel hooks it needs, without a browser:
//   1. mutationRecordLooksEditorStructural recognizes the panel YAML wrapper (ha-yaml-editor) so the
//      panel-host observer's callback is not suppressed — the cue to nest-observe its shadow.
//   2. refreshEditorSentinelRoots observes the injected panelEditorObservationRoots only when
//      universalCodebox is on and an opening window is active (gated; a no-op otherwise).
// The e2e styled-at-mount spec is the live proof; this is the fast structural guard.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorLifecycleSentinelRuntime } from '../../src/editor/editorLifecycleSentinel.js';

// A shadowRoot-like stub: attachEditorSentinelObserver needs querySelectorAll/childNodes, and
// structuralObserverConfigForTarget calls querySelector to decide shallow/deep.
function fakeRoot(label) {
  return { __label: label, querySelector: () => null, querySelectorAll: () => [] };
}

function makeRuntime({ enabled = true, openingWindow = true, panelRoots = [] } = {}) {
  const observed = [];
  class MockMutationObserver {
    constructor(cb) { this.cb = cb; }
    observe(target) { observed.push(target); }
    disconnect() {}
    takeRecords() { return []; }
  }
  const state = {
    editorSentinelStats: {},
    editorSentinelObservers: new Map(),
    editorSentinelProbeTimers: new Set(),
    editorSentinelDelayedProbeTimers: new Map(),
    // openingWindow → editorLikelyOpeningWithoutMountedCodebox() is true (no dialog needed)
    editorSentinelLikelyOpeningUntil: openingWindow ? Date.now() + 5000 : 0,
  };
  const rt = createEditorLifecycleSentinelRuntime({
    document: { documentElement: { __label: 'documentElement' } },
    window: { addEventListener() {}, removeEventListener() {} },
    universalCodeboxEnabled: () => enabled,
    state,
    MutationObserver: MockMutationObserver,
    activeEditDialog: () => null,
    editCardDialogCandidates: () => [],
    homeRoot: () => null,
    panelEditorObservationRoots: () => panelRoots,
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    recordPerformanceEvent: () => {},
  });
  return { rt, state, observed };
}

test('mutationRecordLooksEditorStructural treats the panel YAML wrapper (ha-yaml-editor) as structural', () => {
  const { rt } = makeRuntime();
  const wrapperAdded = { addedNodes: [{ nodeType: 1, localName: 'ha-yaml-editor' }] };
  assert.equal(rt.mutationRecordLooksEditorStructural(wrapperAdded), true, 'ha-yaml-editor mount is the cue to nest-observe');
  const unrelated = { addedNodes: [{ nodeType: 1, localName: 'div' }] };
  assert.equal(rt.mutationRecordLooksEditorStructural(unrelated), false, 'unrelated elements stay non-structural');
});

test('refreshEditorSentinelRoots observes the panel roots when universal + opening window', () => {
  const wrapper = fakeRoot('panel-yaml-wrapper');
  const { rt, observed } = makeRuntime({ enabled: true, openingWindow: true, panelRoots: [{ root: wrapper, label: 'panel-yaml-wrapper' }] });
  rt.refreshEditorSentinelRoots('test');
  assert.ok(observed.includes(wrapper), 'panel wrapper shadow is observed (so its .cm-editor mount fires a callback)');
});

test('panel roots are not observed when universalCodebox is off', () => {
  const wrapper = fakeRoot('panel-yaml-wrapper');
  const { rt, observed } = makeRuntime({ enabled: false, openingWindow: true, panelRoots: [{ root: wrapper, label: 'panel-yaml-wrapper' }] });
  rt.refreshEditorSentinelRoots('test');
  assert.equal(observed.includes(wrapper), false, 'flag off → panel wrappers are never observed');
});

test('panel roots are observed only during an opening window, not all the time', () => {
  const wrapper = fakeRoot('panel-yaml-wrapper');
  const { rt, observed } = makeRuntime({ enabled: true, openingWindow: false, panelRoots: [{ root: wrapper, label: 'panel-yaml-wrapper' }] });
  rt.refreshEditorSentinelRoots('test');
  assert.equal(observed.includes(wrapper), false, 'no opening window → panel observation is not added (bounded to the open window)');
});

test('sync-on-mount also runs before the paint for an opening card dialog, not only for panels', () => {
  // When the card dialog's deep codebox shadow is observed (the card-dialog arm of
  // panelEditorObservationRoots) and a .cm-editor or ha-code-editor mounts there, detection runs in
  // the same pre-paint microtask, with a card dialog present too; otherwise a stacked or nested
  // codebox would show unstyled until a later probe. Gated on CodeMirror and on the same editor.
  const observers = [];
  class MockMutationObserver { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} disconnect() {} takeRecords() { return []; } }
  const reapplies = [];
  const nestedRoot = { __label: 'card-dialog-host:ha-code-editor', querySelector: () => null, querySelectorAll: () => [] };
  const state = {
    editorSentinelStats: {},
    editorSentinelObservers: new Map(),
    editorSentinelProbeTimers: new Set(),
    editorSentinelDelayedProbeTimers: new Map(),
  };
  const rt = createEditorLifecycleSentinelRuntime({
    document: { documentElement: { __label: 'documentElement' } },
    window: { addEventListener() {}, removeEventListener() {} },
    universalCodeboxEnabled: () => true,
    state,
    MutationObserver: MockMutationObserver,
    activeEditDialog: () => ({ shadowRoot: {} }),                 // a visible card dialog
    editCardDialogCandidates: () => [{ shadowRoot: {} }],
    activeCodeboxStyleEditor: () => ({ querySelector: () => null }), // discovery reaches the deep codebox
    codeboxEditorCacheKey: () => 'k',
    scheduleCodeboxStyleReapply: (reason) => reapplies.push(reason),
    panelEditorObservationRoots: () => [{ root: nestedRoot, label: 'card-dialog-host:ha-code-editor' }],
    setTimeout: () => 0, clearTimeout: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    recordPerformanceEvent: () => {},
  });
  rt.refreshEditorSentinelRoots('open');
  const obs = observers[observers.length - 1];
  assert.ok(obs, 'an observer attached to the nested card-dialog codebox shadow');
  // the deep .cm-editor mounts in that observed shadow (shadowRoot makes it structural)
  obs.cb([{ addedNodes: [{ nodeType: 1, localName: 'ha-code-editor', shadowRoot: {}, querySelector: () => null, matches: () => false }] }]);
  assert.ok(reapplies.some(r => /sync-mount/.test(r)), 'detection ran SYNCHRONOUSLY on the deep mount (pre-paint) for the card dialog — no flash');
});
