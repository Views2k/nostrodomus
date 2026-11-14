// Engine track `frecency`: the upgraded accept store (frequency + recency, persistable). Locks: the OFF
// path is byte-identical to the legacy flat 4/8 recency (count ignored); the ON path adds a log-scaled
// frequency term capped at 12; determinism (monotonic stamp); and snapshot/hydrate round-trip + fail-dark.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRecentAcceptBoostStore } from '../../src/completion/scoring.js';

const A = { id: 'light.a' };
const ageOut = (store, n = 6) => { for (let i = 0; i < n; i += 1) store.mark({ id: `filler.${i}` }); };

test('boostFor OFF is byte-identical legacy recency (4 recent-ish, capped), ignoring frequency', () => {
  const s = createRecentAcceptBoostStore(50);
  for (let i = 0; i < 8; i += 1) s.mark(A); // count 8 — but OFF must ignore count entirely
  assert.equal(s.boostFor(A), 8, 'recent (within last 5) → 8, exactly as before');
  assert.equal(s.boostFor(A, { frecency: false }), 8, 'explicit frecency:false === legacy');
  assert.equal(s.boostFor({ id: 'never.accepted' }), 0, 'unseen item → 0');
  ageOut(s); // advance the stamp >5 past A's last accept
  assert.equal(s.boostFor(A), 4, 'aged out of recent → 4 (legacy), still ignoring count');
});

test('boostFor ON adds a log-scaled frequency term, capped at 12', () => {
  const s = createRecentAcceptBoostStore(50);
  s.mark(A); // count 1, recent
  assert.equal(s.boostFor(A, { frecency: true }), 9, '4 base + 4 recent + 1 freq(count1)');
  for (let i = 0; i < 7; i += 1) s.mark(A); // count 8, recent
  assert.equal(s.boostFor(A, { frecency: true }), 11, '4 + 4 + 3 freq(count8 → round(log2 9)=3)');
  for (let i = 0; i < 8; i += 1) s.mark(A); // count 16
  assert.equal(s.boostFor(A, { frecency: true }), 12, 'capped at 12 (freq term maxes at 4)');
});

test('ON keeps a graded recency: an aged-out favorite drops its recency term but keeps its frequency', () => {
  const s = createRecentAcceptBoostStore(50);
  for (let i = 0; i < 8; i += 1) s.mark(A); // count 8, currently recent
  assert.equal(s.boostFor(A, { frecency: true }), 11);
  ageOut(s); // A is now > 5 accepts old
  assert.equal(s.boostFor(A, { frecency: true }), 7, 'recent term drops 4→0; frequency (+3) remains: 4+0+3');
});

test('deterministic: identical accept sequences yield identical boosts', () => {
  const seq = [A, { id: 'b' }, A, A, { id: 'b' }];
  const s1 = createRecentAcceptBoostStore(50); seq.forEach(x => s1.mark(x));
  const s2 = createRecentAcceptBoostStore(50); seq.forEach(x => s2.mark(x));
  assert.equal(s1.boostFor(A, { frecency: true }), s2.boostFor(A, { frecency: true }));
  assert.deepEqual(s1.snapshot(), s2.snapshot());
});

test('snapshot/hydrate round-trip reproduces boosts and resumes the stamp above the seeded max', () => {
  const s1 = createRecentAcceptBoostStore(50);
  [A, { id: 'b' }, A, A, { id: 'b' }, { id: 'c' }].forEach(x => s1.mark(x));
  const snap = s1.snapshot();
  assert.equal(snap.v, 1);
  const s2 = createRecentAcceptBoostStore(50);
  assert.equal(s2.hydrate(snap.entries), snap.entries.length, 'hydrate returns the restored size');
  for (const item of [A, { id: 'b' }, { id: 'c' }]) {
    assert.equal(s2.boostFor(item, { frecency: true }), s1.boostFor(item, { frecency: true }), 'boost reproduced after hydrate');
  }
  // A fresh accept after hydrate must get a stamp ABOVE the hydrated max, so recency math never underflows.
  const before = s2.stamp();
  s2.mark({ id: 'new' });
  assert.ok(s2.stamp() > before, 'monotonic stamp resumes above the seeded max');
});

test('hydrate fail-darks on garbage and caps to the store limit; never throws', () => {
  const s = createRecentAcceptBoostStore(3);
  for (const bad of [null, undefined, {}, { entries: 'x' }, 'str', 42, [{ key: 123 }, { count: 'x' }]]) {
    assert.doesNotThrow(() => s.hydrate(bad), `hydrate(${JSON.stringify(bad)}) is safe`);
  }
  // valid + invalid entries mixed; 4 valid > limit 3 → oldest evicted (the empty-key one is skipped).
  s.hydrate([{ key: 'ok', count: 2, stamp: 5 }, { key: '', count: 9, stamp: 9 }, { key: 'x', count: 1, stamp: 1 }, { key: 'y', count: 1, stamp: 2 }, { key: 'z', count: 1, stamp: 3 }]);
  assert.ok(s.size() <= 3, 'hydrate honors the store size cap');
  assert.ok(s.boostFor({ id: 'z' }, { frecency: true }) > 0, 'a surviving valid entry hydrated (oldest "ok" evicted by the cap)');
});

test('hydrate skips entries with a missing/zero/NaN count (guard is live, not dead)', () => {
  const s = createRecentAcceptBoostStore(50);
  // Only the entry with a real count >= 1 survives; missing/0/garbage counts are rejected.
  const admitted = s.hydrate([
    { key: 'no.count', stamp: 3 },
    { key: 'zero.count', count: 0, stamp: 2 },
    { key: 'nan.count', count: 'xyz', stamp: 1 },
    { key: 'valid', count: 2, stamp: 4 },
  ]);
  assert.equal(admitted, 1, 'only the count>=1 entry is admitted');
  assert.equal(s.size(), 1);
  assert.ok(s.boostFor({ id: 'valid' }, { frecency: true }) > 0);
});

test('snapshot caps at the store limit', () => {
  const s = createRecentAcceptBoostStore(5);
  for (let i = 0; i < 20; i += 1) s.mark({ id: `e.${i}` });
  assert.ok(s.snapshot().entries.length <= 5, 'snapshot never exceeds the store limit');
});
