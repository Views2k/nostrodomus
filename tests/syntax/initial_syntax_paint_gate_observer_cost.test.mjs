// The paint gate observes the roots around an editor for a new .cm-content. The observed
// subtrees include the editor itself, so the observer also received every line, token span and
// gutter element CodeMirror adds while the user types or scrolls. For each of them it ran two
// selector queries, a shadow-host query and wrote a record with an ISO date, for the life of the
// editor. Nothing added inside an existing editor can hold another editor.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialSyntaxPaintGate } from '../../src/syntax/initialSyntaxPaintGate.js';

function gateFixture() {
  const previous = globalThis.MutationObserver;
  const observers = [];
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(root, options) { this.root = root; this.options = options; }
    disconnect() {}
  };
  const state = {
    enabled: true,
    initialSyntaxGateObservers: new Map(),
    initialSyntaxGateObservedRoots: new WeakSet(),
    initialSyntaxGateContents: new WeakSet(),
    initialSyntaxGateTimers: new Set(),
    initialSyntaxGateStyles: new Set(),
  };
  const gate = createInitialSyntaxPaintGate({
    state,
    VERSION: 'test',
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'test-style',
    ensureStyleElementAtEnd: () => null,
    nostrodomusPerfMode: () => 'scoped',
    recordPerformanceEvent: () => {},
    rememberActiveCodeboxEditor: () => {},
    applyTextColorPreset: () => false,
    effectiveStyleSettings: () => ({}),
    styleEditorFromNode: () => null,
    activeCodeboxStyleEditor: () => null,
    activeEditDialog: () => null,
    activeTopLayerDialog: () => null,
    api: { nativeHighlightSyntaxContentPainted: () => false, installSyntaxOwnerObserver: () => true },
  });
  const restore = () => {
    for (const timer of state.initialSyntaxGateTimers) clearTimeout(timer);
    if (previous === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = previous;
  };
  return { gate, state, observers, restore };
}

// An element that counts the queries run on it.
function countingElement(queries, { isContent = false, contents = [] } = {}) {
  return {
    nodeType: 1,
    localName: 'div',
    dataset: {},
    isConnected: false,
    matches: (selector) => { queries.push(`matches ${selector}`); return isContent && selector === '.cm-content'; },
    querySelectorAll: (selector) => { queries.push(`querySelectorAll ${selector}`); return selector === '.cm-content' ? contents : []; },
    getRootNode: () => null,
  };
}

test('elements CodeMirror adds inside an editor are not queried', () => {
  const fx = gateFixture();
  try {
    const root = { nodeType: 11, querySelectorAll: () => [] };
    assert.equal(fx.gate.observeInitialSyntaxPaintGateRoot(root, 'test'), true);
    const [observer] = fx.observers;
    assert.deepEqual(observer.options, { childList: true, subtree: true });

    const queries = [];
    let closestCalls = 0;
    const editor = { nodeType: 1 };
    const content = { nodeType: 1, closest: (selector) => { closestCalls += 1; return selector === '.cm-editor' ? editor : null; } };
    const line = { nodeType: 1, closest: (selector) => { closestCalls += 1; return selector === '.cm-editor' ? editor : null; } };
    const lines = Array.from({ length: 40 }, () => countingElement(queries));
    const spans = Array.from({ length: 10 }, () => countingElement(queries));
    observer.callback([
      ...lines.map((added) => ({ type: 'childList', target: content, addedNodes: [added] })),
      ...spans.map((added) => ({ type: 'childList', target: line, addedNodes: [added] })),
    ]);
    assert.deepEqual(queries, [], 'no selector query runs on a line or a span');
    assert.equal(fx.state.lastInitialSyntaxGateShadowTraversal, undefined, 'no shadow-host scan is recorded');
    assert.equal(closestCalls, 2, 'the editor test runs once per run of records with the same target');
  } finally {
    fx.restore();
  }
});

test('a .cm-content added outside an editor is still gated', async () => {
  const fx = gateFixture();
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  try {
    const root = { nodeType: 11, querySelectorAll: () => [] };
    fx.gate.observeInitialSyntaxPaintGateRoot(root, 'test');
    const [observer] = fx.observers;

    const queries = [];
    const content = countingElement(queries, { isContent: true });
    const wrapperContent = countingElement(queries, { isContent: true });
    const wrapper = countingElement(queries, { contents: [wrapperContent] });
    // The parent of a new editor is an element outside any editor, or the observed shadow root.
    const parent = { nodeType: 1, closest: () => null };
    observer.callback([
      { type: 'childList', target: parent, addedNodes: [content] },
      { type: 'childList', target: root, addedNodes: [wrapper] },
      { type: 'attributes', target: parent, addedNodes: [] },
    ]);
    assert.equal(content.dataset.nostrodomusInitialSyntaxPending, '1', 'the added content is hidden until it is painted');
    assert.equal(wrapperContent.dataset.nostrodomusInitialSyntaxPending, '1', 'a content inside an added element is found');
    assert.ok(queries.includes('matches .cm-content'));
    // The gate tries a first paint in a microtask; let it run before the timers are cleared.
    await Promise.resolve();
  } finally {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    fx.restore();
  }
});
