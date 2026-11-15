// A syntax pass covers every rendered line, about a hundred, while an edit changes one, so the
// tokens of a line are kept until its text or position changes.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSmartSyntaxLineTokenCache,
  smartSyntaxRangeTokensForLine,
  smartSyntaxYamlLineInfo,
} from '../../src/syntax/smartSyntaxTokenizers.js';

const isJinja = (text) => /\{[{%#]/.test(String(text || ''));
const tokenize = (text, kind, info, scalar) => smartSyntaxRangeTokensForLine(text, kind, info, isJinja, undefined, scalar);

const LINES = [
  ['type: entities', 'fg', true, ''],
  ['  - entity: light.kitchen # main', 'fg', true, ''],
  ['      color: red;', 'cssProp', false, 'css'],
  ['      color: red;', 'fg', true, ''],
  ['  some plain text', 'string', false, 'text'],
  ["  {{ states('sensor.x') }}", 'jinja', false, 'text'],
  ['# comment', 'comment', false, ''],
  ['', 'fg', false, ''],
];

test('remembered tokens are the tokens a fresh tokenizer run gives', () => {
  const cached = createSmartSyntaxLineTokenCache(tokenize);
  for (let round = 0; round < 3; round += 1) {
    for (const [text, kind, keyed, scalar] of LINES) {
      const info = keyed ? smartSyntaxYamlLineInfo(text) : null;
      assert.deepEqual([...cached(text, kind, info, scalar)], tokenize(text, kind, info, scalar), `${JSON.stringify(text)} ${kind} ${scalar}`);
    }
  }
});

test('a line is tokenized once for the same text and position, and again when either differs', () => {
  let runs = 0;
  const cached = createSmartSyntaxLineTokenCache((...args) => { runs += 1; return tokenize(...args); });
  const info = smartSyntaxYamlLineInfo('color: red');
  const first = cached('color: red', 'fg', info, '');
  assert.equal(cached('color: red', 'fg', smartSyntaxYamlLineInfo('color: red'), ''), first);
  assert.equal(runs, 1);
  assert.ok(Object.isFrozen(first));
  cached('color: red', 'cssProp', null, 'css');
  cached('color: red', 'fg', null, '');
  cached('color: blue', 'fg', info, '');
  assert.equal(runs, 4, 'another block scalar, another key reading or another text is another entry');
});

test('the memory is bounded and very long lines are not kept', () => {
  let runs = 0;
  const cached = createSmartSyntaxLineTokenCache((...args) => { runs += 1; return tokenize(...args); }, 4, 20);
  for (let i = 0; i < 9; i += 1) cached(`key${i}: 1`, 'fg', null, '');
  assert.equal(runs, 9);
  cached('key8: 1', 'fg', null, '');
  assert.equal(runs, 9, 'a recent line is still remembered');
  cached('key0: 1', 'fg', null, '');
  assert.equal(runs, 10, 'an old line was dropped when the limit was reached');
  const long = `key: ${'x'.repeat(40)}`;
  cached(long, 'fg', null, '');
  cached(long, 'fg', null, '');
  assert.equal(runs, 12, 'a line over the length limit is tokenized every time');
});
