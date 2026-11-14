// Engine track `frecency` integrated into scoreItems. Locks: (a) OFF is byte-identical (count ignored,
// flat 4/8 recency, absent === explicit-false); (b) ON, a more-frequently-accepted item outranks a
// rarely-accepted same-tier rival; (c) the capped boost can NEVER cross a match tier (matchTier is first).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreItems,
  createRecentAcceptBoostStore,
  recordRecentAcceptedCompletion,
} from '../../src/completion/scoring.js';

const ctxFor = (prefix) => ({ lang: 'yaml', prefix, shouldSuggest: true, triggerKind: 'explicit', isTriggerChar: true });
const entity = (label) => ({ id: label, lang: 'yaml', type: 'entity', label, insert: label, source: 'ha-runtime-values', meta: { domain: label.split('.')[0] } });
const markN = (item, store, n) => { for (let i = 0; i < n; i += 1) recordRecentAcceptedCompletion(item, store); };

// Same tier (both exact-prefix of "switch"), same provider — so only the boost can separate them. The
// frequent one (A) is alphabetically LATER, so OFF (tie → label) puts B first; ON must flip to A.
const A = entity('switch.zzz_frequent');
const B = entity('switch.aaa_rare');

test('frecency OFF: ordering is inert / byte-identical (frequency ignored; absent === explicit-false)', () => {
  const store = createRecentAcceptBoostStore(50);
  markN(A, store, 8); markN(B, store, 1);
  const ctx = ctxFor('switch');
  const absent = scoreItems(ctx, [A, B], { settings: {}, recentAccepts: store, cacheSalt: 'a' });
  const explicitOff = scoreItems(ctx, [A, B], { settings: { completions: { frecency: false } }, recentAccepts: store, cacheSalt: 'b' });
  assert.deepEqual(absent.map(r => [r.label, r.recentBoost]), explicitOff.map(r => [r.label, r.recentBoost]), 'absent === explicit-false');
  // count is IGNORED off: both are "recent" → flat 8, regardless of A having 8x the accepts.
  assert.equal(absent.find(r => r.label === A.label).recentBoost, 8);
  assert.equal(absent.find(r => r.label === B.label).recentBoost, 8);
  assert.equal(absent[0].label, B.label, 'OFF: tie on recentBoost → alphabetical label → the rare one leads');
});

test('frecency ON: the more-frequently-accepted item outranks a rarely-accepted same-tier rival', () => {
  const store = createRecentAcceptBoostStore(50);
  markN(A, store, 8); markN(B, store, 1); // A accepted 8x, B once — both recent
  const on = scoreItems(ctxFor('switch'), [A, B], { settings: { completions: { frecency: true } }, recentAccepts: store, cacheSalt: 'on' });
  assert.equal(on[0].label, A.label, 'ON: the frequent favorite leads despite the alphabetical tiebreak');
  assert.ok(on.find(r => r.label === A.label).recentBoost > on.find(r => r.label === B.label).recentBoost, 'A carries a higher frecency boost than B');
});

test('frecency ON cannot cross a match tier: a zero-boost exact-prefix item beats a maxed worse-tier item', () => {
  const store = createRecentAcceptBoostStore(50);
  const exactUnused = entity('sw_relay');     // exact-prefix of "sw", never accepted → boost 0
  const worseMaxed = entity('climate.sw');     // "sw" only as a sub/ordered match → worse tier
  markN(worseMaxed, store, 16);                // maxed frecency boost (12)
  const on = scoreItems(ctxFor('sw'), [exactUnused, worseMaxed], { settings: { completions: { frecency: true } }, recentAccepts: store, cacheSalt: 'tier' });
  assert.equal(on[0].label, 'sw_relay', 'matchTier dominates: the better-tier zero-boost item still leads the maxed worse-tier one');
});
