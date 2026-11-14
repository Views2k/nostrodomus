import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { scoreItems } from '../../src/completion/scoring.js';

function contextAt(docWithCaret, triggerKind = 'typing') {
  const pos = docWithCaret.indexOf('|');
  return detectRuntimeContext(docWithCaret.replace('|', ''), pos, { triggerKind });
}

// [I]
test('the catalog card type comes from the card around the caret, not from an earlier card', () => {
  const afterUnknownType = contextAt('cards:\n  - type: custom:mini-graph-card\n    entities:\n      - sensor.temp\n  - type: thermostat\n    na|');
  assert.equal(afterUnknownType.catalogCardType, '', 'a card type the catalog does not know gets no catalog rows');
  assert.equal(afterUnknownType.catalogSurfaceId, '');

  const root = contextAt('type: vertical-stack\ncards:\n  - type: custom:button-card\n    entity: light.x\nna|');
  assert.equal(root.catalogCardType, 'vertical-stack', 'a root key belongs to the root card, not to the nested one');

  const known = contextAt('cards:\n  - type: custom:mini-graph-card\n    entities:\n      - sensor.temp\n  - type: custom:apexcharts-card\n    na|');
  assert.equal(known.catalogCardType, 'custom:apexcharts-card');

  const nested = contextAt('cards:\n  - type: custom:button-card\n    tap_action:\n      act|');
  assert.equal(nested.catalogCardType, 'custom:button-card', 'a nested block still resolves to its card');
});

// [H]
test('cacheKey: two cards in one document do not share a cache slot', () => {
  const base = { lang: 'yaml', prefix: '', shouldSuggest: true, triggerKind: 'explicit', yamlRole: 'blank', scope: 'cards.type', pathText: 'cards.type', documentWordToken: 'same-doc' };
  const miniGraph = { ...base, catalogCardType: 'custom:mini-graph-card', catalogSurfaceId: 'mini-graph-card' };
  const apex = { ...base, catalogCardType: 'custom:apexcharts-card', catalogSurfaceId: 'apexcharts-card' };
  const rows = [{ id: 'hacs.mini-graph-card.key.line_width', lang: 'yaml', type: 'key', label: 'line_width:', insert: 'line_width: ', source: 'hacs-catalog', meta: {} }];
  const cache = new Map();
  const events = [];
  const rec = (...args) => events.push(args);

  scoreItems(miniGraph, rows, { cache, recordSuggestionQuality: rec });
  const second = scoreItems(apex, [], { cache, recordSuggestionQuality: rec });

  assert.equal(events[1][2].cacheHit, false, 'the apexcharts card must not be served the mini-graph rows');
  assert.equal(second.length, 0);
});


// An item inside a custom card can have its own type: (an apexcharts series `type: column`).
// The lookup stopped there, so the series got none of the card's catalog rows.
test('a type: line that is not a card type does not end the catalog card lookup', () => {
  const doc = 'type: custom:apexcharts-card\nseries:\n  - entity: sensor.power\n    type: column\n    ';
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
  assert.equal(ctx.catalogCardType, 'custom:apexcharts-card');
  // A card type the catalog does not know still ends the lookup (no rows from an earlier card).
  const stack = 'type: vertical-stack\ncards:\n  - type: custom:apexcharts-card\n  - type: custom:not-in-the-catalog\n    ';
  assert.equal(detectRuntimeContext(stack, stack.length, { triggerKind: 'explicit' }).catalogCardType, '');
  const native = 'type: vertical-stack\ncards:\n  - type: custom:apexcharts-card\n  - type: thermostat\n    ';
  assert.notEqual(detectRuntimeContext(native, native.length, { triggerKind: 'explicit' }).catalogCardType, 'custom:apexcharts-card');
});