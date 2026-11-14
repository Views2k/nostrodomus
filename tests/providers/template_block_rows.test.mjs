import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIndex, loadLibrary, staticLibraryProvider } from '../../src/providers/staticLibraryProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { parseSnippetTemplate } from '../../src/completion/snippets.js';

// The template rows `{% if %}` and `{% set %}` insert their own `{%`. The template lane is only
// active inside an open delimiter, so a row must never add a second `{%` behind a typed one.

const state = { completionCache: new Map(), settings: { providers: {}, enabledLangs: { yaml: true, jinja: true, css: true } } };
await loadLibrary({ state, buildIndex: () => buildIndex({ state, ensureProviderSettings: () => null }) });
const provider = staticLibraryProvider({ state });
const SETTINGS = { enabledLangs: { yaml: true, jinja: true, css: true }, maxItems: 40 };

function at(doc, triggerKind = 'typing') {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind });
  const rows = provider.canHandle(ctx) ? provider.provide(ctx) : [];
  const shown = scoreItems(ctx, { settings: SETTINGS, providerCandidates: () => rows });
  return { ctx, rows, shown };
}

// The text after accepting a row: the replaced range is ctx.from..cursor, placeholders become
// their default text.
function accepted(doc, ctx, row) {
  return doc.slice(0, ctx.from) + parseSnippetTemplate(row.insert).text;
}

function count(text, part) {
  return text.split(part).length - 1;
}

test('a bare {% is replaced by the whole block row', () => {
  const doc = 'message: "{%';
  const { ctx, shown } = at(doc);
  const row = shown.find(item => item.label === '{% if %}');
  assert.ok(row, 'the if row is offered right after {%');
  const text = accepted(doc, ctx, row);
  assert.ok(text.startsWith('message: "{% if condition %}'), text);
  assert.equal(count(text, '{% if'), 1);
  assert.ok(!text.includes('{%{%') && !text.includes('{% {%'));
});

test('a word typed after {% gets the row without a second delimiter', () => {
  for (const [doc, label, expected] of [
    ['message: "{% i', '{% if %}', 'message: "{% if condition %}'],
    ['message: "{%i', '{% if %}', 'message: "{% if condition %}'],
    ['message: "{% se', '{% set %}', 'message: "{% set x = value %}'],
    ['message: "{%- se', '{% set %}', 'message: "{%- set x = value %}'],
    ['message: "{%-se', '{% set %}', 'message: "{%- set x = value %}'],
    ['message: "{{ a }} {% if', '{% if %}', 'message: "{{ a }} {% if condition %}'],
  ]) {
    const { ctx, shown } = at(doc);
    const row = shown.find(item => item.label === label);
    assert.ok(row, `${label} is offered at ${JSON.stringify(doc)}`);
    const text = accepted(doc, ctx, row);
    assert.ok(text.startsWith(expected), `${JSON.stringify(doc)} gave ${JSON.stringify(text)}`);
    assert.equal(count(text.split('\n')[0], '{%'), count(expected, '{%'), 'no doubled delimiter');
  }
});

test('an explicit request right after `{% ` offers the block rows', () => {
  const doc = 'message: "{% ';
  const { ctx, rows } = at(doc, 'explicit');
  const row = rows.find(item => item.label === '{% if %}');
  assert.ok(row);
  assert.ok(accepted(doc, ctx, row).startsWith('message: "{% if condition %}'));
});

test('inside {{ }} and further into a block the block rows are left out', () => {
  for (const doc of ['message: "{{ i', 'message: "{{ se', 'message: "{% if x and s', 'message: "{% set y = i', "message: \"{{ states('sensor.x') | i"]) {
    const { ctx, rows, shown } = at(doc);
    assert.equal(ctx.lang, 'jinja', doc);
    assert.ok(!rows.some(item => String(item.insert).startsWith('{%')), doc);
    assert.ok(!shown.some(item => item.label === '{% if %}' || item.label === '{% set %}'), doc);
  }
});

test('the other template rows are the index rows themselves', () => {
  const index = state.index.byLang.jinja;
  for (const doc of ['message: "{{ st', 'message: "{% i', 'message: "{{ x | fl']) {
    const { rows } = at(doc);
    const plain = rows.filter(item => !['{% if %}', '{% set %}'].includes(item.label));
    assert.equal(plain.length, index.length - 2);
    assert.ok(plain.every(item => index.includes(item)), 'no copies of rows that did not change');
  }
  assert.ok(at('message: "{{ st').shown.some(item => item.label === 'states()'));
  assert.ok(at('message: "{% i').shown.some(item => item.label === 'iif'));
});

test('other languages get their pool unchanged', () => {
  const yaml = detectRuntimeContext('type: entities\nen', 19, { triggerKind: 'typing' });
  assert.equal(provider.provide(yaml), state.index.byLang.yaml);
  const cssDoc = 'type: entities\ncard_mod:\n  style: |\n    dis';
  const css = detectRuntimeContext(cssDoc, cssDoc.length, { triggerKind: 'typing' });
  assert.equal(css.lang, 'css');
  assert.equal(provider.provide(css), state.index.byLang.css);
});

test('the completion cache keeps `{{ i` and `{% i` on one line apart', () => {
  const cache = new Map();
  const run = doc => {
    const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' });
    return scoreItems(ctx, { settings: SETTINGS, cache, providerCandidates: () => provider.provide(ctx) });
  };
  assert.ok(!run('message: "{{ i').some(item => item.label === '{% if %}'));
  assert.ok(run('message: "{% i').some(item => item.label === '{% if %}'), 'not the cached {{ list');
  assert.ok(!run('message: "{{ i').some(item => item.label === '{% if %}'));
});
