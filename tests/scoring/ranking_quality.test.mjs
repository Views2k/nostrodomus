// Completion RANKING QUALITY suite.
//
// Philosophy (binding, owner 2026-06-22): assert INTENDED behavior — what a USER should get,
// derived from how prefix/fuzzy matching SHOULD behave + what is most useful in that YAML
// context — NOT recorded output. Observe real behavior, but if a clearly-right answer LOSES,
// that is a ranking finding to REPORT, never encoded here as "expected". Mixed assertion types
// so cases are not brittle: expectedTop (unambiguous), mustIncludeTopN (fuzzy/tie-prone),
// mustRankAbove (semantic priority). Covers BOTH the shipped default path (all engine flags OFF)
// AND the dpRanking-ON path (the quality ceiling) so the suite DOCUMENTS the gap between them.
//
// Cases that are inherently judgement-laden (e.g. "sp" -> spa_pump vs sensor.power, where two
// readings are equally defensible, or the authored sensor>light>switch domain weights) are
// DELIBERATELY OMITTED: asserting them would encode an authored heuristic as a user-truth, the
// exact trap this suite avoids. The within-tier cases use an UNAMBIGUOUS literal-token query
// ("mt" -> switch.mt_relay) where the right answer is not in doubt.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreItems,
  completionMatchRank,
  createRecentAcceptBoostStore,
  recordRecentAcceptedCompletion,
} from '../../src/completion/scoring.js';

// Shipped default: all engine flags OFF. dpRanking ON = the quality ceiling.
const DEFAULT = { mode: 'both', maxItems: 25, fuzzy: true, enabledLangs: { yaml: true, css: true, jinja: true } };
const DP_ON = { ...DEFAULT, completions: { dpRanking: true } };

const ent = (label, extra = {}) => ({ id: `e.${label}`, lang: 'yaml', type: 'entity', label, insert: label, source: 'ha-runtime-values', meta: { domain: label.split('.')[0], ...extra } });
const svc = (label) => ({ id: `s.${label}`, lang: 'yaml', type: 'service', label, insert: label, source: 'ha-runtime-values', meta: { domain: label.split('.')[0] } });
const valueCtx = (prefix, extra = {}) => ({ lang: 'yaml', prefix, valueKind: 'entity', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true, ...extra });

const ids = (rows) => rows.map((r) => r.id);
const at = (rows, id) => rows.findIndex((r) => r.id === id);

// --- assertion helpers (the three intended-behavior shapes) ---
function expectedTop(rows, id, why) {
  assert.equal(rows[0]?.id, id, `${why}\n  expected TOP = ${id}\n  got order   = ${ids(rows).join(', ')}`);
}
function mustIncludeTopN(rows, id, n, why) {
  const i = at(rows, id);
  assert.ok(i >= 0 && i < n, `${why}\n  expected ${id} in TOP ${n}\n  got order = ${ids(rows).join(', ')}`);
}
function mustRankAbove(rows, a, b, why) {
  const ia = at(rows, a);
  const ib = at(rows, b);
  assert.ok(ia >= 0 && ib >= 0, `${why}\n  both must be present: ${a}@${ia}, ${b}@${ib}\n  got = ${ids(rows).join(', ')}`);
  assert.ok(ia < ib, `${why}\n  expected ${a} ABOVE ${b}\n  got order = ${ids(rows).join(', ')}`);
}
function mustInclude(rows, id, why) {
  assert.ok(at(rows, id) >= 0, `${why}\n  expected ${id} present\n  got = ${ids(rows).join(', ')}`);
}
function mustExclude(rows, id, why) {
  assert.ok(at(rows, id) < 0, `${why}\n  expected ${id} ABSENT\n  got = ${ids(rows).join(', ')}`);
}
// records the match tier so a case self-documents its precondition (and a tier-assumption error
// surfaces as a clear failure rather than a silently-passing test for the wrong reason).
const tierOf = (label, prefix) => completionMatchRank({ label, aliases: [] }, prefix).tier;

// INTENDED: a required service-data field is more useful first, so it leads the field lane by
// default. The labels are chosen so the alphabetical tie-break would otherwise put the optional
// field first — so this asserts the required-first bias, not incidental label order.
test('required service fields lead the field lane (default behavior)', () => {
  const optional = { id: 'k.aaa_optional', lang: 'yaml', type: 'key', label: 'aaa_optional:', insert: 'aaa_optional: ', source: 'ha-runtime-values', meta: { domain: 'light' } };
  const required = { id: 'k.zzz_required', lang: 'yaml', type: 'key', label: 'zzz_required:', insert: 'zzz_required: ', source: 'ha-runtime-values', meta: { domain: 'light', required: true } };
  const ctx = { lang: 'yaml', prefix: '', shouldSuggest: true, triggerKind: 'explicit', isTriggerChar: true };
  const rows = scoreItems(ctx, [optional, required], { settings: DEFAULT });
  mustRankAbove(rows, 'k.zzz_required', 'k.aaa_optional', 'a required service field should lead the field lane despite its later label');
});

// =====================================================================================
// CASE 1 — exact-prefix beats a looser subsequence (DEFAULT path).
// Intended: typing "light" you mean the light.* domain; an entity that merely SCATTERS the
// letters (sensor.living_room_light) is less likely your target than one that STARTS with it.
// =====================================================================================
test('quality (default): exact-prefix entity beats a looser subsequence match', () => {
  const rows = scoreItems(valueCtx('light'), [
    ent('sensor.living_room_light'), // ordered-subsequence
    ent('light.kitchen'),            // exact-prefix
  ], { settings: DEFAULT });
  assert.equal(tierOf('light.kitchen', 'light'), 0, 'precondition: light.kitchen is exact-prefix');
  expectedTop(rows, 'e.light.kitchen', 'exact-prefix is what you typed -> it leads');
  mustRankAbove(rows, 'e.light.kitchen', 'e.sensor.living_room_light', 'exact-prefix > subsequence');
});

// =====================================================================================
// CASE 2 — the "lk" marquee is a TIER win on the DEFAULT path.
// "lk" word-boundary initials point at light.|k|itchen (tier 2, word-boundary subsequence);
// lock.front_door / sensor.bulk_power are looser ordered subsequences (tier 2.5). The closer
// match tier always leads, no flag needed.
// =====================================================================================
test('quality (default): word-boundary initials "lk" -> light.kitchen lead looser matches', () => {
  assert.equal(tierOf('light.kitchen', 'lk'), 2, 'precondition: light.kitchen is word-boundary subsequence');
  assert.equal(tierOf('lock.front_door', 'lk'), 2.5, 'precondition: lock.front_door is ordered subsequence');
  const rows = scoreItems(valueCtx('lk'), [
    ent('sensor.bulk_power'),
    ent('lock.front_door'),
    ent('light.kitchen'),
  ], { settings: DEFAULT });
  expectedTop(rows, 'e.light.kitchen', '"lk" initials point at light.kitchen');
  mustRankAbove(rows, 'e.light.kitchen', 'e.lock.front_door', 'closer tier wins');
  mustRankAbove(rows, 'e.light.kitchen', 'e.sensor.bulk_power', 'closer tier wins');
});

// =====================================================================================
// CASE 3 — within one tier, the context-specific provider beats a generic static row (DEFAULT).
// Editing a card config, typing "ac": a context-aware "action" key should beat a generic
// static-library "action" key — same exact-prefix tier, provider relevance decides.
// =====================================================================================
test('quality (default): context-specific provider beats generic static at the same tier', () => {
  const ctx = { lang: 'yaml', prefix: 'ac', yamlRole: 'key', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true, scope: 'plain-action' };
  const rows = scoreItems(ctx, [
    // Different insert text, so both rows stay in the list and their order can be compared.
    { id: 'static.action', lang: 'yaml', type: 'key', label: 'action', insert: 'action:', source: 'static-library', meta: {} },
    { id: 'ctx.action', lang: 'yaml', type: 'key', label: 'action', insert: 'action: ', source: 'lovelace-context', meta: {} },
  ], { settings: DEFAULT });
  mustRankAbove(rows, 'ctx.action', 'static.action', 'the context-aware key is the more useful one here');

  // With the same insert text the two rows are one suggestion, and the context row is the one kept.
  const same = scoreItems(ctx, [
    { id: 'static.action', lang: 'yaml', type: 'key', label: 'action', insert: 'action: ', source: 'static-library', meta: {} },
    { id: 'ctx.action', lang: 'yaml', type: 'key', label: 'action', insert: 'action: ', source: 'lovelace-context', meta: {} },
  ], { settings: DEFAULT });
  assert.deepEqual(same.map(row => row.id), ['ctx.action']);
});

// =====================================================================================
// CASE 4 — tier-safety: recency can NEVER cross a match tier (DEFAULT path).
// Even a maxed recently-accepted looser match must lose to a fresh exact-prefix match. matchTier
// is the first sort key; recentBoost is the 5th. (Extends the single existing tier-safety case.)
// =====================================================================================
test('quality (default): a recently-accepted looser match still loses to a fresh exact-prefix', () => {
  const recent = createRecentAcceptBoostStore(10);
  const looser = ent('sensor.kitchen_light'); // ordered-subsequence for "light"
  recordRecentAcceptedCompletion(looser, recent); // make the WORSE match "recently used"
  const rows = scoreItems(valueCtx('light'), [
    looser,
    ent('light.kitchen'), // exact-prefix, fresh
  ], { settings: DEFAULT, recentAccepts: recent });
  mustRankAbove(rows, 'e.light.kitchen', 'e.sensor.kitchen_light', 'a closer tier beats any amount of recency');
});

// =====================================================================================
// CASE 5 — the relevant entity is SURFACED (not buried) among a realistic mixed set (DEFAULT).
// "po" is a tie-prone query (porch vs power both read naturally), so the robust, non-brittle
// claim is mustIncludeTopN: the porch switch you are reaching for is in the top results among a
// large multi-domain install, never lost below the cap. (Picking an exact #1 between porch/power
// would be the authored-tiebreak trap; top-N is the user-justifiable assertion.)
// (The provider-side per-query-cap survival, filterEntityIdsByQuery, is a complementary provider
// test worth adding separately; this asserts the scorer's selection.)
// =====================================================================================
test('quality (default): a relevant entity is surfaced in the top results among many', () => {
  const many = [
    ent('light.kitchen'), ent('light.living_room'), ent('sensor.temperature'),
    ent('sensor.humidity'), ent('sensor.power'), ent('binary_sensor.front_door'),
    ent('climate.thermostat'), ent('switch.porch_light'), ent('media_player.tv'),
    ent('cover.garage_door'), ent('fan.bedroom'), ent('lock.front_door'),
    ent('automation.morning'), ent('script.bedtime'),
  ];
  const rows = scoreItems(valueCtx('po'), many, { settings: DEFAULT });
  mustIncludeTopN(rows, 'e.switch.porch_light', 3, '"po" -> the porch switch is surfaced, not buried');
});

// =====================================================================================
// CASE 6 — value-kind MEMBERSHIP (not order): an entity-value context keeps only entity rows.
// A service row offered into an entity slot is the wrong kind and must be filtered out entirely.
// =====================================================================================
test('membership (default): an entity-value context keeps entity rows and drops a service row', () => {
  const rows = scoreItems(valueCtx('li'), [
    ent('light.kitchen'),
    svc('light.turn_on'), // a service is the wrong kind for an entity value
  ], { settings: DEFAULT });
  mustInclude(rows, 'e.light.kitchen', 'the entity belongs in an entity slot');
  mustExclude(rows, 's.light.turn_on', 'a service does not belong in an entity slot');
});

// =====================================================================================
// CASE 7 — within-tier QUALITY CEILING (dpRanking ON).
// Two SAME-tier (ordered-subsequence) candidates for "mt": switch.mt_relay contains "mt" as a
// literal contiguous token (unambiguously the target); climate.basement scatters m..t. With
// dpRanking ON, the optimal-alignment scorer puts the contiguous match first. On DEFAULT this
// tie has no quality discriminator and falls to alpha (climate < switch) — so the right answer
// is NOT first by default. That is the gap, documented by CASE 8.
// =====================================================================================
test('quality (dpRanking ON): within one tier, the contiguous-token match leads', () => {
  const strong = ent('switch.mt_relay'); // "mt" is a literal token
  const weak = ent('climate.basement');  // m..t scattered
  assert.equal(tierOf('switch.mt_relay', 'mt'), 2.5, 'precondition: same tier');
  assert.equal(tierOf('climate.basement', 'mt'), 2.5, 'precondition: same tier');
  const on = scoreItems({ ...valueCtx('mt') }, [weak, strong], { settings: DP_ON });
  expectedTop(on, 'e.switch.mt_relay', '"mt" most plausibly means the mt_relay token');
});

// =====================================================================================
// CASE 8 — THE dpRanking-DEFAULT DECISION ITEM (documents both paths; asserts the GAP, not a
// universal "correct"). With the WEAKER match recently accepted: on DEFAULT recency wins (the
// weaker climate.basement leads); with dpRanking ON, match quality wins (switch.mt_relay leads).
// This does NOT claim either is the one right answer — whether match-quality ranking should ship
// ON by default is a PRODUCT decision for the owner. The suite exists to make the gap visible.
// =====================================================================================
test('decision item: recency leads on the DEFAULT path; dpRanking ON makes match quality lead', () => {
  const strong = ent('switch.mt_relay');
  const weak = ent('climate.basement');
  const recent = createRecentAcceptBoostStore(10);
  recordRecentAcceptedCompletion(weak, recent); // the weaker match is the recently-used one

  const def = scoreItems({ ...valueCtx('mt') }, [strong, weak], { settings: DEFAULT, recentAccepts: recent, cacheSalt: 'def' });
  const on = scoreItems({ ...valueCtx('mt') }, [strong, weak], { settings: DP_ON, recentAccepts: recent, cacheSalt: 'on' });

  // DEFAULT (shipped): no within-tier quality signal above recentBoost -> the recently-used weaker match leads.
  expectedTop(def, 'e.climate.basement', 'SHIPPED default: recency outranks within-tier match quality');
  // dpRanking ON (the quality ceiling): the better match leads despite the rival being recently used.
  expectedTop(on, 'e.switch.mt_relay', 'dpRanking ON: match quality outranks recency');
  // dpRanking only REORDERS — same candidate set both ways.
  assert.deepEqual(ids(def).sort(), ids(on).sort(), 'same candidates, just reordered');
});
