import test from 'node:test';
import assert from 'node:assert/strict';

import {
  smartSyntaxDocumentContextForVisibleLinesFromLines,
  smartSyntaxRangeTokensForLine,
  smartSyntaxTokenizeYamlLine,
  smartSyntaxUpdateBlockContext,
  smartSyntaxYamlLineInfo,
} from '../../src/syntax/smartSyntaxTokenizers.js';
import { createDarkPlusBridge } from '../../src/syntax/darkPlusBridge.js';

// '#' and '*' start comments in YAML, but not inside a block scalar: there '#container {' is a
// CSS id selector, '## Title' a markdown heading and '* item' a markdown list item. They were
// all painted as italic comments. A '#' inside a quoted string is not a comment either.

const bridge = createDarkPlusBridge({ DARKPLUS_SYNTAX_COLORS: {}, syntaxColorWithOpacity: (color) => color, api: {} });

function docContext(docLines) {
  const domLines = docLines.map((text) => ({ textContent: text }));
  return smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, domLines, bridge.darkPlusIsJinjaLine, bridge.darkPlusLineKind);
}

const onlyComment = (tokens, raw) => tokens.length === 1 && tokens[0].kind === 'comment' && tokens[0].end === raw.length;

test('inside a CSS block scalar an id selector, a hex continuation and the universal selector are not comments', () => {
  const doc = [
    'card_mod:',
    '  style: |',
    '    #container {',
    '      background: linear-gradient(#112233,',
    '        #00ff00);',
    '    }',
    '    * {',
    '      margin: 0;',
    '    }',
    '    /* note */',
  ];
  const { modes } = docContext(doc);
  assert.equal(modes[2].blockScalarKind, 'css');
  for (const index of [2, 4, 6]) {
    assert.notEqual(modes[index].lineKind, 'comment', `"${doc[index].trim()}" must not be a comment`);
    const tokens = smartSyntaxRangeTokensForLine(doc[index], modes[index].lineKind, modes[index].lineInfo, bridge.darkPlusIsJinjaLine);
    assert.equal(onlyComment(tokens, doc[index]), false, `"${doc[index].trim()}" must not be painted as one comment range`);
  }
  assert.equal(modes[9].lineKind, 'comment', 'a real CSS comment is still a comment');
});

test('a YAML comment outside block scalars is still a comment', () => {
  const doc = ['# dashboard note', 'type: entities', '  # indented note'];
  const { modes } = docContext(doc);
  assert.equal(modes[0].lineKind, 'comment');
  assert.equal(modes[2].lineKind, 'comment');
  assert.equal(onlyComment(smartSyntaxRangeTokensForLine(doc[0], modes[0].lineKind, modes[0].lineInfo), doc[0]), true);
  // A line that was never classified still falls back to the leading-# test.
  assert.equal(onlyComment(smartSyntaxRangeTokensForLine('# loose', '', null), '# loose'), true);
});

test('in a markdown block scalar headings and list items are text; the scalar ends at the next key', () => {
  const doc = ['type: markdown', 'content: |', '  ## Title', '  * item', '  // template comment', 'title: After'];
  const { modes } = docContext(doc);
  assert.equal(modes[2].blockScalarKind, 'text');
  assert.equal(modes[2].lineKind, 'string');
  assert.equal(modes[3].lineKind, 'string');
  assert.equal(modes[4].lineKind, 'comment', 'a JS-style comment line keeps its meaning');
  assert.equal(modes[5].blockScalarKind, '', 'the next key at the opener column closes the scalar');
  assert.ok(modes[5].lineInfo, 'and parses as a YAML key line again');
  for (const index of [2, 3]) {
    const tokens = smartSyntaxRangeTokensForLine(doc[index], modes[index].lineKind, modes[index].lineInfo, bridge.darkPlusIsJinjaLine);
    assert.equal(onlyComment(tokens, doc[index]), false);
  }
});

test('the fallback walker tracks text block scalars and does not reopen one inside another', () => {
  const ctx = { blockComment: false, cssBlockDepth: 0, blockScalarKind: '', blockScalarIndent: null };
  smartSyntaxUpdateBlockContext(ctx, 'content: |');
  assert.equal(ctx.blockScalarKind, 'text');
  smartSyntaxUpdateBlockContext(ctx, '  style: |');
  assert.equal(ctx.blockScalarKind, 'text', 'a key-looking line inside the scalar is content');
  smartSyntaxUpdateBlockContext(ctx, 'title: After');
  assert.equal(ctx.blockScalarKind, '');
});

test('a mapping key needs a colon followed by whitespace or the end of the line', () => {
  assert.equal(smartSyntaxYamlLineInfo('- https://example.com/a'), null);
  assert.equal(smartSyntaxYamlLineInfo('url: https://example.com/a').cleanKey, 'url');
  assert.equal(smartSyntaxYamlLineInfo('tap_action:').cleanKey, 'tap_action');
  assert.equal(smartSyntaxYamlLineInfo('  - at: "07:00"').cleanKey, 'at');
});

test('a # inside a quoted string is not a comment; a real trailing comment still is', () => {
  const quoted = '- name: "Room #1"';
  const quotedTokens = smartSyntaxTokenizeYamlLine(quoted, smartSyntaxYamlLineInfo(quoted), 'yamlList');
  assert.equal(quotedTokens.some((token) => token.kind === 'comment'), false);
  const stringEnd = Math.max(...quotedTokens.filter((token) => token.kind === 'string').map((token) => token.end));
  assert.equal(stringEnd, quoted.length, 'the whole quoted value is string-colored');

  const trailing = 'show_name: "a #b"  # note';
  const trailingTokens = smartSyntaxTokenizeYamlLine(trailing, smartSyntaxYamlLineInfo(trailing), 'fg');
  const comment = trailingTokens.find((token) => token.kind === 'comment');
  assert.ok(comment, 'the trailing comment is found');
  assert.equal(trailing.slice(comment.start).trim(), '# note');
});

test('a list item without a key is tokenized: the dash is the list marker, the scalar has its own kind', () => {
  const kinds = (line) => smartSyntaxTokenizeYamlLine(line, smartSyntaxYamlLineInfo(line), 'yamlList')
    .map((token) => `${token.kind}:${line.slice(token.start, token.end)}`);
  assert.deepEqual(kinds('  - 42'), ['yamlList:-', 'number:42']);
  assert.deepEqual(kinds('  - true'), ['yamlList:-', 'bool:true']);
  assert.deepEqual(kinds('  - "two words"'), ['yamlList:-', 'string:"two', 'string:words"']);
  assert.deepEqual(kinds('  - https://example.com/a'), ['yamlList:-', 'string:https://example.com/a']);
  assert.deepEqual(kinds('  - light.kitchen  # main'), ['yamlList:-', 'filter:light.kitchen', 'comment:# main']);
  assert.deepEqual(kinds('  -'), [], 'a bare dash has nothing to tokenize');
});

test('the document lines are extracted once per document object', async () => {
  const { smartSyntaxDocLinesFromEditor } = await import('../../src/syntax/smartSyntaxTokenizers.js');
  let reads = 0;
  const makeDoc = (texts) => ({ lines: texts.length, line: (n) => { reads += 1; return { text: texts[n - 1] }; } });
  const first = makeDoc(['a: 1', 'b: 2']);
  const parts = { view: { state: { doc: first } } };
  const lines = smartSyntaxDocLinesFromEditor({}, () => parts);
  assert.deepEqual(lines, ['a: 1', 'b: 2']);
  assert.equal(smartSyntaxDocLinesFromEditor({}, () => parts), lines, 'the same document object reuses the extracted lines');
  assert.equal(reads, 2);
  parts.view.state.doc = makeDoc(['a: 1', 'b: 3']); // an edit produces a new document object
  assert.deepEqual(smartSyntaxDocLinesFromEditor({}, () => parts), ['a: 1', 'b: 3']);
  assert.equal(reads, 4);
});
