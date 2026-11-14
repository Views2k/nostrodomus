import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';
import { insertItem } from '../../src/completion/insertion.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// Types a colon with the list open, through the real key handling, context detection and
// insertItem. The document is written with the caret as `|`; the result is the document after
// the key, with the caret marked the same way. A key the list does not take is typed into the
// document, as the editor would.
async function typeColon(docWithCaret, rows) {
  const pos = docWithCaret.indexOf('|');
  const view = {
    text: docWithCaret.replace('|', ''),
    state: { doc: { get length() { return view.text.length; } }, selection: { main: { anchor: pos, head: pos } } },
    dispatch(payload) {
      const change = payload.changes;
      if (change) view.text = view.text.slice(0, change.from) + change.insert + view.text.slice(change.to);
      if (payload.selection) view.state.selection = { main: { anchor: payload.selection.anchor, head: payload.selection.head ?? payload.selection.anchor } };
    },
  };
  const state = {
    enabled: true,
    settings: { commitCharacters: true, acceptMode: 'replace', enterCompletes: true, tabCompletes: true },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
    view,
  };
  const runtime = createCompletionRuntime({
    state,
    documentRef: {},
    cancelAnimationFrame: () => {},
    requestAnimationFrame: () => 1,
    clearTimeout: () => {},
    setTimeout: () => 2,
    now: () => 1000,
    renderCompletionPopup: () => {},
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => view.text,
    getPos: () => view.state.selection.main.head,
    detectContext: (doc, at, triggerKind) => detectRuntimeContext(doc, at, { triggerKind }),
    scoreItems: () => rows,
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
    insertItem: item => insertItem(state, item, { closeCompletion: () => { state.overlay.style.display = 'none'; }, scheduleFrame: () => {}, now: () => 1000 }),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true,
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  await runtime.open(true);
  assert.equal(state.overlay.style.display, 'block', 'the list is open');

  let prevented = false;
  runtime.onKeydown({ key: ':', preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
  if (!prevented) {
    const at = view.state.selection.main.head;
    view.dispatch({ changes: { from: at, to: at, insert: ':' }, selection: { anchor: at + 1 } });
  }
  const { anchor, head } = view.state.selection.main;
  if (anchor === head) return view.text.slice(0, head) + '|' + view.text.slice(head);
  return view.text.slice(0, anchor) + '<<' + view.text.slice(anchor, head) + '>>' + view.text.slice(head);
}

const row = (type, label, insert) => ({ type, label, insert, matchTier: 0 });

// completion#5
test('a colon typed over a key row puts one colon after the key', async () => {
  // Already correct: rows that end at their colon, and a row without one.
  assert.equal(await typeColon('type: entities\nent|', [row('key', 'entity:', 'entity: ')]), 'type: entities\nentity: |');
  assert.equal(await typeColon('type: entities\nent|', [row('key', 'entities:', 'entities:')]), 'type: entities\nentities:|');
  assert.equal(await typeColon('type: button\nico|', [row('key', 'icon:', 'icon: mdi:')]), 'type: button\nicon: mdi:|');
  assert.equal(await typeColon('type: entities\nent|', [row('word', 'entity', 'entity')]), 'type: entities\nentity:|');

  // A key row that carries a value already has the colon the user typed.
  assert.equal(await typeColon('browser_mod:\n  siz|', [row('key', 'size:', 'size: normal')]), 'browser_mod:\n  size: normal|');
  assert.equal(await typeColon('browser_mod:\n  dis|', [row('key', 'dismissable:', 'dismissable: true')]), 'browser_mod:\n  dismissable: true|');
  assert.equal(await typeColon('cards:\n  - siz|', [row('key', 'size:', 'size: normal')]), 'cards:\n  - size: normal|');
});

test('a colon typed over a snippet row does not add a colon at the end of the snippet', async () => {
  const snippet = row('snippet', 'tap_action toggle', 'tap_action:\n  action: ${1:toggle}');
  assert.equal(await typeColon('type: button\ntap|', [snippet]), 'type: button\ntap_action:\n  action: <<toggle>>');
});

test('a colon typed when the list does not commit goes into the document', async () => {
  // The typed text is already a complete key of the list.
  assert.equal(
    await typeColon('condition|', [row('key', 'conditions:', 'conditions:'), row('key', 'condition:', 'condition: ')]),
    'condition:|',
  );
});
