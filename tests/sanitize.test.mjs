import assert from 'node:assert/strict';
import test from 'node:test';
import {
  leadingWhitespace,
  indentLinesAfterFirst,
  sanitizeInlineDocumentation,
} from '../src/core/sanitize.js';

test('leadingWhitespace returns spaces and tabs before content', () => {
  assert.equal(leadingWhitespace('    test'), '    ');
  assert.equal(leadingWhitespace('\t\ttest'), '\t\t');
  assert.equal(leadingWhitespace('test'), '');
  assert.equal(leadingWhitespace(null), '');
});

test('indentLinesAfterFirst prefixes every line after the first with the indent as given', () => {
  assert.equal(indentLinesAfterFirst('a\nb\nc', '  '), 'a\n  b\n  c');
  assert.equal(indentLinesAfterFirst('single', '  '), 'single');
  assert.equal(indentLinesAfterFirst('a\nb', undefined), 'a\nundefinedb');
  assert.equal(indentLinesAfterFirst(null, '  '), '');
});

test('sanitizeInlineDocumentation drops tags, angle brackets and control characters and collapses spaces', () => {
  assert.equal(sanitizeInlineDocumentation('<b>Bold</b> text'), 'Bold text');
  assert.equal(sanitizeInlineDocumentation('a < b'), 'a b');
  assert.equal(sanitizeInlineDocumentation('a > b'), 'a b');
  assert.equal(sanitizeInlineDocumentation('line one\nline\ttwo'), 'line one line two');
  assert.equal(sanitizeInlineDocumentation(null), '');
  assert.equal(sanitizeInlineDocumentation('x'.repeat(400)).length, 320);
});
