import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement,
  setText,
  setAttr,
  setStyle,
  appendChildren,
  clearElement,
  replaceChildrenSafe,
} from '../../src/core/dom.js';

// Behavior tests for the safe-DOM helpers. This module is the XSS safety boundary (rendering goes
// through it instead of innerHTML), so the tests check its contract: safe construction works, and
// unsafe tags, attributes, URLs and styles are rejected.

class FakeNode {}
class FakeText extends FakeNode {
  constructor(t) { super(); this.textContent = String(t); }
}
class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.className = '';
    this.attributes = {};
    this.childNodes = [];
    this._text = '';
    this.style = { props: {}, setProperty(k, v) { this.props[k] = String(v); } };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = v; this.childNodes = []; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) { this.childNodes.push(c); return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); }
  get firstChild() { return this.childNodes[0] || null; }
}

let savedDoc;
let savedNode;
before(() => {
  savedDoc = global.document;
  savedNode = global.Node;
  global.Node = FakeNode;
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (t) => new FakeText(t),
  };
});
after(() => { global.document = savedDoc; global.Node = savedNode; });

test('createElement builds a safe element from all option fields', () => {
  const el = createElement('div', {
    className: 'card',
    text: 'hi',
    attrs: { role: 'dialog', 'data-x': '1' },
    style: { color: 'red' },
  });
  assert.equal(el.tagName, 'div');
  assert.equal(el.className, 'card');
  assert.equal(el.textContent, 'hi');
  assert.equal(el.attributes.role, 'dialog');
  assert.equal(el.style.props.color, 'red');
});

test('createElement rejects tags outside the safe allowlist', () => {
  assert.throws(() => createElement('script'), /Unsafe DOM tag/);
  assert.throws(() => createElement('iframe'), /Unsafe DOM tag/);
  assert.throws(() => createElement(''), /Unsafe DOM tag/);
  assert.doesNotThrow(() => createElement('button'));
});

test('setAttr rejects event-handler attributes and dangerous URL/srcdoc values', () => {
  const el = createElement('div');
  assert.throws(() => setAttr(el, 'onclick', 'x'), /Event-handler DOM attribute/);
  assert.throws(() => setAttr(el, 'onload', 'x'), /Event-handler DOM attribute/);
  const a = createElement('span');
  assert.throws(() => setAttr(a, 'href', 'javascript:alert(1)'), /javascript: URL rejected/);
  assert.throws(() => setAttr(a, 'srcdoc', '<x>'), /srcdoc DOM attribute rejected/);
  assert.throws(() => setAttr(el, '', 'x'), /Empty DOM attribute/);
});

test('setAttr treats booleans/null as presence/absence and stringifies otherwise', () => {
  const el = createElement('input');
  setAttr(el, 'disabled', true);
  assert.equal(el.attributes.disabled, '');
  setAttr(el, 'disabled', false);
  assert.equal(el.attributes.disabled, undefined);
  setAttr(el, 'value', 5);
  assert.equal(el.attributes.value, '5');
  setAttr(el, 'value', null);
  assert.equal(el.attributes.value, undefined);
});

test('setText coerces null/undefined to empty string', () => {
  const el = createElement('div');
  assert.equal(setText(el, null).textContent, '');
  assert.equal(setText(el, undefined).textContent, '');
  assert.equal(setText(el, 0).textContent, '0');
  assert.equal(setText(el, 'x').textContent, 'x');
});

test('setStyle sets valid properties and rejects unsafe property names', () => {
  const el = createElement('div');
  setStyle(el, { color: 'blue', 'z-index': 3, ignored: null });
  assert.equal(el.style.props.color, 'blue');
  assert.equal(el.style.props['z-index'], '3');
  assert.equal('ignored' in el.style.props, false, 'null values are skipped');
  assert.throws(() => setStyle(el, { 'color;background:url(x)': 'red' }), /Unsafe style property/);
  assert.equal(setStyle(el, null), el, 'non-object styles are a no-op');
});

test('appendChildren appends Nodes, wraps primitives as text, and skips null/false', () => {
  const el = createElement('div');
  const child = createElement('span');
  appendChildren(el, [child, 'text', 42, null, false, undefined]);
  assert.equal(el.childNodes.length, 3, 'null/false/undefined skipped');
  assert.equal(el.childNodes[0], child);
  assert.equal(el.childNodes[1].textContent, 'text');
  assert.equal(el.childNodes[2].textContent, '42');
});

test('clearElement and replaceChildrenSafe reset then repopulate', () => {
  const el = createElement('div');
  appendChildren(el, ['a', 'b', 'c']);
  assert.equal(el.childNodes.length, 3);
  clearElement(el);
  assert.equal(el.childNodes.length, 0);
  const fresh = createElement('span');
  replaceChildrenSafe(el, ['x', fresh]);
  assert.equal(el.childNodes.length, 2);
  assert.equal(el.childNodes[1], fresh);
});
