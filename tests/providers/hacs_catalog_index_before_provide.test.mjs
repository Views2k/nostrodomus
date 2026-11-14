import test from 'node:test';
import assert from 'node:assert/strict';

import { hacsCatalogProvider } from '../../src/providers/hacsCatalogProvider.js';
import { MAIN_PROVIDER_SURFACES } from '../../src/providers/hacsProviderCatalog.js';
import { providerCandidates } from '../../src/providers/providerRegistry.js';

// The catalog index is built on first use. The registry times provide() against the provider's
// budget (8 ms), so the one-time build has to happen before provide(): in canHandle(), which every
// request passes through first. For a card type value canHandle() answered without the index, and
// the first card type completion built it inside the timed call.

// A catalog that counts how often its surfaces are read; building the index reads all of them.
function countedCatalog() {
  let reads = 0;
  const surfaces = MAIN_PROVIDER_SURFACES.slice(0, 6).map(surface => new Proxy(surface, {
    get(target, key, receiver) { reads += 1; return Reflect.get(target, key, receiver); },
  }));
  return { surfaces, reads: () => reads };
}

const cardTypeCtx = { shouldSuggest: true, lang: 'yaml', yamlRole: 'value', yamlKey: 'type', valueKind: 'card-type' };

test('the first card type request builds the index in canHandle, not in provide', () => {
  const catalog = countedCatalog();
  const provider = hacsCatalogProvider({ catalog: catalog.surfaces });
  assert.equal(catalog.reads(), 0, 'nothing is built when the provider is created');

  assert.equal(provider.canHandle(cardTypeCtx), true);
  const afterCanHandle = catalog.reads();
  assert.ok(afterCanHandle > 0, 'canHandle built the index');

  const rows = provider.provide(cardTypeCtx);
  assert.equal(catalog.reads(), afterCanHandle, 'provide found the index ready');
  assert.ok(rows.length > 0 && rows.every(row => row.type === 'card'));
});

test('through the registry the build is outside the timed provide call', () => {
  const catalog = countedCatalog();
  const provider = hacsCatalogProvider({ catalog: catalog.surfaces });
  // A clock that moves only when the catalog is read: any catalog work inside the timed section
  // shows up as elapsed time, however fast the machine is.
  const registryState = { settings: { enabledLangs: { yaml: true } }, providers: [provider], providerStats: {} };
  const errors = [];
  const rows = providerCandidates(cardTypeCtx, registryState, {
    now: () => catalog.reads(),
    recordRuntimeError: (key) => errors.push(key),
    recordRuntimeErrorOnce: (key) => errors.push(key),
  });
  assert.ok(rows.length > 0);
  const stats = registryState.providerStats['hacs-catalog'];
  assert.equal(stats.lastMs, 0, 'no catalog read happened inside provide()');
  assert.equal(stats.slowCalls || 0, 0);
  assert.deepEqual(errors, []);
});

test('requests that cannot be handled still build nothing', () => {
  const catalog = countedCatalog();
  const provider = hacsCatalogProvider({ catalog: catalog.surfaces });
  assert.equal(provider.canHandle({ shouldSuggest: false, lang: 'yaml', valueKind: 'card-type' }), false);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'css', valueKind: 'card-type' }), false);
  assert.equal(catalog.reads(), 0);
});

test('key and value requests are answered as before', () => {
  const provider = hacsCatalogProvider();
  const keyCtx = { shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogSurfaceId: 'mini-graph-card' };
  assert.equal(provider.canHandle(keyCtx), true);
  assert.ok(provider.provide(keyCtx).some(row => row.label === 'hours_to_show:'));
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key' }), false);
  assert.equal(provider.provide(cardTypeCtx).length > 10, true);
});
