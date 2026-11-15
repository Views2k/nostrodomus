// Coordinator dedupe + companion coexistence/dormancy signal.
// (The frozen api-surface parity is asserted by coordinator_api_parity.test.mjs;
// this covers install-order convergence and the detection/dormancy layer.)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  installRuntimeCoordinator,
  isForceDormant,
  isExternalCompanionPresent,
  companionLayerStatus,
  companionModuleDormant,
  COMPANION_FORCE_DORMANT_KEY,
  COMPANION_FORCE_DORMANT_VALUE,
  INTERNAL_COORDINATOR_DESCRIPTOR_ID,
} from '../../src/companion/coordinatorRuntime.js';

const forceDormantStorage = {
  getItem: (k) => (k === COMPANION_FORCE_DORMANT_KEY ? COMPANION_FORCE_DORMANT_VALUE : null),
};
const emptyStorage = { getItem: () => null };

test('install-order independence: external-first and internal-first converge to one coordinator', () => {
  // internal first, then external registers
  const gA = {};
  const a1 = installRuntimeCoordinator({ id: INTERNAL_COORDINATOR_DESCRIPTOR_ID, role: 'completion-runtime' }, { globalRef: gA });
  const a2 = installRuntimeCoordinator({ id: 'v17-editor-bridge', role: 'editor-layout-runtime' }, { globalRef: gA });
  assert.equal(a1, a2, 'second install must return the same coordinator instance');
  assert.equal(gA.__nostrodomusRuntimeCoordinatorV1, a1, 'one coordinator published');
  const idsA = a1.snapshot().runtimes.map((r) => r.id).sort();
  assert.deepEqual(idsA, ['main-completion-runtime', 'v17-editor-bridge'], 'both descriptors registered');

  // external first, then internal registers
  const gB = {};
  const b1 = installRuntimeCoordinator({ id: 'picker-safe', role: 'picker-companion-runtime' }, { globalRef: gB });
  const b2 = installRuntimeCoordinator({ id: INTERNAL_COORDINATOR_DESCRIPTOR_ID, role: 'completion-runtime' }, { globalRef: gB });
  assert.equal(b1, b2, 'converges regardless of order');
  assert.deepEqual(b1.snapshot().runtimes.map((r) => r.id).sort(), ['main-completion-runtime', 'picker-safe']);
});

test('isExternalCompanionPresent reflects only external descriptors', () => {
  const g = {};
  installRuntimeCoordinator({ id: INTERNAL_COORDINATOR_DESCRIPTOR_ID, role: 'completion-runtime' }, { globalRef: g });
  assert.equal(isExternalCompanionPresent({ globalRef: g }), false, 'internal-only is not external');
  installRuntimeCoordinator({ id: 'v17-editor-bridge', role: 'editor-layout-runtime' }, { globalRef: g });
  assert.equal(isExternalCompanionPresent({ globalRef: g }), true, 'an external descriptor flips it on');
});

test('isExternalCompanionPresent matches by role too, and is false without a coordinator', () => {
  const g = {};
  installRuntimeCoordinator({ id: 'some-future-picker', role: 'picker-companion-runtime' }, { globalRef: g });
  assert.equal(isExternalCompanionPresent({ globalRef: g }), true, 'role match counts');
  assert.equal(isExternalCompanionPresent({ globalRef: {} }), false, 'no coordinator -> not external');
});

test('isForceDormant reads the dormant override from storage and is false when storage cannot be read', () => {
  assert.equal(isForceDormant({ storage: forceDormantStorage }), true);
  assert.equal(isForceDormant({ storage: emptyStorage }), false);
  assert.equal(isForceDormant({ storage: { getItem() { throw new Error('denied'); } } }), false);
});

test('companionLayerStatus precedence: forced > external > internal', () => {
  const internalOnly = {};
  installRuntimeCoordinator({ id: INTERNAL_COORDINATOR_DESCRIPTOR_ID, role: 'completion-runtime' }, { globalRef: internalOnly });
  assert.equal(companionLayerStatus({ globalRef: internalOnly, storage: emptyStorage }), 'internal');

  const external = {};
  installRuntimeCoordinator({ id: 'picker-safe', role: 'picker-companion-runtime' }, { globalRef: external });
  assert.equal(companionLayerStatus({ globalRef: external, storage: emptyStorage }), 'external');

  // forced wins even when an external companion is present
  assert.equal(companionLayerStatus({ globalRef: external, storage: forceDormantStorage }), 'dormant(forced)');
});

test('companionModuleDormant is true when forced or external, false for internal-only', () => {
  const internalOnly = {};
  installRuntimeCoordinator({ id: INTERNAL_COORDINATOR_DESCRIPTOR_ID, role: 'completion-runtime' }, { globalRef: internalOnly });
  assert.equal(companionModuleDormant({ globalRef: internalOnly, storage: emptyStorage }), false);
  assert.equal(companionModuleDormant({ globalRef: internalOnly, storage: forceDormantStorage }), true);

  const external = {};
  installRuntimeCoordinator({ id: 'v17-editor-bridge', role: 'editor-layout-runtime' }, { globalRef: external });
  assert.equal(companionModuleDormant({ globalRef: external, storage: emptyStorage }), true);
});
