// P2/P3: surface threading + the surface-aware Jinja bias in the pure context adapter.
// Locks: (a) a surface option lands on ctx.surface; (b) on a template surface with jinjaLane on, a
// bare states('…') line (no {{ }} wrapper) is biased to lang='jinja' with an entity jinjaArg; (c) the
// bias is gated — no jinjaLane, or a non-template surface, or a non-call line stays yaml; (d) the
// OFF-path (no surface option) is byte-identical: no surface / jinjaArg fields, lang unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

const at = (doc, opts) => detectRuntimeContext(doc, doc.length, opts);

test('OFF-path: no surface option → no surface/jinjaArg fields, a bare states() line stays yaml', () => {
  const ctx = at("states('");
  assert.equal(ctx.lang, 'yaml', 'no bias without a surface');
  assert.equal(Object.prototype.hasOwnProperty.call(ctx, 'surface'), false, 'no surface field when off');
  assert.equal(Object.prototype.hasOwnProperty.call(ctx, 'jinjaArg'), false, 'no jinjaArg field when off');
});

test('OFF-path byte-identity: the descriptor is deep-equal with and without an empty surface', () => {
  const plain = at('type: entities\nentity: ');
  const withEmpty = detectRuntimeContext('type: entities\nentity: ', 'type: entities\nentity: '.length, { surface: '' });
  assert.deepEqual(withEmpty, plain, 'an empty surface adds nothing');
});

test('P2: a surface option lands on ctx.surface (additive, lang unchanged for a yaml line)', () => {
  const ctx = at('type: ', { surface: 'devtools-action' });
  assert.equal(ctx.surface, 'devtools-action');
  assert.equal(ctx.lang, 'yaml', 'a non-template surface does not bias language');
});

test('P3: template surface + jinjaLane biases a bare states() line to jinja with an entity jinjaArg', () => {
  const ctx = at("states('", { surface: 'devtools-template', jinjaLane: true });
  assert.equal(ctx.lang, 'jinja', 'biased to jinja');
  assert.equal(ctx.scope, 'jinja-template');
  assert.equal(ctx.surface, 'devtools-template');
  assert.ok(ctx.jinjaArg, 'jinjaArg present');
  assert.equal(ctx.jinjaArg.expectKind, 'entity');
  assert.equal(ctx.jinjaArg.fn, 'states');
});

test('P3 gating: template surface but jinjaLane OFF → stays yaml (engineV2-alone changes no content)', () => {
  const ctx = at("states('", { surface: 'devtools-template' });
  assert.equal(ctx.lang, 'yaml');
  assert.equal(ctx.surface, 'devtools-template', 'surface still threaded for cache isolation');
  assert.equal(Object.prototype.hasOwnProperty.call(ctx, 'jinjaArg'), false, 'no jinjaArg without the lane');
});

test('P3 widen-only: a non-call line on a template surface stays yaml even with jinjaLane', () => {
  const ctx = at('some_key: value', { surface: 'devtools-template', jinjaLane: true });
  assert.equal(ctx.lang, 'yaml', 'only a real template-call shape triggers the bias');
});

test('genuine {{ }} jinja gets a jinjaArg on any surface (engine on) — jinja-in-card templates', () => {
  const ctx = at("{{ states('", { surface: 'card-editor', jinjaLane: true });
  assert.equal(ctx.lang, 'jinja', 'the {{ wrapper already implies jinja');
  assert.ok(ctx.jinjaArg && ctx.jinjaArg.expectKind === 'entity');
  assert.equal(ctx.surface, 'card-editor');
});

test('an interior } (dict literal) or % (modulo) does not flip an open jinja template back to YAML (bug hunt 4)', () => {
  const dictDoc = "icon: >\n  {{ {'on':'mdi:lightbulb'}[states('li";
  const dict = detectRuntimeContext(dictDoc, dictDoc.length);
  assert.equal(dict.lang, 'jinja', 'a dict-literal template stays jinja');
  assert.equal(dict.shouldSuggest, true);
  const modDoc = "value_template: >\n  {% if states.x.state | int % 2 == 0 and is_state('li";
  assert.equal(detectRuntimeContext(modDoc, modDoc.length).lang, 'jinja', 'a modulo inside {% stays jinja');
  // A closed template followed by YAML is still YAML.
  const closedDoc = 'template: "{{ x }}"\nentity: sen';
  assert.equal(detectRuntimeContext(closedDoc, closedDoc.length).lang, 'yaml', 'a closed template does not stick as jinja');
});
