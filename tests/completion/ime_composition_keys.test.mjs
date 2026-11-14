import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';

function harness(stateOverrides = {}) {
  const calls = [];
  const state = {
    enabled: true,
    settings: { keepOpen: false, idlePaneText: true, enterCompletes: true, tabCompletes: true },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
    ...stateOverrides,
  };
  const runtime = createCompletionRuntime({
    state,
    documentRef: {},
    cancelAnimationFrame: () => {},
    requestAnimationFrame: fn => { fn(); return 1; },
    clearTimeout: () => {},
    setTimeout: () => 2,
    now: () => 1000,
    renderCompletionPopup: () => calls.push('render'),
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; calls.push('close'); },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'ty',
    getPos: () => 2,
    detectContext: (_doc, _pos, triggerKind) => ({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', prefix: 'ty', from: 0, to: 2, wordTo: 2, triggerKind, branchState: null }),
    scoreItems: () => [{ label: 'type:', insert: 'type: ', matchTier: 0 }, { label: 'title:', insert: 'title: ', matchTier: 1 }],
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
    closeSettings: () => calls.push('closeSettings'),
    clearSnippetSession: () => calls.push('clearSnippetSession'),
    moveSnippetPlaceholder: direction => calls.push(['moveSnippet', direction]),
    insertItem: item => calls.push(['insert', item?.label]),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true,
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  const press = (event) => {
    const seen = { prevented: false, stopped: false };
    runtime.onKeydown({ ...event, preventDefault: () => { seen.prevented = true; }, stopPropagation: () => { seen.stopped = true; } });
    return seen;
  };
  return { state, calls, runtime, press };
}

test('keys that belong to an input method composition are left to the editor', async () => {
  const { state, calls, runtime, press } = harness();
  await runtime.open(true);
  assert.equal(state.overlay.style.display, 'block');
  calls.length = 0;

  for (const event of [
    { key: 'Enter', isComposing: true },
    { key: 'Tab', isComposing: true },
    { key: 'ArrowDown', isComposing: true },
    { key: 'Escape', isComposing: true },
    { key: ':', isComposing: true },
    { key: 'Process', keyCode: 229 },
    { key: 'Enter', keyCode: 229 },
  ]) {
    const seen = press(event);
    assert.deepEqual(seen, { prevented: false, stopped: false }, JSON.stringify(event));
  }
  assert.deepEqual(calls, [], 'nothing is accepted, moved or closed');
  assert.equal(state.selected, 0);
  assert.equal(state.overlay.style.display, 'block', 'the list stays as it is');
});

test('a composition key does not drive a snippet session or the settings panel', () => {
  const session = { view: {}, from: 0, index: 0, placeholders: [{ index: 1, start: 0, end: 2 }], allPlaceholders: [] };
  const { calls, press } = harness({ snippetSession: session });
  assert.deepEqual(press({ key: 'Tab', isComposing: true }), { prevented: false, stopped: false });
  assert.deepEqual(press({ key: 'Escape', keyCode: 229 }), { prevented: false, stopped: false });
  assert.deepEqual(calls, []);

  const panel = harness({ settingsPanel: { parentNode: {}, isConnected: true } });
  assert.deepEqual(panel.press({ key: 'Escape', isComposing: true }), { prevented: false, stopped: false });
  assert.deepEqual(panel.calls, [], 'Escape that cancels a composition does not close Settings');
});

test('the same keys outside a composition still drive the list', async () => {
  const { state, calls, runtime, press } = harness();
  await runtime.open(true);
  calls.length = 0;

  assert.deepEqual(press({ key: 'ArrowDown', isComposing: false, keyCode: 40 }), { prevented: true, stopped: true });
  assert.equal(state.selected, 1);

  assert.deepEqual(press({ key: 'Enter', keyCode: 13 }), { prevented: true, stopped: true });
  assert.deepEqual(calls.filter(call => Array.isArray(call)), [['insert', 'title:']]);

  assert.deepEqual(press({ key: 'Escape', keyCode: 27 }), { prevented: true, stopped: true });
  assert.equal(state.overlay.style.display, 'none');

  const snippet = harness({ snippetSession: { view: {}, from: 0, index: 0, placeholders: [{ index: 1, start: 0, end: 2 }], allPlaceholders: [] } });
  assert.deepEqual(snippet.press({ key: 'Tab', keyCode: 9 }), { prevented: true, stopped: true });
  assert.deepEqual(snippet.calls, [['moveSnippet', 1]]);
});
