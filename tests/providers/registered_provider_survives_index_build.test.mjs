import test from 'node:test';
import assert from 'node:assert/strict';

import { createProviderRuntime } from '../../src/providers/providerRuntime.js';
import { buildIndex } from '../../src/providers/staticLibraryProvider.js';
import { HACS_CATALOG_PROVIDER_ID, STATIC_PROVIDER_ID } from '../../src/core/runtimeConstants.js';

// The public registerProvider API can be called before the library has loaded. The index build
// that follows the load emptied the provider list and registered only the built-in providers
// again, so a provider added before it was gone.

function setup() {
  const state = {
    settings: { providers: {}, enabledLangs: { yaml: true }, triggerMode: 'auto' },
    providers: [],
    providerStats: {},
    completionCache: new Map(),
  };
  const runtime = createProviderRuntime({ state, getDoc: () => '', getPos: () => 0, yamlBranchState: () => null, logIndexed() {} });
  return { state, runtime };
}

const extension = (id = 'my-extension') => ({
  id,
  label: 'My extension',
  provide: () => [{ id: `${id}.row`, lang: 'yaml', type: 'key', label: 'house_mode:', insert: 'house_mode: ', aliases: [], source: id }],
});
const ctx = { shouldSuggest: true, lang: 'yaml', yamlRole: 'key', yamlKey: '', yamlPath: [], prefix: 'ho', triggerKind: 'typing' };
const ids = state => state.providers.map(provider => provider.id);

test('a provider registered before the first library load is still registered after it', async () => {
  const { state, runtime } = setup();
  const provider = extension();
  assert.equal(runtime.registerProvider(provider), true);
  await runtime.loadLibrary();

  assert.ok(ids(state).includes('my-extension'), `providers after the load: ${ids(state).join(', ')}`);
  assert.equal(state.providers.find(item => item.id === 'my-extension'), provider, 'the same provider object');
  assert.ok(runtime.providerCandidates(ctx).some(row => row.id === 'my-extension.row'));
  assert.deepEqual(ids(state).slice(0, 2), [STATIC_PROVIDER_ID, 'snippet-templates'], 'the built-in providers come first, in their order');
  assert.equal(ids(state)[ids(state).length - 1], 'my-extension');
  assert.equal(state.providerStats['my-extension'].calls, 1);
  assert.equal(state.providerStats['my-extension'].lastCount, 1);
});

test('a later index build keeps it too, once, and does not duplicate the built-in providers', async () => {
  const { state, runtime } = setup();
  await runtime.loadLibrary();
  const builtIn = ids(state);
  runtime.registerProvider(extension('late-extension'));
  runtime.registerProvider(extension('other-extension'));
  runtime.buildIndex();
  runtime.buildIndex();
  assert.deepEqual(ids(state), [...builtIn, 'late-extension', 'other-extension']);
  assert.equal(new Set(ids(state)).size, ids(state).length);
});

test('a provider that uses the id of a built-in provider does not replace it at the build', async () => {
  const { state, runtime } = setup();
  const impostor = extension(HACS_CATALOG_PROVIDER_ID);
  runtime.registerProvider(impostor);
  await runtime.loadLibrary();
  assert.equal(ids(state).filter(id => id === HACS_CATALOG_PROVIDER_ID).length, 1);
  assert.notEqual(state.providers.find(item => item.id === HACS_CATALOG_PROVIDER_ID), impostor, 'the built-in catalog provider is the one registered');
});

test('buildIndex without a provider list registers the built-in providers, and without registerProvider none', () => {
  const noList = { library: { packs: {} }, completionCache: new Map() };
  buildIndex({ state: noList, registerProvider: provider => { noList.providers.push(provider); } });
  assert.deepEqual(noList.providers.map(provider => provider.id), [STATIC_PROVIDER_ID, HACS_CATALOG_PROVIDER_ID]);

  const noRegister = { library: { packs: {} }, completionCache: new Map(), providers: [extension()] };
  buildIndex({ state: noRegister });
  assert.deepEqual(noRegister.providers, [], 'nothing can be registered without registerProvider');
});
