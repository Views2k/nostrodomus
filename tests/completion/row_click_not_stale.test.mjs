import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';

// After fast typing the live update is deferred, so the list and its context describe an older
// document. Enter and Tab bring the list up to date before they accept, and a click on a row must
// do the same instead of replacing the range of the older document.
function harness() {
  let pos = 2;
  let labels = ['name', 'navigation_path'];
  const inserted = [];
  const computes = [];
  let rowClick = null;
  const state = {
    enabled: true,
    settings: { keepOpen: false, enterCompletes: true, tabCompletes: true },
    items: [],
    selected: 0,
    overlay: { style: { display: 'block' } },
    context: {},
  };
  const runtime = createCompletionRuntime({
    state,
    documentRef: {},
    cancelAnimationFrame: () => {},
    requestAnimationFrame: () => 1,
    clearTimeout: () => {},
    setTimeout: () => 2,
    now: () => 1000,
    // The list hands the rows the function their click calls.
    renderCompletionPopup: (_state, deps) => { rowClick = deps.insertItem; },
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'nam'.slice(0, pos),
    getPos: () => pos,
    detectContext: (_doc, at, triggerKind) => ({ shouldSuggest: true, triggerKind, branchState: null, from: 0, to: at, prefix: 'nam'.slice(0, at) }),
    scoreItems: () => { computes.push(pos); return labels.map(label => ({ id: label, label, insert: `${label}: `, matchTier: 0 })); },
    updateContextInspectorPanel: () => {},
    updateSuggestionQualityPanel: () => {},
    recordRuntimeError: (scope, err) => { throw err; },
    recordRuntimeErrorOnce: () => {},
    isViewAllowed: () => true,
    loadLibrary: async () => {},
    logDebug: () => {},
    openSettings: () => {},
    preserveScrollDuring: fn => fn(),
    editorDispatchRepeatPressureActive: () => false,
    recordPerformanceEvent: () => {},
    closeSettings: () => {},
    clearSnippetSession: () => {},
    moveSnippetPlaceholder: () => {},
    insertItem: item => { inserted.push({ label: item?.label, contextTo: state.context.to }); return true; },
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true,
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  runtime.compute('typing');
  runtime.render();
  return {
    state, inserted, computes,
    click: index => rowClick(state.items[index]),
    type: (nextLabels) => { pos = 3; if (nextLabels) labels = nextLabels; },
  };
}

test('a click on a row of an up-to-date list inserts it without another compute', () => {
  const h = harness();
  h.computes.length = 0;
  h.click(1);
  assert.deepEqual(h.inserted, [{ label: 'navigation_path', contextTo: 2 }]);
  assert.deepEqual(h.computes, []);
});

test('a click on a row of a stale list inserts that row with the context of the current document', () => {
  const h = harness();
  h.type(); // one more character arrived; the deferred live update has not run yet
  h.click(1);
  assert.deepEqual(h.inserted, [{ label: 'navigation_path', contextTo: 3 }], 'the list was brought up to date first');
});

test('a click on a row that the current document no longer matches inserts nothing', () => {
  const h = harness();
  h.type(['name']); // "nam" no longer matches navigation_path
  h.click(1);
  assert.deepEqual(h.inserted, []);
  assert.equal(h.state.context.to, 3, 'the list is up to date for the next click');
  assert.deepEqual(h.state.items.map(item => item.label), ['name']);
});
