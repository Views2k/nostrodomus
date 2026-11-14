import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { completionMatchRank } from '../../src/completion/scoring.js';

// The typed prefix decides which rows match and which text an accepted row replaces. In a
// template and in JavaScript the braces, `%` and `$` in front of a word are syntax, so they do
// not belong to the prefix once a word follows them.

const STATES_ROW = { label: 'states()', insert: "states('')", aliases: ['states'] };
const ENTITY_ROW = { label: 'entity?.state', insert: 'entity?.state', aliases: ['entity', 'state'] };

function at(doc, triggerKind = 'typing') {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind });
  return { ctx, replaced: doc.slice(ctx.from, doc.length) };
}

test('a word typed right after {{ is the prefix, and the {{ is not replaced', () => {
  for (const doc of ['name: "{{st', 'content: |\n  Hello {{st', '{{st', 'a: "{{ x }}{{st']) {
    const { ctx, replaced } = at(doc);
    assert.equal(ctx.lang, 'jinja', doc);
    assert.equal(ctx.prefix, 'st', doc);
    assert.equal(replaced, 'st', 'only the word is replaced on accept');
    assert.equal(ctx.shouldSuggest, true);
    assert.equal(completionMatchRank(STATES_ROW, ctx.prefix).reason, 'exact-prefix');
  }
});

test('a word typed right after {% or {%- is the prefix', () => {
  assert.equal(at('msg: "{%if').ctx.prefix, 'if');
  assert.equal(at('msg: "{%if').replaced, 'if');
  assert.equal(at('msg: "{%-se').ctx.prefix, 'se', 'the trim marker belongs to the delimiter');
  assert.equal(at('msg: "{{-st').ctx.prefix, 'st');
  assert.equal(at('msg: "{%-').ctx.prefix, '{%-', 'nothing typed after the delimiter yet');
  assert.equal(at('msg: "{% if x %}{{ y }}{%el').ctx.prefix, 'el');
});

test('a template word after a space is unchanged', () => {
  assert.equal(at('name: "{{ st').ctx.prefix, 'st');
  assert.equal(at('name: "{{ st').replaced, 'st');
  assert.equal(at("name: \"{{ states('sensor.ki").ctx.prefix, 'sensor.ki');
  assert.equal(at('name: "{{ x | fl').ctx.prefix, 'fl');
});

test('a bare delimiter is still the whole prefix', () => {
  // Nothing follows the delimiter yet, so the rows that start with it match and replace it.
  const open = at('name: "{{');
  assert.equal(open.ctx.lang, 'jinja');
  assert.equal(open.ctx.prefix, '{{');
  assert.equal(open.replaced, '{{');
  const statement = at('msg: "{%');
  assert.equal(statement.ctx.prefix, '{%');
  assert.equal(statement.replaced, '{%');
  assert.equal(completionMatchRank({ label: '{% if %}', insert: '{% if x %}', aliases: ['if'] }, statement.ctx.prefix).reason, 'exact-prefix');
});

test('JavaScript: a word after ${ is the prefix', () => {
  const doc = 'label: |\n  [[[\n    return `${ent';
  const { ctx, replaced } = at(doc);
  assert.equal(ctx.lang, 'js');
  assert.equal(ctx.prefix, 'ent');
  assert.equal(replaced, 'ent');
  assert.equal(completionMatchRank(ENTITY_ROW, ctx.prefix).reason, 'exact-prefix');
  assert.equal(at('label: |\n  [[[\n    return ent').ctx.prefix, 'ent', 'a plain word is unchanged');
  assert.equal(at('label: |\n  [[[\n    return a%b').ctx.prefix, 'b');
});

test('CSS keeps $, % and braces in the prefix', () => {
  const style = 'type: entities\ncard_mod:\n  style: |\n    ';
  assert.equal(at(`${style}$`).ctx.lang, 'css');
  assert.equal(at(`${style}$`).ctx.prefix, '$', 'the card-mod $ selector rows match their own label');
  assert.equal(at(`${style}width: 50%`).ctx.prefix, '50%');
  assert.equal(at(`${style}--pri`).ctx.prefix, '--pri');
  assert.equal(at(`${style}ha-card{di`).ctx.prefix, 'ha-card{di');
});

test('YAML keys and values keep their prefix rules', () => {
  assert.equal(at('type: entities\nent').ctx.prefix, 'ent');
  assert.equal(at('entity: light.ki').ctx.prefix, 'light.ki');
  assert.equal(at('icon: mdi:ho').ctx.prefix, 'mdi:ho');
  assert.equal(at('entities:\n  - sensor.hu').ctx.prefix, 'sensor.hu');
});
