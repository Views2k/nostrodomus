import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1,
  BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1,
  buildIndex,
  cacheSet,
  clearCompletionCache,
  normalizeItem,
  sanitizeLibraryRow,
  loadLibrary,
  staticLibraryProvider,
} from '../../src/providers/staticLibraryProvider.js';

test('static library row sanitization cuts fields to the limits and rejects hostile shapes', () => {
  const limits = { maxItemLabel: 5, maxInsertText: 8, maxAliases: 2, maxAlias: 4, maxCacheEntries: 2, maxRowsPerPack: 20 };
  const row = sanitizeLibraryRow([
    'row-id',
    'YAML',
    'key.path',
    'abcdef',
    '0123456789',
    ['alias-one', 'alias-two', 'alias-three'],
  ], 'yaml', { limits });

  assert.deepEqual(row, {
    id: 'row-id',
    lang: 'yaml',
    type: 'key.path',
    label: 'abcde',
    insert: '01234567',
    aliases: ['alia', 'alia'],
    source: 'yaml',
  });

  assert.equal(sanitizeLibraryRow(['id', 'bad lang', 'key', 'Label', 'x'], 'bad'), null);
  assert.equal(sanitizeLibraryRow(['id', 'yaml', '<script>', 'Label', 'x'], 'bad'), null);
  assert.equal(sanitizeLibraryRow(['id'], 'bad'), null);
});

test('normalizeItem adds the lowercase label and insert and a searchable haystack', () => {
  const item = normalizeItem(['light-row', 'yaml', 'entity', 'Kitchen Light', 'light.kitchen', ['kitchen', 'lamp']], 'yaml');
  assert.equal(item.id, 'light-row');
  assert.equal(item.labelLower, 'kitchen light');
  assert.equal(item.insertLower, 'light.kitchen');
  assert.equal(item.haystack.includes('kitchen light'), true);
  assert.equal(item.haystack.includes('lamp'), true);
});

test('staticLibraryProvider uses injected runtime state without browser globals', () => {
  const state = {
    settings: { enabledLangs: { yaml: true, css: false }, globalSearch: false },
    index: {
      byLang: { yaml: [{ id: 'yaml-row' }], css: [{ id: 'css-row' }] },
      all: [{ id: 'yaml-row' }, { id: 'css-row' }],
    },
  };
  const provider = staticLibraryProvider({ state });

  assert.equal(provider.id, 'static-library');
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml' }), true);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'css' }), false);
  assert.deepEqual(provider.provide({ lang: 'yaml' }), [{ id: 'yaml-row' }]);

  state.settings.globalSearch = true;
  assert.deepEqual(provider.provide({ lang: 'yaml' }), [{ id: 'yaml-row' }, { id: 'css-row' }]);
});

test('cache helpers evict the oldest entry past the limit, and buildIndex skips bad rows and registers the providers', () => {
  const state = {
    completionCache: new Map(),
    library: {
      packs: {
        yaml: [
          ['ok', 'yaml', 'entity', 'Kitchen Light', 'light.kitchen', ['kitchen']],
          ['bad', 'bad lang', 'entity', 'Bad', 'bad'],
        ],
      },
    },
  };
  cacheSet(state, 'a', 1, { limits: { maxCacheEntries: 2 } });
  cacheSet(state, 'b', 2, { limits: { maxCacheEntries: 2 } });
  cacheSet(state, 'c', 3, { limits: { maxCacheEntries: 2 } });
  assert.deepEqual([...state.completionCache.keys()], ['b', 'c']);
  clearCompletionCache(state);
  assert.equal(state.completionCache.size, 0);

  const registered = [];
  let ensured = 0;
  const index = buildIndex({
    state,
    limits: { maxRowsPerPack: 10, maxItemLabel: 160, maxInsertText: 4000, maxAliases: 24, maxAlias: 96 },
    registerProvider: provider => registered.push(provider.id),
    ensureProviderSettings: () => { ensured += 1; },
  });
  assert.equal(index.all.length, 1);
  assert.equal(index.rejected.yaml, 1);
  assert.equal(ensured, 1);
  assert.deepEqual(registered, ['static-library', 'hacs-catalog']);
});

test('bundled static libraries load without dynamic browser imports and build the runtime index', async () => {
  assert.equal(BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1.version, 'nostrodomus-library-core-v1');
  assert.equal(BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1.version, 'nostrodomus-library-webdev-v1');

  const state = { completionCache: new Map(), settings: { providers: {}, enabledLangs: { yaml: true } } };
  let buildCalls = 0;
  const library = await loadLibrary({
    state,
    buildIndex: () => { buildCalls += 1; },
  });

  assert.equal(buildCalls, 1);
  assert.equal(library.bundled, true);
  assert.equal(library.version, 'nostrodomus-library-bundled');
  assert.equal(Array.isArray(library.packs.yaml), true);
  assert.equal(library.packs.yaml.length > 0, true);
  assert.deepEqual(library.sources, ['nostrodomus-library-core-v1', 'nostrodomus-library-webdev-v1', 'nostrodomus-library-ha-vocab-v1']);

  const second = await loadLibrary({ state, buildIndex: () => { buildCalls += 1; } });
  assert.equal(second, library);
  assert.equal(buildCalls, 1);
});

test('bundled static library includes JSON and Markdown-HTML closeout lanes', async () => {
  const state = { completionCache: new Map(), settings: { providers: {}, enabledLangs: { json: true, html: true } } };
  const library = await loadLibrary({
    state,
    buildIndex: () => buildIndex({ state, ensureProviderSettings: () => null }),
  });

  assert.equal(Array.isArray(library.packs.json), true);
  assert.ok(library.packs.json.some(row => row[0] === 'json.browser_mod_popup'));
  assert.ok(library.packs.html.some(row => row[0] === 'html.md_bold'));
  assert.ok(library.packs.html.some(row => row[0] === 'html.ha_alert'));

  const provider = staticLibraryProvider({ state });
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'json' }), true);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'html' }), true);
});

