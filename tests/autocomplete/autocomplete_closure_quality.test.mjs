import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scoreItems } from '../../src/completion/scoring.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { hacsCatalogProvider } from '../../src/providers/hacsCatalogProvider.js';
import { snippetProvider, snippetRowsForContext } from '../../src/providers/snippetProvider.js';

// Wall-clock budget assertions for these scenarios live in
// tests/perf/autocomplete_closure_budgets.test.mjs (npm run test:perf).

const FIXTURE = 'tests/fixtures/autocomplete/busy_thermostat_dashboard.yaml';

function fixtureWithCursor(replacement = 'show_') {
  const raw = readFileSync(FIXTURE, 'utf8');
  const lineCount = raw.trimEnd().split('\n').length;
  assert.equal(lineCount, 77, 'busy thermostat fixture should stay at the 77-line perf gate size');
  const marker = '__CURSOR__';
  const markerIndex = raw.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'fixture must contain cursor marker');
  return {
    doc: raw.replace(marker, replacement),
    pos: markerIndex + replacement.length,
  };
}

const catalogProvider = hacsCatalogProvider();
const snippetTemplateProvider = snippetProvider();

function completionCandidates(ctx) {
  const catalog = catalogProvider;
  const snippets = snippetTemplateProvider;
  return [
    ...(catalog.canHandle(ctx) ? catalog.provide(ctx) : []),
    ...(snippets.canHandle(ctx) ? snippets.provide(ctx) : []),
  ];
}

test('autocomplete closure keeps busy thermostat catalog compute exact-key-first', () => {
  const { doc, pos } = fixtureWithCursor('show_');
  const ctx = detectRuntimeContext(doc, pos, { triggerKind: 'typing', settings: { minChars: 1 } });

  assert.equal(ctx.catalogSurfaceId, 'better-thermostat-ui-card');
  assert.equal(ctx.catalogCardType, 'custom:better-thermostat-ui-card');
  assert.equal(ctx.prefix, 'show_');
  assert.equal(ctx.shouldSuggest, true);

  const items = scoreItems(ctx, {
    providerCandidates: completionCandidates,
    settings: { enabledLangs: { yaml: true }, maxItems: 20 },
  });

  const labels = items.map(item => item.label);
  assert.deepEqual(labels.slice(0, 2).sort(), ['show_humidity:', 'show_temperature:']);
  assert.ok(labels.indexOf('show_temperature:') < labels.findIndex(label => /button|bubble|card/i.test(label)), 'exact catalog keys should beat substring snippet matches');
});

test('autocomplete closure snippets expose high-value dashboard/action/style patterns together', () => {
  const rootIds = snippetRowsForContext({
    lang: 'yaml',
    shouldSuggest: true,
    yamlRole: 'blank',
    yamlKey: '',
    yamlPath: [],
    pathText: '',
  }).map(row => row.id);

  for (const id of [
    'snip.dashboard.card.mushroom_entity',
    'snip.dashboard.card.button_card_state',
    'snip.dashboard.card.apexcharts_line',
    'snip.dashboard.card.bubble_popup',
    'snip.dashboard.card.auto_entities_battery',
    'snip.dashboard.card.layout_grid',
  ]) {
    assert.ok(rootIds.includes(id), `${id} should be available at dashboard root`);
  }

  const actionIds = snippetRowsForContext({
    lang: 'yaml',
    shouldSuggest: true,
    yamlRole: 'key',
    yamlKey: 'tap_action',
    yamlPath: ['cards', '0', 'tap_action'],
    pathText: 'cards.0.tap_action',
    focusKind: 'action-block',
  }).map(row => row.id);
  assert.ok(actionIds.includes('snip.dashboard.action.browser_mod_popup'));

  // A whole card_mod: block is a key of the card. Inside the style block it would nest a second
  // card_mod: under the first, so it is offered at the card's key positions, for typed text that
  // does not name the card_mod key itself.
  const cardKeyIds = snippetRowsForContext({
    lang: 'yaml',
    shouldSuggest: true,
    yamlRole: 'key',
    yamlKey: '',
    yamlPath: ['cards', '0'],
    pathText: 'cards.0',
    focusKind: '',
    prefix: 'card-m',
  }).map(row => row.id);
  assert.ok(cardKeyIds.includes('snip.card_mod.glass_card'));
  assert.ok(cardKeyIds.includes('snip.card_mod.mushroom_chip_row'));
});

test('indexed HACS catalog provider sweeps all surfaces without rebuilding row objects per request', () => {
  const provider = hacsCatalogProvider();
  const first = provider.provide({
    shouldSuggest: true,
    lang: 'yaml',
    yamlRole: 'key',
    catalogSurfaceId: 'mini-graph-card',
  });
  const second = provider.provide({
    shouldSuggest: true,
    lang: 'yaml',
    yamlRole: 'key',
    catalogSurfaceId: 'mini-graph-card',
  });

  assert.notEqual(first, second, 'provider should return a fresh row array');
  assert.equal(first[0], second[0], 'row objects should come from the stable provider index');
  assert.throws(() => { first[0].label = 'mutated:'; }, TypeError);
});
