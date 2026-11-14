import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';

// rememberView looks up the active dialog three times and
// asks for a style apply; isViewAllowed looks it up once more. A key pressed in the editor that
// is already bound and hooked needs neither.
function harness() {
  const calls = { rememberView: 0, isViewAllowed: 0, inserted: [], styleReapply: [] };
  const dom = { isConnected: true };
  const view = { dom, dispatch() {}, state: { selection: { main: { anchor: 0, head: 0 } } } };
  const documentRef = { activeElement: null };
  const state = {
    enabled: true,
    settings: { keepOpen: false, idlePaneText: true, enterCompletes: true, tabCompletes: true },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
    view,
    hookedView: view,
  };
  const runtime = createCompletionRuntime({
    state,
    documentRef,
    requestAnimationFrame: fn => { fn(); return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: () => 2,
    clearTimeout: () => {},
    now: () => 1000,
    renderCompletionPopup: () => {},
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'ty',
    getPos: () => 2,
    detectContext: (_doc, _pos, triggerKind) => ({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', prefix: 'ty', from: 0, to: 2, wordTo: 2, triggerKind, branchState: null }),
    scoreItems: () => [{ label: 'type:', insert: 'type: ', matchTier: 0 }, { label: 'title:', insert: 'title: ', matchTier: 1 }],
    updateContextInspectorPanel: () => {},
    updateSuggestionQualityPanel: () => {},
    recordRuntimeError: (scope, err) => { throw err; },
    recordRuntimeErrorOnce: () => {},
    isViewAllowed: () => { calls.isViewAllowed += 1; return true; },
    loadLibrary: async () => {},
    logDebug: () => {},
    openSettings: () => {},
    preserveScrollDuring: fn => fn(),
    editorDispatchRepeatPressureActive: () => false,
    recordPerformanceEvent: () => {},
    closeSettings: () => {},
    clearSnippetSession: () => {},
    moveSnippetPlaceholder: () => {},
    insertItem: item => calls.inserted.push(item?.label),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => { calls.rememberView += 1; },
    pathHasEditorSurface: path => path.some(node => node?.editorSurface),
    scheduleCodeboxStyleReapply: reason => { calls.styleReapply.push(reason); },
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  const content = { editorSurface: true };
  const key = (name, extra = {}, path = [content, dom]) => {
    const event = { key: name, prevented: false, composedPath: () => path, ...extra };
    event.preventDefault = () => { event.prevented = true; };
    event.stopPropagation = () => {};
    runtime.onKeydown(event);
    return event;
  };
  return { state, view, dom, documentRef, calls, runtime, key };
}

test('a key in the bound editor does not bind the view again or check it for a plain key', () => {
  const { calls, key } = harness();
  for (const name of ['a', 'ArrowDown', 'Backspace', 'Shift', 'Enter']) key(name);
  assert.equal(calls.rememberView, 0, 'the view is bound and hooked already');
  assert.equal(calls.isViewAllowed, 0, 'only Ctrl+Space asks whether the view is allowed');
});

// The style target can be lost while the bound editor is hidden (a style pass that finds no
// editor). A key in that editor then has to bring the styling back; before this it waited for
// the first typed character or a click.
test('a key in the bound editor asks for a style apply only while that editor is not the style target', () => {
  const { state, dom, calls, key } = harness();
  state.activeEditorCache = { editor: dom };
  key('ArrowDown');
  assert.deepEqual(calls.styleReapply, [], 'steady state: the bound editor is the target');

  state.activeEditorCache.editor = null;
  key('ArrowDown');
  assert.deepEqual(calls.styleReapply, ['remember-view']);

  // A view that cannot be a style target (a small editor in a form) is left alone.
  state.codeboxStyleViewDomChecked = dom;
  key('ArrowDown');
  assert.deepEqual(calls.styleReapply, ['remember-view']);
  assert.equal(calls.rememberView, 0);
});

test('the list keys work the same for a key in the bound editor', async () => {
  const { state, calls, runtime, key } = harness();
  await runtime.open(true);
  calls.isViewAllowed = 0;

  assert.equal(key('ArrowDown').prevented, true);
  assert.equal(state.selected, 1);
  assert.equal(key('Enter').prevented, true);
  assert.deepEqual(calls.inserted, ['title:']);
  assert.equal(calls.rememberView, 0);
  assert.equal(calls.isViewAllowed, 0);
});

test('Ctrl+Space still checks the view, and opens only when it is allowed', async () => {
  const { state, calls, key } = harness();
  key(' ', { code: 'Space', ctrlKey: true });
  assert.equal(calls.isViewAllowed >= 1, true, 'the view is checked');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(state.overlay.style.display, 'block', 'the list opens');
});

test('a key from any other place binds the view as before', () => {
  const other = { isConnected: true };

  const anotherEditor = harness();
  anotherEditor.key('a', {}, [{ editorSurface: true }, other]);
  assert.equal(anotherEditor.calls.rememberView, 1, 'another editor');

  const unbound = harness();
  unbound.state.view = null;
  unbound.key('a');
  assert.equal(unbound.calls.rememberView, 1, 'no view bound yet');

  const unhooked = harness();
  unhooked.state.hookedView = null;
  unhooked.key('a');
  assert.equal(unhooked.calls.rememberView, 1, 'bound but not hooked');

  const detached = harness();
  detached.dom.isConnected = false;
  detached.key('a');
  assert.equal(detached.calls.rememberView, 1, 'the bound editor left the page');

  // The path stops at the dialog; the key is in scope because the focus is inside the bound editor.
  const retargeted = harness();
  retargeted.documentRef.activeElement = retargeted.dom;
  retargeted.key('a', {}, [{ tagName: 'HUI-DIALOG-EDIT-CARD' }]);
  assert.equal(retargeted.calls.rememberView, 1, 'a path that does not reach the editor element');
});
