import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scoreItems } from '../../src/completion/scoring.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { hacsCatalogProvider, catalogRowsForContext } from '../../src/providers/hacsCatalogProvider.js';
import { MAIN_PROVIDER_SURFACES, getProviderSurface, getProviderSurfaceByCardType } from '../../src/providers/hacsProviderCatalog.js';
import { snippetProvider, snippetRowsForContext } from '../../src/providers/snippetProvider.js';
import snippetCatalogData from '../../data/snippets.json' with { type: 'json' };

const HACS_SURFACES = [
  'vertical-stack-in-card',
  'atomic-calendar-revive',
  'clock-weather-card',
  'uptime-card',
  'flex-table-card',
  'xiaomi-vacuum-map-card',
  'kiosk-mode',
  'better-thermostat-ui-card',
];

const REQUIRED_TERMS = {
  'vertical-stack-in-card': ['visibility', 'layout_options', ':host', '--ha-card-border-radius'],
  'atomic-calendar-revive': ['showRelativeTime', 'showProgressBar', 'enableModeChange', 'blocklistRegex'],
  'clock-weather-card': ['temperature_sensor', 'humidity_sensor', 'hide_forecast_section', 'cccc d LLLL'],
  'uptime-card': ['update_interval', 'alignment', 'tooltip', 'mdi:check-circle'],
  'flex-table-card': ['show_header', 'max_rows', 'cell_template', 'x.toFixed(1)'],
  'xiaomi-vacuum-map-card': ['two_finger_pan', 'calibration_points', 'selection_type', 'vacuum.send_command'],
  'kiosk-mode': ['ignore_entity_settings', 'admin_settings', 'query_param', 'tablet'],
  'better-thermostat-ui-card': ['show_temperature', 'show_humidity', 'set_current_as_main', 'climate.set_hvac_mode'],
};

const REQUIRED_SNIPPETS = [
  'snip.dashboard.card.vertical_stack_in_card_media_stack',
  'snip.dashboard.card.vertical_stack_in_card_horizontal_controls',
  'snip.dashboard.card.atomic_calendar_agenda',
  'snip.dashboard.card.atomic_calendar_filtered',
  'snip.dashboard.card.clock_weather_full',
  'snip.dashboard.card.clock_weather_compact',
  'snip.dashboard.card.uptime_binary_sensor',
  'snip.dashboard.card.uptime_thresholds',
  'snip.dashboard.card.flex_table_attributes',
  'snip.dashboard.card.flex_table_modify',
  'snip.dashboard.card.xiaomi_vacuum_map_rooms',
  'snip.dashboard.card.xiaomi_vacuum_map_icons',
  'snip.dashboard.kiosk_mode_global',
  'snip.dashboard.kiosk_mode_entity_toggle',
  'snip.dashboard.card.better_thermostat_full',
  'snip.dashboard.card.better_thermostat_mini',
];

function allSurfaceTerms(surface) {
  return new Set([
    ...(surface.cardTypes || []),
    ...(surface.yamlKeys || []),
    ...(surface.nestedKeys || []),
    ...(surface.valueHints || []),
    ...(surface.serviceHints || []),
  ]);
}

// Wall-clock budget assertions for these scenarios live in
// tests/perf/autocomplete_closure_budgets.test.mjs (npm run test:perf).

function fixtureContext(marker, replacement) {
  const raw = readFileSync('tests/fixtures/autocomplete/hacs_surface_dashboard.yaml', 'utf8');
  const markerIndex = raw.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${marker} must exist in fixture`);
  const doc = raw.replace(marker, replacement);
  return detectRuntimeContext(doc, markerIndex + replacement.length, { triggerKind: 'typing', settings: { minChars: 1 } });
}

const catalogProvider = hacsCatalogProvider();
const snippets = snippetProvider();
function completionCandidates(ctx) {
  return [
    ...(catalogProvider.canHandle(ctx) ? catalogProvider.provide(ctx) : []),
    ...(snippets.canHandle(ctx) ? snippets.provide(ctx) : []),
  ];
}

test('each listed surface has at least 9 top-level keys, 12 nested keys and 9 value hints, and its required terms', () => {
  for (const id of HACS_SURFACES) {
    const surface = getProviderSurface(id);
    assert.ok(surface, `${id} must exist`);
    assert.ok(surface.yamlKeys.length >= 9, `${id} should expose top-level keys`);
    assert.ok(surface.nestedKeys.length >= 12, `${id} should expose nested keys`);
    assert.ok(surface.valueHints.length >= 9, `${id} should expose value hints`);
    const terms = allSurfaceTerms(surface);
    for (const expected of REQUIRED_TERMS[id]) {
      assert.ok(terms.has(expected), `${id} missing ${expected}`);
    }
  }
});

test('each listed surface gives key and value rows through the catalog provider', () => {
  const provider = hacsCatalogProvider();
  for (const id of HACS_SURFACES) {
    const surface = getProviderSurface(id);
    const keyRows = catalogRowsForContext({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogSurfaceId: id });
    const valueRows = catalogRowsForContext({ shouldSuggest: true, lang: 'yaml', yamlRole: 'value', catalogSurfaceId: id });
    assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogSurfaceId: id }), true);
    assert.ok(keyRows.length >= surface.yamlKeys.length, `${id} key rows should include YAML and nested keys`);
    assert.ok(valueRows.length >= surface.valueHints.length, `${id} value rows should include value hints`);
    assert.ok(keyRows.every(row => row.source === provider.id));
    assert.ok(valueRows.every(row => row.source === provider.id));
  }
});

test('the snippets for the listed surfaces are offered at the dashboard root, and snippet ids are unique', () => {
  assert.equal(snippetCatalogData.length, 91);
  const ids = new Set(snippetCatalogData.map(item => item.id));
  assert.equal(ids.size, snippetCatalogData.length);
  for (const id of REQUIRED_SNIPPETS) assert.ok(ids.has(id), `${id} should be present`);

  const rootIds = snippetRowsForContext({
    lang: 'yaml', shouldSuggest: true, yamlRole: 'blank', yamlKey: '', yamlPath: [], pathText: '',
  }).map(row => row.id);
  for (const id of REQUIRED_SNIPPETS) assert.ok(rootIds.includes(id), `${id} should route at dashboard root`);
});

test('in the fixture dashboard each card resolves its catalog surface and ranks the expected key in the top 8', () => {
  const cases = [
    ['__CLOCK__', '', 'clock-weather-card', 'show_humidity:'],
    ['__CAL__', '', 'atomic-calendar-revive', 'maxDaysToShow:'],
    ['__UPTIME__', '', 'uptime-card', 'show:'],
    ['__FLEX__', '', 'flex-table-card', 'modify:'],
    ['__VACUUM__', '', 'xiaomi-vacuum-map-card', 'map_source:'],
    ['__THERM__', '', 'better-thermostat-ui-card', 'show_temperature:'],
  ];

  for (const [marker, replacement, surfaceId, expectedLabel] of cases) {
    const ctx = fixtureContext(marker, replacement);
    assert.equal(ctx.catalogSurfaceId, surfaceId, `${marker} should resolve ${surfaceId}`);
    const rows = scoreItems(ctx, {
      providerCandidates: completionCandidates,
      settings: { enabledLangs: { yaml: true }, maxItems: 20 },
    });
    const labels = rows.map(row => row.label);
    assert.ok(labels.includes(expectedLabel), `${surfaceId} should include ${expectedLabel}`);
    assert.ok(labels.indexOf(expectedLabel) < 8, `${expectedLabel} should rank near the top for ${surfaceId}`);
  }
});

test('the card types of the listed surfaces resolve to their surface, and every card type has one owner', () => {
  assert.equal(getProviderSurfaceByCardType('custom:vertical-stack-in-card')?.id, 'vertical-stack-in-card');
  assert.equal(getProviderSurfaceByCardType('custom:atomic-calendar-revive')?.id, 'atomic-calendar-revive');
  assert.equal(getProviderSurfaceByCardType('custom:clock-weather-card')?.id, 'clock-weather-card');
  assert.equal(getProviderSurfaceByCardType('custom:uptime-card')?.id, 'uptime-card');
  assert.equal(getProviderSurfaceByCardType('custom:flex-table-card')?.id, 'flex-table-card');
  assert.equal(getProviderSurfaceByCardType('custom:xiaomi-vacuum-map-card')?.id, 'xiaomi-vacuum-map-card');
  assert.equal(getProviderSurfaceByCardType('custom:bt-thermostat-card')?.id, 'better-thermostat-ui-card');

  const counts = new Map();
  for (const surface of MAIN_PROVIDER_SURFACES) {
    for (const cardType of surface.cardTypes) counts.set(cardType, (counts.get(cardType) || 0) + 1);
  }
  for (const [cardType, count] of counts) assert.equal(count, 1, `${cardType} should not have multiple owners`);
});
