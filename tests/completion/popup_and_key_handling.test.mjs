import test from 'node:test';
import assert from 'node:assert/strict';

import * as completionRuntimeModule from '../../src/completion/completionRuntime.js';
import { renderCompletionPopup, syncCompletionEditorAria } from '../../src/completion/popupRuntime.js';

const { createCompletionRuntime } = completionRuntimeModule;

function createDeps(overrides = {}) {
  const state = overrides.state || {
    enabled: true,
    settings: { keepOpen: false, idlePaneText: true, enterCompletes: true, tabCompletes: true },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
  };
  const calls = [];
  const deps = {
    state,
    documentRef: {},
    cancelAnimationFrame: () => {},
    requestAnimationFrame: fn => { fn(); return 1; },
    clearTimeout: () => {},
    setTimeout: fn => { fn(); return 2; },
    now: () => 1000,
    renderCompletionPopup: () => calls.push('renderPopup'),
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay?.style?.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'type: button',
    getPos: () => 6,
    detectContext: (_doc, _pos, triggerKind) => ({ shouldSuggest: true, triggerKind, branchState: null }),
    scoreItems: () => [{ label: 'type', score: 10 }],
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
    clearSnippetSession: () => { calls.push('clearSnippetSession'); state.snippetSession = null; },
    moveSnippetPlaceholder: direction => calls.push(['moveSnippetPlaceholder', direction]),
    insertItem: item => calls.push(['insertItem', item?.label]),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true, // the events these tests send come from the editor
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
    ...overrides,
  };
  return { state, calls, runtime: createCompletionRuntime(deps) };
}

function keyEvent(key) {
  const event = { key, prevented: false, stopped: false };
  event.preventDefault = () => { event.prevented = true; };
  event.stopPropagation = () => { event.stopped = true; };
  return event;
}

function sessionWithCaret(head) {
  return {
    view: { dispatch() {}, state: { selection: { main: { anchor: head, head } } } },
    from: 100,
    index: 0,
    placeholders: [{ index: 1, start: 8, end: 21 }, { index: 2, start: 43, end: 56 }],
    allPlaceholders: [{ index: 1, start: 8, end: 21 }, { index: 2, start: 43, end: 56 }],
    finalCursor: null,
  };
}

// [F]
test('Tab and Escape go back to the editor once the caret has left the snippet', () => {
  for (const key of ['Tab', 'Escape']) {
    const { state, calls, runtime } = createDeps();
    state.snippetSession = sessionWithCaret(400); // the snippet spans 108..156
    const event = keyEvent(key);
    runtime.onKeydown(event);
    assert.equal(state.snippetSession, null, `${key}: the stale session is ended`);
    assert.equal(event.prevented, false, `${key}: the key is not consumed`);
    assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'moveSnippetPlaceholder'), false, `${key}: no jump to an old placeholder`);
  }
});

test('Tab still moves between placeholders while the caret is inside the snippet', () => {
  const { state, calls, runtime } = createDeps();
  state.snippetSession = sessionWithCaret(112);
  const event = keyEvent('Tab');
  runtime.onKeydown(event);
  assert.ok(state.snippetSession, 'the session stays');
  assert.equal(event.prevented, true);
  assert.deepEqual(calls.find(call => Array.isArray(call)), ['moveSnippetPlaceholder', 1]);
});

test('Tab and Escape in another editor are not taken for a snippet left behind in the first one', () => {
  for (const key of ['Tab', 'Escape']) {
    const { state, calls, runtime } = createDeps();
    // The caret of the first editor still sits inside its snippet; the key is pressed in a second editor.
    state.snippetSession = sessionWithCaret(112);
    state.view = { dispatch() {}, state: { selection: { main: { anchor: 3, head: 3 } } } };
    const event = keyEvent(key);
    runtime.onKeydown(event);
    assert.equal(state.snippetSession, null, `${key}: the session of the other editor is ended`);
    assert.equal(event.prevented, false, `${key}: the key is not consumed`);
    assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'moveSnippetPlaceholder'), false, `${key}: no jump in the first editor`);
  }
});

test('Tab moves between placeholders when the snippet is in the bound editor', () => {
  const { state, calls, runtime } = createDeps();
  state.snippetSession = sessionWithCaret(112);
  state.view = state.snippetSession.view;
  const event = keyEvent('Tab');
  runtime.onKeydown(event);
  assert.ok(state.snippetSession, 'the session stays');
  assert.equal(event.prevented, true);
  assert.deepEqual(calls.find(call => Array.isArray(call)), ['moveSnippetPlaceholder', 1]);
});

test('Escape in a snippet session ends the session and closes an open list', async () => {
  const { state, calls, runtime } = createDeps();
  await runtime.open(true);
  assert.equal(state.overlay.style.display, 'block', 'precondition: the list is open');
  state.snippetSession = sessionWithCaret(112);
  const event = keyEvent('Escape');
  runtime.onKeydown(event);
  assert.ok(calls.includes('clearSnippetSession'), 'the session is ended');
  assert.equal(state.overlay.style.display, 'none', 'the list is closed');
  assert.equal(event.prevented, true, 'the key does not reach the dialog');
  assert.equal(state.escapeSuppressUntilBoundary, true, 'the list stays closed like after its own Escape');
});

test('Escape in a snippet session with the list closed only ends the session', () => {
  const { state, calls, runtime } = createDeps();
  state.snippetSession = sessionWithCaret(112);
  const event = keyEvent('Escape');
  runtime.onKeydown(event);
  assert.ok(calls.includes('clearSnippetSession'));
  assert.equal(state.overlay.style.display, 'none');
  assert.equal(event.prevented, true);
  assert.notEqual(state.escapeSuppressUntilBoundary, true, 'no suppression when no list was closed');
});

function fakeContent() {
  const attrs = {};
  const writes = [];
  return {
    attrs,
    writes,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute(name, value) { writes.push(name); attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
  };
}

// [K]
test('hiding the popup without close() clears the combobox attributes on the editor', async () => {
  const content = fakeContent();
  let suggest = true;
  const { state, runtime } = createDeps({
    detectContext: (_doc, _pos, triggerKind) => ({ shouldSuggest: suggest, suppressPopup: !suggest, triggerKind, branchState: null }),
    renderCompletionPopup: current => syncCompletionEditorAria(current, true),
  });
  state.view = { contentDOM: content };
  await runtime.open(true);
  assert.equal(content.attrs['aria-expanded'], 'true', 'precondition: open popup marks the editor');

  suggest = false; // e.g. the caret moved into a comment: refresh hides through overlayVisible('none')
  runtime.refresh('typing');
  assert.equal(state.overlay.style.display, 'none');
  assert.equal(content.attrs['aria-expanded'], undefined);
  assert.equal(content.attrs['aria-activedescendant'], undefined);
  assert.equal(content.attrs['aria-controls'], undefined);
});

test('re-rendering with the same selection does not rewrite the editor attributes', () => {
  const content = fakeContent();
  const state = { items: [{ label: 'a' }, { label: 'b' }], selected: 0, view: { contentDOM: content } };
  syncCompletionEditorAria(state, true);
  assert.equal(content.writes.length, 3);
  syncCompletionEditorAria(state, true);
  assert.equal(content.writes.length, 3, 'unchanged values are not written again');
  state.selected = 1;
  syncCompletionEditorAria(state, true);
  assert.deepEqual(content.writes.slice(3), ['aria-activedescendant'], 'only the changed attribute is written');
});

// [H]
test('the document token changes when the text changes without changing its length or ends', () => {
  const tokens = [];
  const docs = ['entity: light.kitchen_main\nname: x', 'entity: light.bedroom_main\nname: x'];
  assert.equal(docs[0].length, docs[1].length);
  let current = docs[0];
  const { runtime } = createDeps({
    getDoc: () => current,
    scoreItems: ctx => { tokens.push(ctx.documentWordToken); return []; },
  });
  runtime.compute('typing');
  current = docs[1];
  runtime.compute('typing');
  assert.notEqual(tokens[0], tokens[1]);
});

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.id = '';
    this.textContent = '';
    this.clientHeight = 100;
    this.scrollTop = 0;
    this.offsetTop = 0;
    this.offsetHeight = 20;
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter(x => x !== child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
  replaceChildren() { this.children = []; }
  querySelector() { return null; }
}

const fakeDocument = {
  createElement(tag) { return new FakeElement(tag); },
  createTextNode(text) { return { tag: '#text', textContent: String(text) }; },
};

// [J]
test('the popup box is not capped at the list-only height when the details pane is shown', () => {
  const render = showDetailsPane => {
    const box = new FakeElement('div');
    box.style.maxHeight = '178px';
    const state = {
      settings: { showDetailsPane, popupSize: 'large' },
      docsExpanded: true,
      selected: 0,
      context: { lang: 'yaml', prefix: 'ent' },
      items: [{ label: 'entity_id', insert: 'entity_id: ', type: 'key', source: 'hacs-catalog', matchReason: 'exact-prefix', meta: { documentation: 'Line one\nLine two' } }],
      overlay: box,
    };
    renderCompletionPopup(state, {
      documentRef: fakeDocument,
      ensureOverlay: () => box,
      insertItem: () => {},
      openSettings: () => {},
      preserveScrollDuring: fn => fn(),
      measurePerformanceEvent: (_name, _label, fn) => fn(),
    });
    return box.style.maxHeight;
  };
  assert.equal(render(false), '178px', 'list-only popup keeps its cap');
  assert.notEqual(render(true), '178px', 'the details pane must not be clipped by the list-only cap');
});
