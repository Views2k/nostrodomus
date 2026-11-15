import test from 'node:test';
import assert from 'node:assert/strict';

import { createProviderRuntime, PROVIDER_SETTINGS_META } from '../../src/providers/providerRuntime.js';
import {
  HA_VALUE_PROVIDER_ID,
  LOVELACE_CONTEXT_PROVIDER_ID,
  SNIPPET_PROVIDER_ID,
  STATIC_PROVIDER_ID,
  WORD_FALLBACK_PROVIDER_ID,
} from '../../src/core/runtimeConstants.js';

function baseState() {
  return {
    settings: { providers: {}, enabledLangs: { yaml: true }, triggerMode: 'auto' },
    providers: [],
    providerStats: {},
    completionCache: new Map(),
  };
}

test('provider runtime owns provider settings metadata and enablement defaults', () => {
  const state = baseState();
  const runtime = createProviderRuntime({ state });

  const providers = runtime.ensureProviderSettings();
  assert.deepEqual(Object.keys(PROVIDER_SETTINGS_META).sort(), [
    HA_VALUE_PROVIDER_ID,
    LOVELACE_CONTEXT_PROVIDER_ID,
    SNIPPET_PROVIDER_ID,
    STATIC_PROVIDER_ID,
    WORD_FALLBACK_PROVIDER_ID,
  ].sort());
  assert.equal(providers[STATIC_PROVIDER_ID].enabled, true);
  assert.equal(providers[SNIPPET_PROVIDER_ID].enabled, true);
  assert.equal(runtime.providerEnabled(LOVELACE_CONTEXT_PROVIDER_ID), true);

  providers[SNIPPET_PROVIDER_ID].enabled = false;
  assert.equal(runtime.providerEnabled(SNIPPET_PROVIDER_ID), false);
});

test('provider runtime registers static, HACS, snippet, Lovelace, and HA runtime providers through index build', () => {
  const state = baseState();
  state.library = {
    packs: {
      yaml: [
        ['demo.name', 'yaml', 'key', 'name:', 'name: ', ['name']],
      ],
    },
  };
  const runtime = createProviderRuntime({
    state,
    getDoc: () => 'type: custom:button-card\n',
    getPos: () => 26,
    yamlBranchState: () => ({ branch: null }),
    logIndexed() {},
  });

  const index = runtime.buildIndex();
  assert.equal(index.all.length >= 1, true);
  assert.deepEqual(state.providers.map(provider => provider.id), [
    STATIC_PROVIDER_ID,
    SNIPPET_PROVIDER_ID,
    LOVELACE_CONTEXT_PROVIDER_ID,
    'hacs-catalog',
    HA_VALUE_PROVIDER_ID,
    WORD_FALLBACK_PROVIDER_ID,
  ]);

  const rows = runtime.providerCandidates({ shouldSuggest: true, triggerKind: 'typing', lang: 'yaml', yamlRole: 'key', yamlPath: [] });
  assert.equal(rows.some(row => row.id === 'demo.name'), true);
});

test('provider runtime delegates HA runtime value suggestions without browser globals', () => {
  const state = baseState();
  state.runtimeCache = {
    at: Date.now(),
    entities: ['light.kitchen'],
    entityNames: { 'light.kitchen': 'Kitchen Light' },
    services: ['light.turn_on'],
    themes: [],
    cards: [],
    icons: [],
    actions: [],
    triggerTypes: [],
    conditionTypes: [],
    automationModes: [],
    booleans: ['true', 'false'],
    scriptActions: [],
  };
  const runtime = createProviderRuntime({ state, now: () => Date.now() });
  const provider = runtime.haRuntimeValueProvider();

  assert.equal(provider.canHandle({ lang: 'yaml', yamlRole: 'value', yamlKey: 'entity_id' }), true);
  const rows = provider.provide({ lang: 'yaml', yamlRole: 'value', yamlKey: 'entity_id' });
  assert.equal(rows[0].id, 'ha.entity.light.kitchen');
  assert.equal(rows[0].meta.friendly, 'Kitchen Light');
});

test('provider runtime centralizes timeout limits, validation, and cache helpers', () => {
  const state = baseState();
  const localStorage = new Map([['nostrodomusProviderTimeoutMs', '12']]);
  const runtime = createProviderRuntime({
    state,
    window: { localStorage: { getItem: key => localStorage.get(key) } },
  });

  assert.equal(runtime.runtimeProviderRegistryLimits().defaultProviderTimeoutMs, 12);
  assert.equal(runtime.providerDiagnosticId({ id: 'bad id!' }), 'bad-id-');
  assert.equal(runtime.validateProviderRow({ id: 'x' }, { id: 'demo' }, 0).ok, false);

  runtime.cacheSet('a', 1);
  assert.equal(state.completionCache.get('a'), 1);
  runtime.clearCompletionCache();
  assert.equal(state.completionCache.size, 0);
});

test('provider timeout deadline reads the injected clock, not a separate real one', () => {
  // The runtime cache and the provider-timeout deadline must share the caller's
  // injected `now`. When they split (timeout on the real clock), a caller that
  // fixes `now` for determinism still sees providers dropped under host CPU load —
  // the exact cause of the flaky ranking contract test. This pins the single clock.
  const provider = {
    id: 'slow-demo',
    canHandle: () => true,
    provide: () => [{ id: 'slow.row', lang: 'yaml', type: 'key', label: 'slow:', insert: 'slow: ' }],
  };
  const ctx = { shouldSuggest: true, triggerKind: 'typing', lang: 'yaml', yamlRole: 'key', yamlPath: [] };

  // A frozen clock (elapsed always 0) — the provider survives however slow the wall is.
  const frozenState = baseState();
  const frozen = createProviderRuntime({ state: frozenState, now: () => 1_000 });
  frozen.registerProvider(provider);
  assert.equal(frozen.providerCandidates(ctx).some(row => row.id === 'slow.row'), true);
  assert.ok(!(frozenState.providerStats['slow-demo']?.timeoutDrops));

  // A clock that advances past the 8ms budget per read records the call as slow, proving the
  // deadline is measured on the injected clock. The finished rows are kept: the provider is
  // synchronous, so dropping them would save no time.
  let tick = 0;
  const racingState = baseState();
  const racing = createProviderRuntime({ state: racingState, now: () => (tick += 100) });
  racing.registerProvider(provider);
  const rows = racing.providerCandidates(ctx);
  assert.equal(rows.some(row => row.id === 'slow.row'), true);
  assert.equal(racingState.providerStats['slow-demo'].slowCalls, 1);
  assert.ok(!racingState.providerStats['slow-demo'].timeoutDrops);
});
