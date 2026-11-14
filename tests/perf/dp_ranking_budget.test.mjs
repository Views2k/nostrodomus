// Perf benchmark + regression guard for `dpRanking` (the optimal-alignment fuzzy ranker).
// Run via `npm run test:perf` (advisory; excluded from the required gate so timing noise can
// never flake `npm test`). Functional/quality assertions live in tests/scoring/*.
//
// WHY THIS EXISTS: flipping dpRanking default-ON is blocked on a MEASUREMENT, not a product
// opinion. dpFuzzyScore is O(n*m) per *search string* (n=haystack<=120, m=query) and scoreItems
// runs it once per uniqueSearchStrings(item) on every MATCHED candidate per keystroke (capped at
// maxRuntimeEntities=750).
//
// REALISM MATTERS (label-only rows understate the cost ~3-4x):
//   * Production entity rows carry aliases ['entity', domain, friendly] (haRuntimeProvider.js:469),
//     so uniqueSearchStrings = [id, 'entity', domain, friendly] => dpFuzzy runs ~4x/candidate, not 1x.
//   * Real ids/friendly-names reach 50-120 chars — the costly band of the O(n*m=120) curve, not ~25.
//   * The 'entity' alias on every row means a short query like "en" matches ALL 750 — a real worst case.
// This benchmark uses production-shaped rows + realistic lengths so the number is representative.
//
// STATISTIC: best-of-N is the non-flaky floor (regression tripwires use it). But keystroke smoothness
// is a TAIL property, so the ACCEPTANCE judgement is read on p90 (the felt slow keystroke).
//
// NO CACHE is correct, not a flaw: the live cache is keyed on ctx.prefix (scoring.js:473), so every
// keystroke changes the prefix => cache miss => full recompute. Do not "add the cache" to look faster.
//
// TWO THRESHOLDS, kept distinct (a number chosen so the test passes is NOT the acceptance bar):
//   * REGRESSION TRIPWIRES (asserted, on `best`): generous gross-slowdown catches that never flake.
//   * ACCEPTANCE BUDGET (LOGGED, not asserted): a keystroke op should
//     sit well under a 60fps frame (16.67ms) WITH headroom on REAL hardware. HA frontends run on
//     Pi/old-laptop/phone, credibly 4-8x slower than a desktop development machine — so the p90 there must be a
//     SMALL fraction of a frame (~2-3ms) to be safe, NOT merely under one frame here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { scoreItems } from '../../src/completion/scoring.js';

const FRAME_MS = 1000 / 60; // 16.67ms
const ON_GROSS_CEILING_MS = 40; // regression tripwire on best (today realistic ~10-15ms); never flakes; NOT the acceptance bar
const DELTA_GROSS_CEILING_MS = 14; // dpRanking surcharge tripwire on best (today realistic ~5-6ms); NOT the acceptance bar

const DOMAINS = ['sensor', 'binary_sensor', 'switch', 'light', 'climate', 'cover', 'media_player', 'fan', 'lock', 'script', 'automation', 'number', 'select', 'input_boolean'];
const ROOMS = ['living_room', 'kitchen', 'master_bedroom', 'garage', 'back_patio', 'upstairs_hallway', 'guest_bathroom', 'office'];
const KINDS = ['temperature', 'humidity', 'illuminance', 'power_consumption', 'battery_level', 'motion', 'contact', 'state'];

// Production-shaped rows: label = entity id, aliases = ['entity', domain, friendly] (haRuntimeProvider.js:469),
// with realistic id/friendly lengths (some long template-style ids in the costly 50-90 char band).
const ENTITIES = Array.from({ length: 750 }, (_, i) => {
  const d = DOMAINS[i % DOMAINS.length];
  const room = ROOMS[i % ROOMS.length];
  const kind = KINDS[i % KINDS.length];
  // every 5th id is a long template-style id (~55-75 chars) to populate the costly band
  const id = i % 5 === 0
    ? `${d}.${room}_${kind}_calculated_average_over_last_24h_${i}`
    : `${d}.${room}_${kind}_${i}`;
  const friendly = i % 5 === 0
    ? `${room.replace(/_/g, ' ')} ${kind.replace(/_/g, ' ')} (calculated 24h average)`
    : `${room.replace(/_/g, ' ')} ${kind.replace(/_/g, ' ')}`;
  return { id: `e${i}`, lang: 'yaml', type: 'entity', label: id, insert: id, source: 'ha-runtime-values', aliases: ['entity', d, friendly], meta: { domain: d, friendly } };
});

const valueCtx = (prefix) => ({ lang: 'yaml', prefix, valueKind: 'entity', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true });
const OFF = { mode: 'both', maxItems: 50, fuzzy: true, enabledLangs: { yaml: true } };
const ON = { ...OFF, completions: { dpRanking: true } };

function sample(fn) {
  for (let i = 0; i < 10; i += 1) fn();
  const s = [];
  for (let i = 0; i < 60; i += 1) {
    const t = performance.now();
    fn();
    s.push(performance.now() - t);
  }
  s.sort((a, b) => a - b);
  return { best: s[0], median: s[30], p90: s[Math.floor(s.length * 0.9)] };
}

const runOff = (q) => scoreItems(valueCtx(q), ENTITIES, { settings: OFF });
const runOn = (q) => scoreItems(valueCtx(q), ENTITIES, { settings: ON });
const fmt = (s) => `best=${s.best.toFixed(2)} med=${s.median.toFixed(2)} p90=${s.p90.toFixed(2)}ms`;

test('perf(dpRanking): worst-case keystroke scoring — 750 production-shaped entities, short broad query', () => {
  // Prove the workload is production-shaped: rows must carry the 4 search strings real rows do
  // (id + 'entity' + domain + friendly), so dpFuzzy pays the real ~4x/candidate. A future schema
  // change that drops aliases would trip this and reveal the benchmark went unrepresentative.
  const sampleRow = ENTITIES[0];
  const searchStrings = Array.from(new Set([sampleRow.label, ...sampleRow.aliases].map((v) => String(v || '')).filter(Boolean)));
  assert.ok(searchStrings.length >= 4, `precondition: production-shaped row has >=4 search strings (dpFuzzy runs per string); got ${searchStrings.length}`);
  const probe = runOn('en'); // the 'entity' alias makes "en" match every row -> the real broad worst case
  assert.ok(probe.some((r) => (r.dpFuzzy || 0) > 0), 'precondition: dpFuzzy is actually computed when ON');

  let worst = null;
  for (const q of ['en', 'e', 'se', 'temp']) { // short broad (match-all via 'entity'/'e') + a higher-m friendly-name query
    const off = sample(() => runOff(q));
    const on = sample(() => runOn(q));
    const delta = on.best - off.best;
    const accVerdict = on.p90 <= FRAME_MS / 2 ? 'UNDER ~half-frame proxy' : on.p90 <= FRAME_MS ? 'over half-frame, under one frame (this machine)' : 'OVER a full frame (this machine)';
    console.log(`dpRanking worst "${q}": OFF ${fmt(off)} | ON ${fmt(on)} | delta(best)=${delta.toFixed(2)}ms | ACCEPTANCE(p90 vs ${(FRAME_MS / 2).toFixed(1)}ms): ${accVerdict}`);
    if (!worst || on.best > worst.on.best) worst = { off, on, delta };
  }
  console.log(`dpRanking ACCEPTANCE NOTE: judge p90 against real hardware = this machine x ~4-8 (Pi/old-laptop/phone). A safe default-ON needs p90 here ~<3ms; base OFF scorer is the dominant cost, dpRanking the surcharge on top.`);

  // REGRESSION TRIPWIRES (on the non-flaky floor; generous; NOT the acceptance bar — see header):
  assert.ok(worst.on.best < ON_GROSS_CEILING_MS, `dpRanking-ON worst best ${worst.on.best.toFixed(2)}ms exceeded the ${ON_GROSS_CEILING_MS}ms gross-regression ceiling`);
  assert.ok(worst.delta < DELTA_GROSS_CEILING_MS, `dpRanking surcharge ${worst.delta.toFixed(2)}ms exceeded the ${DELTA_GROSS_CEILING_MS}ms gross-regression ceiling`);
});

test('perf(dpRanking): typical keystroke — a specific 3+ char query prunes matches, surcharge shrinks', () => {
  // A specific query (domain + room fragment) prunes most candidates, so both base cost and the
  // dpRanking surcharge drop sharply vs the broad worst case above.
  const off = sample(() => runOff('sensor.kit'));
  const on = sample(() => runOn('sensor.kit'));
  console.log(`dpRanking typical "sensor.kit": OFF ${fmt(off)} | ON ${fmt(on)} | delta(best)=${(on.best - off.best).toFixed(2)}ms`);
  assert.ok(on.best < ON_GROSS_CEILING_MS, `typical-case ON best ${on.best.toFixed(2)}ms exceeded the ${ON_GROSS_CEILING_MS}ms ceiling`);
});
