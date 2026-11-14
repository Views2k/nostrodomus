import test from 'node:test';
import assert from 'node:assert/strict';

import {
  smartSyntaxBestDocumentStartIndex,
  smartSyntaxDocIndexForLine,
  smartSyntaxDocumentContextForVisibleLinesFromLines,
} from '../../src/syntax/smartSyntaxTokenizers.js';
import { createDarkPlusBridge } from '../../src/syntax/darkPlusBridge.js';

// A syntax pass used to search the whole document for the rendered lines and then classify the
// document from line 1 down to the viewport, on every pass. The editor now supplies the document
// line of each rendered line, and the line modes continue from the last pass or from the first
// edited line.

const bridge = createDarkPlusBridge({ DARKPLUS_SYNTAX_COLORS: {}, syntaxColorWithOpacity: (color) => color, api: {} });

function longDocument() {
  const lines = ['type: entities', 'entities:'];
  for (let i = 0; i < 40; i += 1) lines.push('  - entity: light.room', '    name: Room');
  lines.push('card_mod:', '  style: |');
  for (let i = 0; i < 30; i += 1) lines.push(`    #row-${i} {`, '      color: red;', '    }');
  lines.push('footer:', '  type: buttons');
  return lines;
}

const dom = (docLines, from, count) => docLines.slice(from, from + count).map((text) => ({ textContent: text }));
const indexes = (from, count) => Array.from({ length: count }, (_, k) => from + k);

// A counting classifier with its own identity, so each test starts from an empty cache.
function countingClassifier() {
  const seen = [];
  const lineKind = (line, ctx) => { seen.push(line); return bridge.darkPlusLineKind(line, ctx); };
  const isJinja = (line) => bridge.darkPlusIsJinjaLine(line);
  return { seen, lineKind, isJinja };
}

test('the line indexes supplied by the editor are used when the rendered text agrees with them', () => {
  const docLines = longDocument();
  // Lines 2 and 3 repeat forty times: the text search can only return the first repetition.
  const visible = dom(docLines, 42, 8);
  assert.equal(smartSyntaxBestDocumentStartIndex(docLines, visible), 2);
  const { lineKind, isJinja } = countingClassifier();
  const withHint = smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, visible, isJinja, lineKind, undefined, indexes(42, 8));
  assert.equal(withHint.startIndex, 42);
});

test('line indexes that do not fit the rendered lines fall back to the text search', () => {
  const docLines = longDocument();
  const visible = dom(docLines, 82, 6);
  const expected = smartSyntaxBestDocumentStartIndex(docLines, visible);
  const rejected = [
    indexes(5, 6), // the text of the first line differs
    indexes(82, 5), // one index short
    [82, 83, 83, 85, 86, 87], // not rising
    [82, 83, 84, 85, 86, 9999], // outside the document
    [82, 83, 84, 85, 86, 87.5],
    42,
    undefined,
  ];
  for (const hint of rejected) {
    const { lineKind, isJinja } = countingClassifier();
    const context = smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, visible, isJinja, lineKind, undefined, hint);
    assert.equal(context.startIndex, expected, `hint ${JSON.stringify(hint)}`);
    assert.equal(context.lineIndexes, null);
  }
});

test('rendered lines that are not one block keep their own document lines', () => {
  // CodeMirror keeps the line with the cursor in the DOM when it is scrolled out of view: the
  // rendered lines are then line 1 followed by the lines of the viewport.
  const docLines = longDocument();
  const cssStart = docLines.indexOf('    #row-10 {');
  const rendered = [0, ...indexes(cssStart, 6)];
  const visible = rendered.map((index) => ({ textContent: docLines[index] }));
  const { lineKind, isJinja } = countingClassifier();
  const context = smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, visible, isJinja, lineKind, undefined, rendered);
  assert.deepEqual(context.lineIndexes, rendered);
  assert.equal(smartSyntaxDocIndexForLine(context, 0), 0);
  assert.equal(smartSyntaxDocIndexForLine(context, 1), cssStart);
  assert.equal(context.modes[smartSyntaxDocIndexForLine(context, 0)].blockScalarKind, '');
  for (let row = 1; row < rendered.length; row += 1) {
    assert.equal(context.modes[smartSyntaxDocIndexForLine(context, row)].blockScalarKind, 'css', `row ${row} is inside the style block`);
  }
  assert.ok(context.modes.length > cssStart + 5, 'the modes reach the last rendered line');

  // Without the list the rendered lines count as one block from the start index.
  const block = { startIndex: 7, modes: [], lineIndexes: null };
  assert.equal(smartSyntaxDocIndexForLine(block, 3), 10);
  assert.equal(smartSyntaxDocIndexForLine(null, 3), -1);
});

test('a second pass on the same document does not classify any line again', () => {
  const docLines = longDocument();
  const { seen, lineKind, isJinja } = countingClassifier();
  const first = smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, dom(docLines, 100, 20), isJinja, lineKind, undefined, indexes(100, 20));
  const classified = seen.length;
  assert.ok(classified > 0);
  const second = smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, dom(docLines, 60, 20), isJinja, lineKind, undefined, indexes(60, 20));
  assert.equal(seen.length, classified, 'lines above an already classified line are reused');
  assert.equal(second.modes[60].lineKind, first.modes[60].lineKind);
});

test('after an edit only the lines from the edited line down are classified, with the same result as a fresh pass', () => {
  const docLines = longDocument();
  const { seen, lineKind, isJinja } = countingClassifier();
  const end = docLines.length - 10;
  smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, dom(docLines, end, 10), isJinja, lineKind, undefined, indexes(end, 10));

  // The edit turns a CSS rule line into a comment opener, which changes the lines after it.
  const editedAt = 100;
  const edited = docLines.slice();
  edited[editedAt] = '    /* note';
  seen.length = 0;
  const continued = smartSyntaxDocumentContextForVisibleLinesFromLines(edited, dom(edited, end, 10), isJinja, lineKind, undefined, indexes(end, 10));
  assert.ok(seen.length > 0, 'the edited line and the lines below it are classified');
  assert.equal(seen.includes(docLines[editedAt - 1]) && seen.indexOf(docLines[editedAt - 1]) < seen.indexOf(edited[editedAt]), false, 'no line above the edit is classified again');

  const fresh = countingClassifier();
  const scratch = smartSyntaxDocumentContextForVisibleLinesFromLines(edited, dom(edited, end, 10), fresh.isJinja, fresh.lineKind, undefined, indexes(end, 10));
  assert.deepEqual(continued.modes.map((mode) => mode.lineKind), scratch.modes.map((mode) => mode.lineKind));
  assert.deepEqual(continued.modes.map((mode) => mode.blockScalarKind), scratch.modes.map((mode) => mode.blockScalarKind));
  assert.equal(continued.modes[editedAt].lineKind, 'comment');
  assert.equal(continued.modes[editedAt + 1].lineKind, 'comment', 'the open block comment carries to the next line');
});

test('a shorter document after a deletion keeps the modes of the shared lines only', () => {
  const docLines = longDocument();
  const { lineKind, isJinja } = countingClassifier();
  smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, dom(docLines, 0, docLines.length), isJinja, lineKind, undefined, indexes(0, docLines.length));
  const shorter = docLines.slice(0, 20);
  const context = smartSyntaxDocumentContextForVisibleLinesFromLines(shorter, dom(shorter, 0, 20), isJinja, lineKind, undefined, indexes(0, 20));
  assert.equal(context.modes.length, 20);
  assert.equal(context.modes[19].docLineNumber, 20);
});

// A folded block shows its first line followed by a placeholder, so the text of that rendered
// line is not the text of its document line. When that line was the first or the last rendered
// line the list from the editor was thrown away and the rendered lines were taken as one block.
const FOLDED_DOC = [
  'views:', // 0, folded: lines 1 and 2 are hidden
  '  - title: Home',
  '    path: home',
  'content: |', // 3
  '  # One', // 4
  'footer:', // 5, folded: line 6 is hidden
  '  text: x',
  'title: A', // 7
  'theme: b', // 8
  'icon: c', // 9
];

function foldedLines(rendered, foldedAt) {
  return rendered.map((index) => ({ textContent: foldedAt.includes(index) ? `${FOLDED_DOC[index]}\u2026` : FOLDED_DOC[index] }));
}

test('a fold on the first rendered line keeps the line indexes from the editor', () => {
  const rendered = [0, 3, 4, 5, 7, 8, 9];
  const visible = foldedLines(rendered, [0, 5]);
  const { lineKind, isJinja } = countingClassifier();
  const context = smartSyntaxDocumentContextForVisibleLinesFromLines(FOLDED_DOC, visible, isJinja, lineKind, undefined, rendered);
  assert.deepEqual(context.lineIndexes, rendered);
  assert.equal(smartSyntaxDocIndexForLine(context, 2), 4);
  assert.equal(context.modes[smartSyntaxDocIndexForLine(context, 2)].blockScalarKind, 'text', 'the heading is a line of the text block');
  assert.equal(context.modes[smartSyntaxDocIndexForLine(context, 4)].lineInfo.key, 'title');
});

test('a fold on the last rendered line keeps the line indexes from the editor', () => {
  const rendered = [0, 3, 4, 5];
  const visible = foldedLines(rendered, [5]);
  const { lineKind, isJinja } = countingClassifier();
  const context = smartSyntaxDocumentContextForVisibleLinesFromLines(FOLDED_DOC, visible, isJinja, lineKind, undefined, rendered);
  assert.deepEqual(context.lineIndexes, rendered);
  assert.equal(context.modes[smartSyntaxDocIndexForLine(context, 2)].blockScalarKind, 'text');
});

test('folds on every rendered line, and widget text in front of an edge line, keep the line indexes', () => {
  const folded = [0, 5];
  const { lineKind, isJinja } = countingClassifier();
  const allFolded = smartSyntaxDocumentContextForVisibleLinesFromLines(FOLDED_DOC, foldedLines(folded, folded), isJinja, lineKind, undefined, folded);
  assert.deepEqual(allFolded.lineIndexes, folded);

  // A widget before the text of the first line: the lines below it carry their own text.
  const rendered = [0, 3, 4, 5, 7];
  const visible = foldedLines(rendered, []);
  visible[0] = { textContent: `! ${FOLDED_DOC[0]}` };
  const context = smartSyntaxDocumentContextForVisibleLinesFromLines(FOLDED_DOC, visible, isJinja, lineKind, undefined, rendered);
  assert.deepEqual(context.lineIndexes, rendered);
});

test('line indexes whose lines carry other text are still rejected', () => {
  const { lineKind, isJinja } = countingClassifier();
  // Every rendered line has the text of another document line.
  const visible = [7, 8, 9].map((index) => ({ textContent: FOLDED_DOC[index] }));
  const wrong = smartSyntaxDocumentContextForVisibleLinesFromLines(FOLDED_DOC, visible, isJinja, lineKind, undefined, [0, 3, 4]);
  assert.equal(wrong.lineIndexes, null);
  assert.equal(wrong.startIndex, 7);
  // An empty line agrees with any empty line, so it settles nothing away from the edges.
  const doc = ['a: 1', '', 'b: 2', '', 'c: 3'];
  const blankMatch = [{ textContent: 'c: 3' }, { textContent: '' }, { textContent: 'a: 1' }];
  const rejected = smartSyntaxDocumentContextForVisibleLinesFromLines(doc, blankMatch, isJinja, lineKind, undefined, [0, 1, 4]);
  assert.equal(rejected.lineIndexes, null);
});
