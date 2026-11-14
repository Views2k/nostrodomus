import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTEXT_DESCRIPTOR_FIELD_NAMES,
  CONTEXT_DESCRIPTOR_VERSION,
  contextDescriptorValidationErrors,
  currentYamlPath,
  describeYamlCompletionContext,
  inferFocusKind,
  inferYamlScalarValueKind,
  inferYamlValueKind,
  isDashboardActionPath,
  isValidContextDescriptor,
  stripYamlCommentRespectingQuotes,
  yamlBranchState,
  yamlCursorRole,
  yamlKeyFromLine,
} from '../../src/yaml/yamlCompletionContext.js';

const FIXTURE_DIR = join('tests', 'fixtures', 'context');

function fixtureFiles() {
  return readdirSync(FIXTURE_DIR).filter(name => name.endsWith('.json')).sort();
}

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

function splitCursor(sourceWithCursor) {
  const explicitMarker = '__CURSOR__';
  const explicitIndex = sourceWithCursor.indexOf(explicitMarker);
  if (explicitIndex >= 0) {
    const source = sourceWithCursor.slice(0, explicitIndex) + sourceWithCursor.slice(explicitIndex + explicitMarker.length);
    return { source, cursor: explicitIndex };
  }
  const marker = sourceWithCursor.indexOf('|');
  assert.notEqual(marker, -1, 'fixture must include __CURSOR__ or legacy | cursor marker');
  const source = sourceWithCursor.slice(0, marker) + sourceWithCursor.slice(marker + 1);
  return { source, cursor: marker };
}

test('context module is pure from browser/runtime globals', () => {
  const text = readFileSync('src/yaml/yamlCompletionContext.js', 'utf8');
  for (const token of ['state', 'document', 'window', 'querySelector', 'addEventListener', 'localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'eval(', 'new Function']) {
    assert.equal(new RegExp(`\\b${token.replace(/[()]/g, '\\$&')}\\b`).test(text), false, `must not reference ${token}`);
  }
});

test('context fixtures are documented and structurally valid', () => {
  const files = fixtureFiles();
  assert.ok(files.length >= 16, 'fixture corpus should cover real HA contexts, embedded blocks, and edge cases');
  for (const file of files) {
    const data = loadFixture(file);
    assert.equal(typeof data.name, 'string', `${file} must have a name`);
    assert.ok(data.rationale && data.rationale.length > 32, `${file} must explain why the context matters`);
    assert.equal(typeof data.sourceWithCursor, 'string', `${file} must include sourceWithCursor`);
    assert.ok(data.expected && typeof data.expected === 'object', `${file} must include expected`);
  }
});

test('describeYamlCompletionContext matches known context fixtures', () => {
  for (const file of fixtureFiles()) {
    const data = loadFixture(file);
    const { source, cursor } = splitCursor(data.sourceWithCursor);
    const ctx = describeYamlCompletionContext(source, cursor);
    assert.deepEqual(contextDescriptorValidationErrors(ctx), [], `${data.name}: descriptor validates`);
    for (const [key, value] of Object.entries(data.expected)) {
      assert.deepEqual(ctx[key], value, `${data.name}: ${key}`);
    }
  }
});

test('descriptor version and field schema are explicit and stable', () => {
  const ctx = describeYamlCompletionContext('entity: ', 'entity: '.length);
  assert.equal(CONTEXT_DESCRIPTOR_VERSION, 1);
  assert.equal(ctx.descriptorVersion, 1);
  assert.deepEqual(CONTEXT_DESCRIPTOR_FIELD_NAMES, [
    'descriptorVersion', 'lang', 'prefix', 'pathText', 'yamlPath', 'yamlKey', 'yamlRole', 'valueKind', 'focusKind',
    'branchState', 'scope', 'shouldSuggest', 'triggerKind', 'isTriggerChar', 'afterKeyColon'
  ]);
  assert.equal(isValidContextDescriptor(ctx), true);
  assert.deepEqual(contextDescriptorValidationErrors({ ...ctx, valueKind: 'bad-kind' }), ['unsupported valueKind: bad-kind']);
});

test('stripYamlCommentRespectingQuotes keeps hash characters inside quoted strings', () => {
  assert.equal(stripYamlCommentRespectingQuotes('"Status #1" # real comment'), '"Status #1"');
  assert.equal(stripYamlCommentRespectingQuotes("'Door #2' # real comment"), "'Door #2'");
  assert.equal(stripYamlCommentRespectingQuotes('light.kitchen # comment'), 'light.kitchen');
});

test('yamlCursorRole classifies blank, comment, key, list-key, and value positions', () => {
  assert.equal(yamlCursorRole({ line: '', beforeCursor: '', col: 0 }), 'blank');
  assert.equal(yamlCursorRole({ line: '# note', beforeCursor: '# note', col: 6 }), 'comment');
  assert.equal(yamlCursorRole({ line: 'entity', beforeCursor: 'entity', col: 6 }), 'key');
  assert.equal(yamlCursorRole({ line: '  - ', beforeCursor: '  - ', col: 4 }), 'list-key');
  assert.equal(yamlCursorRole({ line: 'entity: light.kitchen', beforeCursor: 'entity: light', col: 13 }), 'value');
});

test('yaml path scanner skips block scalar content and keeps structural path', () => {
  const source = 'card_mod:\n  style: |\n    ha-card {\n      color: red;\n    }\n  extra: true\n';
  assert.deepEqual(currentYamlPath(source, source.indexOf('color')), ['card_mod', 'style']);
  assert.deepEqual(currentYamlPath(source, source.indexOf('true')), ['card_mod', 'extra']);
});

test('valueKind and focusKind helpers keep provider-facing hints stable', () => {
  assert.equal(inferYamlValueKind('entity_id', ['action', 'target', 'entity_id'], 'value'), 'entity');
  assert.equal(inferYamlValueKind('service', ['action', 'service'], 'value'), 'service');
  assert.equal(inferYamlValueKind('service_name', ['action', 'service_name'], 'value'), 'service');
  assert.equal(inferYamlValueKind('perform_action', ['sequence', 'perform_action'], 'value'), 'service');
  assert.equal(inferYamlValueKind('action', ['sequence', 'action'], 'value'), 'service');
  assert.equal(inferYamlValueKind('action', ['tap_action', 'action'], 'value'), 'action');
  assert.equal(inferYamlValueKind('type', ['trigger', 'type'], 'value'), 'trigger-type');
  assert.equal(inferYamlValueKind('type', ['condition', 'type'], 'value'), 'condition-type');
  assert.equal(inferYamlValueKind('theme', ['theme'], 'value'), 'theme');
  assert.equal(inferYamlValueKind('enabled', ['automation', 'enabled'], 'value'), 'boolean');
  assert.equal(inferYamlScalarValueKind('timeout'), 'duration');
  assert.equal(inferYamlScalarValueKind('font_size'), 'number');
  assert.equal(inferYamlScalarValueKind('name'), 'string');
  assert.equal(isDashboardActionPath(['tap_action', 'action'], 'action'), true);
  assert.equal(isDashboardActionPath(['sequence', 'action'], 'action'), false);
  assert.equal(inferFocusKind(['card_mod', 'style'], 'style'), 'style-block');
  assert.equal(inferFocusKind(['tap_action', 'target', 'entity_id'], 'entity_id'), 'entity-list');
});

test('yamlBranchState summarizes nearby action siblings without throwing on partial YAML', () => {
  const source = 'action:\n  - service: light.turn_on\n    target:\n      entity_id: light.kitchen\n    data:\n      brightness: 100\n';
  const branch = yamlBranchState(source, source.length);
  assert.equal(branch.parentKey, 'action');
  assert.equal(branch.siblings.service.value, 'light.turn_on');
});

test('yamlKeyFromLine returns quote-aware values', () => {
  assert.deepEqual(yamlKeyFromLine('content: "Status #1" # note'), { indent: 0, key: 'content', value: '"Status #1"' });
});
