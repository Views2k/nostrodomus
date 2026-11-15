import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HACS_CATALOG_PROVIDER_ID,
  catalogCardTypeRows,
  catalogKeyRowsForSurface,
  catalogRowsForContext,
  catalogValueRowsForSurface,
  hacsCatalogProvider,
  surfaceFromCatalogContext,
} from '../../src/providers/hacsCatalogProvider.js';
import {
  MAIN_PROVIDER_SURFACES,
  getProviderSurface,
} from '../../src/providers/hacsProviderCatalog.js';

test('catalog card-type rows stay exported for surface callers', () => {
  assert.equal(typeof catalogCardTypeRows, 'function');
});

test('HACS catalog provider exposes card-type rows for all catalog card types', () => {
  const rows = catalogRowsForContext({
    shouldSuggest: true,
    lang: 'yaml',
    yamlRole: 'value',
    valueKind: 'card-type',
  });

  for (const surface of MAIN_PROVIDER_SURFACES.filter(item => item.cardTypes.length)) {
    for (const cardType of surface.cardTypes) {
      const row = rows.find(item => item.label === cardType);
      assert.ok(row, `missing card type row for ${cardType}`);
      assert.equal(row.source, HACS_CATALOG_PROVIDER_ID);
      assert.equal(row.type, 'card');
      assert.equal(row.meta.surfaceId, surface.id);
    }
  }
});

test('HACS catalog provider resolves active surfaces through precomputed context fields', () => {
  const surface = surfaceFromCatalogContext({ catalogCardType: 'custom:mini-graph-card' });
  assert.equal(surface.id, 'mini-graph-card');
  assert.equal(surfaceFromCatalogContext({ catalogSurfaceId: 'clock-weather-card' }).id, 'clock-weather-card');
  assert.equal(surfaceFromCatalogContext({ catalogCardType: 'custom:not-real' }), null);
});

test('HACS catalog provider returns surface-specific keys and value hints', () => {
  const surface = getProviderSurface('clock-weather-card');
  const keyRows = catalogKeyRowsForSurface(surface);
  assert.equal(keyRows.some(row => row.label === 'forecast_rows:'), true);
  assert.equal(keyRows.every(row => row.source === HACS_CATALOG_PROVIDER_ID), true);

  const valueRows = catalogValueRowsForSurface(surface);
  assert.equal(valueRows.some(row => row.label === 'custom:clock-weather-card'), true);
  assert.equal(valueRows.some(row => row.label === 'true' && row.type === 'boolean'), true);
});

test('HACS catalog provider canHandle is cheap and based on resolved card context', () => {
  const provider = hacsCatalogProvider();

  assert.equal(provider.id, HACS_CATALOG_PROVIDER_ID);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', yamlRole: 'value', valueKind: 'card-type' }), true);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogCardType: 'custom:mini-graph-card' }), true);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogSurfaceId: 'kiosk-mode' }), true);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key' }), false);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'css', yamlRole: 'key', catalogCardType: 'custom:mini-graph-card' }), false);
});

test('HACS catalog provider fixtures cover all surfaces with keys, values, and nested rows', () => {
  assert.equal(MAIN_PROVIDER_SURFACES.length, 38);

  for (const surface of MAIN_PROVIDER_SURFACES) {
    const keyRows = catalogRowsForContext({
      shouldSuggest: true,
      lang: 'yaml',
      yamlRole: 'key',
      catalogSurfaceId: surface.id,
    });
    assert.ok(keyRows.some(row => row.label === `${surface.yamlKeys[0]}:`), `${surface.id} missing top-level key row`);

    const nestedRows = catalogRowsForContext({
      shouldSuggest: true,
      lang: 'yaml',
      yamlRole: 'list-key',
      catalogSurfaceId: surface.id,
      pathText: `${surface.id}.nested`,
    });
    if (surface.nestedKeys.length) {
      assert.ok(nestedRows.some(row => row.label === `${surface.nestedKeys[0]}:`), `${surface.id} missing nested key row`);
    }

    const valueRows = catalogRowsForContext({
      shouldSuggest: true,
      lang: 'yaml',
      yamlRole: 'value',
      catalogSurfaceId: surface.id,
    });
    assert.ok(valueRows.length > 0, `${surface.id} missing value hint row`);
  }
});
