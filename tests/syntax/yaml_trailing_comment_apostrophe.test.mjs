import test from 'node:test';
import assert from 'node:assert/strict';

import { smartSyntaxTokenizeYamlLine, smartSyntaxYamlLineInfo } from '../../src/syntax/smartSyntaxTokenizers.js';

const kinds = (line) => smartSyntaxTokenizeYamlLine(line, smartSyntaxYamlLineInfo(line), 'fg')
  .map((token) => `${token.kind}:${line.slice(token.start, token.end)}`);

test('an apostrophe inside a plain scalar does not hide the trailing comment', () => {
  assert.deepEqual(kinds("name: Bob's lamp # main light").slice(-1), ['comment:# main light']);
  assert.deepEqual(kinds("name: it's # note with 'quotes'").slice(-1), ["comment:# note with 'quotes'"]);
});

test('a quoted fragment that ends in a colon inside a plain scalar does not hide the trailing comment', () => {
  assert.deepEqual(kinds('title: Light "Hall:" # main').slice(-1), ['comment:# main']);
  assert.deepEqual(kinds("name: Say 'time:' now # note").slice(-1), ['comment:# note']);
  assert.deepEqual(kinds('- Use the "Mode:" row # see docs').slice(-1), ['comment:# see docs']);
  assert.deepEqual(kinds('color: [Light "Hall:", true] # list').slice(-1), ['comment:# list']);
  // A colon that ends a key still lets the value open a string, also in a flow mapping.
  assert.deepEqual(kinds('name: "a # b" # c').slice(-1), ['comment:# c']);
  assert.deepEqual(kinds('data: {"a":"b # c"} # d').slice(-1), ['comment:# d']);
});

test('a # inside a quoted scalar is still part of the string', () => {
  assert.deepEqual(kinds('name: "Room #1" # c'), ['key:name', 'punct::', 'string:"Room', 'string:#1"', 'comment:# c']);
  assert.deepEqual(kinds("name: 'Room #1'"), ['key:name', 'punct::', "string:'Room", "string:#1'"]);
  assert.deepEqual(kinds("items: [a, 'b # c'] # real").slice(-1), ['comment:# real']);
});

test('the trailing comment starts at the #, after any run of blanks', () => {
  assert.deepEqual(kinds('name: Hall   # note'), ['key:name', 'punct::', 'string:Hall', 'comment:# note']);
  assert.deepEqual(kinds('  - entity: light.a \t# main').slice(-1), ['comment:# main']);
  assert.deepEqual(kinds('  - light.a   # main').slice(-1), ['comment:# main'], 'as for a list item without a key');
});

test("an escaped quote ('') does not end a single-quoted scalar", () => {
  assert.deepEqual(kinds("name: 'Bob''s # 1 fan' # real"), [
    'key:name', 'punct::', "string:'Bob''s", 'string:#', 'string:1', "string:fan'", 'comment:# real',
  ]);
  assert.equal(kinds("  - 'it''s # here'").some((kind) => kind.startsWith('comment:')), false);
});

// A quote opens a scalar only where a scalar can start. After a word of a plain scalar it is an
// ordinary character, also when it follows a space: `rock 'n roll` has no quoted part.
test('a word that starts with an apostrophe inside a plain scalar does not hide the trailing comment', () => {
  const line = "name: rock 'n roll # the band";
  assert.deepEqual(smartSyntaxTokenizeYamlLine(line, smartSyntaxYamlLineInfo(line), 'fg'), [
    { start: 0, end: 4, kind: 'key' },
    { start: 4, end: 5, kind: 'punct' },
    { start: 6, end: 10, kind: 'string' },
    { start: 11, end: 13, kind: 'string' },
    { start: 14, end: 18, kind: 'string' },
    { start: 19, end: 29, kind: 'comment' },
  ]);
  assert.deepEqual(kinds("name: the 'old house # note").slice(-1), ['comment:# note']);
  assert.deepEqual(kinds('name: say "cheese # note').slice(-1), ['comment:# note']);
  assert.deepEqual(kinds("name: Hello, 'world # note").slice(-1), ['comment:# note']);
  // The same value as a list item without a key.
  const item = "  - rock 'n roll # the band";
  assert.deepEqual(smartSyntaxTokenizeYamlLine(item, null, 'yamlList'), [
    { start: 2, end: 3, kind: 'yamlList' },
    { start: 4, end: 8, kind: 'string' },
    { start: 9, end: 11, kind: 'string' },
    { start: 12, end: 16, kind: 'string' },
    { start: 17, end: 27, kind: 'comment' },
  ]);
});

test('a quoted scalar still starts after a list dash, an anchor, a tag, a colon or a flow indicator', () => {
  const noComment = (line, lineKind = 'fg') => assert.equal(
    smartSyntaxTokenizeYamlLine(line, smartSyntaxYamlLineInfo(line), lineKind).some((token) => token.kind === 'comment'),
    false,
    line,
  );
  noComment("name: 'Room #1'");
  noComment('  - "Room #1"', 'yamlList');
  noComment("  - - 'a #1'", 'yamlList');
  noComment("name: !!str 'a #1'");
  noComment("name: &room 'a #1'");
  noComment("rooms: ['a #1', \"b #2\"]");
  noComment("rooms: {first: 'a #1', second: [x, 'b #2']}");
  // A real comment after each of them is still found.
  assert.deepEqual(kinds("name: !!str 'a #1' # real").slice(-1), ['comment:# real']);
  assert.deepEqual(kinds("name: &room 'a #1' # real").slice(-1), ['comment:# real']);
  assert.deepEqual(kinds("rooms: {first: 'a #1', second: [x, 'b #2']} # real").slice(-1), ['comment:# real']);
  assert.deepEqual(kinds("name: 'it''s' # real").slice(-1), ['comment:# real']);
  assert.deepEqual(kinds('name: plain # real'), ['key:name', 'punct::', 'string:plain', 'comment:# real']);
});
