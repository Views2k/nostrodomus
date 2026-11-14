import assert from 'node:assert/strict';
import test from 'node:test';

import { createSuggestionQualityRuntime } from '../../src/completion/suggestionQualityRuntime.js';
import { createScoringRuntime } from '../../src/completion/scoringRuntime.js';

// Every scoring pass reports its list to the suggestion quality runtime. Building the payload
// there cost each keystroke the work of a diagnostics export (score statistics, label counts,
// the provider summary, a timestamp), and the pass runs before the caller has stored the new
// list and its selected row, so the payload named the row at the previous list's index.

const rows = labels => labels.map((label, index) => ({ id: label, label, type: 'entity', source: 'ha-runtime-values', score: 100 - index }));

function setup(state) {
  const counts = { summaries: 0, stamps: 0, details: 0, panel: 0 };
  const runtime = createSuggestionQualityRuntime({
    state,
    now: () => { counts.stamps += 1; return 'now'; },
    providerSummary: () => { counts.summaries += 1; return []; },
    itemDetail: (item) => { counts.details += 1; return item.label; },
    updateSuggestionQualityPanel: () => { counts.panel += 1; },
  });
  // Every reader of the payload does this.
  const read = () => state.suggestionQuality || runtime.suggestionQualityPayload(state.context, state.items);
  return { runtime, counts, read };
}

test('recording a scoring pass builds no payload', () => {
  const state = { selected: 0, context: { lang: 'yaml' }, items: [] };
  const { runtime, counts } = setup(state);
  for (let i = 0; i < 50; i += 1) runtime.recordSuggestionQuality({ lang: 'yaml' }, rows(['light.a', 'light.b']), { cacheHit: i % 2 === 0, candidateInputCount: 2 });
  assert.deepEqual({ summaries: counts.summaries, stamps: counts.stamps, details: counts.details }, { summaries: 0, stamps: 0, details: 0 });
  assert.equal(state.suggestionQuality, null);
  assert.equal(counts.panel, 50, 'the panel is still told about every pass');
});

test('the selected row is the row at the index of the list that was scored', () => {
  // The previous list had its third row selected.
  const previous = rows(['sensor.a', 'sensor.b', 'sensor.c']);
  const state = { selected: 2, context: { lang: 'yaml', prefix: 's' }, items: previous };
  const { runtime, read } = setup(state);
  assert.equal(read().selectedSuggestion.label, 'sensor.c');

  // A scoring pass for the next keystroke: the caller stores the list and the new index after it.
  const next = rows(['light.kitchen', 'light.living_room', 'light.library']);
  const ctx = { lang: 'yaml', prefix: 'li' };
  runtime.recordSuggestionQuality(ctx, next, { cacheHit: false, candidateInputCount: 40 });
  state.context = ctx;
  state.items = next;
  state.selected = 0;

  const payload = read();
  assert.equal(payload.selectedSuggestion.label, 'light.kitchen', 'not the third row of the new list');
  assert.equal(payload.topSuggestion.label, 'light.kitchen');
  assert.equal(payload.suggestionCount, 3);
  assert.equal(payload.candidateInputCount, 40);
  assert.equal(payload.cacheHit, false);
  assert.equal(payload.context.prefixLength, 2);
});

test('the facts of the last pass belong to its list only', () => {
  const state = { selected: 0, context: { lang: 'yaml' }, items: [] };
  const { runtime, read } = setup(state);
  const scored = rows(['light.a']);
  runtime.recordSuggestionQuality(state.context, scored, { cacheHit: true, candidateInputCount: 9 });
  state.items = scored;
  assert.equal(read().cacheHit, true);
  assert.equal(read().candidateInputCount, 9);

  // Another list (the snippet choice rows are stored without a scoring pass).
  state.items = rows(['on', 'off']);
  assert.equal(read().cacheHit, false);
  assert.equal(read().candidateInputCount, 0);
  // Options given by the caller are used as they are.
  assert.equal(runtime.suggestionQualityPayload(state.context, scored, { cacheHit: false, candidateInputCount: 3 }).candidateInputCount, 3);
});

test('through the scoring runtime: a cache hit and a fresh list are both reported and read back', () => {
  const state = { settings: { enabledLangs: { yaml: true } }, completionCache: new Map(), context: null, items: [], selected: 0 };
  const { runtime, counts, read } = setup(state);
  const scoring = createScoringRuntime({
    state,
    providerCandidates: () => [{ id: 'a', lang: 'yaml', type: 'entity', label: 'light.kitchen', insert: 'light.kitchen', source: 'ha-runtime-values', meta: {} }],
    recordSuggestionQuality: runtime.recordSuggestionQuality,
  });
  const ctx = { prefix: 'li', lang: 'yaml', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', triggerKind: 'typing', shouldSuggest: true };
  const first = scoring.scoreItems(ctx);
  state.context = ctx;
  state.items = first;
  assert.equal(counts.stamps, 0, 'scoring built no payload');
  assert.equal(read().cacheHit, false);
  assert.equal(read().candidateInputCount, 1);

  const again = scoring.scoreItems(ctx);
  state.items = again;
  assert.equal(read().cacheHit, true);
  assert.equal(read().selectedSuggestion.label, 'light.kitchen');
});
