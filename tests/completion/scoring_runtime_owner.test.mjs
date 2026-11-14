import assert from 'node:assert/strict';
import test from 'node:test';

import { createScoringRuntime } from '../../src/completion/scoringRuntime.js';

test('scoring runtime owns live scoreItems state glue and provider salt', () => {
  const state = {
    settings: { mode: 'both', enabledLangs: { yaml: true } },
    completionCache: new Map(),
    context: { prefix: '', lang: 'yaml', shouldSuggest: true },
    items: [],
  };
  let providerCalls = 0;
  let qualityPayload = null;
  const runtime = createScoringRuntime({
    state,
    ensureProviderSettings: () => ({ beta: { enabled: true }, alpha: { enabled: true }, off: { enabled: false } }),
    providerCandidates: ctx => {
      providerCalls += 1;
      assert.equal(ctx.prefix, 'li');
      return [
        { label: 'light.kitchen', insert: 'light.kitchen', type: 'entity', source: 'ha-runtime', lang: 'yaml', score: 1 },
      ];
    },
    recordSuggestionQuality: (ctx, items, options) => {
      qualityPayload = { ctx, items, options };
    },
  });

  const ctx = { prefix: 'li', lang: 'yaml', valueKind: 'entity', triggerKind: 'typing', shouldSuggest: true };
  const rows = runtime.scoreItems(ctx);
  assert.equal(providerCalls, 1);
  assert.equal(rows[0].label, 'light.kitchen');
  assert.equal(qualityPayload.options.candidateInputCount, 1);
});

test('scoring runtime preserves mode-aware type filtering and helper delegates', () => {
  const state = { settings: { mode: 'snippets' } };
  const runtime = createScoringRuntime({ state });

  assert.equal(runtime.allowType({ type: 'entity' }), false);
  assert.equal(runtime.allowType({ type: 'snippet' }), true);
  assert.equal(runtime.allowType({ type: 'entity', meta: { quickSnippet: true } }), true);
  assert.equal(runtime.camelMatch('Mushroom Template Card', 'mtc'), true);
  assert.equal(runtime.modeRank({ type: 'snippet' }), 0);
});
