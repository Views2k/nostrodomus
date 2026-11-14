import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogRowsForContext,
  hacsCatalogProvider,
  surfaceFromCatalogContext,
} from '../../src/providers/hacsCatalogProvider.js';
import {
  MAIN_PROVIDER_SURFACES,
  getProviderSurfaceByCardType,
} from '../../src/providers/hacsProviderCatalog.js';

// The 8ms wall-clock budgets that used to gate these row generations live in
// tests/perf/hacs_catalog_budgets.test.mjs (npm run test:perf); this file keeps
// the functional row-content assertions only.
function rowsFor(_label, fn) {
  return fn();
}

test('catalog fixture gate covers all HACS provider surfaces', () => {
  assert.equal(MAIN_PROVIDER_SURFACES.length, 38);

  for (const surface of MAIN_PROVIDER_SURFACES) {
    assert.match(surface.id, /^[a-z0-9-]+$/, `${surface.id} has normalized id`);
    assert.ok(surface.upstreamVersion, `${surface.id} missing upstreamVersion`);
    assert.match(surface.verifiedAt, /^\d{4}-\d{2}-\d{2}$/, `${surface.id} missing verifiedAt`);
    assert.ok(surface.yamlKeys.length > 0, `${surface.id} missing yamlKeys`);
    assert.ok(surface.valueHints.length + surface.serviceHints.length > 0, `${surface.id} missing value/service hints`);
  }
});

test('card-type fixtures resolve every documented card type to one catalog owner', () => {
  const cardTypeRows = rowsFor('card type row generation', () => catalogRowsForContext({
    shouldSuggest: true,
    lang: 'yaml',
    yamlRole: 'value',
    valueKind: 'card-type',
  }));

  const labels = new Set(cardTypeRows.map(row => row.label));
  for (const surface of MAIN_PROVIDER_SURFACES) {
    for (const cardType of surface.cardTypes) {
      const owner = getProviderSurfaceByCardType(cardType);
      assert.equal(owner?.id, surface.id, `${cardType} should resolve to ${surface.id}`);
      assert.ok(labels.has(cardType), `${cardType} missing from type: completion rows`);
    }
  }
});

test('key/value fixtures cover each surface through the wired provider path', () => {
  const provider = hacsCatalogProvider();

  for (const surface of MAIN_PROVIDER_SURFACES) {
    const ctx = {
      shouldSuggest: true,
      lang: 'yaml',
      yamlRole: 'key',
      catalogSurfaceId: surface.id,
    };
    assert.equal(provider.canHandle(ctx), true, `${surface.id} should be handled by catalog provider`);

    const keyRows = rowsFor(`${surface.id} key rows`, () => provider.provide(ctx));
    assert.ok(keyRows.some(row => row.label === `${surface.yamlKeys[0]}:`), `${surface.id} missing top-level key row`);

    if (surface.nestedKeys.length) {
      const nestedRows = rowsFor(`${surface.id} nested rows`, () => provider.provide({
        ...ctx,
        yamlRole: 'list-key',
        pathText: `${surface.id}.nested`,
      }));
      assert.ok(nestedRows.some(row => row.label === `${surface.nestedKeys[0]}:`), `${surface.id} missing nested key row`);
    }

    const valueRows = rowsFor(`${surface.id} value rows`, () => provider.provide({
      ...ctx,
      yamlRole: 'value',
    }));
    assert.ok(valueRows.length > 0, `${surface.id} missing value/service hint rows`);
  }
});

test('catalog context resolver does not guess when no surface/card context is present', () => {
  assert.equal(surfaceFromCatalogContext({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key' }), null);
  assert.equal(surfaceFromCatalogContext({ catalogCardType: 'custom:not-real' }), null);
});
