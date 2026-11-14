import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext, yamlValueKind as adapterValueKind } from '../../src/yaml/runtimeContextAdapter.js';
import { yamlValueKind as classifierValueKind } from '../../src/yaml/yamlContextClassifier.js';
import { haRuntimeValueProvider } from '../../src/providers/haRuntimeProvider.js';
import { hacsCatalogProvider } from '../../src/providers/hacsCatalogProvider.js';

// `type:` names a card only where a card can stand. Inside a card, several lists have items with
// a `type:` of their own (tile features, chart series, mushroom chips, an entities card header),
// a view has a layout type, and a device action in an automation has an action type. None of
// those takes a card type, so the card type list is not offered there.

const data = { entities: [], entityNames: {}, services: [], serviceFields: {}, cards: ['entities', 'tile', 'custom:button-card'] };

function at(doc) {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
  const rows = [];
  for (const provider of [haRuntimeValueProvider({ runtimeData: () => data }), hacsCatalogProvider()]) {
    if (provider.canHandle(ctx)) rows.push(...provider.provide(ctx));
  }
  return { ctx, cardRows: rows.filter(row => row.type === 'card').map(row => row.label) };
}

const NOT_A_CARD = [
  ['a tile feature', 'type: tile\nentity: light.kitchen\nfeatures:\n  - type: '],
  ['a tile feature after another key', 'type: tile\nfeatures:\n  - style: dropdown\n    type: '],
  ['a tile feature inside a stack', 'type: vertical-stack\ncards:\n  - type: tile\n    features:\n      - type: li'],
  ['a chart series', 'type: custom:apexcharts-card\nseries:\n  - entity: sensor.power\n    type: '],
  ['a mushroom chip', 'type: custom:mushroom-chips-card\nchips:\n  - type: '],
  ['an entities card header', 'type: entities\nheader:\n  type: '],
  ['an entities card footer', 'type: entities\nfooter:\n  type: '],
  ['a view layout', 'views:\n  - title: Home\n    type: '],
  ['a device action step', 'actions:\n  - device_id: abc123\n    domain: light\n    type: '],
  ['a device action step in a script', 'sequence:\n  - type: turn_on\n    device_id: abc123\n  - domain: light\n    type: '],
  ['a device action step in a then block', 'actions:\n  - if:\n      - condition: state\n    then:\n      - domain: light\n        type: '],
  // then: and else: are not in the list of blocks themselves (auto-entities has an else: card);
  // an automation branch is covered by the actions: or sequence: further up its path.
  ['the first key of a step in a then block', 'actions:\n  - if:\n      - condition: state\n    then:\n      - type: '],
  ['a step in an else block', 'actions:\n  - if:\n      - condition: state\n    then:\n      - action: light.turn_on\n    else:\n      - type: '],
  ['a step in an else block of a script', 'sequence:\n  - if:\n      - condition: state\n    then: []\n    else:\n      - device_id: abc123\n        type: '],
];

for (const [name, doc] of NOT_A_CARD) {
  test(`type: is not a card type for ${name}`, () => {
    const { ctx, cardRows } = at(doc);
    assert.equal(ctx.yamlKey, 'type');
    assert.equal(ctx.valueKind, '', JSON.stringify(ctx.yamlPath));
    assert.equal(classifierValueKind(ctx), '', 'the provider-side copy agrees');
    // The catalog still lists the value hints of the card around the cursor (its own type among
    // them); the list of all card types is what must not appear.
    for (const cardType of ['tile', 'entities', 'custom:button-card']) {
      assert.ok(!cardRows.includes(cardType), `${cardType} offered: ${JSON.stringify(cardRows.slice(0, 6))}`);
    }
    assert.ok(cardRows.length <= 2, JSON.stringify(cardRows.slice(0, 6)));
  });
}

const A_CARD = [
  ['the root card', 'type: '],
  ['the root card after other keys', 'type: tile\nfeatures:\n  - type: light-brightness\ncard_mod:\n  style: x\ntype: '],
  ['a card in a stack', 'type: vertical-stack\ncards:\n  - type: '],
  ['a card after a tile with features', 'type: vertical-stack\ncards:\n  - type: tile\n    features:\n      - type: light-brightness\n  - type: '],
  ['a card in a view', 'views:\n  - title: Home\n    cards:\n      - type: '],
  ['a card in a section', 'views:\n  - type: sections\n    sections:\n      - type: grid\n        cards:\n          - type: '],
  ['the card of a conditional card', 'type: conditional\ncard:\n  type: '],
  ['a popup content card in an automation', 'actions:\n  - action: browser_mod.popup\n    data:\n      content:\n        type: '],
  ['a section', 'views:\n  - type: sections\n    sections:\n      - type: '],
  ['a badge', 'views:\n  - title: Home\n    badges:\n      - type: '],
  ['a picture element', 'type: picture-elements\nelements:\n  - type: '],
  ['an entities row', 'type: entities\nentities:\n  - type: '],
  ['a card inside a chip card stack', 'type: vertical-stack\ncards:\n  - type: custom:mushroom-chips-card\n    chips:\n      - type: entity\n  - type: '],
  ['the else card of an auto-entities card', 'type: custom:auto-entities\ncard:\n  type: entities\nfilter:\n  include:\n    - domain: light\nelse:\n  type: '],
  ['the else card of an auto-entities card in a stack', 'type: vertical-stack\ncards:\n  - type: custom:auto-entities\n    filter:\n      include: []\n    else:\n      type: ma'],
];

for (const [name, doc] of A_CARD) {
  test(`type: stays a card type for ${name}`, () => {
    const { ctx, cardRows } = at(doc);
    assert.equal(ctx.valueKind, 'card-type', JSON.stringify(ctx.yamlPath));
    assert.equal(classifierValueKind(ctx), 'card-type');
    assert.ok(cardRows.includes('tile') && cardRows.includes('custom:button-card'), JSON.stringify(cardRows.slice(0, 5)));
  });
}

test('trigger and condition types keep their own lanes', () => {
  assert.equal(at('triggers:\n  - trigger: device\n    type: ').ctx.valueKind, 'trigger-type');
  assert.equal(at('conditions:\n  - condition: device\n    type: ').ctx.valueKind, 'condition-type');
});

test('both copies of the classifier agree on type: for every path', () => {
  const segments = ['cards', 'card', 'content', 'features', 'series', 'chips', 'header', 'footer', 'views', 'sections', 'badges',
    'elements', 'entities', 'actions', 'sequence', 'then', 'else', 'parallel', 'type', 'entity', 'data', 'triggers', 'conditions'];
  for (const a of segments) {
    for (const b of segments) {
      for (const yamlPath of [[a], [a, b], [a, 'type', b], [a, b, 'type'], [a, 'title', b, 'type']]) {
        for (const yamlRole of ['value', 'key']) {
          const ctx = { yamlKey: 'type', yamlPath, yamlRole, lang: 'yaml' };
          assert.equal(adapterValueKind(ctx), classifierValueKind(ctx), JSON.stringify(ctx));
        }
      }
    }
  }
});
