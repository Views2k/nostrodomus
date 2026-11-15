import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';

// Tab from one snippet placeholder to the next moves the selection with a dispatch. With the list
// open, the dispatch hook asks for a live update one frame later. The choice list shown for the
// new placeholder must still be there after that frame.

function choiceSession(view) {
  return {
    view,
    from: 0,
    index: 0,
    placeholders: [
      { index: 1, start: 0, end: 4, choices: ['auto', 'heat'] },
      { index: 2, start: 10, end: 14, choices: ['low', 'high'] },
    ],
    allPlaceholders: [],
  };
}

function setup() {
  const frames = new Map();
  let nextFrame = 1;
  const view = { dispatch: () => {}, state: { selection: { main: { anchor: 0, head: 4 } } } };
  const state = {
    enabled: true,
    settings: { keepOpen: false, idlePaneText: true, enterCompletes: true, tabCompletes: true },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
    view,
  };
  let runtime = null;
  runtime = createCompletionRuntime({
    state,
    documentRef: {},
    requestAnimationFrame: fn => { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: () => 0,
    clearTimeout: () => {},
    now: () => 1000,
    renderCompletionPopup: () => {},
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; state.lastExplicitOpen = false; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'mode: auto\nfan: low',
    getPos: () => (state.snippetSession?.index === 1 ? 14 : 4),
    detectContext: (_doc, pos, triggerKind) => ({ shouldSuggest: true, triggerKind, from: pos, to: pos, prefix: '' }),
    scoreItems: () => [{ label: 'entity', insert: 'entity: ' }],
    updateContextInspectorPanel: () => {},
    updateSuggestionQualityPanel: () => {},
    recordRuntimeError: () => {},
    recordRuntimeErrorOnce: () => {},
    isViewAllowed: () => true,
    loadLibrary: async () => {},
    logDebug: () => {},
    openSettings: () => {},
    preserveScrollDuring: fn => fn(),
    editorDispatchRepeatPressureActive: () => false,
    recordPerformanceEvent: () => {},
    closeSettings: () => {},
    clearSnippetSession: () => { state.snippetSession = null; },
    // The real move dispatches a selection change; the dispatch hook then asks for a live update
    // because the list is open.
    moveSnippetPlaceholder: direction => {
      state.snippetSession.index += direction;
      if (state.overlay.style.display === 'block') runtime.requestLiveUpdate();
    },
    insertItem: () => true,
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    pathHasEditorSurface: () => true,
    rememberView: () => {},
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  const runFrames = () => {
    for (const [id, fn] of [...frames]) {
      frames.delete(id);
      fn();
    }
  };
  return { state, runtime, view, runFrames };
}

const tab = (shiftKey = false) => ({ key: 'Tab', shiftKey, preventDefault() {}, stopPropagation() {}, composedPath: () => [] });

test('the choice list of the next placeholder stays after the live update the move asked for', () => {
  const { state, runtime, view, runFrames } = setup();
  state.snippetSession = choiceSession(view);
  state.snippetSession.index = -1;

  runtime.onKeydown(tab());                     // to the first placeholder; the list was closed
  runFrames();
  assert.deepEqual(state.items.map(item => item.label), ['auto', 'heat']);

  runtime.onKeydown(tab());                     // to the second placeholder with the list open
  assert.deepEqual(state.items.map(item => item.label), ['low', 'high']);
  runFrames();
  assert.deepEqual(state.items.map(item => item.label), ['low', 'high']);
  assert.equal(state.context.snippetChoice, true);
  assert.equal(state.overlay.style.display, 'block');
});

test('a move to a placeholder without choices still refreshes the open list', () => {
  const { state, runtime, view, runFrames } = setup();
  state.snippetSession = choiceSession(view);
  delete state.snippetSession.placeholders[1].choices;
  state.snippetSession.index = -1;

  runtime.onKeydown(tab());
  runFrames();
  assert.deepEqual(state.items.map(item => item.label), ['auto', 'heat']);

  runtime.onKeydown(tab());
  runFrames();
  assert.deepEqual(state.items.map(item => item.label), ['entity']);
  assert.notEqual(state.context.snippetChoice, true);
});
