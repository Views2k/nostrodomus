import test from 'node:test';
import assert from 'node:assert/strict';

import { placeCompletionPopupAtCursor, renderCompletionPopup, updateCompletionPopupSelection } from '../../src/completion/popupRuntime.js';

// A placement read the box rectangle, wrote the position, and read the rectangle
// again to cancel a containing-block offset: two forced layouts per keystroke and per scroll
// frame. The first read already shows the offset when the box has been placed before and is not
// scaled, so the second read is left out then. The position must be the same either way.

// A box that lands where its style says plus the offset of its containing block. `layoutSize`
// false leaves out offsetWidth/offsetHeight, which sends the placement down the two-read path.
function fakeBox({ offsetX = 0, offsetY = 0, width = 280, height = 150, scale = 1, layoutSize = true } = {}) {
  const box = {
    reads: 0,
    dataset: {},
    style: { display: 'block', left: '', top: '' },
    getBoundingClientRect() {
      box.reads += 1;
      const left = parseFloat(box.style.left);
      const top = parseFloat(box.style.top);
      return {
        left: (Number.isFinite(left) ? left * scale : 0) + offsetX,
        top: (Number.isFinite(top) ? top * scale : 0) + offsetY,
        width: width * scale,
        height: height * scale,
      };
    },
  };
  if (layoutSize) {
    box.offsetWidth = Math.round(width);
    box.offsetHeight = Math.round(height);
  }
  return box;
}

function placer(box) {
  let caret = { top: 400, bottom: 416, left: 200 };
  const scroller = { addEventListener() {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) }; // bounds = viewport
  const state = { overlay: box, context: { from: 5 }, view: { dom: { querySelector: () => scroller, closest: () => null }, coordsAtPos: () => caret } };
  const deps = { getPos: () => 5, ensureOverlay: () => box, windowRef: { innerWidth: 1440, innerHeight: 900, requestAnimationFrame: fn => fn() } };
  return {
    place(nextCaret) {
      if (nextCaret) caret = nextCaret;
      box.reads = 0;
      placeCompletionPopupAtCursor(state, deps);
      return { left: box.style.left, top: box.style.top, placement: box.dataset.placement, reads: box.reads };
    },
  };
}

const carets = [
  { top: 400, bottom: 416, left: 200 },
  { top: 400, bottom: 416, left: 260 },
  { top: 420, bottom: 436, left: 120 },
  { top: 860, bottom: 876, left: 1400 }, // flips above and clamps to the right edge
  { top: 20, bottom: 36, left: 4 },
];

for (const offset of [{ offsetX: 0, offsetY: 0 }, { offsetX: 26, offsetY: 40 }, { offsetX: -13.5, offsetY: 7.25 }, { offsetX: 0.6, offsetY: -0.9 }]) {
  test(`one rectangle read per placement gives the same position as two (offset ${offset.offsetX}/${offset.offsetY})`, () => {
    const fast = placer(fakeBox({ ...offset }));
    const reference = placer(fakeBox({ ...offset, layoutSize: false }));

    const first = fast.place(carets[0]);
    assert.equal(first.reads, 2, 'the first placement has no earlier position to measure from');
    assert.deepEqual({ ...first, reads: 0 }, { ...reference.place(carets[0]), reads: 0 });

    for (const caret of carets.slice(1)) {
      const placed = fast.place(caret);
      const expected = reference.place(caret);
      assert.equal(expected.reads, 2, 'the reference path reads twice');
      assert.equal(placed.reads, 1, 'a later placement reads once');
      assert.deepEqual({ ...placed, reads: 0 }, { ...expected, reads: 0 }, JSON.stringify(caret));
    }
  });
}

test('a fractional box width still takes the one-read path', () => {
  const fast = placer(fakeBox({ width: 285.5, height: 149.6 }));
  fast.place(carets[0]);
  assert.equal(fast.place(carets[1]).reads, 1);
});

test('a scaled box keeps the two reads, because its offset depends on the position', () => {
  const scaled = placer(fakeBox({ offsetX: 26, offsetY: 40, scale: 0.9 }));
  scaled.place(carets[0]);
  assert.equal(scaled.place(carets[1]).reads, 2);
});

test('a box that is not displayed keeps the two reads', () => {
  const hidden = placer(fakeBox({ width: 0, height: 0 }));
  hidden.place(carets[0]);
  assert.equal(hidden.place(carets[1]).reads, 2);
});

// Arrow keys.

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
  removeChild(child) { this.children = this.children.filter(x => x !== child); child.parentNode = null; return child; }
  replaceChild(next, old) { this.children = this.children.map(x => (x === old ? next : x)); next.parentNode = this; old.parentNode = null; return old; }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
  querySelector(selector) {
    const data = /^\[data-nostrodomus-(list|detail|signature)="1"\]$/.exec(selector);
    const row = /^\.nostrodomus-intelli-row\[data-i="(\d+)"\]$/.exec(selector);
    const key = data ? `nostrodomus${data[1][0].toUpperCase()}${data[1].slice(1)}` : '';
    const matches = el => (data ? el.dataset?.[key] === '1' : row ? String(el.className).includes('nostrodomus-intelli-row') && el.dataset?.i === row[1] : false);
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

const fakeDocument = {
  createElement: tag => new FakeElement(tag),
  createTextNode: text => ({ tag: '#text', textContent: String(text) }),
};

function renderedList({ showDetailsPane, documented = true }) {
  const box = new FakeElement('div');
  box.style.display = 'block';
  const state = {
    settings: { showDetailsPane, popupSize: 'compact' },
    docsExpanded: false,
    selected: 0,
    context: { lang: 'yaml', prefix: '' },
    items: ['alpha', 'beta', 'gamma'].map(label => ({ label, insert: label, type: 'key', source: 'test', meta: documented ? { documentation: `About ${label}` } : {} })),
    overlay: box,
  };
  const placements = [];
  const deps = {
    documentRef: fakeDocument,
    ensureOverlay: () => box,
    insertItem: () => {},
    openSettings: () => {},
    preserveScrollDuring: fn => fn(),
    measurePerformanceEvent: (_name, _label, fn) => fn(),
    placeAtCursor: () => placements.push('place'),
  };
  renderCompletionPopup(state, deps);
  placements.length = 0;
  return { box, state, deps, placements };
}

test('an arrow key in a list without a details pane does not place the list again', () => {
  const { box, state, deps, placements } = renderedList({ showDetailsPane: false });
  assert.equal(box.querySelector('[data-nostrodomus-detail="1"]'), null);
  state.selected = 1;
  assert.equal(updateCompletionPopupSelection(state, 0, deps), true);
  state.selected = 2;
  assert.equal(updateCompletionPopupSelection(state, 1, deps), true);
  assert.deepEqual(placements, [], 'the box keeps its size, so its place is unchanged');
  assert.equal(box.querySelector('.nostrodomus-intelli-row[data-i="2"]').attributes['aria-selected'], 'true');
});

test('an arrow key in a list with a details pane places the list once, as before', () => {
  const { state, deps, placements } = renderedList({ showDetailsPane: true });
  state.selected = 1;
  assert.equal(updateCompletionPopupSelection(state, 0, deps), true);
  assert.deepEqual(placements, ['place'], 'the pane can change the height of the box');
});
