import test from 'node:test';
import assert from 'node:assert/strict';

import {
  smartSyntaxDocumentContextForVisibleLinesFromLines,
  smartSyntaxRangeTokensForLine,
} from '../../src/syntax/smartSyntaxTokenizers.js';
import { createDarkPlusBridge } from '../../src/syntax/darkPlusBridge.js';

// The document pass knows whether a line is YAML structure, block-scalar text or a CSS block, and
// that decides the tokenizer: a `key:` at line start, a card name or a brace does not make a
// YAML line CSS.

const bridge = createDarkPlusBridge({ DARKPLUS_SYNTAX_COLORS: {}, syntaxColorWithOpacity: (color) => color, api: {} });

function tokensFor(doc) {
  const domLines = doc.map((text) => ({ textContent: text }));
  const { modes } = smartSyntaxDocumentContextForVisibleLinesFromLines(doc, domLines, bridge.darkPlusIsJinjaLine, bridge.darkPlusLineKind);
  return doc.map((raw, i) => smartSyntaxRangeTokensForLine(raw, modes[i].lineKind, modes[i].lineInfo, bridge.darkPlusIsJinjaLine, undefined, modes[i].blockScalarKind)
    .map((token) => ({ kind: token.kind, text: raw.slice(token.start, token.end) })));
}
const kinds = (tokens) => tokens.map((token) => token.kind);
const kindOf = (tokens, text) => tokens.find((token) => token.text.trim() === text)?.kind;
const hasCss = (tokens) => tokens.some((token) => /^css/.test(token.kind));

test('plain YAML lines are tokenized as YAML', () => {
  const doc = [
    'type: custom:button-card  # main',
    'name: Kitchen # comment',
    'show_state: true',
    'tap_action: {action: toggle}',
    'cards:',
    '  - type: custom:mushroom-chips-card',
    '  - mushroom-title-card',
  ];
  const lines = tokensFor(doc);
  for (const [i, tokens] of lines.entries()) assert.equal(hasCss(tokens), false, `"${doc[i]}" has CSS tokens: ${JSON.stringify(tokens)}`);
  assert.equal(kindOf(lines[0], 'type'), 'key');
  assert.equal(lines[0][lines[0].length - 1].kind, 'comment', 'a trailing comment is a comment');
  assert.equal(lines[1][lines[1].length - 1].kind, 'comment');
  assert.equal(kindOf(lines[2], 'true'), 'bool');
  assert.equal(kindOf(lines[3], 'tap_action'), 'key', 'a flow mapping does not turn the key into a selector');
  assert.equal(kindOf(lines[5], 'type'), 'key', 'a card name does not turn the key into a selector');
});

test('a YAML line with a template keeps its key, list dash and trailing comment', () => {
  const doc = [
    'value_template: "{{ states(\'sensor.x\') | float > 20 }}"  # threshold',
    '  - name: Temp {{ x }}',
    '  - "{{ y }}"',
    '{% if true %}',
  ];
  const lines = tokensFor(doc);
  const shape = (tokens) => tokens.map((token) => `${token.kind}:${token.text}`);
  assert.deepEqual(shape(lines[0]).slice(0, 2), ['key:value_template', 'punct::']);
  assert.deepEqual(shape(lines[0]).slice(-1), ['comment:# threshold']);
  assert.deepEqual(shape(lines[1]).slice(0, 3), ['yamlList:- ', 'key:name', 'punct::']);
  assert.deepEqual(shape(lines[1]).slice(-3), ['jinja:{{', 'filter:x', 'jinja:}}'], 'the value is a template');
  assert.deepEqual(shape(lines[2]).slice(0, 2), ['yamlList:-', 'string:"{{ y }}"']);
  assert.deepEqual(shape(lines[3]), ['jinja:{%', 'keyword:if', 'keyword:true', 'jinja:%}'], 'a line without a key is all template');
});

test('the class painter keeps the key of a YAML line with a template', async () => {
  const { smartSyntaxTokenKind, smartSyntaxYamlLineInfo } = await import('../../src/syntax/smartSyntaxTokenizers.js');
  const kindAt = (line, text, lineKind = 'fg') => {
    const start = line.indexOf(text);
    return smartSyntaxTokenKind(text, line, lineKind, start, start + text.length, smartSyntaxYamlLineInfo(line), bridge.darkPlusIsJinjaLine, bridge.darkPlusTokenKind);
  };
  const quoted = '  - value_template: "{{ x }}"';
  assert.equal(kindAt(quoted, '-', 'yamlList'), 'yamlList');
  assert.equal(kindAt(quoted, 'value_template', 'yamlList'), 'key');
  assert.equal(kindAt(quoted, ':', 'yamlList'), 'punct');
  assert.equal(kindAt(quoted, '"{{ x }}"', 'yamlList'), 'string');
  const plain = 'name: Temp {{ x }}';
  assert.equal(kindAt(plain, 'name'), 'key');
  assert.equal(kindAt(plain, 'x'), 'jinja', 'the value is still a template');
});

test('text in a block scalar is text or a template, not CSS', () => {
  const doc = [
    'type: markdown',
    'content: |',
    '  Some text: here {x} and ha-card',
    '  {% if is_state("sun.sun", "above_horizon") %}',
    '  {% endif %}',
  ];
  const lines = tokensFor(doc);
  assert.deepEqual(lines[2], [{ kind: 'string', text: 'Some text: here {x} and ha-card' }]);
  assert.equal(lines[3][0].kind, 'jinja');
  assert.equal(hasCss(lines[3]), false);
});

test('CSS blocks keep the CSS tokenizer; CSS values in a styles list keep their functions', () => {
  const doc = [
    'styles:',
    '  card:',
    '    - background: rgba(0, 0, 0, 0.4)',
    'card_mod:',
    '  style: |',
    '    ha-card {',
    '      color: red;',
    '    }',
  ];
  const lines = tokensFor(doc);
  assert.equal(kindOf(lines[2], 'background'), 'key');
  assert.ok(kinds(lines[2]).includes('number'), JSON.stringify(lines[2]));
  assert.equal(kindOf(lines[5], 'ha-card'), 'cssSelector');
  assert.equal(kindOf(lines[6], 'color'), 'cssProp');
});

test('document lines come from the editor line export in one call', async () => {
  const { smartSyntaxDocLinesFromEditor } = await import('../../src/syntax/smartSyntaxTokenizers.js');
  let lineCalls = 0;
  const doc = { lines: 3, toJSON: () => ['a: 1', 'b: 2', 'c: 3'], line: (n) => { lineCalls += 1; return { text: `x${n}` }; } };
  const lines = smartSyntaxDocLinesFromEditor({}, () => ({ view: { state: { doc } } }));
  assert.deepEqual(lines, ['a: 1', 'b: 2', 'c: 3']);
  assert.equal(lineCalls, 0);
  // A document without the export, or with a mismatching one, falls back to the per-line read.
  const plain = { lines: 2, line: (n) => ({ text: `l${n}` }) };
  assert.deepEqual(smartSyntaxDocLinesFromEditor({}, () => ({ view: { state: { doc: plain } } })), ['l1', 'l2']);
});