// card_mod takes `style:` as a map with one key per selector path, and the block scalar under
// each key is CSS:
//
//   card_mod:
//     style:
//       hui-generic-entity-row $: |
//         #container { color: red; }
//       .: |
//         * { margin: 0; }
//
// A line in such a block that starts with '#' or '*' is a selector, not a comment.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  smartSyntaxDocumentContextForVisibleLinesFromLines,
  smartSyntaxRangeTokensForLine,
  smartSyntaxUpdateBlockContext,
} from '../../src/syntax/smartSyntaxTokenizers.js';
import { createDarkPlusBridge } from '../../src/syntax/darkPlusBridge.js';

const bridge = createDarkPlusBridge({ DARKPLUS_SYNTAX_COLORS: {}, syntaxColorWithOpacity: (color) => color, api: {} });

function modesOf(docLines, isJinja = bridge.darkPlusIsJinjaLine, lineKind = bridge.darkPlusLineKind) {
  const domLines = docLines.map((text) => ({ textContent: text }));
  return smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, domLines, isJinja, lineKind).modes;
}

function tokensOf(docLines, index, modes = modesOf(docLines)) {
  const mode = modes[index];
  return smartSyntaxRangeTokensForLine(docLines[index], mode.lineKind, mode.lineInfo, bridge.darkPlusIsJinjaLine, undefined, String(mode.blockScalarKind || ''));
}

const kinds = (docLines, index, modes) => tokensOf(docLines, index, modes)
  .map((token) => `${token.kind}:${docLines[index].slice(token.start, token.end)}`);

const DOC = [
  'type: entities', // 0
  'card_mod:', // 1
  '  style:', // 2
  '    hui-generic-entity-row $: |', // 3
  '      #container {', // 4
  '        color: red;', // 5
  '      }', // 6
  '    ha-markdown$: |', // 7
  '      #title { color: #fff; }', // 8
  '      * { margin: 0; }', // 9
  '    .: |', // 10
  '      ha-card { --x: 1px; }', // 11
  '    "ha-card $": |-', // 12
  '      #a { b: c }', // 13
  '    hui-row:', // 14
  '      $: |', // 15
  '        #deep { color: blue; }', // 16
  '  # a YAML comment', // 17
  'entities:', // 18
  '  - light.kitchen # main', // 19
];

test('a block scalar under any key of a style map is CSS', () => {
  const modes = modesOf(DOC);
  for (const index of [4, 5, 6, 8, 9, 11, 13, 16]) {
    assert.equal(modes[index].blockScalarKind, 'css', `"${DOC[index].trim()}" is inside a CSS block`);
    assert.equal(modes[index].lineInfo, null);
    assert.notEqual(modes[index].lineKind, 'comment', `"${DOC[index].trim()}" is not a comment`);
  }
  // The key lines themselves and the lines after the map are YAML.
  for (const index of [0, 1, 2, 3, 7, 10, 12, 14, 15, 17, 18, 19]) {
    assert.equal(modes[index].blockScalarKind, '', `"${DOC[index].trim()}" is YAML`);
  }
});

test('the CSS lines get CSS tokens at their offsets', () => {
  const modes = modesOf(DOC);
  assert.deepEqual(tokensOf(DOC, 4, modes), [
    { start: 6, end: 16, kind: 'cssSelector' },
    { start: 17, end: 18, kind: 'punct' },
  ]);
  assert.deepEqual(tokensOf(DOC, 5, modes), [
    { start: 8, end: 13, kind: 'cssProp' },
    { start: 13, end: 14, kind: 'punct' },
    { start: 15, end: 18, kind: 'cssValue' },
    { start: 18, end: 19, kind: 'punct' },
  ]);
  assert.deepEqual(kinds(DOC, 8, modes), ['cssSelector:#title', 'punct:{', 'cssProp:color', 'punct::', 'cssValue:#fff', 'punct:;', 'punct:}']);
  assert.deepEqual(kinds(DOC, 9, modes), ['op:*', 'punct:{', 'cssProp:margin', 'punct::', 'number:0', 'punct:;', 'punct:}']);
  assert.deepEqual(kinds(DOC, 11, modes), ['cssSelector:ha-card', 'punct:{', 'cssProp:--x', 'punct::', 'number:1px', 'punct:;', 'punct:}']);
  assert.deepEqual(kinds(DOC, 13, modes), ['cssSelector:#a', 'punct:{', 'cssProp:b', 'punct::', 'cssValue:c', 'punct:}']);
  assert.deepEqual(kinds(DOC, 16, modes), ['cssSelector:#deep', 'punct:{', 'cssProp:color', 'punct::', 'cssValue:blue', 'punct:;', 'punct:}']);
});

test('YAML around the map keeps its meaning: comments, keys and list items', () => {
  const modes = modesOf(DOC);
  assert.equal(modes[17].lineKind, 'comment');
  assert.deepEqual(tokensOf(DOC, 17, modes), [{ start: 0, end: DOC[17].length, kind: 'comment' }]);
  assert.deepEqual(kinds(DOC, 2, modes), ['key:style', 'punct::']);
  assert.deepEqual(kinds(DOC, 7, modes), ['key:ha-markdown$', 'punct::', 'op:|']);
  assert.deepEqual(kinds(DOC, 12, modes), ['key:"ha-card $"', 'punct::', 'op:|-']);
  assert.deepEqual(kinds(DOC, 18, modes), ['key:entities', 'punct::']);
  assert.deepEqual(kinds(DOC, 19, modes), ['yamlList:-', 'filter:light.kitchen', 'comment:# main']);
});

test('a selector key with a comment after its block indicator still opens CSS', () => {
  const doc = [
    'card_mod:',
    '  style:',
    '    .: |  # the card',
    '      #x { color: red; }',
    '    "ha-card $": |- # shadow root',
    '      * { margin: 0; }',
  ];
  const modes = modesOf(doc);
  assert.equal(modes[3].blockScalarKind, 'css');
  assert.notEqual(modes[3].lineKind, 'comment');
  assert.equal(modes[5].blockScalarKind, 'css');
});

test('a block scalar after the map has ended is text again', () => {
  const doc = [
    'card_mod:',
    '  style:',
    '    .: |',
    '      ha-card { color: red; }',
    'content: |',
    '  # Heading',
    '  * item',
  ];
  const modes = modesOf(doc);
  assert.equal(modes[3].blockScalarKind, 'css');
  assert.equal(modes[5].blockScalarKind, 'text');
  assert.equal(modes[5].lineKind, 'string');
  assert.equal(modes[6].lineKind, 'string');
});

test('a YAML comment at a lower column does not end the map; a key at the map column does', () => {
  const doc = [
    '- type: entities',
    '  style:',
    '# note',
    '    .: |',
    '      #x { color: red; }',
    '  title: |',
    '    # Heading',
  ];
  const modes = modesOf(doc);
  assert.equal(modes[2].lineKind, 'comment');
  assert.equal(modes[4].blockScalarKind, 'css');
  assert.equal(modes[6].blockScalarKind, 'text', 'title is a sibling of style, outside the map');
});

test('a style map with plain values is YAML', () => {
  // picture-elements: style holds CSS property names with plain values.
  const doc = ['elements:', '  - type: state-icon', '    style:', '      top: 50%', '      left: 30% # a third', '    entity: light.kitchen'];
  const modes = modesOf(doc);
  for (const mode of modes) assert.equal(mode.blockScalarKind, '');
  assert.deepEqual(kinds(doc, 3, modes), ['key:top', 'punct::', 'number:50%']);
  assert.deepEqual(kinds(doc, 4, modes), ['key:left', 'punct::', 'number:30%', 'comment:# a third']);
  assert.deepEqual(kinds(doc, 5, modes), ['key:entity', 'punct::', 'filter:light.kitchen']);
});

test('the line modes continue correctly after an edit inside the map', () => {
  // The classifier keeps the state before each line and continues from the first changed line,
  // so that state has to carry the map.
  const lineKind = (line, ctx) => bridge.darkPlusLineKind(line, ctx);
  const isJinja = (line) => bridge.darkPlusIsJinjaLine(line);
  const before = modesOf(DOC, isJinja, lineKind).map((mode) => `${mode.blockScalarKind}|${mode.lineKind}`);
  const edited = DOC.slice();
  edited[12] = '    "ha-card $": |';
  const continued = modesOf(edited, isJinja, lineKind).map((mode) => `${mode.blockScalarKind}|${mode.lineKind}`);
  assert.deepEqual(continued, before);
  // A fresh classifier (another function identity, so an empty cache) gives the same answer.
  const fresh = modesOf(edited, (line) => bridge.darkPlusIsJinjaLine(line), (line, ctx) => bridge.darkPlusLineKind(line, ctx))
    .map((mode) => `${mode.blockScalarKind}|${mode.lineKind}`);
  assert.deepEqual(continued, fresh);
});

test('the walker used without a document tracks the map the same way', () => {
  const ctx = { blockComment: false, cssBlockDepth: 0, blockScalarKind: '', blockScalarIndent: null };
  const seen = DOC.map((line) => { smartSyntaxUpdateBlockContext(ctx, line); return ctx.blockScalarKind; });
  // The walker is advanced before a line is classified, so the opening line already reports the
  // scalar it opens.
  for (const index of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16]) assert.equal(seen[index], 'css', DOC[index]);
  for (const index of [0, 1, 2, 14, 17, 18, 19]) assert.equal(seen[index], '', DOC[index]);
});
