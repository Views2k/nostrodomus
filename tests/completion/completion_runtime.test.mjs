import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime, completionLiveUpdateTriggerIsTyping } from '../../src/completion/completionRuntime.js';

function baseState() {
  return {
    enabled: true,
    settings: {
      keepOpen: false,
      idlePaneText: true,
      autoOpenOnFocus: true,
      enterCompletes: true,
      tabCompletes: true,
    },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
  };
}

function createDeps(overrides = {}) {
  const state = overrides.state || baseState();
  const calls = [];
  const deps = {
    state,
    documentRef: {},
    cancelAnimationFrame: () => calls.push('cancelFrame'),
    requestAnimationFrame: fn => { calls.push('raf'); fn(); return 1; },
    clearTimeout: () => calls.push('clearTimer'),
    setTimeout: fn => { calls.push('timer'); fn(); return 2; },
    now: () => 1000,
    renderCompletionPopup: () => calls.push('renderPopup'),
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => calls.push('placeAtCursor'),
    popupIsOpen: () => state.overlay?.style?.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; calls.push('close'); },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'type: custom:mini-graph-card',
    getPos: () => 6,
    detectContext: (_doc, _pos, triggerKind) => ({ shouldSuggest: true, triggerKind, branchState: null }),
    scoreItems: () => [{ label: 'type', score: 10 }, { label: 'title', score: 8 }],
    updateContextInspectorPanel: () => calls.push('contextPanel'),
    updateSuggestionQualityPanel: () => calls.push('qualityPanel'),
    recordRuntimeError: (...args) => calls.push(['runtimeError', ...args]),
    recordRuntimeErrorOnce: (...args) => calls.push(['runtimeErrorOnce', ...args]),
    isViewAllowed: () => true,
    loadLibrary: async () => calls.push('loadLibrary'),
    logDebug: message => calls.push(['logDebug', message]),
    openSettings: () => calls.push('openSettings'),
    preserveScrollDuring: fn => fn(),
    editorDispatchRepeatPressureActive: () => false,
    recordPerformanceEvent: (...args) => calls.push(['performance', ...args]),
    closeSettings: () => calls.push('closeSettings'),
    clearSnippetSession: () => calls.push('clearSnippetSession'),
    moveSnippetPlaceholder: direction => calls.push(['moveSnippetPlaceholder', direction]),
    insertItem: item => calls.push(['insertItem', item?.label]),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => calls.push('rememberView'),
    pathHasEditorSurface: () => true, // the events these tests send come from the editor
    scheduleCodeboxStyleReapply: reason => calls.push(['styleReapply', reason]),
    observerLifecycleCloseDryRunListenerProbe: reason => calls.push(['observerProbe', reason]),
    ...overrides,
  };
  return { state, calls, runtime: createCompletionRuntime(deps) };
}

test('completion runtime compute updates context, items, and diagnostics panels', () => {
  const { state, calls, runtime } = createDeps();
  runtime.compute('explicit');

  assert.equal(state.context.triggerKind, 'explicit');
  assert.equal(state.items.length, 2);
  assert.equal(state.diagnosticsLastComputeAt, 1000);
  assert.ok(calls.includes('contextPanel'));
  assert.ok(calls.includes('qualityPanel'));
});

test('completion runtime open renders and shows overlay when suggestions exist', async () => {
  const { state, calls, runtime } = createDeps();
  const opened = await runtime.open(true);

  assert.equal(opened, true);
  assert.equal(state.overlay.style.display, 'block');
  assert.ok(calls.includes('loadLibrary'));
  assert.ok(calls.includes('renderPopup'));
  assert.ok(calls.includes('placeAtCursor'));
});

test('completion runtime keydown accepts selected suggestion', async () => {
  const { state, calls, runtime } = createDeps();
  await runtime.open(true);
  state.selected = 1;

  const ev = {
    key: 'Enter',
    preventDefault: () => calls.push('preventDefault'),
    stopPropagation: () => calls.push('stopPropagation'),
  };
  runtime.onKeydown(ev);

  assert.ok(calls.includes('preventDefault'));
  assert.ok(calls.includes('stopPropagation'));
  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'insertItem'), ['insertItem', 'title']);
});

test('completion runtime exposes live update trigger classifier', () => {
  assert.equal(completionLiveUpdateTriggerIsTyping('typing'), true);
  assert.equal(completionLiveUpdateTriggerIsTyping('editor-dispatch'), true);
  assert.equal(completionLiveUpdateTriggerIsTyping('manual-refresh'), false);
});


test('completion runtime Ctrl+Space toggles popup without blocking preview-pane shortcuts', async () => {
  const { state, calls, runtime } = createDeps();

  const ev = {
    key: ' ',
    code: 'Space',
    ctrlKey: true,
    preventDefault: () => calls.push('preventDefault'),
    stopPropagation: () => calls.push('stopPropagation'),
  };

  runtime.onKeydown(ev);
  await Promise.resolve();
  assert.equal(state.overlay.style.display, 'block');
  assert.equal(calls.includes('preventDefault'), false);
  assert.equal(calls.includes('stopPropagation'), false);

  runtime.onKeydown(ev);
  assert.equal(state.overlay.style.display, 'none');
  assert.equal(calls.includes('preventDefault'), false);
  assert.equal(calls.includes('stopPropagation'), false);
});

test('completion runtime navigation wraps and supports page/home/end keys', async () => {
  const { state, calls, runtime } = createDeps({
    scoreItems: () => Array.from({ length: 8 }, (_, i) => ({ label: `item-${i}`, score: 10 - i })),
  });
  await runtime.open(true);

  state.selected = 7;
  runtime.onKeydown({ key: 'ArrowDown', preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') });
  assert.equal(state.selected, 0);

  runtime.onKeydown({ key: 'End', preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') });
  assert.equal(state.selected, 7);

  runtime.onKeydown({ key: 'PageUp', preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') });
  assert.equal(state.selected, 2);

  runtime.onKeydown({ key: 'Home', preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') });
  assert.equal(state.selected, 0);
});

test('completion runtime keeps snippet tabstops active after popup closes', () => {
  const { state, calls, runtime } = createDeps();
  state.snippetSession = { index: 0 };
  state.overlay.style.display = 'none';

  runtime.onKeydown({
    key: 'Tab',
    preventDefault: () => calls.push('preventDefault'),
    stopPropagation: () => calls.push('stopPropagation'),
  });

  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'moveSnippetPlaceholder'), ['moveSnippetPlaceholder', 1]);
});

test('completion runtime dismisses typed delimiters without preventing editor input', async () => {
  const { state, calls, runtime } = createDeps();
  await runtime.open(true);

  runtime.onKeydown({
    key: ':',
    preventDefault: () => calls.push('preventDefault'),
    stopPropagation: () => calls.push('stopPropagation'),
  });

  assert.equal(state.overlay.style.display, 'none');
  assert.equal(calls.includes('preventDefault'), false);
});


test('completion runtime suppresses keep-open refresh after Escape until a boundary or Ctrl+Space', async () => {
  const { state, runtime } = createDeps();
  state.settings.keepOpen = true;
  await runtime.open(true);
  assert.equal(state.overlay.style.display, 'block');

  runtime.onKeydown({ key: 'Escape', preventDefault: () => {}, stopPropagation: () => {} });
  assert.equal(state.escapeSuppressUntilBoundary, true);
  assert.equal(state.overlay.style.display, 'none');

  runtime.refresh('typing');
  assert.equal(state.overlay.style.display, 'none');

  runtime.onKeydown({ key: ' ', preventDefault: () => {}, stopPropagation: () => {} });
  assert.equal(state.escapeSuppressUntilBoundary, false);
});


test('completion runtime commit character accepts prefix key and consumes colon once', async () => {
  const inserted = [];
  const { state, calls, runtime } = createDeps({
    detectContext: () => ({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', prefix: 'ent', from: 0, to: 3, wordTo: 3, branchState: null }),
    scoreItems: () => [{ label: 'entity:', insert: 'entity: ', matchTier: 0, score: 10 }],
    insertItem: item => inserted.push(item.insert),
  });
  state.settings.commitCharacters = true;
  await runtime.open(true);

  runtime.onKeydown({ key: ':', preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') });

  assert.deepEqual(inserted, ['entity: ']);
  assert.ok(calls.includes('preventDefault'));
  assert.ok(calls.includes('stopPropagation'));
});

test('completion runtime keeps selected item identity across refiltering unless exact winner changes', () => {
  const state = baseState();
  state.items = [{ id: 'one', label: 'one', matchTier: 1 }, { id: 'two', label: 'two', matchTier: 1 }];
  state.selected = 1;
  const { runtime } = createDeps({
    state,
    detectContext: (_doc, _pos, triggerKind) => ({ shouldSuggest: true, lang: 'yaml', prefix: 'tw', triggerKind, branchState: null }),
    scoreItems: () => [{ id: 'two', label: 'two', matchTier: 1 }, { id: 'three', label: 'three', matchTier: 1 }],
  });
  runtime.compute('typing');
  assert.equal(state.selected, 0);

  state.items = [{ id: 'old', label: 'old', matchTier: 2 }, { id: 'two', label: 'two', matchTier: 2 }];
  state.selected = 1;
  const { runtime: runtime2 } = createDeps({
    state,
    detectContext: (_doc, _pos, triggerKind) => ({ shouldSuggest: true, lang: 'yaml', prefix: 't', triggerKind, branchState: null }),
    scoreItems: () => [{ id: 'title', label: 'title', matchTier: 0 }, { id: 'two', label: 'two', matchTier: 2 }],
  });
  runtime2.compute('typing');
  assert.equal(state.selected, 0);
});

test('completion runtime toggles expanded docs with Ctrl+Space while popup is open', async () => {
  const { state, runtime } = createDeps();
  state.settings.showDetailsPane = true;
  await runtime.open(true);
  assert.equal(state.docsExpanded, undefined);
  runtime.onKeydown({ key: ' ', code: 'Space', ctrlKey: true, preventDefault: () => {}, stopPropagation: () => {} });
  assert.equal(state.docsExpanded, true);
});


test('completion runtime opens snippet choice rows after tabbing to a choice placeholder', () => {
  const view = { dispatch: () => {} };
  const { state, runtime } = createDeps({
    moveSnippetPlaceholder: () => { state.snippetSession.index = 1; },
  });
  state.snippetSession = {
    view,
    from: 10,
    index: 0,
    placeholders: [
      { index: 1, start: 0, end: 4 },
      { index: 2, start: 8, end: 12, choices: ['auto', 'heat', 'cool'] },
    ],
    allPlaceholders: [],
  };
  state.overlay.style.display = 'none';

  runtime.onKeydown({ key: 'Tab', preventDefault: () => {}, stopPropagation: () => {} });

  assert.equal(state.overlay.style.display, 'block');
  assert.deepEqual(state.items.map(item => item.label), ['auto', 'heat', 'cool']);
  assert.equal(state.context.snippetChoice, true);
  assert.equal(state.context.from, 18);
  assert.equal(state.context.wordTo, 22);
});

test('completion runtime accepts snippet choice rows without ending the snippet session', async () => {
  const dispatches = [];
  const view = { dispatch: spec => dispatches.push(spec) };
  const { state, runtime } = createDeps();
  state.snippetSession = {
    view,
    from: 5,
    index: 0,
    placeholders: [{ index: 1, start: 2, end: 6, choices: ['auto', 'heat'] }],
    allPlaceholders: [{ index: 1, start: 2, end: 6, choices: ['auto', 'heat'] }],
  };
  state.items = [{ label: 'heat', insert: 'heat', meta: { snippetChoice: true } }];
  state.selected = 0;
  state.overlay.style.display = 'block';

  runtime.onKeydown({ key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} });

  assert.deepEqual(dispatches[0].changes, { from: 7, to: 11, insert: 'heat' });
  assert.equal(state.snippetSession.placeholders[0].end, 6);
  assert.equal(state.overlay.style.display, 'none');
});

test('Escape closing the settings panel preserves the saved drag position', () => {
  const closeArgs = [];
  const { state, runtime } = createDeps({ closeSettings: (reset) => closeArgs.push(reset) });
  state.settingsPanel = { parentNode: {} }; // panel is open
  state.snippetSession = null;
  runtime.onKeydown({ key: 'Escape', preventDefault: () => {}, stopPropagation: () => {} });
  // Every other close path passes false; Escape must too, or it nulls + persists settingsPos and
  // the user's dragged panel position is lost on the next open.
  assert.deepEqual(closeArgs, [false], 'Escape closes the panel WITHOUT resetting the saved position');
});

test('accept after a deferred update refreshes first and inserts against the current document', () => {
  // Typing `na` computed the popup; a fast burst then typed `me` while the live update was
  // deferred. Enter must not insert with the range from `na`.
  let pos = 2;
  const computedAt = [];
  const { state, calls, runtime } = createDeps({
    getPos: () => pos,
    detectContext: (_doc, at, triggerKind) => { computedAt.push(at); return { shouldSuggest: true, triggerKind, branchState: null, from: 0, to: at, prefix: 'n' }; },
    scoreItems: () => [{ label: 'name', insert: 'name: ', score: 10, matchTier: 0 }],
  });
  state.overlay.style.display = 'block';
  runtime.compute('typing');
  assert.equal(state.context.to, 2);

  pos = 4; // two more characters arrived; no refresh has run yet
  calls.length = 0;
  const event = { key: 'Enter', preventDefault() {}, stopPropagation() {}, composedPath: () => [] };
  runtime.onKeydown(event);

  assert.equal(state.context.to, 4, 'the context was recomputed at the current cursor before inserting');
  const insertAt = calls.findIndex((c) => Array.isArray(c) && c[0] === 'insertItem');
  assert.ok(insertAt >= 0, 'the item is still accepted');
  assert.equal(computedAt[computedAt.length - 1], 4);
});

test('accept with an up-to-date popup does not recompute', () => {
  let computes = 0;
  const { state, calls, runtime } = createDeps({
    getPos: () => 2,
    detectContext: (_doc, at, triggerKind) => { computes += 1; return { shouldSuggest: true, triggerKind, branchState: null, from: 0, to: at, prefix: 'n' }; },
    scoreItems: () => [{ label: 'name', insert: 'name: ', score: 10, matchTier: 0 }],
  });
  state.overlay.style.display = 'block';
  runtime.compute('typing');
  const before = computes;
  runtime.onKeydown({ key: 'Enter', preventDefault() {}, stopPropagation() {}, composedPath: () => [] });
  assert.equal(computes, before);
  assert.ok(calls.some((c) => Array.isArray(c) && c[0] === 'insertItem'));
});

// --- appended: settings panel removed by Home Assistant; keys pressed inside the settings panel ---
test('Escape is not swallowed by a settings panel that was removed with its dialog', () => {
  const closeArgs = [];
  const { state, calls, runtime } = createDeps({ closeSettings: (reset) => closeArgs.push(reset) });
  state.settingsPanel = { parentNode: {}, isConnected: false }; // detached together with the HA dialog
  runtime.onKeydown({ key: 'Escape', preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') });

  assert.deepEqual(closeArgs, [false], 'the stale panel state is cleared');
  assert.equal(calls.includes('preventDefault'), false, 'the key still reaches the editor and the dialog');
  assert.equal(calls.includes('stopPropagation'), false);
});

test('keys pressed inside the settings panel do not drive the open popup', async () => {
  const panel = { parentNode: {}, isConnected: true };
  const { state, calls, runtime } = createDeps({
    isScopedEditorEvent: () => false,
    isNostrodomusUiEvent: () => true,
  });
  await runtime.open(true);
  state.settingsPanel = panel;
  calls.length = 0;

  for (const key of ['Tab', 'Enter', 'ArrowDown', ' ']) {
    runtime.onKeydown({ key, composedPath: () => [{}, panel, {}], preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') });
  }
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'insertItem'), [], 'no suggestion is inserted');
  assert.equal(calls.includes('preventDefault'), false, 'the panel control receives the key');
  assert.equal(state.selected, 0);
  assert.equal(state.overlay.style.display, 'block', 'the popup is left as it was');

  // Keys from the popup itself (also a Nostrodomus surface) keep working.
  runtime.onKeydown({ key: 'Enter', composedPath: () => [state.overlay], preventDefault: () => calls.push('preventDefault'), stopPropagation: () => {} });
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'insertItem'), [['insertItem', 'type']]);
});


test('keys pressed inside the settings panel do not drive the popup when the dialog counts as editor scope', async () => {
  const panel = { parentNode: {}, isConnected: true };
  const { state, calls, runtime } = createDeps({
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => true,
  });
  await runtime.open(true);
  state.settingsPanel = panel;
  calls.length = 0;
  for (const key of ['Tab', 'Enter', 'ArrowDown']) {
    runtime.onKeydown({ key, composedPath: () => [{}, panel, {}], preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') });
  }
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'insertItem'), [], 'no suggestion is inserted');
  assert.equal(calls.includes('preventDefault'), false, 'the panel control receives the key');
  assert.equal(state.selected, 0);
});

test('a list opened with the shortcut stays an explicit session while the user types (manual trigger mode)', async () => {
  const seen = [];
  const { runtime } = createDeps({
    scoreItems: (ctx) => { seen.push({ kind: ctx.triggerKind, explicitSession: ctx.explicitSession }); return [{ label: 'type', score: 10 }]; },
  });
  await runtime.open(true);
  runtime.refresh('typing');
  assert.deepEqual(seen[0], { kind: 'explicit', explicitSession: true });
  assert.deepEqual(seen[seen.length - 1], { kind: 'typing', explicitSession: true }, 'typing after an explicit open keeps the session');
});

// Editor scope is dialog-wide: any key or click in a card dialog that hosts a code editor passes
// isScopedEditorEvent. Keys on the dialog's own buttons and fields must not act on the list.
test('keys and clicks on other controls of the dialog close the list instead of driving it', async () => {
  const make = () => createDeps({ isScopedEditorEvent: () => true, isNostrodomusUiEvent: () => false, pathHasEditorSurface: () => false });
  const key = make();
  await key.runtime.open(true);
  key.calls.length = 0;
  key.runtime.onKeydown({ key: 'Enter', composedPath: () => [{}], preventDefault: () => key.calls.push('preventDefault'), stopPropagation: () => {} });
  assert.deepEqual(key.calls.filter((call) => Array.isArray(call) && call[0] === 'insertItem'), [], 'Enter on a dialog button inserts nothing');
  assert.equal(key.calls.includes('preventDefault'), false, 'the button receives the key');
  assert.equal(key.state.overlay.style.display, 'none', 'the list is closed');

  const click = make();
  await click.runtime.open(true);
  click.runtime.onPointer({ composedPath: () => [{}] });
  assert.equal(click.state.overlay.style.display, 'none', 'a click beside the editor closes the list');
});