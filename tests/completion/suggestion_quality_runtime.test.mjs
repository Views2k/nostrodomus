import assert from 'node:assert/strict';
import test from 'node:test';

import { createSuggestionQualityRuntime } from '../../src/completion/suggestionQualityRuntime.js';

test('suggestion quality runtime builds redacted provider/type payloads', () => {
  const state = {
    selected: 1,
    context: {
      lang: 'yaml',
      yamlPath: ['cards', '0', 'type'],
      focusKind: 'card-type',
      valueKind: 'string',
      prefix: 'mush',
      shouldSuggest: true,
    },
    items: [
      { label: 'Mushroom Template Card', type: 'card', source: 'hacs-catalog', score: 210, meta: { detail: 'ignored' } },
      { label: 'Mushroom Chips Card', type: 'card', source: 'hacs-catalog', score: 190 },
      { label: 'Mushroom Chips Card', type: 'snippet', source: 'snippet-catalog', score: 120 },
    ],
  };
  const runtime = createSuggestionQualityRuntime({
    state,
    version: 'nostrodomus-test',
    projectVersion: '0.test',
    now: () => '2026-06-11T00:00:00.000Z',
    providerSummary: () => ({ enabled: ['hacs-catalog'] }),
    contextRouteLabel: ctx => `${ctx.lang}:${ctx.focusKind}`,
    itemDetail: item => `detail:${item.type}:${item.label}`,
  });

  const payload = runtime.suggestionQualityPayload();
  assert.equal(payload.exportedAt, '2026-06-11T00:00:00.000Z');
  assert.equal(payload.redacted, true);
  assert.equal(payload.version, 'nostrodomus-test');
  assert.equal(payload.projectVersion, '0.test');
  assert.equal(payload.suggestionCount, 3);
  assert.equal(payload.topScore, 210);
  assert.equal(payload.lowScore, 120);
  assert.equal(payload.scoreSpread, 90);
  assert.deepEqual(payload.providerMix, { 'hacs-catalog': 2, 'snippet-catalog': 1 });
  assert.deepEqual(payload.typeMix, { card: 2, snippet: 1 });
  assert.equal(payload.duplicateLabelCount, 1);
  assert.deepEqual(payload.context, {
    language: 'yaml',
    yamlPath: 'cards.0.type',
    focusKind: 'card-type',
    valueKind: 'string',
    prefixLength: 4,
    shouldSuggest: true,
    route: 'yaml:card-type',
  });
  assert.equal(payload.topSuggestion.detail, 'detail:card:Mushroom Template Card');
  assert.equal(payload.selectedSuggestion.detail, 'detail:card:Mushroom Chips Card');
});

test('suggestion quality runtime records state and refreshes panel', () => {
  const state = { selected: 0, context: { lang: 'yaml', idleReason: 'waiting' }, items: [] };
  let refreshed = 0;
  const runtime = createSuggestionQualityRuntime({
    state,
    now: () => 'now',
    updateSuggestionQualityPanel: () => { refreshed += 1; },
  });

  // A scoring pass records what it knows and refreshes the panel. The payload is built when it is
  // read (tests/completion/suggestion_quality_on_read.test.mjs), from the list the pass scored.
  assert.equal(runtime.recordSuggestionQuality(state.context, state.items, { cacheHit: true, candidateInputCount: 7 }), null);
  assert.equal(refreshed, 1);
  assert.equal(state.suggestionQuality, null);
  const payload = state.suggestionQuality || runtime.suggestionQualityPayload(state.context, state.items);
  assert.equal(payload.cacheHit, true);
  assert.equal(payload.candidateInputCount, 7);
  assert.equal(payload.emptyReason, 'waiting');
});

// --- the payload is only built when someone can read it ---
test('with no reader, a recording builds no payload and a later read still gets its options', () => {
  const items = [{ label: 'light.kitchen', type: 'entity', source: 'ha-values', score: 80 }];
  const state = { selected: 0, context: { lang: 'yaml' }, items };
  const built = { now: 0, providerSummary: 0, itemDetail: 0, route: 0 };
  let refreshed = 0;
  let wanted = false;
  const runtime = createSuggestionQualityRuntime({
    state,
    now: () => { built.now += 1; return 'now'; },
    providerSummary: () => { built.providerSummary += 1; return []; },
    contextRouteLabel: () => { built.route += 1; return 'route'; },
    itemDetail: () => { built.itemDetail += 1; return 'detail'; },
    updateSuggestionQualityPanel: () => { refreshed += 1; },
    payloadWanted: () => wanted,
  });
  state.suggestionQuality = { stale: true };

  for (let i = 0; i < 20; i += 1) {
    assert.equal(runtime.recordSuggestionQuality(state.context, items, { cacheHit: true, candidateInputCount: 9 }), null);
  }
  assert.deepEqual(built, { now: 0, providerSummary: 0, itemDetail: 0, route: 0 }, 'nothing is built per refresh');
  assert.equal(refreshed, 0, 'and no panel is asked to redraw');
  assert.equal(state.suggestionQuality, null, 'the payload of an older list is dropped, so readers build a current one');

  // The readers call the payload builder with the current context and items, and no options.
  const read = runtime.suggestionQualityPayload(state.context, state.items);
  assert.equal(read.cacheHit, true);
  assert.equal(read.candidateInputCount, 9);
  assert.equal(read.suggestionCount, 1);
  assert.equal(read.topSuggestion.label, 'light.kitchen');

  // A different list is not given the options of the skipped recording.
  assert.equal(runtime.suggestionQualityPayload(state.context, []).cacheHit, false);

  // With a reader (the Settings panel is open) the panel is asked to redraw, and its read builds
  // the payload from the stored list with the options of this recording.
  wanted = true;
  assert.equal(runtime.recordSuggestionQuality(state.context, items, { cacheHit: false, candidateInputCount: 4 }), null);
  assert.equal(state.suggestionQuality, null);
  assert.equal(refreshed, 1);
  const shown = runtime.suggestionQualityPayload(state.context, items);
  assert.equal(shown.candidateInputCount, 4);
  assert.equal(shown.exportedAt, 'now');
});
