import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';
import { renderCompletionPopup } from '../../src/completion/popupRuntime.js';

// The rows of a hidden box have no size, so the render cannot scroll a kept selection into view;
// the selected row must be scrolled into view once the box is shown.

const ROW_HEIGHT = 20;
const LIST_HEIGHT = 100;

// Elements that have a size only while the box they are in is displayed, like a real layout.
class FakeElement {
  constructor(tag, root = null) {
    this.tag = tag;
    this.root = root || this;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.id = '';
    this.textContent = '';
    this.scrollTop = 0;
    this.parentNode = null;
  }
  get laidOut() { return this.root.style.display !== 'none'; }
  get clientHeight() { return this.laidOut && this.dataset.nostrodomusList === '1' ? LIST_HEIGHT : 0; }
  get offsetHeight() { return this.laidOut && String(this.className).includes('nostrodomus-intelli-row') ? ROW_HEIGHT : 0; }
  get offsetTop() { return this.laidOut && String(this.className).includes('nostrodomus-intelli-row') ? Number(this.dataset.i) * ROW_HEIGHT : 0; }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter(x => x !== child); child.parentNode = null; return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 150 }; }
  get firstChild() { return this.children[0] || null; }
  querySelector(selector) {
    const row = /^\.nostrodomus-intelli-row\[data-i="(\d+)"\]$/.exec(selector);
    const matches = el => (selector === '[data-nostrodomus-list="1"]'
      ? el.dataset?.nostrodomusList === '1'
      : row ? String(el.className).includes('nostrodomus-intelli-row') && el.dataset?.i === row[1] : false);
    const walk = el => {
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

function harness(selected) {
  const box = new FakeElement('div');
  box.style.display = 'none';
  const documentRef = {
    createElement: tag => new FakeElement(tag, box),
    createTextNode: text => ({ tag: '#text', textContent: String(text) }),
  };
  const rows = Array.from({ length: 12 }, (_unused, index) => ({ id: `row-${index}`, label: `row_${index}`, insert: `row_${index}: `, type: 'key', matchTier: 1 }));
  const state = {
    enabled: true,
    settings: { keepOpen: false, idlePaneText: true, popupSize: 'compact', showDetailsPane: false },
    items: rows,
    selected,
    lastExplicitOpen: true,
    overlay: box,
    context: {},
  };
  const runtime = createCompletionRuntime({
    state,
    documentRef,
    cancelAnimationFrame: () => {},
    requestAnimationFrame: () => 1,
    clearTimeout: () => {},
    setTimeout: () => 2,
    now: () => 1000,
    renderCompletionPopup,
    ensureOverlay: () => box,
    placeAtCursor: () => {},
    popupIsOpen: () => box.style.display !== 'none',
    closePopup: () => { box.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'ro',
    getPos: () => 2,
    detectContext: (_doc, at, triggerKind) => ({ shouldSuggest: true, lang: 'yaml', prefix: 'ro', from: 0, to: at, triggerKind, branchState: null }),
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
    insertItem: () => {},
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true,
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  const list = () => box.querySelector('[data-nostrodomus-list="1"]');
  return { state, box, runtime, list };
}

test('a list shown from hidden scrolls the kept selection into view', () => {
  const { state, box, runtime, list } = harness(9);
  runtime.refresh('typing');
  assert.equal(box.style.display, 'block', 'the list is shown');
  assert.equal(state.selected, 9, 'the selection is kept');
  // Row 9 spans 180..200 in a list that shows 100.
  assert.equal(list().scrollTop, 100);
});

test('a list shown from hidden with the first row selected stays at its top', () => {
  const { box, runtime, list } = harness(0);
  runtime.refresh('typing');
  assert.equal(box.style.display, 'block');
  assert.equal(list().scrollTop, 0);
});

test('a list that is already shown scrolls the kept selection into view in the render', () => {
  const { box, runtime, list } = harness(9);
  box.style.display = 'block';
  runtime.refresh('typing');
  assert.equal(list().scrollTop, 100);
});
