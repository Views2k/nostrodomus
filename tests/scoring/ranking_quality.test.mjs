// Completion ranking quality.
//
// The tests assert the intended behavior: what a user should get from prefix and fuzzy matching
// and what is most useful in that YAML context, not recorded output. A clearly right answer that
// loses is a ranking problem to report, never an expected value here. Three kinds of assertion keep
// the cases from being brittle: expectedTop (unambiguous), mustIncludeTopN (fuzzy or tie-prone) and
// mustRankAbove (semantic priority). The suite covers the default path (all engine flags off) and
// the dpRanking path, so it shows the gap between them.
//
// Cases that are a matter of judgment (for example "sp" -> spa_pump vs sensor.power, where both
// readings are defensible, or the authored sensor > light > switch domain weights) are left out on
// purpose: asserting them would turn an authored heuristic into a fact about users. The within-tier
// cases use an unambiguous literal-token query ("mt" -> switch.mt_relay).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreItems,
  completionMatchRank,
  createRecentAcceptBoostStore,
  recordRecentAcceptedCompletion,
} from '../../src/completion/scoring.js';

// The shipped default has every engine flag off; DP_ON turns dpRanking on.
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
  assert.ok(ia < ib, `${why}\n  expected ${a} above ${b}\n  got order = ${ids(rows).join(', ')}`);
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

// On purpose: a required service-data field is more useful first, so it leads the field lane by
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
// Case 1: an exact prefix beats a looser subsequence (default path).
// Typing "light" means the light.* domain; an entity that only scatters the letters
// (sensor.living_room_light) is less likely the target than one that starts with them.
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
// Case 2: the "lk" initials win on match tier (default path).
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
// Case 3: within one tier, the context-specific provider beats a generic static row (default path).
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
// Case 4: recency never crosses a match tier (default path).
// Even a recently accepted looser match loses to a fresh exact-prefix match: matchTier is the
// first sort key, recentBoost the fifth.
// =====================================================================================
test('quality (default): a recently-accepted looser match still loses to a fresh exact-prefix', () => {
  const recent = createRecentAcceptBoostStore(10);
  const looser = ent('sensor.kitchen_light'); // ordered-subsequence for "light"
  recordRecentAcceptedCompletion(looser, recent); // make the worse match "recently used"
  const rows = scoreItems(valueCtx('light'), [
    looser,
    ent('light.kitchen'), // exact-prefix, fresh
  ], { settings: DEFAULT, recentAccepts: recent });
  mustRankAbove(rows, 'e.light.kitchen', 'e.sensor.kitchen_light', 'a closer tier beats any amount of recency');
});

// =====================================================================================
// Case 5: the relevant entity is in the top results of a realistic mixed set (default path).
// "po" is tie-prone (porch and power both read naturally), so the test only requires the porch
// switch in the top three; naming an exact first between porch and power would assert an authored
// tie-break. This checks the scorer; the provider's per-query cap (filterEntityIdsByQuery) is
// checked in tests/providers/entity_prefix_sourcing.test.mjs.
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
// Case 6: value-kind membership, not order: an entity-value context keeps only entity rows.
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
// Case 7: within one tier, with dpRanking on.
// Two candidates of the same tier (ordered subsequence) for "mt": switch.mt_relay contains "mt"
// as a contiguous token (clearly the target); climate.basement scatters m..t. With dpRanking on,
// the optimal-alignment scorer puts the contiguous match first. On the default path nothing tells
// the two apart and the alphabetical order decides (climate < switch), so the right answer is not
// first; case 8 shows that gap.
// =====================================================================================
test('quality (dpRanking on): within one tier, the contiguous-token match leads', () => {
  const strong = ent('switch.mt_relay'); // "mt" is a literal token
  const weak = ent('climate.basement');  // m..t scattered
  assert.equal(tierOf('switch.mt_relay', 'mt'), 2.5, 'precondition: same tier');
  assert.equal(tierOf('climate.basement', 'mt'), 2.5, 'precondition: same tier');
  const on = scoreItems({ ...valueCtx('mt') }, [weak, strong], { settings: DP_ON });
  expectedTop(on, 'e.switch.mt_relay', '"mt" most plausibly means the mt_relay token');
});

// =====================================================================================
// Case 8: what turning dpRanking on by default would change. With the weaker match recently
// accepted, recency wins on the default path (climate.basement leads) and match quality wins with
// dpRanking on (switch.mt_relay leads). The test does not claim either is right; whether
// match-quality ranking should be on by default is a product decision, and this shows the gap.
// =====================================================================================
test('recency leads on the default path, and dpRanking on makes match quality lead', () => {
  const strong = ent('switch.mt_relay');
  const weak = ent('climate.basement');
  const recent = createRecentAcceptBoostStore(10);
  recordRecentAcceptedCompletion(weak, recent); // the weaker match is the recently-used one

  const def = scoreItems({ ...valueCtx('mt') }, [strong, weak], { settings: DEFAULT, recentAccepts: recent, cacheSalt: 'def' });
  const on = scoreItems({ ...valueCtx('mt') }, [strong, weak], { settings: DP_ON, recentAccepts: recent, cacheSalt: 'on' });

  // Default path: no within-tier quality signal ranks above recentBoost, so the recently used
  // weaker match leads.
  expectedTop(def, 'e.climate.basement', 'default path: recency outranks within-tier match quality');
  // With dpRanking on the better match leads, although the other one was used recently.
  expectedTop(on, 'e.switch.mt_relay', 'dpRanking on: match quality outranks recency');
  // dpRanking only reorders: the candidates are the same both ways.
  assert.deepEqual(ids(def).sort(), ids(on).sort(), 'same candidates, just reordered');
});
