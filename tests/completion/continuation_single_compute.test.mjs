import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';
import { insertItem } from '../../src/completion/insertion.js';

// The runtime and insertItem are wired the way the page wires them: the dispatch
// of the accepted row requests a live update (the dispatch hook does that while the list is
// open), and insertItem schedules the continuation open. Frames run one at a time.
function harness({ rowsFor, keepOpen = false }) {
  const frames = [];
  const computes = [];
  const renders = [];
  let runtime = null;
  const view = {
    text: 'ent',
    state: { doc: { id: 0 }, selection: { main: { anchor: 3, head: 3 } } },
    dispatch(payload) {
      const change = payload.changes;
      if (change) {
        view.text = view.text.slice(0, change.from) + change.insert + view.text.slice(change.to);
        view.state = { ...view.state, doc: { id: view.state.doc.id + 1 } };
      }
      if (payload.selection) view.state = { ...view.state, selection: { main: { anchor: payload.selection.anchor, head: payload.selection.head ?? payload.selection.anchor } } };
      if (state.overlay.style.display === 'block' || state.settings.keepOpen) runtime.requestLiveUpdate();
    },
  };
  const state = {
    enabled: true,
    settings: { keepOpen, idlePaneText: true, enterCompletes: true, tabCompletes: true, acceptMode: 'replace' },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
    view,
  };
  runtime = createCompletionRuntime({
    state,
    documentRef: {},
    cancelAnimationFrame: id => { frames[id - 1] = null; },
    requestAnimationFrame: fn => frames.push(fn),
    clearTimeout: () => {},
    setTimeout: () => 0,
    now: () => 1000,
    renderCompletionPopup: () => renders.push(state.items.length),
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.lastExplicitOpen = false; state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => view.text,
    getPos: () => view.state.selection.main.head,
    detectContext: (doc, pos, triggerKind) => {
      const key = /^([a-z_]+): $/.exec(doc);
      return key
        ? { shouldSuggest: true, lang: 'yaml', yamlRole: 'value', yamlKey: key[1], valueKind: 'entity', prefix: '', from: pos, to: pos, wordTo: pos, line: doc, beforeCursor: doc, afterCursor: '', triggerKind, branchState: null }
        : { shouldSuggest: true, lang: 'yaml', yamlRole: 'key', prefix: doc, from: 0, to: pos, wordTo: pos, line: doc, beforeCursor: doc, afterCursor: '', triggerKind, branchState: null };
    },
    scoreItems: ctx => { computes.push(ctx.triggerKind); return rowsFor(ctx); },
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
    insertItem: item => insertItem(state, item, {
      closeCompletion: () => { state.lastExplicitOpen = false; state.overlay.style.display = 'none'; },
      openCompletion: explicit => runtime.open(explicit),
      scheduleFrame: fn => frames.push(fn),
      now: () => 1000,
    }),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true,
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  // Runs the queued frames, including the ones they queue, and lets awaited opens settle.
  const runFrames = async () => {
    for (let i = 0; i < frames.length && i < 40; i += 1) {
      const frame = frames[i];
      frames[i] = null;
      if (frame) {
        frame();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  };
  const pressEnter = () => runtime.onKeydown({ key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} });
  return { state, view, runtime, computes, renders, frames, runFrames, pressEnter };
}

const keyRows = [{ type: 'key', label: 'entity:', insert: 'entity: ', matchTier: 0 }];
const valueRows = [{ type: 'entity', label: 'light.kitchen', insert: 'light.kitchen', matchTier: 0 }];

test('accepting a key that waits for its value computes and renders the value list once', async () => {
  const h = harness({ rowsFor: ctx => (ctx.yamlRole === 'value' ? valueRows : keyRows) });
  await h.runtime.open(true);
  h.computes.length = 0;
  h.renders.length = 0;

  h.pressEnter();
  assert.equal(h.view.text, 'entity: ');
  await h.runFrames();

  assert.deepEqual(h.computes, ['explicit'], 'one compute, by the continuation open');
  assert.deepEqual(h.renders, [1], 'one render');
  assert.equal(h.state.overlay.style.display, 'block');
  assert.deepEqual(h.state.items, valueRows);
  assert.equal(h.state.lastExplicitOpen, true);
});

test('a continuation that finds no rows is not computed again while nothing changed', async () => {
  const h = harness({ rowsFor: ctx => (ctx.yamlRole === 'value' ? [] : keyRows) });
  await h.runtime.open(true);
  h.computes.length = 0;
  h.renders.length = 0;

  h.pressEnter();
  await h.runFrames();

  assert.deepEqual(h.computes, ['explicit'], 'the empty result is computed once');
  assert.deepEqual(h.renders, [0], 'the idle pane is rendered once');
  assert.equal(h.state.overlay.style.display, 'block', 'the idle pane is shown');
});

test('an empty continuation is computed again after the document or the caret changed', async () => {
  const h = harness({ rowsFor: ctx => (ctx.yamlRole === 'value' ? [] : keyRows) });
  await h.runtime.open(true);
  h.pressEnter();
  h.computes.length = 0;
  const step = async () => {
    const index = h.frames.findIndex(Boolean);
    const frame = h.frames[index];
    h.frames[index] = null;
    frame();
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  await step(); // the live update of the accept: skipped
  await step(); // the continuation is queued
  await step(); // first attempt
  assert.deepEqual(h.computes, ['explicit']);

  // A change that requests no live update of its own (the list is not open for it).
  h.view.state = { ...h.view.state, doc: { id: 99 } };
  await step(); // second attempt: the document is another one
  assert.deepEqual(h.computes, ['explicit', 'explicit']);

  h.view.state = { ...h.view.state, selection: { main: { anchor: 2, head: 2 } } };
  await step(); // third attempt: the caret moved
  assert.deepEqual(h.computes, ['explicit', 'explicit', 'explicit']);

  await step(); // fourth attempt: nothing changed
  assert.deepEqual(h.computes, ['explicit', 'explicit', 'explicit']);
  assert.equal(h.frames.some(Boolean), false, 'the attempts are still bounded');
});

test('typing after an accepted key still updates the list', async () => {
  const h = harness({ rowsFor: ctx => (ctx.yamlRole === 'value' ? valueRows : keyRows) });
  await h.runtime.open(true);
  h.pressEnter();
  await h.runFrames();
  h.computes.length = 0;

  // The next change requests a live update; it is not skipped.
  h.view.dispatch({ changes: { from: 8, to: 8, insert: 'l' }, selection: { anchor: 9 } });
  await h.runFrames();
  assert.deepEqual(h.computes, ['typing']);
});

test('a live update is skipped once only, even when the continuation never runs', async () => {
  const h = harness({ rowsFor: ctx => (ctx.yamlRole === 'value' ? valueRows : keyRows) });
  await h.runtime.open(true);
  h.pressEnter();
  // The page is disabled before the continuation frame: it returns without opening.
  h.state.enabled = false;
  await h.runFrames();
  h.state.enabled = true;
  h.computes.length = 0;

  h.runtime.refresh('typing');
  assert.deepEqual(h.computes, ['typing'], 'the next live update computes');
});
