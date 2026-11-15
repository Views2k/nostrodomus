import test from 'node:test';
import assert from 'node:assert/strict';

import { completionPopupPosition, placeCompletionPopupAtCursor, renderCompletionPopup } from '../../src/completion/popupRuntime.js';

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
  querySelector(selector) {
    const all = [];
    const walk = node => {
      if (!node || !node.children) return;
      for (const child of node.children) { all.push(child); walk(child); }
    };
    walk(this);
    if (selector === '[data-nostrodomus-list="1"]') return all.find(el => el.dataset?.nostrodomusList === '1') || null;
    const dataMatch = /^\.nostrodomus-intelli-row\[data-i="(\d+)"\]$/.exec(selector);
    if (dataMatch) return all.find(el => String(el.dataset?.i) === dataMatch[1]) || null;
    return null;
  }
}

const fakeDocument = {
  createElement(tag) { return new FakeElement(tag); },
  createTextNode(text) { return { tag: '#text', textContent: String(text) }; },
};

test('popup position flips above and clamps horizontally within bounds', () => {
  const below = completionPopupPosition({ top: 80, bottom: 96, left: 40 }, { width: 120, height: 80 }, { left: 0, right: 300, top: 0, bottom: 260 });
  assert.equal(below.placement, 'below');
  const above = completionPopupPosition({ top: 230, bottom: 246, left: 290 }, { width: 120, height: 100 }, { left: 0, right: 300, top: 0, bottom: 260 });
  assert.equal(above.placement, 'above');
  assert.equal(above.left <= 180, true);
});

test('popup stays on-screen when the editor band is narrower than the popup', () => {
  // A narrow codebox near the viewport's right edge: leftBound(1050) > rightBound(1290) - width(280).
  // Clamping left to 1050 would push the right edge to 1330, off the screen.
  const narrow = completionPopupPosition({ top: 300, bottom: 318, left: 1050 }, { width: 280, height: 150 }, { left: 1050, right: 1290, top: 10, bottom: 800 });
  assert.ok(narrow.left + 280 <= 1290, `right edge ${narrow.left + 280} must stay within rightBound 1290`);
  assert.ok(narrow.left >= 0, 'not off the left edge either');
  // And a popup wider than the whole band floors at 0 rather than going negative.
  const tiny = completionPopupPosition({ top: 50, bottom: 66, left: 20 }, { width: 400, height: 150 }, { left: 20, right: 300, top: 0, bottom: 800 });
  assert.ok(tiny.left >= 0, 'left floored at 0 for an over-wide popup');
});

test('popup re-positions on editor scroll while open (one passive listener per scroller, idempotent, no-op when hidden)', () => {
  const listeners = [];
  const scroller = {
    addEventListener(type, handler, options) { listeners.push({ type, handler, options }); },
    getBoundingClientRect: () => ({ left: 38, right: 1402, top: 144, bottom: 800, width: 1364, height: 656 }),
  };
  let caretLeft = 700;
  const box = { dataset: {}, style: { display: 'block' }, getBoundingClientRect: () => ({ width: 280, height: 150 }) };
  const state = {
    overlay: box,
    view: { dom: { querySelector: (s) => (s === '.cm-scroller' ? scroller : null), closest: () => null }, coordsAtPos: () => ({ top: 400, bottom: 416, left: caretLeft }) },
  };
  const deps = { getPos: () => 5, ensureOverlay: () => box, windowRef: { innerWidth: 1440, innerHeight: 900, requestAnimationFrame: (fn) => fn() } };

  placeCompletionPopupAtCursor(state, deps);
  assert.equal(box.style.left, '700px', 'initial placement tracks the caret');
  const scrollListeners = listeners.filter(l => l.type === 'scroll');
  assert.equal(scrollListeners.length, 1, 'exactly one scroll listener attached to the scroller');
  assert.equal(scrollListeners[0].options?.passive, true, 'scroll listener is passive (never blocks scrolling)');

  // Caret moves (editor scrolled) → firing the scroll handler re-positions the open popup.
  caretLeft = 300;
  scrollListeners[0].handler();
  assert.equal(box.style.left, '300px', 'scroll re-positions the popup to follow the caret');

  // Idempotent: a second placement does not add another scroll listener.
  placeCompletionPopupAtCursor(state, deps);
  assert.equal(listeners.filter(l => l.type === 'scroll').length, 1, 'no duplicate scroll listener');

  // No-op when the popup is hidden.
  box.style.display = 'none';
  caretLeft = 999;
  scrollListeners[0].handler();
  assert.notEqual(box.style.left, '999px', 'a hidden popup is not re-positioned on scroll');
});

test('popup anchors at the word start (ctx.from), not the caret; falls back to the caret on a wrapped token', () => {
  const scroller = { addEventListener() {}, getBoundingClientRect: () => ({ left: 38, right: 1402, top: 144, bottom: 800, width: 1364, height: 656 }) };
  const box = { dataset: {}, style: { display: 'block' }, getBoundingClientRect: () => ({ width: 280, height: 150 }) };
  const mk = (coordsAtPos, context) => ({ overlay: box, context, view: { dom: { querySelector: () => scroller, closest: () => null }, coordsAtPos } });
  const deps = { getPos: () => 10, ensureOverlay: () => box, windowRef: { innerWidth: 1440, innerHeight: 900, requestAnimationFrame: (fn) => fn() } };

  // from (pos 3) on the same row at left=120; caret (pos 10) at left=300 → anchor under the word start.
  placeCompletionPopupAtCursor(mk((p) => (p === 3 ? { top: 400, bottom: 416, left: 120 } : { top: 400, bottom: 416, left: 300 }), { from: 3 }), deps);
  assert.equal(box.style.left, '120px', 'anchors at the token start (120), not the caret (300)');

  // token wrapped: from is on a higher visual row → fall back to the caret left.
  placeCompletionPopupAtCursor(mk((p) => (p === 3 ? { top: 360, bottom: 376, left: 1300 } : { top: 400, bottom: 416, left: 300 }), { from: 3 }), deps);
  assert.equal(box.style.left, '300px', 'wrapped token falls back to the caret left');
});

test('self-corrects a containing-block offset so the box lands at the intended viewport coords', () => {
  // A re-basing ancestor shifts the position:fixed box +26x / +40y from where we set it.
  const box = {
    dataset: {}, style: { display: 'block', left: '', top: '' },
    getBoundingClientRect() {
      const l = parseFloat(this.style.left), t = parseFloat(this.style.top);
      return { left: (Number.isFinite(l) ? l : 0) + 26, top: (Number.isFinite(t) ? t : 0) + 40, width: 280, height: 150 };
    },
  };
  const scroller = { addEventListener() {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) }; // tiny → bounds = viewport
  const state = { overlay: box, context: { from: 5 }, view: { dom: { querySelector: () => scroller, closest: () => null }, coordsAtPos: () => ({ top: 400, bottom: 416, left: 200 }) } };
  const deps = { getPos: () => 5, ensureOverlay: () => box, windowRef: { innerWidth: 1440, innerHeight: 900, requestAnimationFrame: (fn) => fn() } };
  placeCompletionPopupAtCursor(state, deps);
  // intended: left 200, top 416+2(gap)=418; box reports +26/+40, so the code cancels the delta.
  assert.equal(box.style.left, '174px', 'horizontal containing-block offset (26) canceled');
  assert.equal(box.style.top, '378px', 'vertical containing-block offset (40) canceled');
});

test('on a wide editor the popup follows the caret horizontally and stays clamped to the right edge', () => {
  // A ~1364px-wide panel editor (bounds.left 48 .. right 1392), caret mid-editor.
  const wide = { left: 48, right: 1392, top: 144, bottom: 800 };
  // Caret well to the right but not near the edge: the popup follows the caret (no cap at left + 170 = 218).
  const mid = completionPopupPosition({ top: 400, bottom: 416, left: 700 }, { width: 280, height: 150 }, wide);
  assert.ok(Math.abs(mid.left - 700) <= 4, `popup should track caret left ~700, got ${mid.left}`);
  // Caret near the right edge → still clamped so a 280px popup cannot overflow (rightBound - width = 1112).
  const farRight = completionPopupPosition({ top: 400, bottom: 416, left: 1300 }, { width: 280, height: 150 }, wide);
  assert.ok(farRight.left <= 1112, `popup clamps within the editor right edge, got ${farRight.left}`);
  assert.ok(farRight.left >= 48, 'popup never goes left of the editor');
});

test('popup renders ARIA listbox, option rows, highlighted matches, and expanded docs without innerHTML', () => {
  const box = new FakeElement('div');
  const state = {
    settings: { showDetailsPane: true, popupSize: 'compact' },
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
  const list = box.querySelector('[data-nostrodomus-list="1"]');
  assert.equal(list.getAttribute('role'), 'listbox');
  assert.equal(list.getAttribute('aria-activedescendant'), 'nostrodomus-intelli-option-0');
  const row = box.querySelector('.nostrodomus-intelli-row[data-i="0"]');
  assert.equal(row.getAttribute('role'), 'option');
  assert.equal(row.getAttribute('aria-selected'), 'true');
  const hasMatchSpan = row.children.some(child => child.children?.some(grand => grand.className === 'nostrodomus-intelli-match'));
  assert.equal(hasMatchSpan, true);
  const collectText = node => String(node.textContent || '') + (node.children || []).map(collectText).join('');
  assert.equal(collectText(box).includes('Line two'), true);
});
