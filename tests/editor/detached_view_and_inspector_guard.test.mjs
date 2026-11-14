import test from 'node:test';
import assert from 'node:assert/strict';

import { createActiveEditorCacheRuntime } from '../../src/editor/activeEditorCacheRuntime.js';
import { createDiagnosticsRuntime } from '../../src/diagnostics/telemetryRuntime.js';

// [L]
test('a view whose editor left the document is released so the no-editor backoff can arm', () => {
  const originalDispatch = () => {};
  const view = { dom: { isConnected: false }, dispatch: () => {} };
  const state = {
    view,
    hookedView: view,
    originalDispatch,
    snippetSession: { view },
    activeEditorCache: { editor: null, noEditorBackoffMs: 180, noEditorBackoffUntil: 0, noEditorSkips: 0 },
  };
  const runtime = createActiveEditorCacheRuntime({
    state,
    activeEditDialog: () => null,
    editorLikelyOpeningWithoutMountedCodebox: () => false,
    recordPerformanceEvent: () => {},
  });

  assert.equal(runtime.rememberActiveEditorNoEditor('unit-miss'), true, 'the backoff starts once the editor is gone');
  assert.equal(state.view, null);
  assert.equal(state.hookedView, null);
  assert.equal(view.dispatch, originalDispatch, 'the dispatch hook is taken off the old view');
  assert.equal(state.snippetSession, null);
  assert.equal(runtime.activeEditorNoEditorBackoffAllowed('unit-skip'), true);
});

test('a view that is still in the document is kept', () => {
  const view = { dom: { isConnected: true }, dispatch: () => {} };
  const state = {
    view,
    hookedView: view,
    originalDispatch: () => {},
    activeEditorCache: { editor: null, noEditorBackoffMs: 180, noEditorBackoffUntil: 0, noEditorSkips: 0 },
  };
  const runtime = createActiveEditorCacheRuntime({
    state,
    activeEditDialog: () => null,
    editorLikelyOpeningWithoutMountedCodebox: () => false,
    recordPerformanceEvent: () => {},
  });
  assert.equal(runtime.rememberActiveEditorNoEditor('unit-miss'), false);
  assert.equal(state.view, view);
});

// [D]
test('the context inspector refresh does not recompute under an open popup', () => {
  const computes = [];
  const panelUpdates = [];
  let popupOpen = true;
  const section = { classList: { contains: name => name === 'active' }, querySelector: () => null };
  const state = {
    view: {},
    items: [{ label: 'entity:' }],
    settings: {},
    diagnosticsLastComputeAt: 0,
    settingsPanel: { isConnected: true, querySelector: selector => (selector === '[data-section="context"]' ? section : null) },
  };
  const runtime = createDiagnosticsRuntime({
    state,
    compute: triggerKind => { computes.push(triggerKind); state.items = []; },
    isOpen: () => popupOpen,
    isViewAllowed: () => true,
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    recordPerformanceEvent: () => {},
    recordRuntimeErrorOnce: () => {},
    suggestionQualityPayload: () => ({ providerMix: {}, providerSummary: [], suggestionCount: 0 }),
    createSettingsElement: () => ({ appendChild() {} }),
    itemSourceLabel: () => '',
  });

  runtime.refreshContextInspectorPanel('context-inspector-live');
  runtime.refreshSuggestionQualityPanel('suggestion-quality-live');
  assert.deepEqual(computes, [], 'no compute while the popup is open');
  assert.equal(state.items.length, 1, 'the rows the popup rendered are still the rows Enter and a click act on');

  popupOpen = false;
  runtime.refreshContextInspectorPanel('context-inspector-live');
  assert.deepEqual(computes, ['context-inspector-live'], 'with the popup closed the inspector still computes');
  void panelUpdates;
});
