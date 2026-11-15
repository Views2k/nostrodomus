import test from 'node:test';
import assert from 'node:assert/strict';

import { cachePut, cacheGet, DEFAULT_SCORING_SETTINGS } from '../../src/completion/filtering.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';

// state.completionCache is written on every keystroke through scoreItems, so cachePut must evict:
// it trims oldest-first at SECURITY_LIMITS.maxCacheEntries, like cacheSet in staticLibraryProvider.

test('cachePut caps a Map at maxCacheEntries and evicts oldest-first (FIFO)', () => {
  const cache = new Map();
  for (let i = 0; i < 200; i += 1) cachePut(cache, `k${i}`, i);
  assert.equal(cache.size, SECURITY_LIMITS.maxCacheEntries, 'cache must be bounded at the limit, not grow to 200');
  // FIFO: the C most-recent keys (k136..k199 for C=64) survive, the earlier ones are evicted.
  const firstKept = 200 - SECURITY_LIMITS.maxCacheEntries; // 136
  assert.equal(cacheGet(cache, 'k199'), 199, 'newest entry retained');
  assert.equal(cacheGet(cache, `k${firstKept}`), firstKept, 'boundary newest-kept entry retained');
  assert.ok(!cache.has('k0'), 'oldest entry evicted');
  assert.ok(!cache.has(`k${firstKept - 1}`), 'entry just past the window evicted');
});

test('cachePut uses an explicit maxEntries override', () => {
  const cache = new Map();
  for (let i = 0; i < 50; i += 1) cachePut(cache, `k${i}`, i, 8);
  assert.equal(cache.size, 8, 'override cap respected');
  assert.equal(cacheGet(cache, 'k49'), 49);
  assert.equal(cacheGet(cache, 'k42'), 42, 'last 8 (k42..k49) retained');
  assert.ok(!cache.has('k41'), 'ninth-from-last evicted');
});

test('cachePut with maxEntries<=0 stays unbounded (opt-out) and never throws on a bad cache', () => {
  const cache = new Map();
  for (let i = 0; i < 100; i += 1) cachePut(cache, `k${i}`, i, 0);
  assert.equal(cache.size, 100, 'zero cap means no eviction');
  assert.doesNotThrow(() => cachePut(null, 'a', [1]));
  assert.doesNotThrow(() => cachePut({}, 'a', [1]));
});

test('the wired scoreItems path keeps state.completionCache bounded across many distinct queries', () => {
  const cache = new Map();
  const candidates = [
    { id: '1', lang: 'yaml', type: 'service', label: 'light.turn_on', insert: 'light.turn_on', source: 'ha-runtime' },
    { id: '2', lang: 'yaml', type: 'service', label: 'light.turn_off', insert: 'light.turn_off', source: 'ha-runtime' },
  ];
  for (let i = 0; i < 200; i += 1) {
    const ctx = { shouldSuggest: true, lang: 'yaml', prefix: 'light', triggerKind: 'explicit' };
    // Distinct cacheSalt per call => a distinct cacheKey => a new cache write, exactly like 200
    // different keystroke contexts across a session.
    scoreItems(ctx, candidates, { settings: DEFAULT_SCORING_SETTINGS, cache, cacheSalt: `q${i}` });
  }
  assert.ok(cache.size <= SECURITY_LIMITS.maxCacheEntries, `completionCache leaked: ${cache.size} > ${SECURITY_LIMITS.maxCacheEntries}`);
});
