import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreItems } from '../../src/completion/scoring.js';
import {
  HA_VALUE_PROVIDER_ID,
  HACS_CATALOG_PROVIDER_ID,
  LOVELACE_CONTEXT_PROVIDER_ID,
  STATIC_PROVIDER_ID,
} from '../../src/core/runtimeConstants.js';
import { lovelaceContextProvider } from '../../src/providers/lovelaceContextProvider.js';
import { hacsCatalogProvider } from '../../src/providers/hacsCatalogProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// Several providers offer the same key or the same card type. Rows of the same kind that insert
// the same text are one suggestion and take one place in the list.

const SETTINGS = { enabledLangs: { yaml: true }, maxItems: 12 };
const keyCtx = prefix => ({ lang: 'yaml', yamlRole: 'key', yamlKey: '', valueKind: '', scope: 'yaml-root', pathText: '', shouldSuggest: true, triggerKind: 'typing', prefix });
const row = (source, id, type, label, insert, aliases = []) => ({ id, lang: 'yaml', type, label, insert, aliases, source, meta: {} });

test('the same key from three providers is listed once, from the highest-priority provider', () => {
  const rows = [
    row(STATIC_PROVIDER_ID, 'yaml.entity', 'key', 'entity:', 'entity: ', ['entity', 'entity_id']),
    row(HACS_CATALOG_PROVIDER_ID, 'hacs.core.key.entity', 'key', 'entity:', 'entity: ', ['entity', 'core']),
    row(LOVELACE_CONTEXT_PROVIDER_ID, 'ctx.entity', 'key', 'entity:', 'entity: ', ['entity_id', 'ha']),
    row(HACS_CATALOG_PROVIDER_ID, 'hacs.core.key.entities', 'key', 'entities:', 'entities:', ['entities']),
    row(LOVELACE_CONTEXT_PROVIDER_ID, 'ctx.entities', 'key', 'entities:', 'entities:', ['entity list']),
  ];
  const shown = scoreItems(keyCtx('ent'), rows, { settings: SETTINGS });
  assert.deepEqual(shown.map(item => item.label), ['entity:', 'entities:']);
  assert.deepEqual(shown.map(item => item.id), ['ctx.entity', 'ctx.entities'], 'the context provider outranks the catalog and the static library');
});

test('a card type from Home Assistant and from the catalog is listed once', () => {
  const ctx = { lang: 'yaml', yamlRole: 'value', yamlKey: 'type', valueKind: 'card-type', scope: 'type', pathText: 'type', shouldSuggest: true, triggerKind: 'typing', prefix: 'ti' };
  const rows = [
    row(HACS_CATALOG_PROVIDER_ID, 'hacs.core.card-type.tile', 'card', 'tile', 'tile', ['core']),
    row(HA_VALUE_PROVIDER_ID, 'ha.card.tile', 'card', 'tile', 'tile', ['type', 'card']),
  ];
  const shown = scoreItems(ctx, rows, { settings: SETTINGS });
  assert.equal(shown.length, 1);
  assert.equal(shown[0].id, 'ha.card.tile');
});

test('rows with the same label and different insert text both stay', () => {
  const rows = [
    row(LOVELACE_CONTEXT_PROVIDER_ID, 'ctx.icon', 'key', 'icon:', 'icon: mdi:', ['mdi']),
    row(HACS_CATALOG_PROVIDER_ID, 'hacs.core.key.icon', 'key', 'icon:', 'icon: ', ['icon']),
    row(LOVELACE_CONTEXT_PROVIDER_ID, 'ctx.styles.icon', 'key', 'icon:', 'icon:', ['styles']),
  ];
  const shown = scoreItems(keyCtx('ic'), rows, { settings: SETTINGS });
  assert.deepEqual(shown.map(item => item.insert).sort(), ['icon:', 'icon: ', 'icon: mdi:']);
});

test('rows of different kinds that insert the same text both stay', () => {
  const ctx = { ...keyCtx('ha'), lang: 'css', yamlRole: 'code', scope: 'card-mod-css' };
  const rows = [
    { ...row(STATIC_PROVIDER_ID, 'css.sel.ha_card', 'selector', 'ha-card', 'ha-card', ['ha-card']), lang: 'css' },
    { ...row(STATIC_PROVIDER_ID, 'css.val.ha_card', 'value', 'ha-card', 'ha-card', ['ha-card']), lang: 'css' },
  ];
  const shown = scoreItems(ctx, rows, { settings: { enabledLangs: { css: true }, maxItems: 12 } });
  assert.deepEqual(shown.map(item => item.id).sort(), ['css.sel.ha_card', 'css.val.ha_card']);
});

test('the places of removed duplicates go to the next rows, up to the list size', () => {
  const rows = [];
  for (let i = 0; i < 20; i += 1) {
    const name = `option_${String(i).padStart(2, '0')}`;
    rows.push(row(LOVELACE_CONTEXT_PROVIDER_ID, `ctx.${name}`, 'key', `${name}:`, `${name}: `));
    rows.push(row(HACS_CATALOG_PROVIDER_ID, `hacs.${name}`, 'key', `${name}:`, `${name}: `));
  }
  const shown = scoreItems(keyCtx('opt'), rows, { settings: SETTINGS });
  assert.equal(shown.length, 12);
  assert.equal(new Set(shown.map(item => item.insert)).size, 12, 'twelve different suggestions');
  assert.deepEqual(shown.map(item => item.label), rows.filter(item => item.source === LOVELACE_CONTEXT_PROVIDER_ID).slice(0, 12).map(item => item.label));
});

test('a list without duplicates is unchanged', () => {
  const rows = [
    row(LOVELACE_CONTEXT_PROVIDER_ID, 'ctx.name', 'key', 'name:', 'name: '),
    row(HACS_CATALOG_PROVIDER_ID, 'hacs.key.navigation_path', 'key', 'navigation_path:', 'navigation_path: '),
    row(STATIC_PROVIDER_ID, 'yaml.name_alias', 'key', 'title:', 'title: ', ['name']),
  ];
  const shown = scoreItems(keyCtx('na'), rows, { settings: SETTINGS });
  assert.deepEqual(shown.map(item => item.id), ['ctx.name', 'hacs.key.navigation_path', 'yaml.name_alias']);
  assert.deepEqual(shown[2].aliases, ['name'], 'aliases are only extended when a duplicate was dropped');
});

test('narrowing a list still finds a text through the words of the dropped row', () => {
  // `m` matches both rows by an alias. Only the catalog row has an alias that starts with `mush`.
  const rows = [
    row(LOVELACE_CONTEXT_PROVIDER_ID, 'ctx.entity', 'key', 'entity:', 'entity: ', ['main entity']),
    row(HACS_CATALOG_PROVIDER_ID, 'hacs.mushroom.key.entity', 'key', 'entity:', 'entity: ', ['mushroom']),
    row(LOVELACE_CONTEXT_PROVIDER_ID, 'ctx.name', 'key', 'name:', 'name: ', ['mushroom title']),
  ];
  const first = keyCtx('m');
  const shown = scoreItems(first, rows, { settings: SETTINGS });
  assert.deepEqual(shown.map(item => item.id).sort(), ['ctx.entity', 'ctx.name']);

  let asked = 0;
  const next = keyCtx('mush');
  const narrowed = scoreItems(next, { settings: SETTINGS, previousContext: first, previousItems: shown, providerCandidates: () => { asked += 1; return rows; } });
  assert.equal(asked, 0, 'the previous list is narrowed, the providers are not asked again');
  const fresh = scoreItems(next, rows, { settings: SETTINGS });
  assert.deepEqual(narrowed.map(item => item.insert).sort(), fresh.map(item => item.insert).sort());
  assert.ok(narrowed.some(item => item.insert === 'entity: '));
});

test('real providers: a card key position lists every key once', () => {
  const doc = 'type: entities\nentities:\n  - light.kitchen\nt';
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' });
  const providers = [lovelaceContextProvider({ getDoc: () => doc, getPos: () => doc.length }), hacsCatalogProvider()];
  const candidates = providers.flatMap(provider => (provider.canHandle(ctx) ? provider.provide(ctx) : []));
  assert.ok(candidates.filter(item => item.label === 'type:').length > 1, 'both providers offer type:');
  const shown = scoreItems(ctx, candidates, { settings: SETTINGS });
  const texts = shown.map(item => `${item.type}|${item.insert}`);
  assert.equal(new Set(texts).size, texts.length);
  assert.equal(shown.filter(item => item.label === 'type:').length, 1);
  assert.equal(shown.find(item => item.label === 'type:').source, LOVELACE_CONTEXT_PROVIDER_ID);
});
