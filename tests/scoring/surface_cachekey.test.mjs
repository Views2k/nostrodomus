// The surface must isolate the scoring cache, or a Dev Tools Template result could be served from a
// card-editor cache slot (and vice-versa). Two affirmative guards: the full cacheKey (via the
// cacheHit signal) and the incremental-filter reuse predicate.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreItems, sameCompletionContextForIncrementalFilter } from '../../src/completion/scoring.js';

test('cacheKey: contexts that differ only by surface do not share a cache slot', () => {
  const base = { lang: 'yaml', prefix: 'entity', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true };
  const ctxTemplate = { ...base, surface: 'devtools-template' };
  const ctxCard = { ...base, surface: 'card-editor' };
  const rows = [{ id: 'key.entity', lang: 'yaml', type: 'key', label: 'entity', insert: 'entity: ', source: 'static-library', meta: {} }];
  const cache = new Map();
  const events = [];
  const rec = (...args) => events.push(args);

  scoreItems(ctxTemplate, rows, { cache, recordSuggestionQuality: rec });   // miss (compute + store)
  scoreItems(ctxTemplate, [], { cache, recordSuggestionQuality: rec });     // hit (same surface)
  scoreItems(ctxCard, [], { cache, recordSuggestionQuality: rec });         // miss (surface differs!)

  assert.equal(events[0][2].cacheHit, false, 'first template call computes');
  assert.equal(events[1][2].cacheHit, true, 'repeat template call hits cache');
  assert.equal(events[2][2].cacheHit, false, 'card surface is a DISTINCT cache slot — no cross-surface contamination');
});

test('cacheKey: a different jinjaArg position is a distinct slot', () => {
  const base = { lang: 'jinja', surface: 'devtools-template', prefix: 'light', shouldSuggest: true, triggerKind: 'typing' };
  const ctxStates = { ...base, jinjaArg: { fn: 'states', argIndex: 0, expectKind: 'entity' } };
  const ctxAttr = { ...base, jinjaArg: { fn: 'state_attr', argIndex: 1, expectKind: 'attribute' } };
  const rows = [{ id: 'ha.entity.light.k', lang: 'jinja', type: 'entity', label: 'light.k', insert: 'light.k', source: 'ha-runtime-value', meta: {} }];
  const cache = new Map();
  const events = [];
  const rec = (...args) => events.push(args);
  scoreItems(ctxStates, rows, { cache, recordSuggestionQuality: rec, settings: { enabledLangs: { jinja: true } } });
  scoreItems(ctxAttr, [], { cache, recordSuggestionQuality: rec, settings: { enabledLangs: { jinja: true } } });
  assert.equal(events[0][2].cacheHit, false);
  assert.equal(events[1][2].cacheHit, false, 'a different call-arg position must not reuse the prior slot');
});

test('incremental-filter reuse refuses to bridge two surfaces', () => {
  const prev = { lang: 'yaml', surface: 'devtools-template', prefix: 'ent', triggerKind: 'typing' };
  const sameSurface = { ...prev, prefix: 'enti' };
  const diffSurface = { ...prev, prefix: 'enti', surface: 'card-editor' };
  assert.equal(sameCompletionContextForIncrementalFilter(prev, sameSurface), true, 'same surface, extending prefix → reuse');
  assert.equal(sameCompletionContextForIncrementalFilter(prev, diffSurface), false, 'surface changed → no reuse');
});

test('without a surface field a longer prefix reuses the incremental filter', () => {
  const prev = { lang: 'yaml', prefix: 'ent', triggerKind: 'typing' };
  const next = { ...prev, prefix: 'enti' };
  assert.equal(sameCompletionContextForIncrementalFilter(prev, next), true, 'absent surface → both sides "" → unchanged behavior');
});

test('cacheKey: a data: block under a different service gets its own cache slot', () => {
  // Same YAML path, role and prefix; the only difference is the resolved service in branchState.
  // Without the branch in the key, the second block would get the first service's fields.
  const base = { lang: 'yaml', scope: 'actions.action.data', yamlRole: 'blank', yamlKey: '', valueKind: '', focusKind: 'automation-action', pathText: 'actions.action.data', prefix: '', shouldSuggest: true, triggerKind: 'explicit', isTriggerChar: false };
  const light = { ...base, branchState: { parentKey: 'action', parentValue: 'light.turn_on' } };
  const sw = { ...base, branchState: { parentKey: 'action', parentValue: 'switch.turn_on' } };
  const rows = [{ id: 'x', lang: 'yaml', type: 'key', label: 'k:', insert: 'k: ', source: 'ha-runtime-values', meta: {} }];
  const cache = new Map();
  const events = [];
  const rec = (...args) => events.push(args);
  scoreItems(light, rows, { cache, recordSuggestionQuality: rec, settings: { enabledLangs: { yaml: true } } }); // miss
  scoreItems(light, [], { cache, recordSuggestionQuality: rec, settings: { enabledLangs: { yaml: true } } });   // hit (same service)
  scoreItems(sw, [], { cache, recordSuggestionQuality: rec, settings: { enabledLangs: { yaml: true } } });      // miss (service differs!)
  assert.equal(events[0][2].cacheHit, false, 'first light block computes');
  assert.equal(events[1][2].cacheHit, true, 'repeat light block hits cache');
  assert.equal(events[2][2].cacheHit, false, 'the switch block is a DISTINCT slot — it must not inherit light rows');
});

test('cacheKey: an empty-prefix trigger position is a distinct slot from a passive one', () => {
  // isTriggerChar flips the empty-prefix passive gate, so the two must not share a slot.
  const base = { lang: 'yaml', scope: 'entities.entity', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', pathText: 'entities.entity', prefix: '', shouldSuggest: true, triggerKind: 'typing' };
  const trigger = { ...base, isTriggerChar: true };
  const passive = { ...base, isTriggerChar: false };
  const rows = [{ id: 'ha.entity.light.k', lang: 'yaml', type: 'entity', label: 'light.k', insert: 'light.k', source: 'ha-runtime-values', meta: {} }];
  const cache = new Map();
  const events = [];
  const rec = (...args) => events.push(args);
  scoreItems(trigger, rows, { cache, recordSuggestionQuality: rec, settings: { enabledLangs: { yaml: true } } });
  scoreItems(passive, [], { cache, recordSuggestionQuality: rec, settings: { enabledLangs: { yaml: true } } });
  assert.equal(events[0][2].cacheHit, false);
  assert.equal(events[1][2].cacheHit, false, 'passive empty-prefix position must not reuse the trigger slot');
});
