// A range pass keeps the ranges of a line whose element, text, tokens and text nodes are the ones
// of the pass that built them, so an edit of one line does not rebuild every rendered line. These
// tests compare the registered highlights after each step with
// the highlights a new runtime registers in one full pass over the same lines: they must be the
// same ranges (text node, start, end) in the same order for every kind.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeState } from '../../src/core/state.js';
import { createSyntaxRuntime } from '../../src/syntax/syntaxRuntime.js';

const KINDS = ['fg', 'key', 'string', 'number', 'bool', 'punct', 'filter', 'comment', 'yamlList', 'op'];

function rangeRuntime(view) {
  class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
  const store = new Map();
  const highlights = { set: (name, value) => store.set(name, value), delete: (name) => store.delete(name), get: (name) => store.get(name), values: () => store.values() };
  const state = createRuntimeState({ version: 'test' });
  const runtime = createSyntaxRuntime({
    state,
    VERSION: 'nostrodomus-test',
    W: { NodeFilter: {}, CSS: { highlights }, Highlight: FakeHighlight },
    DARKPLUS_SYNTAX_COLORS: { fg: '#ffffff', dim: '#999999' },
    DARKPLUS_MAX_LINES_PER_PASS: 50,
    DARKPLUS_MAX_SPANS_PER_PASS: 200,
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'nostrodomus-test-source-class',
    SYNTAX_RECOVERY_DEFAULT_DELAYS: [48, 180],
    STYLE_SYNTAX_KIND_ORDER: KINDS,
    syntaxRecoveryDelaysForStageA3: (_reason, delays) => delays,
    activeCodeboxStyleEditor: () => null,
    activeEditDialog: () => null,
    activeTopLayerDialog: () => null,
    applyTextColorPreset: () => false,
    codeboxEditorCacheKey: () => 'editor-key',
    codeMirrorSourceClassParts: () => ({ view }),
    cssEscapeSelectorPart: (value) => String(value),
    effectiveStyleSettings: () => ({}),
    ensureStyleElementAtEnd: () => null,
    recordPerformanceEvent: () => {},
    rememberActiveCodeboxEditor: () => {},
    resolveSyntaxTintSettings: () => ({ presetKey: 'test', palette: {}, themeOpacity: 1, themeSaturation: 1 }),
    nostrodomusPerfMode: () => false,
    styleEditorFromNode: () => null,
    nostrodomusWalkOpenRoots: () => {},
    visibleStyleEditorCandidate: () => true,
    syntaxColorWithOpacity: (color) => color,
  });
  return { state, runtime, store };
}

let nextNodeId = 1;
const textNode = (value) => ({ nodeValue: value, isConnected: true, id: nextNodeId++ });

// A rendered line: an element with one or more text nodes, as CodeMirror renders token spans.
function makeLine(text, docIndex, parts = null) {
  const pieces = parts || (text.length > 6 ? [text.slice(0, 6), text.slice(6)] : [text]);
  const line = { textContent: text, docIndex, nodes: pieces.filter((piece) => piece.length).map(textNode), dataset: {} };
  line.contains = (node) => line.nodes.includes(node);
  return line;
}

const fakeDoc = (texts) => ({ lines: texts.length, line: (number) => ({ text: texts[number - 1] }), lineAt: (pos) => ({ number: pos + 1 }) });

const DOCUMENT = [
  'type: entities', // 0
  'title: Rooms # main', // 1
  'show_header_toggle: false', // 2
  'entities:', // 3
  '  - entity: light.kitchen', // 4
  '    name: Kitchen', // 5
  '  - entity: light.hall', // 6
  '    name: "Hall #1"', // 7
  '  - light.porch', // 8
  '  - 42', // 9
  '# a note', // 10
  'footer:', // 11
  '  type: buttons', // 12
  '  count: 3', // 13
  'theme: dark', // 14
  'state_color: true', // 15
];

function fixture(texts = DOCUMENT, from = 0, to = 8) {
  const fx = { texts: texts.slice(), lines: [] };
  fx.content = { isConnected: true, querySelectorAll: (selector) => (selector === '.cm-line' ? fx.lines : []) };
  fx.editor = { querySelector: (selector) => (selector === '.cm-content' ? fx.content : null), querySelectorAll: () => [] };
  fx.view = { state: { doc: fakeDoc(fx.texts) }, posAtDOM: (line) => line.docIndex };
  Object.assign(fx, rangeRuntime(fx.view));
  // Renders the document lines from..to. A line that was rendered before keeps its element when
  // its text is the same, as CodeMirror does.
  fx.render = (start, end) => {
    const known = new Map(fx.lines.map((line) => [line.docIndex, line]));
    const next = [];
    for (let index = start; index < end; index += 1) {
      const old = known.get(index);
      next.push(old && old.textContent === fx.texts[index] ? old : makeLine(fx.texts[index], index));
    }
    for (const line of fx.lines) if (!next.includes(line)) for (const node of line.nodes) node.isConnected = false;
    fx.lines = next;
  };
  // An edit: a new document object with the same number of lines. CodeMirror keeps the element
  // of an edited line and gives it new text nodes; inPlace does the same here.
  fx.edit = (index, text, inPlace = false) => {
    fx.texts[index] = text;
    fx.view.state = { doc: fakeDoc(fx.texts) };
    const line = fx.lines.find((candidate) => candidate.docIndex === index);
    if (inPlace && line) {
      for (const node of line.nodes) node.isConnected = false;
      line.textContent = text;
      line.nodes = makeLine(text, index).nodes;
    }
    fx.render(fx.lines[0].docIndex, fx.lines[fx.lines.length - 1].docIndex + 1);
  };
  fx.render(from, to);
  return fx;
}

function withDom(run) {
  const previousDocument = globalThis.document;
  const previousStaticRange = globalThis.StaticRange;
  const counter = { created: 0 };
  globalThis.document = {
    createTreeWalker: (line) => { let at = 0; return { nextNode: () => line.nodes[at++] || null }; },
    createRange: () => ({ setStart() {}, setEnd() {} }),
  };
  globalThis.StaticRange = class { constructor(init) { counter.created += 1; Object.assign(this, init); } };
  try { run(counter); } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousStaticRange === undefined) delete globalThis.StaticRange; else globalThis.StaticRange = previousStaticRange;
  }
}

const snapshot = (store) => Object.fromEntries(Array.from(store.entries())
  .map(([name, highlight]) => [name, highlight.ranges.map((range) => [range.startContainer.id, range.startOffset, range.endContainer.id, range.endOffset])])
  .sort(([a], [b]) => a.localeCompare(b)));

const allRanges = (store) => Array.from(store.values()).flatMap((highlight) => highlight.ranges);

// What one full pass of a new runtime registers for the lines as they are now.
function fullRebuild(fx) {
  const fresh = rangeRuntime(fx.view);
  fresh.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, 'full-rebuild');
  return snapshot(fresh.store);
}

function passAndCompare(fx, reason, label) {
  const result = fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, reason);
  assert.notEqual(result.unchanged, true, `${label}: the pass ran`);
  const expected = fullRebuild(fx);
  assert.deepEqual(snapshot(fx.store), expected, `${label}: the same highlights as a full rebuild`);
  const count = Object.values(expected).reduce((sum, ranges) => sum + ranges.length, 0);
  assert.equal(result.rangeHighlights.ranges, count, `${label}: the reported range count`);
  return result;
}

test('an edit of one line builds the ranges of that line only, with the result of a full rebuild', () => {
  withDom((counter) => {
    const fx = fixture();
    const first = passAndCompare(fx, 'first', 'first pass');
    assert.ok(first.rangeHighlights.ranges > 20);

    for (const inPlace of [false, true]) {
      const before = new Set(allRanges(fx.store));
      const oldNodes = fx.lines[5].nodes;
      fx.edit(5, inPlace ? '    name: Kitchen lamp' : '    name: Kitchen lamp # edited', inPlace);
      counter.created = 0;
      fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, 'smart-source-content-change');
      const created = counter.created;
      assert.deepEqual(snapshot(fx.store), fullRebuild(fx), 'the same highlights as a full rebuild');

      const edited = fx.lines[5];
      assert.equal(edited.docIndex, 5);
      const after = allRanges(fx.store);
      const fresh = after.filter((range) => !before.has(range));
      assert.ok(fresh.length > 0);
      assert.equal(created, fresh.length, 'the pass created the ranges of the edited line and no others');
      for (const range of fresh) assert.ok(edited.nodes.includes(range.startContainer), 'every new range sits on the edited line');
      for (const range of before) {
        if (oldNodes.includes(range.startContainer)) assert.equal(after.includes(range), false, 'the ranges of the old text are gone');
        else assert.ok(after.includes(range), 'the range of an unchanged line is the same object');
      }
    }
  });
});

test('a character replaced inside a text node, with the node and its length kept, rebuilds the line', () => {
  withDom(() => {
    const fx = fixture(DOCUMENT, 8, 16);
    passAndCompare(fx, 'first', 'first pass');
    // CodeMirror writes the new text into the text node it has. '3' becomes 'x': the number is
    // now a string, at the same offsets.
    const line = fx.lines.find((candidate) => candidate.docIndex === 13);
    const nodes = line.nodes.slice();
    const numberNodes = () => (fx.store.get('nostrodomus-source-syntax-number')?.ranges || []).map((range) => range.startContainer);
    assert.ok(numberNodes().includes(nodes[1]));
    fx.texts[13] = '  count: x';
    fx.view.state = { doc: fakeDoc(fx.texts) };
    line.textContent = fx.texts[13];
    nodes[1].nodeValue = fx.texts[13].slice(6);
    passAndCompare(fx, 'smart-source-content-change', 'a character replaced in place');
    assert.deepEqual(line.nodes, nodes, 'the text nodes are the same objects');
    assert.equal(numberNodes().includes(nodes[1]), false, 'the number range is gone');
  });
});

test('an edit that changes the meaning of the lines below it rebuilds those lines', () => {
  withDom(() => {
    const fx = fixture(DOCUMENT, 8, 14);
    passAndCompare(fx, 'first', 'first pass');
    // 'footer:' becomes a text block opener: the two lines under it were YAML and are now text.
    // Their elements and their text are the same; only their tokens differ.
    const under = [12, 13].map((index) => fx.lines.find((line) => line.docIndex === index));
    const nodesOf = (kind) => (fx.store.get(`nostrodomus-source-syntax-${kind}`)?.ranges || []).map((range) => range.startContainer);
    for (const line of under) assert.ok(line.nodes.some((node) => nodesOf('key').includes(node)), 'a YAML key before the edit');
    fx.edit(11, 'footer: |');
    passAndCompare(fx, 'smart-source-content-change', 'a block scalar opened above');
    for (const line of under) {
      assert.equal(fx.lines.includes(line), true, 'the line element is the same');
      assert.ok(line.nodes.every((node) => nodesOf('string').includes(node)), 'block text after the edit');
      assert.equal(line.nodes.some((node) => nodesOf('key').includes(node)), false);
    }
    fx.edit(11, 'footer:');
    passAndCompare(fx, 'smart-source-content-change', 'the block scalar closed again');
    for (const line of under) assert.ok(line.nodes.some((node) => nodesOf('key').includes(node)), 'a YAML key again');
  });
});

test('scrolling adds and removes lines at both ends', () => {
  withDom(() => {
    const fx = fixture(DOCUMENT, 4, 10);
    passAndCompare(fx, 'first', 'first pass');

    fx.render(6, 12); // down: two lines leave at the top, two enter at the bottom
    passAndCompare(fx, 'smart-source-content-change', 'scrolled down');

    fx.render(2, 9); // up: lines enter at the top and leave at the bottom
    passAndCompare(fx, 'smart-source-content-change', 'scrolled up');

    fx.render(0, 16); // the whole document
    passAndCompare(fx, 'smart-source-content-change', 'all lines');

    fx.render(13, 16); // a jump: no rendered line is kept
    passAndCompare(fx, 'smart-source-content-change', 'jumped to the end');

    fx.render(0, 3);
    passAndCompare(fx, 'style-reapply-skip-scroll', 'jumped to the start');
  });
});

test('a line whose text nodes were replaced or split without a text change is built again', () => {
  withDom(() => {
    const fx = fixture();
    passAndCompare(fx, 'first', 'first pass');

    // A decoration (a matched bracket, a selection match) splits the text of a line into other
    // text nodes. The element and its text are the same.
    const line = fx.lines[4];
    for (const node of line.nodes) node.isConnected = false;
    line.nodes = ['  - ', 'entity', ': light.', 'kitchen'].map(textNode);
    passAndCompare(fx, 'smart-source-content-change', 'text nodes replaced');
    for (const range of allRanges(fx.store)) assert.notEqual(range.startContainer.isConnected, false, 'no range is left on a removed text node');

    // A text node is cut short and the rest moves to a new node; the old node stays connected.
    const other = fx.lines[1];
    const [head, tail] = other.nodes;
    head.nodeValue = head.nodeValue.slice(0, 3);
    other.nodes = [head, textNode(other.textContent.slice(3, 6)), tail];
    passAndCompare(fx, 'smart-source-content-change', 'a text node split in place');

    // A text node now belongs to another line (two lines with the same text swap a node).
    const fxTwo = fixture(['name: Hall', 'name: Hall', 'icon: mdi:lamp'], 0, 3);
    passAndCompare(fxTwo, 'first', 'first pass of the second editor');
    const [a, b] = fxTwo.lines;
    [a.nodes, b.nodes] = [b.nodes, a.nodes];
    passAndCompare(fxTwo, 'smart-source-content-change', 'text nodes moved between lines');
  });
});

test('a settings or theme pass builds every range again', () => {
  withDom(() => {
    const fx = fixture();
    passAndCompare(fx, 'first', 'first pass');
    for (const reason of ['settings-change', 'syntax-theme-change', 'option-change-syntaxTintPreset']) {
      const before = new Set(allRanges(fx.store));
      passAndCompare(fx, reason, reason);
      for (const range of allRanges(fx.store)) assert.equal(before.has(range), false, `${reason}: no range object is carried over`);
    }
    // The pass after it keeps unchanged lines again.
    const before = new Set(allRanges(fx.store));
    passAndCompare(fx, 'style-reapply-skip-keydown', 'the next ordinary pass');
    for (const range of allRanges(fx.store)) assert.ok(before.has(range));
  });
});

test('removing the registered ranges drops the kept ranges, and a second editor has its own', () => {
  withDom(() => {
    const fx = fixture();
    passAndCompare(fx, 'first', 'first pass');
    const before = new Set(allRanges(fx.store));
    fx.runtime.disconnectSourceClassSmartSyntaxObserver('test');
    assert.equal(allRanges(fx.store).length, 0);
    passAndCompare(fx, 'style-reapply-skip-keydown', 'after the ranges were removed');
    for (const range of allRanges(fx.store)) assert.equal(before.has(range), false);

    // Two editors painted by one runtime, one after the other, twice.
    const second = fixture(['name: Hall', 'icon: mdi:lamp'], 0, 2);
    const views = new Map([[fx.editor, fx.view], [second.editor, second.view]]);
    let current = fx.editor;
    const shared = rangeRuntime({ get state() { return views.get(current).state; }, posAtDOM: (line) => line.docIndex });
    const paint = (target) => { current = target.editor; shared.runtime.applyCodeMirrorSmartSyntaxClasses(target.editor, {}, 'style-reapply-skip-pointer'); };
    paint(fx); paint(second); paint(fx); paint(second);
    const merged = snapshot(shared.store);
    const firstOnly = fullRebuild(fx);
    const secondOnly = fullRebuild(second);
    for (const name of new Set([...Object.keys(firstOnly), ...Object.keys(secondOnly)])) {
      assert.deepEqual(merged[name], [...(firstOnly[name] || []), ...(secondOnly[name] || [])], `${name}: both editors, each with its full set`);
    }
  });
});

test('with the content observer attached, an unchanged pass still writes nothing and an edit keeps the other lines', () => {
  withDom((counter) => {
    const fx = fixture();
    passAndCompare(fx, 'first', 'first pass');
    fx.state.sourceClassSmartSyntaxObserver = { disconnect() {} };
    fx.state.sourceClassSmartSyntaxContent = fx.content;
    counter.created = 0;
    assert.equal(fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, 'style-reapply-skip-keydown').unchanged, true);
    assert.equal(counter.created, 0);

    fx.edit(2, 'show_header_toggle: true');
    counter.created = 0;
    const result = fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, 'smart-source-content-change');
    const created = counter.created;
    assert.notEqual(result.unchanged, true);
    const edited = fx.lines[2];
    const onEditedLine = allRanges(fx.store).filter((range) => edited.nodes.includes(range.startContainer)).length;
    assert.ok(onEditedLine >= 3, 'the key, the colon and the value of the edited line');
    assert.equal(created, onEditedLine, 'only the ranges of the edited line were created');
    assert.deepEqual(snapshot(fx.store), fullRebuild(fx));

    // The pass at the end of a typing session always runs. After the passes that followed the
    // edits it has no line to build.
    counter.created = 0;
    const exit = fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, 'typing-session-exit');
    assert.notEqual(exit.unchanged, true);
    assert.equal(counter.created, 0, 'no range is built at the end of the typing session');
    assert.deepEqual(snapshot(fx.store), fullRebuild(fx));
  });
});

test('a line whose text nodes could not be read is not kept and is built on the next pass', () => {
  withDom(() => {
    const fx = fixture();
    const walk = globalThis.document.createTreeWalker;
    const broken = fx.lines[4];
    // The walk over one line stops early once (a detached node in the middle of a frame).
    globalThis.document.createTreeWalker = (line) => {
      if (line !== broken) return walk(line);
      let at = 0;
      return { nextNode: () => (at === 0 ? line.nodes[at++] : null) };
    };
    fx.runtime.applyCodeMirrorSmartSyntaxClasses(fx.editor, {}, 'first');
    globalThis.document.createTreeWalker = walk;
    assert.notDeepEqual(snapshot(fx.store), fullRebuild(fx), 'the first pass missed part of the line');
    passAndCompare(fx, 'style-reapply-skip-keydown', 'the next pass');
  });
});
