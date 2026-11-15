import test from 'node:test';
import assert from 'node:assert/strict';

import { createProviderRuntime } from '../../src/providers/providerRuntime.js';
import {
  HACS_CATALOG_PROVIDER_ID,
  HA_VALUE_PROVIDER_ID,
  LOVELACE_CONTEXT_PROVIDER_ID,
  SNIPPET_PROVIDER_ID,
  STATIC_PROVIDER_ID,
  WORD_FALLBACK_PROVIDER_ID,
} from '../../src/core/runtimeConstants.js';

// The "Enabled" toggle of a provider in Settings changes state.settings.providers[id].enabled,
// and only when that entry exists. Entries were made for five built-in ids only, so the toggle
// of the catalog provider and of a provider added through the public API did nothing.

function setup() {
  const state = {
    settings: { providers: {}, enabledLangs: { yaml: true }, triggerMode: 'auto' },
    providers: [],
    providerStats: {},
    completionCache: new Map(),
    library: { packs: { yaml: [['demo.name', 'yaml', 'key', 'name:', 'name: ', ['name']]] } },
  };
  const doc = 'type: custom:mini-graph-card\n';
  const runtime = createProviderRuntime({ state, getDoc: () => doc, getPos: () => doc.length, yamlBranchState: () => null, logIndexed() {} });
  runtime.buildIndex();
  return { state, runtime };
}

// What the Settings change handler does for a provider checkbox.
function toggle(state, runtime, providerId, checked) {
  runtime.ensureProviderSettings();
  if (!providerId || !state.settings.providers[providerId]) return false;
  state.settings.providers[providerId].enabled = checked;
  return true;
}

const keyCtx = { shouldSuggest: true, lang: 'yaml', yamlRole: 'key', yamlKey: '', yamlPath: [], prefix: 'ho', triggerKind: 'typing', catalogCardType: 'custom:mini-graph-card', catalogSurfaceId: 'mini-graph-card' };

test('the catalog provider has a settings entry and its toggle switches it off and on', () => {
  const { state, runtime } = setup();
  const entries = runtime.ensureProviderSettings();
  assert.deepEqual(entries[HACS_CATALOG_PROVIDER_ID], { enabled: true });
  assert.ok(runtime.providerCandidates(keyCtx).some(row => row.source === HACS_CATALOG_PROVIDER_ID));

  assert.equal(toggle(state, runtime, HACS_CATALOG_PROVIDER_ID, false), true, 'the toggle found the entry');
  assert.equal(runtime.providerEnabled(HACS_CATALOG_PROVIDER_ID), false);
  assert.ok(!runtime.providerCandidates(keyCtx).some(row => row.source === HACS_CATALOG_PROVIDER_ID), 'no catalog rows while it is off');
  assert.equal(state.providerStats[HACS_CATALOG_PROVIDER_ID].skipped, true);

  toggle(state, runtime, HACS_CATALOG_PROVIDER_ID, true);
  assert.ok(runtime.providerCandidates(keyCtx).some(row => row.source === HACS_CATALOG_PROVIDER_ID));
});

test('a provider added through registerProvider gets an entry and a working toggle', () => {
  const { state, runtime } = setup();
  const row = { id: 'ext.row', lang: 'yaml', type: 'key', label: 'house_mode:', insert: 'house_mode: ', aliases: [], source: 'my-extension' };
  runtime.registerProvider({ id: 'my-extension', label: 'My extension', provide: () => [row] });
  assert.deepEqual(runtime.ensureProviderSettings()['my-extension'], { enabled: true });
  assert.ok(runtime.providerCandidates(keyCtx).some(item => item.id === 'ext.row'));

  assert.equal(toggle(state, runtime, 'my-extension', false), true);
  assert.ok(!runtime.providerCandidates(keyCtx).some(item => item.id === 'ext.row'));
});

test('a stored choice is kept, a broken entry is reset, and the other built-in entries are enabled', () => {
  const { state, runtime } = setup();
  state.settings.providers = { [HACS_CATALOG_PROVIDER_ID]: { enabled: false }, [SNIPPET_PROVIDER_ID]: { enabled: false }, [STATIC_PROVIDER_ID]: 'broken' };
  const entries = runtime.ensureProviderSettings();
  assert.equal(entries[HACS_CATALOG_PROVIDER_ID].enabled, false);
  assert.equal(entries[SNIPPET_PROVIDER_ID].enabled, false);
  assert.deepEqual(entries[STATIC_PROVIDER_ID], { enabled: true });
  for (const id of [LOVELACE_CONTEXT_PROVIDER_ID, HA_VALUE_PROVIDER_ID, WORD_FALLBACK_PROVIDER_ID]) assert.deepEqual(entries[id], { enabled: true });
});

test('without registered providers only the five built-in entries exist', () => {
  const state = { settings: { providers: {} }, providers: [], providerStats: {} };
  const runtime = createProviderRuntime({ state });
  assert.deepEqual(Object.keys(runtime.ensureProviderSettings()).sort(), [STATIC_PROVIDER_ID, SNIPPET_PROVIDER_ID, LOVELACE_CONTEXT_PROVIDER_ID, HA_VALUE_PROVIDER_ID, WORD_FALLBACK_PROVIDER_ID].sort());
});

test('a provider id cannot reach the prototype of the settings object', () => {
  const { state, runtime } = setup();
  runtime.registerProvider({ id: '__proto__', provide: () => [] });
  runtime.registerProvider({ id: 'constructor', provide: () => [] });
  const entries = runtime.ensureProviderSettings();
  assert.equal(Object.getPrototypeOf(entries), Object.prototype);
  assert.equal({}.enabled, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(entries, 'constructor'), true, 'an ordinary own entry');
  assert.equal(runtime.providerEnabled('__proto__'), true);
  assert.equal(toggle(state, runtime, 'constructor', false), true);
  assert.equal(runtime.providerEnabled('constructor'), false);
});
