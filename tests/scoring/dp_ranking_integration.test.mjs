// Engine track `dpRanking` in scoreItems: (a) with dpRanking off nothing changes (dpFuzzy is 0 on
// every item, absent and explicit false agree); (b) with it on dpFuzzy is computed and the better
// optimal-alignment match ranks above a recently accepted weaker one, so dpFuzzy sits above
// recentBoost in the within-tier chain (matchTier, providerRank, dpFuzzy, …, recentBoost).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreItems,
  createRecentAcceptBoostStore,
  recordRecentAcceptedCompletion,
} from '../../src/completion/scoring.js';

const baseCtx = { lang: 'yaml', prefix: 'mt', shouldSuggest: true, triggerKind: 'explicit', isTriggerChar: true };
const entity = (label) => ({ id: `e.${label}`, lang: 'yaml', type: 'entity', label, insert: label, source: 'ha-runtime-values', meta: { domain: label.split('.')[0] } });

// Both are ordered-subsequence-tier matches for "mt" (neither matches word-boundary initials),
// same provider/catalog — so dpFuzzy vs recentBoost is the only thing that can separate them.
const strong = entity('switch.mt_relay');   // m after ".", t consecutive  → high dpFuzzy
const weak = entity('climate.basement');     // m + t buried, gappy          → low dpFuzzy

test('with dpRanking off the order does not change (dpFuzzy is 0 on every item; absent is the same as false)', () => {
  const absent = scoreItems(baseCtx, [strong, weak], { settings: {} });
  const explicitOff = scoreItems(baseCtx, [strong, weak], { settings: { completions: { dpRanking: false } }, cacheSalt: 'off2' });
  assert.deepEqual(absent.map(r => r.label), explicitOff.map(r => r.label), 'flag absent and explicit-false agree');
  assert.ok(absent.every(r => (r.dpFuzzy || 0) === 0), 'no dpFuzzy is computed when the flag is off');
});

test('with dpRanking on, a stronger optimal-alignment match outranks a recently accepted weaker one', () => {
  const store = createRecentAcceptBoostStore(10);
  recordRecentAcceptedCompletion(weak, store); // make the weak match "recently used" → high recentBoost

  const off = scoreItems(baseCtx, [strong, weak], { settings: {}, recentAccepts: store, cacheSalt: 'off' });
  const on = scoreItems(baseCtx, [strong, weak], { settings: { completions: { dpRanking: true } }, recentAccepts: store, cacheSalt: 'on' });

  assert.equal(off[0].label, 'climate.basement', 'OFF: the recently-accepted item leads (recentBoost wins)');
  assert.equal(on[0].label, 'switch.mt_relay', 'ON: the better match leads (dpFuzzy ranks above recentBoost)');
  assert.ok(on.find(r => r.label === 'switch.mt_relay').dpFuzzy > 0, 'dpFuzzy is computed when on');

  // dpRanking only reorders — never adds or drops candidates.
  assert.deepEqual(on.map(r => r.label).sort(), off.map(r => r.label).sort(), 'same candidate set, just reordered');
});
