import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';
import { renderCompletionPopup, updateCompletionPopupSelection } from '../../src/completion/popupRuntime.js';

// An arrow key in the suggestion list rebuilt every row and placed the list twice. It now
// repaints the two rows whose state changed and the details pane, and places the list once.

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
    this.parentNode = null;
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter((x) => x !== child); child.parentNode = null; return child; }
  replaceChild(next, old) { this.children = this.children.map((x) => (x === old ? next : x)); next.parentNode = this; old.parentNode = null; return old; }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
  querySelector(selector) {
    const data = /^\[data-nostrodomus-(list|detail|signature)="1"\]$/.exec(selector);
    const row = /^\.nostrodomus-intelli-row\[data-i="(\d+)"\]$/.exec(selector);
    const key = data ? `nostrodomus${data[1][0].toUpperCase()}${data[1].slice(1)}` : '';
    const matches = (el) => (data ? el.dataset?.[key] === '1' : row ? String(el.className).includes('nostrodomus-intelli-row') && el.dataset?.i === row[1] : false);
    const walk = (el) => {
      for (const child of el.children || []) {
        if (matches(child)) return child;
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    };
    return walk(this);
  }
}

const fakeDocument = {
  createElement(tag) { return new FakeElement(tag); },
  createTextNode(text) { return { tag: '#text', textContent: String(text) }; },
};

function renderedPopup(labels = ['alpha', 'beta', 'gamma']) {
  const box = new FakeElement('div');
  box.style.display = 'block';
  const state = {
    settings: { showDetailsPane: true, popupSize: 'compact' },
    docsExpanded: false,
    selected: 0,
    context: { lang: 'yaml', prefix: '' },
    items: labels.map((label) => ({ label, insert: label, type: 'key', source: 'test', meta: { documentation: `About ${label}` } })),
    overlay: box,
  };
  const placements = [];
  const deps = {
    documentRef: fakeDocument,
    ensureOverlay: () => box,
    insertItem: () => {},
    openSettings: () => {},
    preserveScrollDuring: (fn) => fn(),
    measurePerformanceEvent: (_name, _label, fn) => fn(),
    placeAtCursor: () => placements.push('place'),
  };
  renderCompletionPopup(state, deps);
  const list = box.querySelector('[data-nostrodomus-list="1"]');
  return { box, state, deps, placements, list };
}

const textOf = (el) => [el.textContent || '', ...(el.children || []).map(textOf)].join(' ');

test('a full render of a visible list places it once', () => {
  const { placements } = renderedPopup();
  assert.deepEqual(placements, ['place']);
});

test('a hidden list is not placed by the render', () => {
  const box = new FakeElement('div');
  box.style.display = 'none';
  const placements = [];
  renderCompletionPopup({ settings: { popupSize: 'compact' }, selected: 0, context: {}, items: [{ label: 'alpha', type: 'key' }], overlay: box }, {
    documentRef: fakeDocument,
    ensureOverlay: () => box,
    measurePerformanceEvent: (_name, _label, fn) => fn(),
    placeAtCursor: () => placements.push('place'),
  });
  assert.deepEqual(placements, []);
});

test('moving the selection keeps the rows and repaints the two that changed', () => {
  const { box, state, deps, placements, list } = renderedPopup();
  const rows = list.children.slice();
  const firstDetail = box.querySelector('[data-nostrodomus-detail="1"]');
  assert.ok(textOf(firstDetail).includes('alpha'));
  placements.length = 0;

  state.selected = 2;
  assert.equal(updateCompletionPopupSelection(state, 0, deps), true);

  assert.deepEqual(list.children, rows, 'the row elements are the ones rendered before');
  assert.equal(rows[0].attributes['aria-selected'], 'false');
  assert.equal(rows[0].style.background, 'transparent');
  assert.equal(rows[1].attributes['aria-selected'], 'false');
  assert.equal(rows[2].attributes['aria-selected'], 'true');
  assert.equal(rows[2].style.color, '#fff');
  assert.notEqual(rows[2].style.background, 'transparent');
  assert.equal(list.attributes['aria-activedescendant'], 'nostrodomus-intelli-option-2');

  const detail = box.querySelector('[data-nostrodomus-detail="1"]');
  assert.notEqual(detail, firstDetail);
  assert.ok(textOf(detail).includes('gamma'), 'the details pane shows the selected item');
  assert.equal(box.children.filter((child) => child.dataset.nostrodomusDetail === '1').length, 1);
  assert.deepEqual(placements, ['place'], 'the list is placed once');
});

test('the in-place update declines when the rendered rows are not the current items', () => {
  const { state, deps } = renderedPopup();
  state.items = state.items.slice(0, 2);
  state.selected = 1;
  assert.equal(updateCompletionPopupSelection(state, 0, deps), false);
  assert.equal(updateCompletionPopupSelection({ ...state, overlay: null }, 0, deps), false);
});

function runtimeWith(overlay, calls, scoreItems = () => ['alpha', 'beta', 'gamma'].map((label, i) => ({ label, score: 10 - i, type: 'key' }))) {
  const state = { enabled: true, settings: { keepOpen: false, idlePaneText: true, enterCompletes: true, tabCompletes: true }, items: [], selected: 0, overlay, context: {} };
  const runtime = createCompletionRuntime({
    state,
    documentRef: fakeDocument,
    cancelAnimationFrame: () => {},
    requestAnimationFrame: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    setTimeout: (fn) => { fn(); return 2; },
    now: () => 1000,
    renderCompletionPopup: (popupState, deps) => { calls.push('render'); return renderCompletionPopup(popupState, deps); },
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => calls.push('place'),
    popupIsOpen: () => state.overlay?.style?.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'type: button',
    getPos: () => 6,
    detectContext: (_doc, _pos, triggerKind) => ({ shouldSuggest: true, triggerKind, branchState: null }),
    scoreItems,
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
    insertItem: () => {},
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true, // the events these tests send come from the editor
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  return { state, runtime };
}

test('opening the list renders and places it once, and an arrow key does not render again', async () => {
  const calls = [];
  const overlay = new FakeElement('div');
  overlay.style.display = 'none';
  const { state, runtime } = runtimeWith(overlay, calls);
  await runtime.open(true);
  assert.equal(overlay.style.display, 'block');
  assert.deepEqual(calls, ['render', 'place'], 'one render, one placement after the box is shown');

  calls.length = 0;
  runtime.onKeydown({ key: 'ArrowDown', preventDefault: () => {}, stopPropagation: () => {} });
  assert.equal(state.selected, 1);
  // No details pane here, so the box keeps its size and is not placed again either.
  assert.deepEqual(calls, [], 'the selection moved without a render');
  const list = overlay.querySelector('[data-nostrodomus-list="1"]');
  assert.equal(list.children[1].attributes['aria-selected'], 'true');
  assert.equal(list.children[0].attributes['aria-selected'], 'false');

  // Typing with the list open renders again and places it once.
  calls.length = 0;
  runtime.refresh('typing');
  assert.deepEqual(calls, ['render', 'place']);
});

test('the idle pane is placed once, both when the box was hidden and when the list was showing', async () => {
  const calls = [];
  const overlay = new FakeElement('div');
  overlay.style.display = 'none';
  let rows = [];
  const { runtime } = runtimeWith(overlay, calls, () => rows);
  await runtime.open(true);
  assert.equal(overlay.style.display, 'block');
  assert.deepEqual(calls, ['render', 'place'], 'no rows: the idle pane is rendered, shown and placed');

  // The list is showing, then a keystroke leaves no rows: the pane replaces the list in the
  // visible box and has another height, so it is placed again.
  rows = [{ label: 'alpha', score: 1, type: 'key' }];
  runtime.refresh('typing');
  calls.length = 0;
  rows = [];
  runtime.refresh('typing');
  assert.deepEqual(calls, ['render', 'place']);
});
