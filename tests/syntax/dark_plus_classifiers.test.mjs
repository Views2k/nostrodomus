import test from 'node:test';
import assert from 'node:assert/strict';

import {
  darkPlusCssDepthDelta,
  darkPlusIsJinjaKeyword,
  darkPlusIsJinjaLine,
  darkPlusLooksCssContinuation,
  darkPlusLooksCssDeclaration,
  darkPlusLooksCssSelector,
} from '../../src/syntax/darkPlusClassifiers.js';

test('dark plus CSS depth delta counts braces', () => {
  assert.equal(darkPlusCssDepthDelta('.card {'), 1);
  assert.equal(darkPlusCssDepthDelta('}'), -1);
  assert.equal(darkPlusCssDepthDelta('a { color: red; }'), 0);
  assert.equal(darkPlusCssDepthDelta(null), 0);
});

test('dark plus CSS selector classifier matches selectors', () => {
  assert.equal(darkPlusLooksCssSelector('.card {'), true);
  assert.equal(darkPlusLooksCssSelector('#main'), true);
  assert.equal(darkPlusLooksCssSelector('ha-card > div'), true);
  assert.equal(darkPlusLooksCssSelector('color: red;'), false);
  assert.equal(darkPlusLooksCssSelector(''), false);
});

test('dark plus CSS declaration classifier matches declarations', () => {
  assert.equal(darkPlusLooksCssDeclaration('--nostrodomus-color: #fff;'), true);
  assert.equal(darkPlusLooksCssDeclaration('background: linear-gradient(red, blue);'), true);
  assert.equal(darkPlusLooksCssDeclaration('color: var(--primary-text-color);'), true);
  assert.equal(darkPlusLooksCssDeclaration('color: /not-declaration'), false);
  assert.equal(darkPlusLooksCssDeclaration(''), false);
});

test('dark plus CSS continuation classifier matches continuation lines', () => {
  assert.equal(darkPlusLooksCssContinuation('!important'), true);
  assert.equal(darkPlusLooksCssContinuation('var(--x)'), true);
  assert.equal(darkPlusLooksCssContinuation('rgba(1, 2, 3, .5)'), true);
  assert.equal(darkPlusLooksCssContinuation('plain text'), false);
  assert.equal(darkPlusLooksCssContinuation(null), false);
});

test('dark plus Jinja classifiers match Jinja lines and keywords', () => {
  assert.equal(darkPlusIsJinjaLine('{{ states("sensor.x") }}'), true);
  assert.equal(darkPlusIsJinjaLine('{% if true %}'), true);
  assert.equal(darkPlusIsJinjaLine('plain yaml'), false);
  assert.equal(darkPlusIsJinjaKeyword('if'), true);
  assert.equal(darkPlusIsJinjaKeyword('endfor'), true);
  assert.equal(darkPlusIsJinjaKeyword('sensor'), false);
});
