// Coexistence matrix. The four cells, asserted on
// the shared dormancy/activation logic (companionLayerStatus / companionModuleDormant
// / companionLayerActive) and the input-quiet guard, with the coordinator's external-
// descriptor signal and the force-dormant kill switch driving each cell.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  installRuntimeCoordinator,
  companionLayerStatus,
  companionModuleDormant,
  companionLayerActive,
  INTERNAL_COORDINATOR_DESCRIPTOR_ID,
  COMPANION_FORCE_DORMANT_KEY,
} from '../../src/companion/coordinatorRuntime.js';
import { createInputQuietRuntime } from '../../src/companion/inputQuietRuntime.js';

const noStorage = { getItem: () => null };
const dormantStorage = { getItem: (k) => (k === COMPANION_FORCE_DORMANT_KEY ? 'dormant' : null) };

function globalWith(descriptors) {
  const g = {};
  for (const d of descriptors) installRuntimeCoordinator(d, { globalRef: g });
  return g;
}

const internalDescriptor = { id: INTERNAL_COORDINATOR_DESCRIPTOR_ID, role: 'completion-runtime' };

test('CELL 1 — external v17 present: scrollbar+enlarge dormant, diagnostics "external"', () => {
  const g = globalWith([internalDescriptor, { id: 'v17-editor-bridge', role: 'editor-layout-runtime' }]);
  assert.equal(companionLayerStatus({ globalRef: g, storage: noStorage }), 'external');
  assert.equal(companionModuleDormant({ globalRef: g, storage: noStorage }), true);
  // even with a shipped-active default, an external owner keeps the absorbed layer off
  assert.equal(companionLayerActive({ globalRef: g, storage: noStorage, shippedDefault: true }), false);
});

test('CELL 2 — external picker-safe present: input-quiet defers to shared state, picker fix dormant', () => {
  const g = globalWith([internalDescriptor, { id: 'picker-safe', role: 'picker-companion-runtime' }]);
  assert.equal(companionLayerStatus({ globalRef: g, storage: noStorage }), 'external');
  assert.equal(companionModuleDormant({ globalRef: g, storage: noStorage }), true);
  assert.equal(companionLayerActive({ globalRef: g, storage: noStorage, shippedDefault: true }), false, 'picker fix dormant under external');
  // the absorbed input-quiet guard yields "no deferral" (defers to the external picker-safe
  // owning the shared coordinator quiet channel) — provably a pass-through.
  const quiet = createInputQuietRuntime({ globalRef: g, storage: noStorage });
  quiet.markEditorInputQuiet('typing');
  assert.equal(quiet.deferDuringTyping('x', () => {}), false, 'guard pass-through while external owns the layer');
});

test('CELL 3 — both absent: internal (active subject to the shipped default / force-active flag)', () => {
  const g = globalWith([internalDescriptor]); // only the internal runtime registered
  assert.equal(companionLayerStatus({ globalRef: g, storage: noStorage }), 'internal');
  assert.equal(companionModuleDormant({ globalRef: g, storage: noStorage }), false);
  // not dormant, but gated by each module's shipped default
  assert.equal(companionLayerActive({ globalRef: g, storage: noStorage, shippedDefault: false }), false, 'shipped dormant by default');
  assert.equal(companionLayerActive({ globalRef: g, storage: noStorage, shippedDefault: true }), true, 'active once the default is flipped');
  // the force-active escape hatch activates regardless of the shipped default
  const forceActive = { getItem: (k) => (k === COMPANION_FORCE_DORMANT_KEY ? 'active' : null) };
  assert.equal(companionLayerActive({ globalRef: g, storage: forceActive, shippedDefault: false }), true, 'force-active flag');
});

test('CELL 4 — force-dormant flag: everything dormant regardless of presence or shipped default', () => {
  for (const descriptors of [[internalDescriptor], [internalDescriptor, { id: 'v17-editor-bridge', role: 'editor-layout-runtime' }]]) {
    const g = globalWith(descriptors);
    assert.equal(companionLayerStatus({ globalRef: g, storage: dormantStorage }), 'dormant(forced)');
    assert.equal(companionModuleDormant({ globalRef: g, storage: dormantStorage }), true);
    assert.equal(companionLayerActive({ globalRef: g, storage: dormantStorage, shippedDefault: true }), false);
  }
});
