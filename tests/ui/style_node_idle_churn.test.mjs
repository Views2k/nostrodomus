import test from 'node:test';
import assert from 'node:assert/strict';

import { createStyleDomRuntime } from '../../src/ui/styleDomRuntime.js';
import { createCodeboxPreflight } from '../../src/ui/codebox/codeboxPreflight.js';

// The idle re-apply loop measured on a live instance (about 31 applies, 62 <style>
// re-insertions and 216 attribute writes per second with a card editor open and no input):
// every style apply re-appended a <style> node in the editor shadow root and re-wrote seven
// marker attributes. The companion dialog observer saw the re-insert as a foreign change and
// scheduled the next apply. These tests pin that a repeat call writes nothing.

function makeContainer() {
  const children = [];
  const moves = { appended: 0, removed: 0 };
  const link = () => {
    children.forEach((child, index) => { child.nextElementSibling = children[index + 1] || null; });
  };
  const container = {
    children,
    moves,
    appendChild(node) {
      const at = children.indexOf(node);
      if (at >= 0) children.splice(at, 1);
      children.push(node);
      node.parentNode = container;
      moves.appended += 1;
      link();
      return node;
    },
    removeChild(node) {
      const at = children.indexOf(node);
      if (at >= 0) children.splice(at, 1);
      node.parentNode = null;
      moves.removed += 1;
      link();
      return node;
    },
    getElementById: (id) => children.find((child) => child.id === id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return container;
}

function makeNode(localName, id = '') {
  return { localName, id, parentNode: null, nextElementSibling: null, dataset: {} };
}

function buildStyleDom() {
  const documentRef = { head: makeContainer(), createElement: (tag) => makeNode(tag) };
  return createStyleDomRuntime({ documentRef, state: {} });
}

test('ensureStyleElementAtEnd leaves an in-place node alone on a repeat call', () => {
  const root = makeContainer();
  const { ensureStyleElementAtEnd } = buildStyleDom();

  const first = ensureStyleElementAtEnd(root, 'nostrodomus-initial-syntax-paint-gate-v1');
  assert.equal(root.moves.appended, 1, 'the first call inserts the node');

  for (let i = 0; i < 5; i += 1) {
    assert.equal(ensureStyleElementAtEnd(root, 'nostrodomus-initial-syntax-paint-gate-v1'), first);
  }
  assert.deepEqual(root.moves, { appended: 1, removed: 0 }, 'repeat calls must not touch the DOM');
});

test('ensureStyleElementAtEnd does not shuffle two Nostrodomus styles around each other', () => {
  const root = makeContainer();
  const { ensureStyleElementAtEnd } = buildStyleDom();

  ensureStyleElementAtEnd(root, 'nostrodomus-initial-syntax-paint-gate-v1');
  ensureStyleElementAtEnd(root, 'nostrodomus-cm-source-class-syntax-v1');
  const before = { ...root.moves };

  ensureStyleElementAtEnd(root, 'nostrodomus-initial-syntax-paint-gate-v1');
  ensureStyleElementAtEnd(root, 'nostrodomus-cm-source-class-syntax-v1');
  assert.deepEqual(root.moves, before, 'own styles after the node are not a reason to move it');
});

test('ensureStyleElementAtEnd moves the node back to the end when a foreign stylesheet follows it', () => {
  const root = makeContainer();
  const { ensureStyleElementAtEnd } = buildStyleDom();

  const style = ensureStyleElementAtEnd(root, 'nostrodomus-cm-source-class-syntax-v1');
  root.appendChild(makeNode('div'));
  assert.equal(ensureStyleElementAtEnd(root, 'nostrodomus-cm-source-class-syntax-v1'), style);
  assert.equal(root.moves.removed, 0, 'a non-stylesheet sibling does not affect the cascade');

  root.appendChild(makeNode('style', 'some-card-style'));
  ensureStyleElementAtEnd(root, 'nostrodomus-cm-source-class-syntax-v1');
  assert.equal(root.children[root.children.length - 1], style, 'the node is last again');
  assert.equal(root.moves.removed, 1, 'it moved exactly once');

  ensureStyleElementAtEnd(root, 'nostrodomus-cm-source-class-syntax-v1');
  assert.equal(root.moves.removed, 1, 'and stays put afterwards');
});

function makeElement(localName) {
  const attributes = new Map();
  const element = {
    localName,
    writes: 0,
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute(name, value) { attributes.set(name, String(value)); element.writes += 1; },
  };
  return element;
}

test('primeCodeboxPreflightForEditor writes each marker attribute once across repeated applies', () => {
  const host = makeElement('ha-code-editor');
  const scroller = makeElement('div');
  const content = makeElement('div');
  const preflightStyle = { textContent: '' };
  const root = { host };
  const editor = Object.assign(makeElement('div'), {
    getRootNode: () => root,
    closest: (selector) => (selector === 'ha-code-editor' ? host : null),
    querySelector: (selector) => (selector === '.cm-scroller' ? scroller : selector === '.cm-content' ? content : null),
    querySelectorAll: () => [],
  });

  const { primeCodeboxPreflightForEditor } = createCodeboxPreflight({
    document: {},
    state: {},
    recordPerformanceEvent: () => {},
    codeboxEditorCacheKey: () => 'editor-1',
    ensureStableStyleElement: () => ({ style: preflightStyle, changed: false }),
    installCodeboxKeyboardContainment: () => {},
    primeInitialSyntaxPaintGateForEditor: () => 0,
    activeEditDialog: () => null,
    activeCodeboxStyleEditor: () => editor,
  });

  primeCodeboxPreflightForEditor(editor, 'first');
  const afterFirst = [editor, host, scroller, content].map((element) => element.writes);
  assert.deepEqual(afterFirst, [2, 2, 1, 1], 'the first prime tags the editor, its host, scroller and content');

  for (let i = 0; i < 10; i += 1) primeCodeboxPreflightForEditor(editor, `repeat-${i}`);
  assert.deepEqual([editor, host, scroller, content].map((element) => element.writes), afterFirst,
    'repeat primes must not write attributes');
});
