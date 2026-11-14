import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';

// A choice placeholder is rendered as its first choice and selected: the selection anchor is
// the placeholder start and the head (getPos) is its end. The choice rows are anchored at the
// start, so the "cursor moved since compute" test must not apply to them.
test('Enter accepts the highlighted snippet choice while the placeholder text is selected', () => {
  const calls = [];
  const dispatches = [];
  const state = {
    enabled: true,
    settings: { keepOpen: false, idlePaneText: true, enterCompletes: true, tabCompletes: true },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
    snippetSession: {
      view: { dispatch: (spec) => dispatches.push(spec) },
      from: 5,
      index: 0,
      placeholders: [{ index: 1, start: 2, end: 6, choices: ['auto', 'heat'] }],
      allPlaceholders: [{ index: 1, start: 2, end: 6, choices: ['auto', 'heat'] }],
    },
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
    getDoc: () => 'mode: auto',
    getPos: () => 11, // selection head = placeholder end (5 + 6)
    detectContext: (_doc, at, triggerKind) => ({ shouldSuggest: true, triggerKind, branchState: null, from: 7, to: at, prefix: 'auto' }),
    scoreItems: () => [{ label: 'automation', insert: 'automation', score: 10, matchTier: 0 }],
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
    insertItem: (item) => calls.push(['insertItem', item?.label]),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true, // the events these tests send come from the editor
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  const key = (name) => ({ key: name, preventDefault() {}, stopPropagation() {}, composedPath: () => [] });

  runtime.onKeydown(key('Tab')); // shows the choice rows for the current placeholder
  assert.deepEqual(state.items.map((item) => item.label), ['auto', 'heat']);
  assert.equal(state.context.to, 7, 'the choice context is anchored at the placeholder start');

  state.selected = 1;
  runtime.onKeydown(key('Enter'));

  assert.deepEqual(dispatches[0]?.changes, { from: 7, to: 11, insert: 'heat' }, 'the chosen value replaces the placeholder');
  assert.deepEqual(calls, [], 'no ordinary completion item was inserted instead');
});
