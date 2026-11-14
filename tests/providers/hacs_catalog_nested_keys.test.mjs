import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import {
  catalogBlockKeyRowsForSurface,
  catalogKeyRowsForSurface,
  catalogRowsForContext,
  hacsCatalogProvider,
} from '../../src/providers/hacsCatalogProvider.js';
import { MAIN_PROVIDER_SURFACES, getProviderSurface } from '../../src/providers/hacsProviderCatalog.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { CURSOR, suggestionPipeline } from '../fixtures/suggestionPipeline.mjs';

// A catalog surface lists the card's own keys (yamlKeys) and the keys of its inner blocks
// (nestedKeys). The catalog does not say reliably which keys belong inside a block: include: of
// an auto-entities filter, pagination: of the swipe-card parameters and unit: of a mini-graph
// entity are all listed with the card's own keys. So every key of the surface is offered at
// every depth. Inside a block the nested keys rank first; nothing is left out.

const provider = hacsCatalogProvider();
const pipeline = await suggestionPipeline();

function at(doc, triggerKind = 'explicit') {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind });
  const rows = provider.canHandle(ctx) ? provider.provide(ctx) : [];
  return { ctx, rows, labels: rows.map(row => row.label) };
}

const MINI = 'type: custom:mini-graph-card\nentities:\n  - sensor.temperature\n';
const OWN_ONLY = ['hours_to_show:', 'points_per_hour:', 'line_width:', 'type:', 'entities:'];
const NESTED_ONLY = ['graph:', 'labels:', 'fill:', 'points:'];

test('a key typed in full inside a block is the first row, and Enter completes the key', () => {
  for (const [marked, key, expected] of [
    [`type: custom:auto-entities\nfilter:\n  include${CURSOR}`, 'include:', `type: custom:auto-entities\nfilter:\n  include: ${CURSOR}`],
    [`type: custom:swipe-card\nparameters:\n  pagination${CURSOR}`, 'pagination:', `type: custom:swipe-card\nparameters:\n  pagination: ${CURSOR}`],
    [`type: custom:mini-graph-card\nentities:\n  - entity: sensor.power\n    unit${CURSOR}`, 'unit:', `type: custom:mini-graph-card\nentities:\n  - entity: sensor.power\n    unit: ${CURSOR}`],
  ]) {
    const result = pipeline.listAt(marked);
    assert.equal(result.ctx.catalogCardNested, true, marked);
    assert.equal(result.labels[0], key, `first rows at ${JSON.stringify(marked)}: ${JSON.stringify(result.labels.slice(0, 3))}`);
    assert.equal(result.items[0].type, 'key');
    assert.equal(pipeline.accept(result), expected);
  }
});

test('keys that the catalog lists with the card\'s own keys are still offered inside its blocks', () => {
  for (const [marked, key] of [
    [`type: custom:auto-entities\nfilter:\n  exc${CURSOR}`, 'exclude:'],
    [`type: custom:auto-entities\nfilter:\n  templ${CURSOR}`, 'template:'],
    [`type: custom:swipe-card\nparameters:\n  navig${CURSOR}`, 'navigation:'],
    [`type: custom:swipe-card\nparameters:\n  autop${CURSOR}`, 'autoplay:'],
    [`type: custom:swipe-card\nparameters:\n  spaceB${CURSOR}`, 'spaceBetween:'],
    [`type: custom:swipe-card\nparameters:\n  slidesP${CURSOR}`, 'slidesPerView:'],
    [`type: custom:mini-graph-card\nentities:\n  - entity: sensor.power\n    aggreg${CURSOR}`, 'aggregate_func:'],
    [`type: custom:mini-graph-card\nentities:\n  - entity: sensor.power\n    smoo${CURSOR}`, 'smoothing:'],
    [`type: custom:mushroom-chips-card\nchips:\n  - type: template\n    icon_c${CURSOR}`, 'icon_color:'],
    [`type: custom:mushroom-chips-card\nchips:\n  - type: template\n    pict${CURSOR}`, 'picture:'],
    [`type: custom:button-card\nentity: light.kitchen\nstate:\n  - value: "on"\n    entity_p${CURSOR}`, 'entity_picture:'],
    [`type: custom:button-card\nentity: light.kitchen\nstate:\n  - value: "on"\n    state_d${CURSOR}`, 'state_display:'],
    [`type: custom:apexcharts-card\nyaxis:\n  - id: temp\n    apex_${CURSOR}`, 'apex_config:'],
    [`type: custom:apexcharts-card\napex_config:\n  yax${CURSOR}`, 'yaxis:'],
    [`type: button\ntap_action:\n  action: fire-dom-event\n  browser_mod:\n    service: browser_mod.popup\n    data:\n      conte${CURSOR}`, 'content:'],
  ]) {
    const { labels } = pipeline.listAt(marked);
    assert.equal(labels[0], key, `first rows at ${JSON.stringify(marked)}: ${JSON.stringify(labels.slice(0, 3))}`);
  }
});

test('inside a block every key of the surface is offered, the nested keys first', () => {
  for (const doc of [
    `${MINI}show:\n  `,
    `${MINI}show:\n  gr`,
    `${MINI}show:\n  graph: line\n  `,
    `${MINI}tap_action:\n`,                 // the editor puts the new line at the opener's column
    `${MINI}color_thresholds:\n  - `,
    `${MINI}color_thresholds:\n  - value: 20\n    `,
    `type: vertical-stack\ncards:\n  - type: custom:mini-graph-card\n    show:\n      `,
  ]) {
    const { ctx, labels } = at(doc);
    assert.equal(ctx.catalogSurfaceId, 'mini-graph-card', JSON.stringify(doc));
    assert.equal(ctx.catalogCardNested, true, JSON.stringify(doc));
    for (const key of [...OWN_ONLY, ...NESTED_ONLY]) assert.ok(labels.includes(key), `${key} missing at ${JSON.stringify(doc)}`);
    const lastNested = Math.max(...NESTED_ONLY.map(key => labels.indexOf(key)));
    const firstOwn = Math.min(...OWN_ONLY.map(key => labels.indexOf(key)));
    assert.ok(lastNested < firstOwn, 'the nested keys are handed out before the other keys');
  }
});

test('inside a block a nested key ranks ahead of an own key that matches equally well', () => {
  // `sh` starts show: (a key of the card) and show_line:, show_points:, ... (keys of an entity).
  const settings = { enabledLangs: { yaml: true }, maxItems: 40 };
  const ranked = (doc) => {
    const { ctx, rows } = at(doc, 'typing');
    return scoreItems(ctx, rows, { settings }).map(row => row.label);
  };
  const inBlock = ranked(`${MINI.replace('  - sensor.temperature\n', '  - entity: sensor.temperature\n    sh')}`);
  assert.ok(inBlock.includes('show:') && inBlock.includes('show_line:'));
  assert.ok(inBlock.indexOf('show_line:') < inBlock.indexOf('show:'), JSON.stringify(inBlock));
  assert.ok(inBlock.indexOf('show_points:') < inBlock.indexOf('show:'));

  // At the card's own keys the order is the order of 0.1.276: the shorter label first.
  const ownKeys = ranked(`${MINI}sh`);
  assert.equal(ownKeys[0], 'show:');

  // A better match still wins over the nested keys: an own key typed in full is first.
  assert.equal(ranked(`${MINI.replace('  - sensor.temperature\n', '  - entity: sensor.temperature\n    show')}`)[0], 'show:');
});

test('at the card\'s own keys every key of the surface is offered, as before', () => {
  for (const doc of [
    MINI,
    `${MINI}ho`,
    `${MINI}show:\n  graph: line\nho`,
    'type: custom:mini-graph-card\n',
    'type: vertical-stack\ncards:\n  - type: custom:mini-graph-card\n    ',
    'type: vertical-stack\ncards:\n  - type: custom:mini-graph-card\n    show:\n      graph: line\n    ho',
    'type: vertical-stack\ncards:\n  - entities:\n      - sensor.x\n    type: custom:mini-graph-card\n    ',
  ]) {
    const { ctx, rows, labels } = at(doc);
    assert.equal(ctx.catalogSurfaceId, 'mini-graph-card', JSON.stringify(doc));
    assert.equal(ctx.catalogCardNested, false, JSON.stringify(doc));
    assert.deepEqual(labels, catalogKeyRowsForSurface(getProviderSurface('mini-graph-card')).map(row => row.label));
    assert.ok(rows.every(row => row.meta.ownKeyInBlock === undefined), 'no key is marked at the card\'s own keys');
  }
});

test('the line after an opener the YAML path does not know is a key of the card', () => {
  // `show:` is not one of the block openers the YAML path descends into at the opener's own
  // column, so that line is read as the next key of the card, exactly as the path reads it.
  const { ctx } = at(`${MINI}show:\n`);
  assert.deepEqual(ctx.yamlPath, []);
  assert.equal(ctx.catalogCardNested, false);
});

test('value positions and hand-built contexts are unchanged', () => {
  const surface = getProviderSurface('mini-graph-card');
  const all = catalogRowsForContext({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogSurfaceId: 'mini-graph-card' });
  assert.deepEqual(all, catalogKeyRowsForSurface(surface));
  const values = catalogRowsForContext({ shouldSuggest: true, lang: 'yaml', yamlRole: 'value', catalogSurfaceId: 'mini-graph-card', catalogCardNested: true });
  assert.ok(values.length > 0 && values.every(row => row.meta.contextKind === 'hacs-catalog-value'));
});

test('every surface: the block rows are all its keys, nested keys first and unchanged', () => {
  for (const surface of MAIN_PROVIDER_SURFACES) {
    const all = catalogKeyRowsForSurface(surface);
    const block = catalogBlockKeyRowsForSurface(surface);
    assert.deepEqual(block.map(row => row.label).sort(), all.map(row => row.label).sort(), `${surface.id}: no key is left out`);
    assert.deepEqual(block.map(row => row.id).sort(), all.map(row => row.id).sort(), `${surface.id}: the row ids are the same at both depths`);
    const nested = new Set(surface.nestedKeys.map(key => `${key}:`));
    const nestedRows = block.filter(row => nested.has(row.label));
    assert.deepEqual(block.slice(0, nestedRows.length), nestedRows, `${surface.id}: nested keys first`);
    assert.ok(nestedRows.every(row => all.includes(row)), `${surface.id}: nested rows are the rows of the full list`);
    for (const row of block.slice(nestedRows.length)) {
      const own = all.find(item => item.id === row.id);
      assert.deepEqual({ ...row, meta: null }, { ...own, meta: null });
      assert.deepEqual(row.meta, { ...own.meta, ownKeyInBlock: true }, `${surface.id}: the other keys are marked, nothing else differs`);
      assert.ok(Object.isFrozen(row) && Object.isFrozen(row.meta));
    }
    assert.equal(catalogBlockKeyRowsForSurface(surface)[block.length - 1], block[block.length - 1], 'built once per surface');
  }
});

test('the completion cache keeps the two depths apart', () => {
  const cache = new Map();
  const settings = { enabledLangs: { yaml: true }, maxItems: 100 };
  const base = { lang: 'yaml', prefix: 'sh', shouldSuggest: true, triggerKind: 'typing', yamlRole: 'key', scope: 'x', pathText: 'x', catalogCardType: 'custom:mini-graph-card', catalogSurfaceId: 'mini-graph-card', lineNumber: 4 };
  const run = ctx => scoreItems(ctx, { settings, cache, providerCandidates: () => provider.provide(ctx) }).map(row => row.label);
  const root = run({ ...base, catalogCardNested: false });
  const nested = run({ ...base, catalogCardNested: true });
  assert.equal(root[0], 'show:');
  assert.notEqual(nested[0], 'show:', 'not the cached list of the card root');
  assert.deepEqual([...nested].sort(), [...root].sort(), 'the same keys at both depths');
});

test('narrowing a block list to a fully typed own key puts that key first', () => {
  // The list for `sho` is narrowed for `show` instead of asking the providers again.
  const settings = { enabledLangs: { yaml: true }, maxItems: 40 };
  const base = { lang: 'yaml', shouldSuggest: true, triggerKind: 'typing', yamlRole: 'key', scope: 'x', pathText: 'x', catalogCardType: 'custom:mini-graph-card', catalogSurfaceId: 'mini-graph-card', catalogCardNested: true };
  const first = { ...base, prefix: 'sho' };
  const shown = scoreItems(first, { settings, providerCandidates: () => provider.provide(first) });
  assert.notEqual(shown[0].label, 'show:');
  let asked = 0;
  const narrowed = scoreItems({ ...base, prefix: 'show' }, { settings, previousContext: first, previousItems: shown, providerCandidates: () => { asked += 1; return []; } });
  assert.equal(asked, 0);
  assert.equal(narrowed[0].label, 'show:');
});
