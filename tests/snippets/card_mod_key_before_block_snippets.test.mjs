import test from 'node:test';
import assert from 'node:assert/strict';

import { CURSOR, suggestionPipeline } from '../fixtures/suggestionPipeline.mjs';

// The two card_mod block snippets insert text that starts with `card_mod:`. A user who types
// the key name wants the key: the plain `card_mod:` row has to be the first row, and Enter has to
// complete the key, at a card's own keys and inside a nested block. The snippets are reached by
// their own words (glass, mushroom, card-mod).

const pipeline = await suggestionPipeline();
const BLOCK_SNIPPETS = ['snip.card_mod.glass_card', 'snip.card_mod.mushroom_chip_row'];
const blockSnippets = items => items.filter(item => BLOCK_SNIPPETS.includes(item.id)).map(item => item.id);

test('in a nested block, typing the key name gives the card_mod: key first', () => {
  for (const typed of ['card_', 'card_m', 'card_mod', 'card', 'car', 'cardm']) {
    const marked = `type: entities\nentities:\n  - entity: light.kitchen\n    ${typed}${CURSOR}`;
    const result = pipeline.listAt(marked);
    assert.deepEqual(blockSnippets(result.items), [], `block snippets offered for ${typed}`);
    if (typed.startsWith('card_') || typed === 'cardm') {
      assert.equal(result.labels[0], 'card_mod:', `first rows for ${typed}: ${JSON.stringify(result.labels.slice(0, 3))}`);
      assert.equal(result.items[0].type, 'key');
      assert.equal(pipeline.accept(result), `type: entities\nentities:\n  - entity: light.kitchen\n    card_mod:${CURSOR}`);
    }
  }
});

test('at a card\'s own keys, typing the key name gives the card_mod: key first', () => {
  for (const card of [
    'type: entities\nentities:\n  - light.kitchen\n',
    'type: custom:button-card\nentity: light.kitchen\n',
    'type: thermostat\nentity: climate.living_room\n',
    'type: vertical-stack\ncards:\n  - type: tile\n    entity: light.kitchen\n    ',
  ]) {
    const result = pipeline.listAt(`${card}card_mod${CURSOR}`);
    assert.equal(result.labels[0], 'card_mod:', `first rows at ${JSON.stringify(card)}: ${JSON.stringify(result.labels.slice(0, 3))}`);
    assert.equal(result.items[0].type, 'key');
    assert.deepEqual(blockSnippets(result.items), []);
    assert.ok(pipeline.accept(result).startsWith(`${card}card_mod:${CURSOR}`));
    for (const typed of ['card_', 'car']) {
      const partial = pipeline.listAt(`${card}${typed}${CURSOR}`);
      assert.equal(partial.items[0].type, 'key', `a key row leads for ${typed}`);
      assert.ok(partial.labels.includes('card_mod:'));
      assert.deepEqual(blockSnippets(partial.items), []);
    }
    assert.deepEqual(blockSnippets(pipeline.listAt(`${card}${CURSOR}`, 'explicit').items), [], 'not in the list of an empty prefix');
  }
});

test('the block snippets are offered for their own words', () => {
  for (const [typed, id] of [
    ['glass', 'snip.card_mod.glass_card'],
    ['frost', 'snip.card_mod.glass_card'],
    ['card-m', 'snip.card_mod.glass_card'],
    ['mush', 'snip.card_mod.mushroom_chip_row'],
  ]) {
    for (const card of ['type: entities\nentities:\n  - light.kitchen\n', 'type: entities\nentities:\n  - entity: light.kitchen\n    ']) {
      const result = pipeline.listAt(`${card}${typed}${CURSOR}`);
      assert.ok(result.items.some(item => item.id === id), `${id} missing for ${typed} at ${JSON.stringify(card)}`);
      assert.ok(!result.labels.includes('card_mod:'), 'the plain key row does not match this text, so nothing is ranked behind a snippet');
    }
  }
  const glass = pipeline.listAt(`type: entities\nentities:\n  - light.kitchen\nglass${CURSOR}`);
  assert.ok(pipeline.accept(glass, glass.items.find(item => item.id === 'snip.card_mod.glass_card')).startsWith('type: entities\nentities:\n  - light.kitchen\ncard_mod:\n  style: |\n    ha-card {'));
});
