import test from 'node:test';
import assert from 'node:assert/strict';

import { lovelaceContextProvider } from '../../src/providers/lovelaceContextProvider.js';
import { hacsCatalogProvider } from '../../src/providers/hacsCatalogProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { scoreItems } from '../../src/completion/scoring.js';

// Directly inside a card_mod: mapping the keys are card_mod's own (style:, class:), not the keys
// of the card around it.

function at(doc, triggerKind = 'explicit') {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind });
  const provider = lovelaceContextProvider({ getDoc: () => doc, getPos: () => doc.length });
  const rows = provider.canHandle(ctx) ? provider.provide(ctx) : [];
  return { ctx, rows, labels: rows.map(row => row.label) };
}

const CARD_KEYS = ['type:', 'entity:', 'tap_action:', 'card_mod:', 'cards:'];
const ROOT_KEYS = ['triggers:', 'actions:', 'alias:'];

test('inside card_mod: the style key is offered and the card keys are not', () => {
  for (const doc of [
    'type: entities\ncard_mod:\n  ',
    'type: entities\ncard_mod:\n  st',
    'type: entities\ncard_mod:\n',           // the editor puts the new line at the opener's column
    'type: entities\ncard_mod:\n  class: big\n  ',
    'type: vertical-stack\ncards:\n  - type: tile\n    entity: light.kitchen\n    card_mod:\n      ',
    'views:\n  - title: Home\n    cards:\n      - type: markdown\n        card_mod:\n          s',
    'type: custom:button-card\ncard_mod:\n  ',
  ]) {
    const { labels, rows } = at(doc);
    assert.ok(labels.includes('style:'), `style: missing at ${JSON.stringify(doc)}: ${JSON.stringify(labels)}`);
    assert.ok(labels.includes('class:'));
    for (const key of [...CARD_KEYS, ...ROOT_KEYS]) assert.ok(!labels.includes(key), `${key} offered inside card_mod at ${JSON.stringify(doc)}`);
    assert.equal(rows.find(row => row.label === 'style:').insert, 'style: |');
  }
});

test('the style key leads the list inside card_mod', () => {
  const doc = 'type: entities\nentities:\n  - light.kitchen\ncard_mod:\n  s';
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' });
  const providers = [lovelaceContextProvider({ getDoc: () => doc, getPos: () => doc.length }), hacsCatalogProvider()];
  const shown = scoreItems(ctx, {
    settings: { enabledLangs: { yaml: true }, maxItems: 12 },
    providerCandidates: () => providers.flatMap(provider => (provider.canHandle(ctx) ? provider.provide(ctx) : [])),
  });
  assert.equal(shown[0].label, 'style:');
  // The catalog still lists the keys of the card around the block (it cannot tell which of them
  // belong inside a block); they come after the card_mod keys.
  const firstCardKey = shown.findIndex(row => row.source !== shown[0].source);
  assert.ok(firstCardKey === -1 || firstCardKey >= 1);
  assert.ok(shown.slice(0, Math.max(1, firstCardKey)).every(row => ['style:', 'class:'].includes(row.label)));
});

test('the card around a card_mod block keeps its keys', () => {
  const afterBlock = at('type: entities\ncard_mod:\n  style: |\n    ha-card { color: red; }\nna');
  assert.equal(afterBlock.ctx.lang, 'yaml');
  for (const key of ['name:', 'type:', 'card_mod:']) assert.ok(afterBlock.labels.includes(key), key);
  assert.ok(!afterBlock.labels.includes('style:'));

  const root = at('type: entities\n');
  assert.ok(root.labels.includes('card_mod:') && root.labels.includes('entities:'));
  assert.ok(!root.labels.includes('style:'));

  const stacked = at('type: vertical-stack\ncards:\n  - type: tile\n    card_mod:\n      style: |\n        ha-card { color: red; }\n    en');
  for (const key of ['entity:', 'tap_action:']) assert.ok(stacked.labels.includes(key), key);
  assert.ok(!stacked.labels.includes('style:'));
});

test('button-card styles and other blocks keep their own rows', () => {
  assert.deepEqual(at('type: custom:button-card\nstyles:\n  ').labels.slice(0, 3), ['card:', 'icon:', 'name:']);
  assert.ok(at('type: custom:button-card\nstyles:\n  card:\n    - ').labels.includes('border-radius:'));
  assert.ok(at('type: tile\ntap_action:\n  ').labels.includes('action:'));
  assert.ok(at('type: entities\nentities:\n  - ').labels.includes('secondary_info:'));
});
