import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntaxRuntime } from '../src/syntax/syntaxRuntime.js';

const COLORS = {
  fg: '#d4d4d4',
  dim: '#808080',
  comment: '#6a9955',
  keyword: '#569cd6',
  op: '#d4d4d4',
  string: '#ce9178',
  number: '#b5cea8',
  bool: '#569cd6',
  key: '#9cdcfe',
  cssValue: '#ce9178',
  jinja: '#c586c0',
  punct: '#d4d4d4',
  cssGlow: '#f44747',
};

function makeRuntime(_classLookup) {
  return createSyntaxRuntime({
    state: {},
    VERSION: 'test-version',
    W: { NodeFilter: {} },
    DARKPLUS_SYNTAX_COLORS: COLORS,
    DARKPLUS_MAX_LINES_PER_PASS: 100,
    DARKPLUS_MAX_SPANS_PER_PASS: 100,
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'nostrodomus-test-source-class-style',
    SYNTAX_RECOVERY_DEFAULT_DELAYS: [],
    STYLE_SYNTAX_KIND_ORDER: ['key', 'string', 'number', 'bool', 'comment', 'keyword', 'op', 'punct', 'cssValue', 'cssGlow', 'jinja'],
    codeboxEditorCacheKey: () => 'editor-key',
    cssEscapeSelectorPart: value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'),
    effectiveStyleSettings: () => ({}),
    recordPerformanceEvent: () => {},
    resolveSyntaxTintSettings: () => ({ active: true, textShadow: 'none', themeOpacity: 1, palette: COLORS, presetKey: 'test' }),
    syntaxColorWithOpacity: color => color,
    codeMirrorSourceClassParts: () => null,
    scheduleDiagnosticsRefresh: () => false,
  });
}

function makeParts(classLookup) {
  const tags = {
    comment: 'comment',
    lineComment: 'lineComment',
    blockComment: 'blockComment',
    docComment: 'docComment',
    keyword: 'keyword',
    controlKeyword: 'controlKeyword',
    definitionKeyword: 'definitionKeyword',
    operatorKeyword: 'operatorKeyword',
    string: 'string',
    number: 'number',
    integer: 'integer',
    float: 'float',
    bool: 'bool',
    null: 'null',
    atom: 'atom',
    variableName: 'variableName',
    propertyName: 'propertyName',
    attributeName: 'attributeName',
    typeName: 'typeName',
    className: 'className',
    operator: 'operator',
    punctuation: 'punctuation',
    separator: 'separator',
    bracket: 'bracket',
    invalid: 'invalid',
    special: tag => `special:${tag}`,
    local: tag => `local:${tag}`,
    definition: tag => `definition:${tag}`,
    function: tag => `function:${tag}`,
  };
  return {
    cm: {
      highlightingFor: (_state, tag) => {
        const key = Array.isArray(tag) ? tag[0] : tag;
        return classLookup.get(key) || '';
      },
    },
    view: { state: {} },
    tags,
  };
}

test('source-class stylesheet emits one block per hashed class with first-registration winning', () => {
  const classLookup = new Map([
    ['comment', 'ͼdupe'],
    ['lineComment', 'ͼdupe'],
    ['keyword', 'ͼkw'],
    ['controlKeyword', 'ͼkw'],
    ['string', 'ͼstr'],
    ['special:string', 'ͼstr'],
  ]);
  const runtime = makeRuntime(classLookup);
  const built = runtime.buildCodeMirrorSourceClassSyntaxCss(makeParts(classLookup), {
    active: true,
    textShadow: 'none',
    themeOpacity: 1,
    palette: COLORS,
    presetKey: 'test',
  });

  assert.equal(built.sourceClassRuleCollisions, 3);
  assert.equal(built.classMap.length, 3);
  assert.equal((built.css.match(/\.\\ͼdupe \{/g) || []).length, 1);
  assert.equal((built.css.match(/\.\\ͼkw \{/g) || []).length, 1);
  assert.equal((built.css.match(/\.\\ͼstr \{/g) || []).length, 1);

  const commentEntry = built.classMap.find(entry => entry.classes.includes('ͼdupe'));
  assert.equal(commentEntry.label, 'comment');
  assert.equal(commentEntry.color, COLORS.comment);
  assert.deepEqual(commentEntry.collidedWith, ['lineComment']);

  const keywordEntry = built.classMap.find(entry => entry.classes.includes('ͼkw'));
  assert.equal(keywordEntry.label, 'keyword');
  assert.equal(keywordEntry.color, COLORS.keyword);
  assert.deepEqual(keywordEntry.collidedWith, ['controlKeyword']);

  const stringEntry = built.classMap.find(entry => entry.classes.includes('ͼstr'));
  assert.equal(stringEntry.label, 'string');
  assert.equal(stringEntry.color, COLORS.string);
  assert.deepEqual(stringEntry.collidedWith, ['specialString']);
});
