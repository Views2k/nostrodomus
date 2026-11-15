import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  allowType,
  camelMatch,
  catalogPriorityRank,
  completionMatchRank,
  contextualPenalty,
  createRecentAcceptBoostStore,
  focusKindTypeBoost,
  isScalarConfigContext,
  itemMatchesYamlValueKind,
  modeRank,
  providerPriorityRank,
  recordRecentAcceptedCompletion,
  runtimeDomainPriority,
  sameCompletionContextForIncrementalFilter,
  scoreItems,
  semanticItemRank,
  shouldSuppressStaticForFocusedContext,
  wordBoundarySubsequence,
} from '../../src/completion/scoring.js';

const FIXTURE_DIR = join('tests', 'fixtures', 'ranking');

function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

function fixtureFiles() {
  return readdirSync(FIXTURE_DIR).filter(name => name.endsWith('.json')).sort();
}

test('scoring module is pure from browser/runtime globals', () => {
  const text = readFileSync('src/completion/scoring.js', 'utf8');
  // A quoted 'state' is the YAML key, not the runtime state object.
  assert.equal(/(?<!['"])\bstate\b(?!['"])/.test(text), false, 'must not reference monolith runtime state');
  assert.equal(/\bdocument\b/.test(text), false, 'must not reference DOM document');
  assert.equal(/\bwindow\b/.test(text), false, 'must not reference browser window');
});

test('ranking fixtures are documented and structurally valid', () => {
  const files = fixtureFiles();
  assert.ok(files.length >= 5, 'fixture corpus should cover more than the initial two cases');
  for (const file of files) {
    const data = fixture(file);
    assert.equal(typeof data.name, 'string', `${file} must have a name`);
    assert.ok(data.rationale && data.rationale.length > 24, `${file} must explain why the ranking matters`);
    assert.ok(data.ctx && typeof data.ctx === 'object', `${file} must include ctx`);
    assert.equal(Array.isArray(data.candidates), true, `${file} must include candidates`);
    assert.equal(Array.isArray(data.expectedTopIds), true, `${file} must include expectedTopIds`);
    assert.ok(data.expectedTopIds.length >= 1, `${file} must assert at least one top id`);
  }
});

test('allowType filters rows by mode and lets snippet-provider rows through in keys mode', () => {
  assert.equal(allowType({ type: 'snippet', source: 'static-library' }, { mode: 'keys' }), false);
  assert.equal(allowType({ type: 'snippet', source: 'snippet-templates' }, { mode: 'keys' }), true);
  assert.equal(allowType({ type: 'key', source: 'static-library' }, { mode: 'snippets' }), false);
  assert.equal(allowType({ type: 'snippet', source: 'static-library' }, { mode: 'snippets' }), true);
});

test('runtimeDomainPriority boosts Home Assistant runtime domains', () => {
  const light = { source: 'ha-runtime-values', type: 'entity', label: 'light.kitchen', meta: { domain: 'light' } };
  const automation = { source: 'ha-runtime-values', type: 'entity', label: 'automation.old', meta: { domain: 'automation' } };
  assert.ok(runtimeDomainPriority(light, { yamlKey: 'entity' }) > runtimeDomainPriority(automation, { yamlKey: 'entity' }));
});

test('contextualPenalty rewards focused runtime/context rows and penalizes wrong scalar providers', () => {
  const ctx = { lang: 'yaml', valueKind: 'entity', scope: 'tap_action', prefix: 'light', afterKeyColon: true };
  assert.ok(contextualPenalty({ source: 'ha-runtime-values', type: 'entity', label: 'light.kitchen' }, ctx) > 0);
  assert.ok(contextualPenalty({ source: 'static-library', type: 'key', label: 'entity' }, ctx) < 0);
  assert.ok(contextualPenalty({ source: 'lovelace-context', type: 'key', label: 'action' }, { lang: 'yaml', scope: 'tap_action', prefix: 'a' }) > 0);
});

test('itemMatchesYamlValueKind gates scalar value contexts', () => {
  assert.equal(itemMatchesYamlValueKind({ type: 'entity' }, { valueKind: 'entity' }), true);
  assert.equal(itemMatchesYamlValueKind({ type: 'service' }, { valueKind: 'entity' }), false);
  assert.equal(itemMatchesYamlValueKind({ type: 'boolean' }, { valueKind: 'boolean' }), true);
  assert.equal(itemMatchesYamlValueKind({ type: 'card' }, { valueKind: 'card-type' }), true);
});

test('itemMatchesYamlValueKind keeps snippets and other rows out of the registry value lanes', () => {
  // area_id:, device_id:, floor_id: and label_id: take only their own registry rows, not the
  // snippet and entity rows that the source-based check for other kinds lets through.
  for (const kind of ['area', 'device', 'floor', 'label']) {
    assert.equal(itemMatchesYamlValueKind({ type: kind }, { valueKind: kind }), true, `${kind} row must pass its own lane`);
    assert.equal(itemMatchesYamlValueKind({ type: 'snippet', source: 'nostrodomus-snippets' }, { valueKind: kind }), false, `snippet must not leak into ${kind}`);
    assert.equal(itemMatchesYamlValueKind({ type: 'entity', source: 'ha-runtime' }, { valueKind: kind }), false, `entity must not leak into ${kind}`);
  }
  // Registry rows stay scoped to their own kind (an area row must not satisfy a device lane).
  assert.equal(itemMatchesYamlValueKind({ type: 'area' }, { valueKind: 'device' }), false);
});

test('isScalarConfigContext identifies YAML scalar/value positions', () => {
  assert.equal(isScalarConfigContext({ lang: 'yaml', valueKind: 'number' }), true);
  assert.equal(isScalarConfigContext({ lang: 'yaml', yamlRole: 'value', yamlKey: 'entity' }), true);
  assert.equal(isScalarConfigContext({ lang: 'css', valueKind: 'number' }), false);
});

test('focusKindTypeBoost favors expected action, entity, style, trigger, and condition rows', () => {
  assert.ok(focusKindTypeBoost({ type: 'service', source: 'ha-runtime-values' }, { focusKind: 'action-block' }) > 0);
  assert.ok(focusKindTypeBoost({ type: 'entity', source: 'ha-runtime-values' }, { focusKind: 'entity-list' }) > 0);
  assert.ok(focusKindTypeBoost({ type: 'property', source: 'static-library', lang: 'css' }, { focusKind: 'style-block' }) > 0);
  assert.ok(focusKindTypeBoost({ type: 'trigger', source: 'static-library' }, { focusKind: 'trigger-block' }) > 0);
  assert.ok(focusKindTypeBoost({ type: 'condition', source: 'static-library' }, { focusKind: 'condition-block' }) > 0);
});

test('semanticItemRank and modeRank keep source/type ordering stable', () => {
  assert.ok(
    semanticItemRank({ source: 'ha-runtime-values', type: 'entity' }, { lang: 'yaml' }) <
    semanticItemRank({ source: 'static-library', type: 'key' }, { lang: 'yaml' }),
    'runtime values should have a stronger semantic rank than generic static rows'
  );
  assert.ok(
    semanticItemRank({ source: 'lovelace-context', type: 'key' }, { lang: 'yaml' }) <
    semanticItemRank({ source: 'static-library', type: 'snippet' }, { lang: 'yaml' }),
    'focused Lovelace keys should beat generic static snippets in YAML'
  );
  assert.equal(modeRank({ type: 'snippet', source: 'static-library' }, { mode: 'keys' }), 100);
  assert.equal(modeRank({ type: 'snippet', source: 'snippet-templates' }, { mode: 'snippets' }), 0);
});

test('focused Lovelace context suppresses generic static rows', () => {
  const ctx = { lang: 'yaml', scope: 'tap_action', yamlPath: ['tap_action'] };
  assert.equal(shouldSuppressStaticForFocusedContext(ctx, [{ source: 'lovelace-context' }]), true);
});

test('camelMatch matches the initials of words that start with an uppercase letter only', () => {
  assert.equal(camelMatch('callServiceAction', 'csa'), false);
  assert.equal(camelMatch('CallServiceAction', 'csa'), true);
  assert.equal(camelMatch('entity_id', 'ei'), false);
});

test('scoreItems respects gate settings and language/mode filters', () => {
  const ctx = { lang: 'yaml', prefix: 'entity', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true };
  const rows = [{ id: 'key.entity', lang: 'yaml', type: 'key', label: 'entity', insert: 'entity: ', source: 'static-library', meta: {} }];
  assert.deepEqual(scoreItems({ ...ctx, shouldSuggest: false }, rows), []);
  assert.deepEqual(scoreItems(ctx, rows, { settings: { enabledLangs: { yaml: false } } }), []);
  assert.deepEqual(scoreItems(ctx, rows, { settings: { triggerMode: 'manual' } }), []);
  assert.equal(scoreItems({ ...ctx, triggerKind: 'explicit' }, rows, { settings: { triggerMode: 'manual' } }).length, 1);
});

test('scoreItems records quality and uses cache on repeat calls', () => {
  const ctx = { lang: 'yaml', prefix: 'entity', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true };
  const rows = [{ id: 'key.entity', lang: 'yaml', type: 'key', label: 'entity', insert: 'entity: ', source: 'static-library', meta: {} }];
  const cache = new Map();
  const events = [];
  const first = scoreItems(ctx, rows, { cache, recordSuggestionQuality: (...args) => events.push(args) });
  const second = scoreItems(ctx, [], { cache, recordSuggestionQuality: (...args) => events.push(args) });
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(events.length, 2);
  assert.equal(events[0][2].cacheHit, false);
  assert.equal(events[1][2].cacheHit, true);
});

test('scoreItems orders known ranking fixtures', () => {
  for (const file of fixtureFiles()) {
    const { ctx, candidates, expectedTopIds, name } = fixture(file);
    const rows = scoreItems(ctx, candidates, { settings: { mode: 'both', maxItems: 10, fuzzy: true, enabledLangs: { yaml: true, css: true, jinja: true } } });
    assert.deepEqual(rows.slice(0, expectedTopIds.length).map(row => row.id), expectedTopIds, name);
  }
});


test('completionMatchRank follows Completions prefix, boundary, then substring order', () => {
  const exact = completionMatchRank({ label: 'mini-graph-card', aliases: [] }, 'mini');
  const insensitive = completionMatchRank({ label: 'Mini Graph Card', aliases: [] }, 'mini');
  const boundary = completionMatchRank({ label: 'mini-graph-card', aliases: [] }, 'mgc');
  const fuzzy = completionMatchRank({ label: 'user', aliases: [] }, 'usr');
  const substring = completionMatchRank({ label: 'custom:button-card', aliases: [] }, 'button', { fuzzy: false });

  assert.equal(exact.reason, 'exact-prefix');
  assert.equal(insensitive.reason, 'case-insensitive-prefix');
  assert.equal(boundary.reason, 'word-boundary-subsequence');
  assert.equal(fuzzy.reason, 'ordered-subsequence');
  assert.equal(substring.reason, 'substring');
  assert.ok(exact.tier < insensitive.tier);
  assert.ok(insensitive.tier < boundary.tier);
  assert.ok(boundary.tier < fuzzy.tier);
  assert.ok(fuzzy.tier < substring.tier);
  assert.equal(wordBoundarySubsequence('mini-graph-card', 'mgc'), true);
});

test('scoreItems makes match tier stronger than provider priority', () => {
  const ctx = { lang: 'yaml', prefix: 'ca', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true };
  const rows = scoreItems(ctx, [
    { id: 'runtime.substring', lang: 'yaml', type: 'entity', label: 'sensor.camera_state', insert: 'sensor.camera_state', source: 'ha-runtime-values', meta: { domain: 'sensor' } },
    { id: 'static.prefix', lang: 'yaml', type: 'key', label: 'card', insert: 'card: ', source: 'static-library', meta: { priority: 1 } },
  ], { settings: { mode: 'both', enabledLangs: { yaml: true } } });
  assert.deepEqual(rows.map(row => row.id), ['static.prefix', 'runtime.substring']);
  assert.equal(rows[0].matchReason, 'exact-prefix');
});

test('scoreItems tie-breaks by provider, catalog priority, shorter label, then alpha', () => {
  const ctx = { lang: 'yaml', prefix: 'a', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true, scope: 'plain-action' };
  const rows = scoreItems(ctx, [
    // Same label as the context row, different insert text: both rows stay (rows that insert the
    // same text are listed once, see tests/scoring/duplicate_rows.test.mjs).
    { id: 'static.high', lang: 'yaml', type: 'key', label: 'actionable', insert: 'actionable:', source: 'static-library', meta: { priority: 999 } },
    { id: 'context.low', lang: 'yaml', type: 'key', label: 'actionable', insert: 'actionable: ', source: 'lovelace-context', meta: { priority: 1 } },
    { id: 'context.high.long', lang: 'yaml', type: 'key', label: 'actionable_name', insert: 'actionable_name: ', source: 'lovelace-context', meta: { priority: 20 } },
    { id: 'context.high.short.b', lang: 'yaml', type: 'key', label: 'alarm', insert: 'alarm: ', source: 'lovelace-context', meta: { priority: 20 } },
    { id: 'context.high.short.a', lang: 'yaml', type: 'key', label: 'area', insert: 'area: ', source: 'lovelace-context', meta: { priority: 20 } },
  ], { settings: { mode: 'both', enabledLangs: { yaml: true } } });

  assert.equal(providerPriorityRank({ source: 'lovelace-context' }, ctx), 0);
  assert.equal(catalogPriorityRank({ meta: { priority: 20 } }), 20);
  assert.deepEqual(rows.slice(0, 5).map(row => row.id), [
    'context.high.short.a',
    'context.high.short.b',
    'context.high.long',
    'context.low',
    'static.high',
  ]);
});

test('recent accepted boost is bounded and does not cross match tiers', () => {
  const recent = createRecentAcceptBoostStore(2);
  const ctx = { lang: 'yaml', prefix: 'li', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true, valueKind: 'entity' };
  const rows = [
    { id: 'prefix.light', lang: 'yaml', type: 'entity', label: 'light.kitchen', insert: 'light.kitchen', source: 'ha-runtime-values', meta: { domain: 'light', priority: 1 } },
    { id: 'substring.sensor', lang: 'yaml', type: 'entity', label: 'sensor.light_level', insert: 'sensor.light_level', source: 'ha-runtime-values', meta: { domain: 'sensor', priority: 1000 } },
  ];
  recordRecentAcceptedCompletion(rows[1], recent);
  const ranked = scoreItems(ctx, rows, { recentAccepts: recent, settings: { mode: 'both', enabledLangs: { yaml: true } } });
  assert.equal(recent.size(), 1);
  assert.equal(ranked[0].id, 'prefix.light');
  assert.equal(ranked[1].recentBoost > 0, true);
});

test('scoreItems reuses previous rows only for prefix extension, not backspace', () => {
  const previousContext = { lang: 'yaml', prefix: 'li', scope: 'entity', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', focusKind: 'entity-list', pathText: 'cards.0.entity' };
  const nextContext = { ...previousContext, prefix: 'lig', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true };
  const backspaceContext = { ...previousContext, prefix: 'l', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true };
  const previousItems = [
    { id: 'light', lang: 'yaml', type: 'entity', label: 'light.kitchen', insert: 'light.kitchen', source: 'ha-runtime-values', meta: { domain: 'light' } },
    { id: 'switch', lang: 'yaml', type: 'entity', label: 'switch.living_room', insert: 'switch.living_room', source: 'ha-runtime-values', meta: { domain: 'switch' } },
  ];
  let providerCalls = 0;
  const providerCandidates = () => {
    providerCalls += 1;
    return [{ id: 'provider.light', lang: 'yaml', type: 'entity', label: 'light.office', insert: 'light.office', source: 'ha-runtime-values', meta: { domain: 'light' } }];
  };
  const quality = [];

  assert.equal(sameCompletionContextForIncrementalFilter(previousContext, nextContext), true);
  const narrowed = scoreItems(nextContext, { previousContext, previousItems, providerCandidates, recordSuggestionQuality: (...args) => quality.push(args) });
  assert.equal(providerCalls, 0);
  assert.deepEqual(narrowed.map(row => row.id), ['light', 'switch']);
  assert.equal(quality.at(-1)[2].incrementalFilter, true);

  const requeried = scoreItems(backspaceContext, { previousContext, previousItems, providerCandidates });
  assert.equal(providerCalls, 1);
  assert.deepEqual(requeried.map(row => row.id), ['provider.light']);
});

test('empty-prefix value list stays up after the key colon and its space', () => {
  // ':' is a trigger character, so `entity:` opens the value list. After the space that follows
  // (`entity: `, isTriggerChar false, empty prefix) afterKeyColon keeps the same rows.
  const rows = [
    { id: 'e1', lang: 'yaml', type: 'entity', label: 'sensor.temp', insert: 'sensor.temp', source: 'ha-runtime-values', meta: {} },
    { id: 'e2', lang: 'yaml', type: 'entity', label: 'light.kitchen', insert: 'light.kitchen', source: 'ha-runtime-values', meta: {} },
  ];
  const base = { lang: 'yaml', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', scope: 'entities', pathText: 'entities', prefix: '', shouldSuggest: true, triggerKind: 'typing', afterKeyColon: true };
  const afterColon = scoreItems({ ...base, isTriggerChar: true }, rows, { settings: { enabledLangs: { yaml: true } } });
  const afterSpace = scoreItems({ ...base, isTriggerChar: false }, rows, { settings: { enabledLangs: { yaml: true } } });
  assert.equal(afterColon.length, 2, "':' opens the value list");
  assert.equal(afterSpace.length, 2, "the trailing space keeps it up (afterKeyColon), not passive-empty");
  // An empty prefix with no trigger character and no colon before it gives no rows.
  const passive = scoreItems({ ...base, isTriggerChar: false, afterKeyColon: false }, rows, { settings: { enabledLangs: { yaml: true } } });
  assert.equal(passive.length, 0, 'no trigger and not after a colon → still suppressed');
});
