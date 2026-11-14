import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogRowsForContext,
  hacsCatalogProvider,
} from '../../src/providers/hacsCatalogProvider.js';
import {
  MAIN_PROVIDER_SURFACES,
  getProviderSurface,
  getProviderSurfaceByCardType,
} from '../../src/providers/hacsProviderCatalog.js';

const DEEPENED_SURFACES = [
  'home-assistant-core',
  'card-mod',
  'mini-graph-card',
  'apexcharts-card',
  'mushroom',
  'button-card',
  'bubble-card',
  'layout-card',
  'auto-entities',
  'browser-mod',
  'stack-in-card',
  'swipe-card',
];

const REQUIRED_TERMS = {
  'home-assistant-core': ['perform_action', 'double_tap_action', 'perform-action', 'navigation_replace'],
  'card-mod': [':host', '$', '--card-mod-icon-color', 'ha-markdown'],
  'mini-graph-card': ['aggregate_func', 'state_map', 'labels_secondary', 'color_thresholds_transition'],
  'apexcharts-card': ['transform', 'data_generator', 'offset', 'return Number(x)'],
  mushroom: ['custom:mushroom-media-player-card', 'badge_icon', 'collapsible_controls', '{{ states(entity) }}'],
  'button-card': ['section_mode', 'state_display', 'triggers_update', '[[[ return entity.state; ]]]'],
  'bubble-card': ['modules', 'trigger_entity', 'horizontal-buttons-stack', 'module_id'],
  'layout-card': ['custom:grid-layout', 'custom:gap-card', 'mediaquery', 'sidebar'],
  'auto-entities': ['card_param', 'else', 'state_translated', 'entity_category'],
  'browser-mod': ['browser_mod.more_info', 'sequence', 'popup_card_id', 'browser_entities'],
  'stack-in-card': ['background', 'box_shadow', '--keep-background', 'true'],
  'swipe-card': ['keyboard', 'mousewheel', 'scrollbar', 'pauseOnMouseEnter'],
};

function allSurfaceTerms(surface) {
  return new Set([
    ...(surface.cardTypes || []),
    ...(surface.yamlKeys || []),
    ...(surface.nestedKeys || []),
    ...(surface.valueHints || []),
    ...(surface.serviceHints || []),
  ]);
}

test('schema deepening covers original high-traffic catalog surfaces with documented option terms', () => {
  for (const id of DEEPENED_SURFACES) {
    const surface = getProviderSurface(id);
    assert.ok(surface, `${id} must exist`);
    const terms = allSurfaceTerms(surface);
    for (const expected of REQUIRED_TERMS[id]) {
      assert.ok(terms.has(expected), `${id} missing ${expected}`);
    }
  }
});

test('schema-deepened surfaces expose richer provider rows without changing provider shape', () => {
  const provider = hacsCatalogProvider();

  for (const id of DEEPENED_SURFACES) {
    const surface = getProviderSurface(id);
    const keyRows = catalogRowsForContext({
      shouldSuggest: true,
      lang: 'yaml',
      yamlRole: 'key',
      catalogSurfaceId: surface.id,
    });
    const valueRows = catalogRowsForContext({
      shouldSuggest: true,
      lang: 'yaml',
      yamlRole: 'value',
      catalogSurfaceId: surface.id,
    });

    assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogSurfaceId: id }), true);
    assert.ok(keyRows.length >= surface.yamlKeys.length, `${id} key rows should include top-level keys`);
    assert.ok(valueRows.length >= 1, `${id} value rows should stay available`);
    assert.ok(keyRows.every(row => row.source === provider.id), `${id} key rows keep provider id`);
    assert.ok(valueRows.every(row => row.source === provider.id), `${id} value rows keep provider id`);
  }
});

test('additional layout and Mushroom card types resolve to a single catalog owner', () => {
  const expectedOwners = {
    'custom:grid-layout': 'layout-card',
    'custom:masonry-layout': 'layout-card',
    'custom:gap-card': 'layout-card',
    'custom:mushroom-media-player-card': 'mushroom',
    'custom:mushroom-title-card': 'mushroom',
  };

  for (const [cardType, ownerId] of Object.entries(expectedOwners)) {
    assert.equal(getProviderSurfaceByCardType(cardType)?.id, ownerId);
  }

  const duplicateCardTypes = new Map();
  for (const surface of MAIN_PROVIDER_SURFACES) {
    for (const cardType of surface.cardTypes) {
      duplicateCardTypes.set(cardType, (duplicateCardTypes.get(cardType) || 0) + 1);
    }
  }
  for (const [cardType, count] of duplicateCardTypes) {
    assert.equal(count, 1, `${cardType} should not have multiple catalog owners`);
  }
});
