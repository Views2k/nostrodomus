import test from 'node:test';
import assert from 'node:assert/strict';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import { haRuntimeValueProvider, runtimeData } from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { makeHassFixture } from '../fixtures/hassFixture.mjs';

// Entity LIST items with a typed prefix ('entities:\n  - sensor.hum|') were silent: the
// colon-less dash line reads as role 'key', so neither the bare-dash list-key lane nor
// the value-shape lane ever fired -- rows appeared at '- ' and vanished at the first
// keystroke. The adapter now reclassifies a typed sequence scalar as a list VALUE when
// it sits under an entities list or the token is entity-shaped against live domains.
const hass = makeHassFixture();
const liveData = () => runtimeData({ state: {}, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => hass, now: () => 1_000 });

function provider() {
  return haRuntimeValueProvider({ runtimeData: liveData });
}

function ctxAt(doc, triggerKind = 'typing') {
  return detectRuntimeContext(doc, doc.length, { triggerKind, runtimeData: liveData });
}

function labelsOf(rows) {
  return rows.map(row => row?.label ?? row?.insert ?? String(row));
}

test('a typed entity list item classifies as a list value', () => {
  const ctx = ctxAt('entities:\n  - sensor.hum');
  assert.equal(ctx.valueKind, 'entity');
  assert.equal(ctx.yamlRole, 'list-key');
  assert.equal(ctx.prefix, 'sensor.hum');
  assert.equal(ctx.shouldSuggest, true);
});

test('a typed entity list item reaches the entity rows end-to-end', () => {
  const ctx = ctxAt('entities:\n  - sensor.hum');
  const p = provider();
  assert.equal(p.canHandle(ctx), true);
  const rows = p.provide(ctx);
  assert.ok(labelsOf(rows).includes('sensor.humidity'), `expected entity rows, got: ${JSON.stringify(labelsOf(rows))}`);
  const scored = scoreItems(ctx, rows, { settings: { enabledLangs: { yaml: true }, maxItems: 20 } });
  assert.ok(scored.some(item => item.label === 'sensor.humidity'));
});

test('the second typed list item completes too', () => {
  const ctx = ctxAt('entities:\n  - sensor.humidity\n  - sensor.pow');
  const p = provider();
  assert.equal(p.canHandle(ctx), true);
  assert.ok(labelsOf(p.provide(ctx)).includes('sensor.power_usage'));
});

test('entity-shaped items under other list names complete via the shape arm', () => {
  const ctx = ctxAt('group_members:\n  - media_player.sp');
  assert.equal(ctx.valueKind, 'entity');
  const p = provider();
  assert.equal(p.canHandle(ctx), true);
  assert.ok(labelsOf(p.provide(ctx)).includes('media_player.speaker'));
});

test('a trailing comment with a colon does not disable the list-item lane', () => {
  // The mapping-item gate must test the CODE part of the line: a colon inside a
  // trailing comment is not a key separator.
  const source = 'entities:\n  - sensor.hum # note: x';
  const pos = source.indexOf(' # note');
  const ctx = detectRuntimeContext(source, pos, { triggerKind: 'typing', runtimeData: liveData });
  assert.equal(ctx.valueKind, 'entity');
  assert.equal(ctx.yamlRole, 'list-key');
  const p = provider();
  assert.equal(p.canHandle(ctx), true);
  assert.ok(labelsOf(p.provide(ctx)).includes('sensor.humidity'));

  // A real mapping item keeps the key lane, cursor mid-key included: the colon
  // after the caret is code, not comment.
  const mapping = 'entities:\n  - entity: sensor.hum';
  const midKey = mapping.indexOf('ntity:');
  const mapCtx = detectRuntimeContext(mapping, midKey, { triggerKind: 'typing', runtimeData: liveData });
  assert.equal(mapCtx.yamlRole, 'key');
});

test('controls: bare dash, non-entity lists, mapping items, and CSS lanes are unchanged', () => {
  const p = provider();

  const bare = ctxAt('entities:\n  - ', 'explicit');
  assert.equal(bare.yamlRole, 'list-key');
  assert.equal(bare.valueKind, 'entity');
  assert.equal(p.canHandle(bare), true);

  const alias = ctxAt('aliases:\n  - my_al');
  assert.equal(alias.yamlRole, 'key');
  assert.equal(alias.valueKind, '');
  assert.equal(p.canHandle(alias), false);

  const cardKey = ctxAt('cards:\n  - ty');
  assert.equal(cardKey.yamlRole, 'key');
  assert.equal(cardKey.valueKind, '');
  assert.equal(p.canHandle(cardKey), false);

  const mapping = ctxAt('entities:\n  - entity: sensor.hum');
  assert.equal(mapping.yamlRole, 'value');
  assert.equal(mapping.valueKind, 'entity');

  const css = ctxAt('cards:\n  - style: |\n      - sensor.hu');
  assert.equal(css.lang, 'css');
  assert.equal(css.valueKind, '');
});
