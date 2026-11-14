import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installRuntimeCoordinator } from '../../src/core/runtimeCoordinator.js';
import {
  COMPANION_FORCE_DORMANT_KEY,
  COMPANION_OVERRIDE_CACHE_MS,
  companionLayerActive,
  companionModuleDormant,
  invalidateCompanionOverrideCache,
  isExternalCompanionPresent,
  isForceDormant,
  onCompanionOverrideStorageEvent,
} from '../../src/companion/coordinatorRuntime.js';

// The dormancy check runs on every pointerdown and focusin (the picker fix, which ships dormant),
// on every observed mutation (the settle engine) and on every deferred refresh. Each call read
// localStorage, twice for a module that can be forced active, and built a full coordinator
// snapshot to look at the registered runtimes.

function countingStorage(initial = null) {
  const store = { value: initial, reads: 0, getItem(key) { store.reads += 1; return key === COMPANION_FORCE_DORMANT_KEY ? store.value : null; } };
  return store;
}

function coordinatorGlobal() {
  const g = {};
  const coordinator = installRuntimeCoordinator(g, { id: 'main-completion-runtime', role: 'completion-runtime' });
  let snapshots = 0;
  const snapshot = coordinator.snapshot;
  coordinator.snapshot = () => { snapshots += 1; return snapshot(); };
  return { g, coordinator, snapshots: () => snapshots };
}

test('a burst of dormancy checks reads the override key once and builds no snapshot', () => {
  invalidateCompanionOverrideCache();
  const { g, snapshots } = coordinatorGlobal();
  const storage = countingStorage(null);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(companionModuleDormant({ globalRef: g, storage }), false);
    assert.equal(companionLayerActive({ globalRef: g, storage, shippedDefault: false }), false);
    assert.equal(companionLayerActive({ globalRef: g, storage, shippedDefault: true }), true);
  }
  assert.equal(storage.reads, 1, 'one storage read for 150 checks');
  assert.equal(snapshots(), 0, 'no coordinator snapshot');
});

test('an external companion that registers later is seen by the next check', () => {
  invalidateCompanionOverrideCache();
  const { g, coordinator, snapshots } = coordinatorGlobal();
  const storage = countingStorage(null);
  assert.equal(isExternalCompanionPresent({ globalRef: g }), false);
  assert.equal(companionModuleDormant({ globalRef: g, storage }), false);
  coordinator.register({ id: 'v17-editor-bridge', role: 'editor-layout-runtime' });
  assert.equal(isExternalCompanionPresent({ globalRef: g }), true, 'no cache between the registration and the check');
  assert.equal(companionModuleDormant({ globalRef: g, storage }), true);
  assert.equal(companionLayerActive({ globalRef: g, storage, shippedDefault: true }), false);
  assert.equal(snapshots(), 0);
});

test('a coordinator that only offers snapshot() is still read', () => {
  const g = { __nostrodomusRuntimeCoordinatorV1: { snapshot: () => ({ runtimes: [{ id: 'picker-safe', role: 'picker-companion-runtime' }] }) } };
  assert.equal(isExternalCompanionPresent({ globalRef: g }), true);
  const internalOnly = { __nostrodomusRuntimeCoordinatorV1: { snapshot: () => ({ runtimes: [{ id: 'main-completion-runtime', role: 'completion-runtime' }] }) } };
  assert.equal(isExternalCompanionPresent({ globalRef: internalOnly }), false);
});

test('the storage event applies a change of the override at once, in both directions', () => {
  invalidateCompanionOverrideCache();
  const { g } = coordinatorGlobal();
  const storage = countingStorage(null);
  assert.equal(isForceDormant({ storage }), false);
  assert.equal(companionLayerActive({ globalRef: g, storage, shippedDefault: true }), true);

  storage.value = 'dormant';
  onCompanionOverrideStorageEvent({ key: COMPANION_FORCE_DORMANT_KEY, newValue: 'dormant' });
  assert.equal(isForceDormant({ storage }), true, 'forced dormant after the event');
  assert.equal(companionModuleDormant({ globalRef: g, storage }), true);
  assert.equal(companionLayerActive({ globalRef: g, storage, shippedDefault: true }), false);

  storage.value = null;
  onCompanionOverrideStorageEvent({ key: COMPANION_FORCE_DORMANT_KEY, newValue: null });
  assert.equal(isForceDormant({ storage }), false, 'back to the shipped default after the key is removed');
  assert.equal(companionLayerActive({ globalRef: g, storage, shippedDefault: true }), true);

  storage.value = 'active';
  onCompanionOverrideStorageEvent({ key: null }); // localStorage.clear() and re-set report no single key
  assert.equal(companionLayerActive({ globalRef: g, storage, shippedDefault: false }), true, 'forced active');

  storage.value = null;
  invalidateCompanionOverrideCache(); // what code that writes the key itself calls
  assert.equal(companionLayerActive({ globalRef: g, storage, shippedDefault: false }), false, 'shipped default again');
});

test('a storage event for another key does not drop the cached override', () => {
  invalidateCompanionOverrideCache();
  const storage = countingStorage(null);
  isForceDormant({ storage });
  onCompanionOverrideStorageEvent({ key: 'nostrodomus.settings', newValue: '{}' });
  isForceDormant({ storage });
  assert.equal(storage.reads, 1);
});

test('a change made in the same tab applies when the cached value is older than the cache time', () => {
  invalidateCompanionOverrideCache();
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  try {
    const storage = countingStorage(null);
    assert.equal(isForceDormant({ storage }), false);
    storage.value = 'dormant'; // typed into the console: no storage event in the same tab
    mock.timers.tick(COMPANION_OVERRIDE_CACHE_MS - 1);
    assert.equal(isForceDormant({ storage }), false, 'still the cached value');
    mock.timers.tick(1);
    assert.equal(isForceDormant({ storage }), true, 'read again after the cache time');
    storage.value = null;
    mock.timers.tick(COMPANION_OVERRIDE_CACHE_MS);
    assert.equal(isForceDormant({ storage }), false, 'and back');
    assert.equal(storage.reads, 3);
  } finally {
    mock.timers.reset();
  }
});

test('each storage object has its own cached value, and a failing read is not cached', () => {
  invalidateCompanionOverrideCache();
  const dormant = countingStorage('dormant');
  const plain = countingStorage(null);
  assert.equal(isForceDormant({ storage: dormant }), true);
  assert.equal(isForceDormant({ storage: plain }), false);
  assert.equal(isForceDormant({ storage: dormant }), true);
  let denied = 0;
  const failing = { getItem() { denied += 1; throw new Error('denied'); } };
  assert.equal(isForceDormant({ storage: failing }), false);
  assert.equal(isForceDormant({ storage: failing }), false);
  assert.equal(denied, 2, 'no value was cached for a read that threw');
});

test('main registers the storage listener that drops the cached override', () => {
  const main = readFileSync(new URL('../../src/main.legacy.js', import.meta.url), 'utf8');
  assert.match(main, /addPersistentListener\(W, "storage", onCompanionOverrideStorageEvent, false, "companion-override-storage"\);/);
});
