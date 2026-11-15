import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { CURSOR, suggestionPipeline } from '../fixtures/suggestionPipeline.mjs';

// The YAML path counts the first key of a list item as a parent of the item's other keys. A card
// in a list that starts with `- features:` has `type:` at the path cards.features.type, the same
// path as the type: of one of its features. The card's own type: is a sibling of that first key
// (same column), and it names a card.

const pipeline = await suggestionPipeline();

function kindAt(doc) {
  return detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' }).valueKind;
}

test('a card whose list item starts with features, chips, series, header or footer gets card types', () => {
  for (const [marked, expected] of [
    [`cards:\n  - features:\n      - type: light-brightness\n    entity: light.kitchen\n    type: ti${CURSOR}`, 'tile'],
    [`cards:\n  - chips:\n      - type: entity\n    type: custom:mushroom-ch${CURSOR}`, 'custom:mushroom-chips-card'],
    [`cards:\n  - series:\n      - entity: sensor.power\n    type: custom:apex${CURSOR}`, 'custom:apexcharts-card'],
    [`cards:\n  - header:\n      type: buttons\n    type: entit${CURSOR}`, 'entity'],
    [`cards:\n  - footer:\n      type: graph\n    type: entit${CURSOR}`, 'entity'],
    [`type: vertical-stack\ncards:\n  - type: markdown\n  - features:\n      - type: light-brightness\n    type: ti${CURSOR}`, 'tile'],
    [`views:\n  - title: Home\n    cards:\n      - features: []\n        type: ti${CURSOR}`, 'tile'],
    // thermostat is a card type only the Home Assistant value provider lists.
    [`cards:\n  - features:\n      - type: climate-hvac-modes\n    type: thermo${CURSOR}`, 'thermostat'],
  ]) {
    const { ctx, items, labels } = pipeline.listAt(marked);
    assert.equal(ctx.valueKind, 'card-type', marked);
    assert.ok(items.length > 0 && items.every(item => item.type === 'card'), marked);
    assert.equal(labels[0], expected, `first rows at ${JSON.stringify(marked)}: ${JSON.stringify(labels.slice(0, 3))}`);
  }
});

test('the type: of the item inside such a block is still not a card type', () => {
  for (const doc of [
    'type: tile\nfeatures:\n  - type: li',
    'type: tile\nfeatures:\n  - style: dropdown\n    type: li',
    'cards:\n  - features:\n      - type: li',
    'cards:\n  - features:\n      - style: dropdown\n        type: li',
    'cards:\n  - type: tile\n    features:\n      - style: dropdown\n        type: li',
    'cards:\n  - header:\n      type: bu',
    'type: custom:mushroom-chips-card\nchips:\n  - entity: light.kitchen\n    type: en',
    'actions:\n  - device_id: abc123\n    type: tu',
    'views:\n  - title: Home\n    type: se',
  ]) {
    assert.equal(kindAt(doc), '', JSON.stringify(doc));
    const marked = `${doc}${CURSOR}`;
    assert.deepEqual(pipeline.listAt(marked).labels, [], `no rows while typing at ${JSON.stringify(doc)}`);
  }
});

test('trigger and condition types of a list item keep their lanes', () => {
  assert.equal(kindAt('triggers:\n  - trigger: device\n    type: '), 'trigger-type');
  assert.equal(kindAt('- trigger: device\n  type: '), 'trigger-type');
  assert.equal(kindAt('- platform: device\n  type: '), 'card-type', 'nothing above says trigger');
  assert.equal(kindAt('conditions:\n  - condition: device\n    type: '), 'condition-type');
});
