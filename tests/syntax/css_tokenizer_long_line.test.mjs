// The CSS tokenizer cut the rest of the line off and lower-cased it for every token, and searched
// the line from its start for every identifier. The time for a line grew with the square of its
// length: a 64,000 character line of minified card_mod CSS took about half a second per pass on
// a fast computer, and a line that long is tokenized again on every pass.

import test from 'node:test';
import assert from 'node:assert/strict';

import { smartSyntaxTokenizeCssLine } from '../../src/syntax/smartSyntaxTokenizers.js';

const LENGTH = 100000;

const LONG_LINES = {
  'minified rules': '.a{color:red;margin:0 auto;background:var(--x)}',
  'a value list in a declaration': 'opacity 0.3s ease-in-out, ',
  'identifiers without a colon': 'foo bar baz qux ',
  'important flags': '1px !important ',
};

// The work is counted, not timed, so the result does not depend on the computer: the number of
// characters the tokenizer copies out of the line or lower-cases while it runs.
function charactersCopiedBy(run) {
  const { slice, toLowerCase } = String.prototype;
  let characters = 0;
  String.prototype.slice = function countedSlice(...args) {
    const part = slice.apply(this, args);
    characters += part.length;
    return part;
  };
  String.prototype.toLowerCase = function countedToLowerCase() {
    characters += this.length;
    return toLowerCase.call(this);
  };
  try {
    run();
  } finally {
    String.prototype.slice = slice;
    String.prototype.toLowerCase = toLowerCase;
  }
  return characters;
}

for (const [label, unit] of Object.entries(LONG_LINES)) {
  test(`the work for a ${LENGTH} character line grows with its length, not its square: ${label}`, () => {
    const prefix = label.startsWith('a value list') ? 'transition: ' : '';
    const line = prefix + unit.repeat(Math.ceil(LENGTH / unit.length));
    for (const lineKind of ['cssValue', 'cssSelector']) {
      let tokens = [];
      const characters = charactersCopiedBy(() => { tokens = smartSyntaxTokenizeCssLine(line, lineKind); });
      assert.ok(tokens.length > LENGTH / 20, 'the whole line is tokenized');
      assert.equal(tokens[tokens.length - 1].end, line.trimEnd().length);
      // The old tokenizer copied the rest of the line for every token: more than a hundred
      // million characters for these lines. The limit is twice the length of the line.
      assert.ok(characters <= 2 * line.length, `${label} (${lineKind}) copied ${characters} characters of a ${line.length} character line`);
    }
  });
}

test('the tokens of a long line are the tokens of its parts', () => {
  // The same rule repeated: every repetition gets the same kinds at the same relative offsets.
  const unit = '.a{color:#fff;margin:0 -1.5em !important;background:var(--x)} ';
  const one = smartSyntaxTokenizeCssLine(unit, 'cssSelector');
  const repeats = 500;
  const all = smartSyntaxTokenizeCssLine(unit.repeat(repeats), 'cssSelector');
  assert.equal(all.length, one.length * repeats);
  const at = 317;
  const slice = all.slice(at * one.length, (at + 1) * one.length)
    .map((token) => ({ ...token, start: token.start - at * unit.length, end: token.end - at * unit.length }));
  assert.deepEqual(slice, one);
});

test('token kinds at a position are unchanged for the forms the tokenizer matches in place', () => {
  const kinds = (line, lineKind = 'cssValue') => smartSyntaxTokenizeCssLine(line, lineKind)
    .map((token) => `${token.kind}:${line.slice(token.start, token.end)}`);
  assert.deepEqual(kinds('color: #FFF !IMPORTANT;'), ['cssProp:color', 'punct::', 'cssValue:#FFF', 'cssGlow:!IMPORTANT', 'punct:;']);
  assert.deepEqual(kinds('margin: -1.5em .5px 2rem;'), ['cssProp:margin', 'punct::', 'number:-1.5em', 'number:.5px', 'number:2rem', 'punct:;']);
  assert.deepEqual(kinds('--my-var: var(--other);'), ['cssProp:--my-var', 'punct::', 'filter:var', 'punct:(', 'cssValue:--other', 'punct:);']);
  assert.deepEqual(kinds('ha-card { color: red }', 'cssSelector'), ['cssSelector:ha-card', 'punct:{', 'cssProp:color', 'punct::', 'cssValue:red', 'punct:}']);
  // The identifiers after the first colon of a declaration are values, with or without a
  // terminator before the colon.
  assert.deepEqual(kinds('b: c d'), ['cssProp:b', 'punct::', 'cssValue:c', 'cssValue:d']);
  assert.deepEqual(kinds('a; b: c d'), ['cssValue:a', 'punct:;', 'cssProp:b', 'punct::', 'cssValue:c', 'cssValue:d']);
  assert.deepEqual(kinds('x y: z'), ['cssValue:x', 'cssProp:y', 'punct::', 'cssValue:z']);
});
