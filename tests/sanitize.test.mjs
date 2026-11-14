import assert from 'node:assert/strict';
import test from 'node:test';
import {
  safeString,
  stripYamlComment,
  directYamlKey,
  leadingWhitespace,
  indentLinesAfterFirst,
  camelMatch,
} from '../src/core/sanitize.js';

test('safeString coerces nullable and scalar values without throwing', () => {
  assert.equal(safeString('abc'), 'abc');
  assert.equal(safeString(123), '123');
  assert.equal(safeString(null), '');
  assert.equal(safeString(undefined), '');
});

test('stripYamlComment reflects the current implementation contract', () => {
  assert.equal(stripYamlComment('name: test # comment'), 'name: test');
  assert.equal(stripYamlComment("name: '# not comment'"), "name: '# not comment'");
  assert.equal(stripYamlComment('name: "# not comment"'), 'name: "# not comment"');
});

test.todo('decide whether stripYamlComment should preserve the trailing space before a removed comment');

test('directYamlKey returns the current parsed key descriptor object', () => {
  assert.deepEqual(directYamlKey('name: test'), { indent: 0, key: 'name', value: 'test' });
  assert.deepEqual(directYamlKey('  entity: light.kitchen'), { indent: 2, key: 'entity', value: 'light.kitchen' });
  assert.deepEqual(directYamlKey('- type: custom:button-card'), { indent: 0, key: 'type', value: 'custom:button-card' });
});

test('leadingWhitespace returns spaces and tabs before content', () => {
  assert.equal(leadingWhitespace('    test'), '    ');
  assert.equal(leadingWhitespace('\t\ttest'), '\t\t');
  assert.equal(leadingWhitespace('test'), '');
  assert.equal(leadingWhitespace(null), '');
});

test('indentLinesAfterFirst prefixes every line after the first with legacy coercion', () => {
  assert.equal(indentLinesAfterFirst('a\nb\nc', '  '), 'a\n  b\n  c');
  assert.equal(indentLinesAfterFirst('single', '  '), 'single');
  assert.equal(indentLinesAfterFirst('a\nb', undefined), 'a\nundefinedb');
  assert.equal(indentLinesAfterFirst(null, '  '), '');
});

test('camelMatch reflects the current uppercase-token implementation', () => {
  assert.equal(camelMatch('buttonCard', 'bc'), false);
  assert.equal(camelMatch('ButtonCard', 'bc'), true);
  assert.equal(camelMatch('ha-card', 'hc'), false);
  assert.equal(camelMatch('entity', 'zz'), false);
});

test.todo('decide whether camelMatch should support lowercase camelCase and delimiter initials');
