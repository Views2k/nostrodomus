import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentYamlPath,
  detectContext,
  directYamlKey,
  isCommentContext,
  isScalarConfigContext,
  recentYamlText,
  scalarValueContext,
  stripYamlComment,
  yamlBranchState,
  yamlCurrentKey,
  yamlCursorRole,
  yamlFocusKind,
  yamlPathText,
  yamlScalarValueKind,
} from '../../src/yaml/yamlScanner.js';

test('yamlScanner facade exposes pure path, comment, and key helpers', () => {
  const source = 'type: custom:button-card\ntap_action:\n  action: navigate\n  navigation_path: /lovelace/home\n';
  const pos = source.indexOf('navigate') + 'navigate'.length;
  assert.deepEqual(currentYamlPath(source, pos), ['tap_action', 'action']);
  assert.equal(yamlPathText({ yamlPath: ['Tap_Action', 'Action'] }), 'tap_action.action');
  assert.equal(recentYamlText(source, pos, 20).endsWith('action: navigate'), true);
  assert.deepEqual(directYamlKey('  action: navigate # comment'), { indent: 2, key: 'action', value: 'navigate' });
  assert.equal(stripYamlComment('"Status #1" # comment'), '"Status #1"');
  assert.equal(yamlCurrentKey({ line: '  entity_id: light.kitchen' }), 'entity_id');
  assert.equal(yamlCursorRole({ line: 'entity: light.kitchen', beforeCursor: 'entity: light', col: 13 }), 'value');
  assert.equal(isCommentContext('yaml', { line: '# note', beforeCursor: '# note' }, ''), true);
});

test('isCommentContext catches a trailing YAML comment', () => {
  const line = 'entity: light.a # kit';
  // Cursor inside the trailing comment → suppressed (else the entity popup overwrites the comment).
  assert.equal(isCommentContext('yaml', { line, beforeCursor: 'entity: light.a # kit' }, ''), true, 'cursor after the # is inside the comment');
  // Cursor still in the value (before the #) → not a comment.
  assert.equal(isCommentContext('yaml', { line, beforeCursor: 'entity: li' }, ''), false, 'cursor before the # is in the value');
  // `#` without a leading space is part of the value, not a comment.
  assert.equal(isCommentContext('yaml', { line: 'entity: a#b', beforeCursor: 'entity: a#b' }, ''), false, 'a#b is a value');
  // `#` inside quotes is not a comment.
  assert.equal(isCommentContext('yaml', { line: 'name: "a # b"', beforeCursor: 'name: "a # b"' }, ''), false, 'quoted # is not a comment');
  // Same `#` in a CSS (card_mod) context is a color/selector, not a comment.
  assert.equal(isCommentContext('css', { line: 'color: #ff', beforeCursor: 'color: #ff' }, ''), false, 'CSS # is a color, not a comment');
});

test('isCommentContext gates the /* and <!-- scans by language', () => {
  // /* … */ is a comment only in CSS/JS. In YAML a `/*` inside a value (e.g. a URL) must not
  // suppress completion — and the cross-line scan must not kill the rest of the recent buffer.
  const urlLine = { line: 'url: https://ex.com/*wild', beforeCursor: 'url: https://ex.com/*wild' };
  assert.equal(isCommentContext('yaml', urlLine, ''), false, 'YAML /* in a value is not a comment');
  assert.equal(isCommentContext('css', { line: '/* c', beforeCursor: '/* c' }, ''), true, 'CSS /* still a comment');
  // Cross-line: a `/*` earlier in the YAML buffer must not suppress a later YAML line.
  assert.equal(isCommentContext('yaml', { line: 'entity: light.k', beforeCursor: 'entity: light.k' }, 'note: "a /* b"'), false, 'stray /* in the YAML buffer does not suppress downstream');
  assert.equal(isCommentContext('css', { line: 'color: r', beforeCursor: 'color: r' }, '/* open block'), true, 'CSS open block comment still suppresses across lines');

  // <!-- … --> is a comment only in HTML. In YAML/markdown content it must not suppress.
  const md = { line: 'content: see <!-- x', beforeCursor: 'content: see <!-- x' };
  assert.equal(isCommentContext('yaml', md, ''), false, 'YAML/markdown <!-- is not a suppressing comment');
  assert.equal(isCommentContext('html', { line: '<!-- c', beforeCursor: '<!-- c' }, ''), true, 'HTML <!-- still a comment');
  assert.equal(isCommentContext('yaml', { line: 'name: x', beforeCursor: 'name: x' }, 'body: "<!-- open"'), false, 'stray <!-- in the YAML buffer does not suppress downstream');
});

test('isCommentContext gates the line-start # and // markers by language', () => {
  // `#` starts a comment in YAML/Python but is an id selector in a card_mod CSS block.
  assert.equal(isCommentContext('css', { line: '#id {', beforeCursor: '#id {' }, ''), false, 'CSS #id selector is not a comment');
  assert.equal(isCommentContext('css', { line: '#id .child {', beforeCursor: '#id ' }, ''), false, 'mid-CSS id selector is not a comment');
  assert.equal(isCommentContext('yaml', { line: '# note', beforeCursor: '# note' }, ''), true, 'YAML # is still a comment');
  assert.equal(isCommentContext('python', { line: '# py', beforeCursor: '# py' }, ''), true, 'Python # is still a comment');
  // `//` starts a comment in JS/CSS but is a bare value (e.g. a UNC/host path) in YAML.
  assert.equal(isCommentContext('yaml', { line: 'server: //host/share', beforeCursor: 'server: //host/share' }, ''), false, 'YAML // in a value is not a comment');
  assert.equal(isCommentContext('js', { line: '// c', beforeCursor: '// c' }, ''), true, 'JS // is still a comment');
  assert.equal(isCommentContext('css', { line: '// c', beforeCursor: '// c' }, ''), true, 'CSS // (scss-style) still suppresses');
});

test('detectContext adds legacy-compatible readout fields without globals', () => {
  const source = 'action:\n  - service: light.turn_on\n    target:\n      entity_id: light.kitchen\n';
  const cursor = source.indexOf('light.kitchen') + 'light.'.length;
  const ctx = detectContext(source, cursor);
  assert.equal(ctx.descriptorVersion, 1);
  assert.equal(ctx.yamlKey, 'entity_id');
  assert.equal(ctx.valueKind, 'entity');
  assert.equal(ctx.focusKind, 'entity-list');
  assert.equal(ctx.pathText, 'action.service.target.entity_id');
  assert.equal(ctx.lineNumber, 4);
  assert.equal(ctx.currentLine.trim(), 'entity_id: light.kitchen');
  assert.equal(ctx.beforeCursor.trim(), 'entity_id: light.');
  assert.equal(ctx.afterCursor, 'kitchen');
  assert.equal(ctx.existingKeyContext, true);
  assert.deepEqual(ctx.scalarValueContext, {
    valueKind: 'entity',
    yamlKey: 'entity_id',
    pathText: 'action.service.target.entity_id',
    focusKind: 'entity-list',
  });
});

test('yamlScanner facade keeps scalar and branch compatibility helpers', () => {
  const source = 'action:\n  - service: light.turn_on\n    data:\n      brightness_pct: 25\n';
  const branch = yamlBranchState(source, source.length);
  assert.equal(branch.parentKey, 'action');
  assert.equal(branch.action, 'light.turn_on');
  assert.equal(yamlScalarValueKind('timeout'), 'duration');
  assert.equal(yamlScalarValueKind('brightness_pct'), 'number');
  assert.equal(yamlFocusKind(['card_mod', 'style'], 'style'), 'style-block');
  assert.equal(isScalarConfigContext({ yamlRole: 'value', valueKind: 'number' }), true);
  assert.deepEqual(scalarValueContext({ yamlRole: 'value', valueKind: 'number', yamlKey: 'brightness_pct', yamlPath: ['data', 'brightness_pct'], focusKind: '' }), {
    valueKind: 'number',
    yamlKey: 'brightness_pct',
    pathText: 'data.brightness_pct',
    focusKind: '',
  });
});


test('a stray /* in YAML above a card_mod block does not suppress CSS completion inside it', () => {
  const line = { line: '      colo', beforeCursor: '      colo' };
  // /* is in a YAML value above the `style: |` opener → not a CSS comment for the block below.
  const strayAbove = 'name: "see http://x/*wild"\ncard_mod:\n  style: |\n    ha-card {\n      ';
  assert.equal(isCommentContext('css', line, strayAbove), false, 'a /* above the block opener is YAML text, not an open CSS comment');
  // A real open /* inside the block body still suppresses.
  const openInside = 'card_mod:\n  style: |\n    ha-card {\n      /* real open comment\n      ';
  assert.equal(isCommentContext('css', line, openInside), true, 'a real open /* inside the block is still a comment');
});
