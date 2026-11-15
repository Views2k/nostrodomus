// Benchmark of `dpRanking`, the optimal-alignment fuzzy ranker. Run with `npm run test:perf`; it is
// left out of `npm test` so timing noise cannot fail the required checks. The ranking quality tests
// are in tests/scoring/.
//
// Turning dpRanking on by default needs this measurement. dpFuzzyScore is O(n*m) per search string
// (n = haystack <= 120, m = query), and scoreItems runs it for every search string of every matched
// candidate on each keystroke (at most maxRuntimeEntities = 750 candidates).
//
// The rows are shaped like production rows, because label-only rows understate the cost 3 to 4 times:
//   * entity rows carry the aliases ['entity', domain, friendly], so each candidate has four search
//     strings ([id, 'entity', domain, friendly]);
//   * real ids and friendly names reach 50 to 120 characters, the costly end of the curve;
//   * the 'entity' alias on every row makes a short query like "en" match all 750, a real worst case.
//
// Best of N is the stable number and is what the assertions use. Keystroke smoothness depends on the
// slow keystrokes, so the budget is judged on p90.
//
// No cache on purpose: the live cache is keyed on ctx.prefix, so each keystroke misses it and
// recomputes; a cache here would only make the number look better.
//
// Two thresholds:
//   * asserted, on `best`: generous ceilings that catch a gross slowdown and never flake;
//   * logged, not asserted: the budget for a keystroke, well under a 60fps frame (16.67ms) on real
//     hardware. Home Assistant frontends run on a Pi, an old laptop or a phone, 4 to 8 times slower
//     than a desktop development machine, so p90 here should be about 2-3ms, not just under a frame.

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { scoreItems } from '../../src/completion/scoring.js';

const FRAME_MS = 1000 / 60; // 16.67ms
// Upper bounds on the best run: they catch a large slowdown and are not a speed target.
const ON_GROSS_CEILING_MS = 40;
const DELTA_GROSS_CEILING_MS = 14; // the dpRanking surcharge alone

const DOMAINS = ['sensor', 'binary_sensor', 'switch', 'light', 'climate', 'cover', 'media_player', 'fan', 'lock', 'script', 'automation', 'number', 'select', 'input_boolean'];
const ROOMS = ['living_room', 'kitchen', 'master_bedroom', 'garage', 'back_patio', 'upstairs_hallway', 'guest_bathroom', 'office'];
const KINDS = ['temperature', 'humidity', 'illuminance', 'power_consumption', 'battery_level', 'motion', 'contact', 'state'];

// Production-shaped rows: label = entity id, aliases = ['entity', domain, friendly] (as haRuntimeProvider.js builds them),
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

test('perf(dpRanking): worst-case keystroke scoring — 750 production-shaped entities, short broad query', (t) => {
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
    const p90Frame = on.p90 <= FRAME_MS / 2 ? 'under half a frame' : on.p90 <= FRAME_MS ? 'between half a frame and a frame' : 'over a frame';
    t.diagnostic(`dpRanking worst "${q}": off ${fmt(off)} | on ${fmt(on)} | delta(best)=${delta.toFixed(2)}ms | p90 on this machine: ${p90Frame}`);
    if (!worst || on.best > worst.on.best) worst = { off, on, delta };
  }

  // The asserted ceilings (on best of N; generous; not the keystroke budget, see the header):
  assert.ok(worst.on.best < ON_GROSS_CEILING_MS, `dpRanking-ON worst best ${worst.on.best.toFixed(2)}ms exceeded the ${ON_GROSS_CEILING_MS}ms gross-regression ceiling`);
  assert.ok(worst.delta < DELTA_GROSS_CEILING_MS, `dpRanking surcharge ${worst.delta.toFixed(2)}ms exceeded the ${DELTA_GROSS_CEILING_MS}ms gross-regression ceiling`);
});

test('perf(dpRanking): typical keystroke — a specific 3+ char query prunes matches, surcharge shrinks', (t) => {
  // A specific query (domain + room fragment) prunes most candidates, so both base cost and the
  // dpRanking surcharge drop sharply vs the broad worst case above.
  const off = sample(() => runOff('sensor.kit'));
  const on = sample(() => runOn('sensor.kit'));
  t.diagnostic(`dpRanking typical "sensor.kit": off ${fmt(off)} | on ${fmt(on)} | delta(best)=${(on.best - off.best).toFixed(2)}ms`);
  assert.ok(on.best < ON_GROSS_CEILING_MS, `typical-case ON best ${on.best.toFixed(2)}ms exceeded the ${ON_GROSS_CEILING_MS}ms ceiling`);
});
