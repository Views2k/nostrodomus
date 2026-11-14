import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';

// The refresh that runs before accepting a stale popup goes through compute(), which moves the
// selection back to the first row when the highlighted row ranks below it. The row the user
// highlighted must still be the one that is inserted when it is in the refreshed list.
test('Enter on a stale popup inserts the highlighted row, not the first row', () => {
  let pos = 2;
  const inserted = [];
  const rows = () => [
    { id: 'a', label: 'name', insert: 'name: ', score: 10, matchTier: 0 },
    { id: 'b', label: 'navigation_path', insert: 'navigation_path: ', score: 5, matchTier: 1 },
  ];
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
    requestAnimationFrame: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    setTimeout: () => 2,
    now: () => 1000,
    renderCompletionPopup: () => {},
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'na',
    getPos: () => pos,
    detectContext: (_doc, at, triggerKind) => ({ shouldSuggest: true, triggerKind, branchState: null, from: 0, to: at, prefix: 'n' }),
    scoreItems: rows,
    updateContextInspectorPanel: () => {},
    updateSuggestionQualityPanel: () => {},
    recordRuntimeError: () => {},
    recordRuntimeErrorOnce: () => {},
    isViewAllowed: () => true,
    loadLibrary: async () => {},
    logDebug: () => {},
    openSettings: () => {},
    preserveScrollDuring: (fn) => fn(),
    editorDispatchRepeatPressureActive: () => false,
    recordPerformanceEvent: () => {},
    closeSettings: () => {},
    clearSnippetSession: () => {},
    moveSnippetPlaceholder: () => {},
    insertItem: (item) => inserted.push(item?.label),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true, // the events these tests send come from the editor
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  const key = (name) => ({ key: name, preventDefault() {}, stopPropagation() {}, composedPath: () => [] });

  runtime.compute('typing');
  runtime.onKeydown(key('ArrowDown'));
  assert.equal(state.items[state.selected].label, 'navigation_path');

  pos = 3; // one more character arrived; the deferred live update has not run yet
  runtime.onKeydown(key('Enter'));

  assert.equal(state.context.to, 3, 'the popup was refreshed first');
  assert.deepEqual(inserted, ['navigation_path']);
});
