// A YAML alias (`*name`) was painted as a comment: the scalar classifier tested for a leading
// '*' (the continuation of a block comment) before it tested for an alias.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  smartSyntaxScalarKind,
  smartSyntaxTokenizeYamlLine,
  smartSyntaxYamlLineInfo,
} from '../../src/syntax/smartSyntaxTokenizers.js';

const tokens = (line, lineKind = 'fg') => smartSyntaxTokenizeYamlLine(line, smartSyntaxYamlLineInfo(line), lineKind);
const kinds = (line, lineKind) => tokens(line, lineKind).map((token) => `${token.kind}:${line.slice(token.start, token.end)}`);

test('an alias is a keyword, as an anchor is', () => {
  assert.deepEqual(tokens('card: *base'), [
    { start: 0, end: 4, kind: 'key' },
    { start: 4, end: 5, kind: 'punct' },
    { start: 6, end: 11, kind: 'keyword' },
  ]);
  assert.deepEqual(tokens('defaults: &base'), [
    { start: 0, end: 8, kind: 'key' },
    { start: 8, end: 9, kind: 'punct' },
    { start: 10, end: 15, kind: 'keyword' },
  ]);
  assert.equal(smartSyntaxScalarKind('*base'), 'keyword');
  assert.equal(smartSyntaxScalarKind('*base-card_2'), 'keyword');
  assert.equal(smartSyntaxScalarKind('&base'), 'keyword');
});

test('an alias as a list item and inside a flow sequence', () => {
  assert.deepEqual(tokens('  - *common', 'yamlList'), [
    { start: 2, end: 3, kind: 'yamlList' },
    { start: 4, end: 11, kind: 'keyword' },
  ]);
  assert.deepEqual(kinds('cards: [*a, *b]'), ['key:cards', 'punct::', 'punct:[', 'keyword:*a', 'punct:,', 'keyword:*b', 'punct:]']);
  assert.deepEqual(kinds('  - entity: *main # the main light', 'yamlList'), ['yamlList:- ', 'key:entity', 'punct::', 'keyword:*main', 'comment:# the main light']);
});

test('comments and other scalars keep their kinds', () => {
  assert.deepEqual(kinds('name: Hall # *not an alias'), ['key:name', 'punct::', 'string:Hall', 'comment:# *not an alias']);
  assert.deepEqual(kinds('password: !secret wifi'), ['key:password', 'punct::', 'keyword:!secret', 'string:wifi']);
  // A '*' that is not followed by a name is not an alias.
  assert.equal(smartSyntaxScalarKind('*'), 'comment');
  assert.equal(smartSyntaxScalarKind('*/'), 'comment');
  assert.equal(smartSyntaxScalarKind('* text'), 'comment');
  assert.equal(smartSyntaxScalarKind('// note'), 'comment');
  assert.equal(smartSyntaxScalarKind('#note'), 'comment');
  assert.equal(smartSyntaxScalarKind('*bold*'), 'comment');
});
