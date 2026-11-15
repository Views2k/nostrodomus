// Coexistence matrix: the four cases of the built-in companion layer next to the external companion
// scripts, checked on the shared dormancy logic (companionLayerStatus, companionModuleDormant,
// companionLayerActive) and the input-quiet guard. The coordinator's external descriptors and the
// force-dormant switch select each case.

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

test('case 1, external v17 present: scrollbar and enlarge dormant, diagnostics "external"', () => {
  const g = globalWith([internalDescriptor, { id: 'v17-editor-bridge', role: 'editor-layout-runtime' }]);
  assert.equal(companionLayerStatus({ globalRef: g, storage: noStorage }), 'external');
  assert.equal(companionModuleDormant({ globalRef: g, storage: noStorage }), true);
  // Even with the shipped default on, an external owner keeps the built-in layer off.
  assert.equal(companionLayerActive({ globalRef: g, storage: noStorage, shippedDefault: true }), false);
});

test('case 2, external picker-safe present: input-quiet defers to the shared state, picker fix dormant', () => {
  const g = globalWith([internalDescriptor, { id: 'picker-safe', role: 'picker-companion-runtime' }]);
  assert.equal(companionLayerStatus({ globalRef: g, storage: noStorage }), 'external');
  assert.equal(companionModuleDormant({ globalRef: g, storage: noStorage }), true);
  assert.equal(companionLayerActive({ globalRef: g, storage: noStorage, shippedDefault: true }), false, 'picker fix dormant under external');
  // The built-in input-quiet guard defers nothing: the external picker-safe owns the shared
  // coordinator quiet channel, so the guard passes everything through.
  const quiet = createInputQuietRuntime({ globalRef: g, storage: noStorage });
  quiet.markEditorInputQuiet('typing');
  assert.equal(quiet.deferDuringTyping('x', () => {}), false, 'guard pass-through while external owns the layer');
});

test('case 3, both absent: internal, active when the shipped default or the force-active flag says so', () => {
  const g = globalWith([internalDescriptor]); // only the internal runtime registered
  assert.equal(companionLayerStatus({ globalRef: g, storage: noStorage }), 'internal');
  assert.equal(companionModuleDormant({ globalRef: g, storage: noStorage }), false);
  // Not dormant, but each module's shipped default decides.
  assert.equal(companionLayerActive({ globalRef: g, storage: noStorage, shippedDefault: false }), false, 'off when the shipped default is off');
  assert.equal(companionLayerActive({ globalRef: g, storage: noStorage, shippedDefault: true }), true, 'on when the shipped default is on');
  // The force-active flag turns it on whatever the shipped default is.
  const forceActive = { getItem: (k) => (k === COMPANION_FORCE_DORMANT_KEY ? 'active' : null) };
  assert.equal(companionLayerActive({ globalRef: g, storage: forceActive, shippedDefault: false }), true, 'force-active flag');
});

test('case 4, force-dormant flag: everything dormant whatever is present and whatever the shipped default', () => {
  for (const descriptors of [[internalDescriptor], [internalDescriptor, { id: 'v17-editor-bridge', role: 'editor-layout-runtime' }]]) {
    const g = globalWith(descriptors);
    assert.equal(companionLayerStatus({ globalRef: g, storage: dormantStorage }), 'dormant(forced)');
    assert.equal(companionModuleDormant({ globalRef: g, storage: dormantStorage }), true);
    assert.equal(companionLayerActive({ globalRef: g, storage: dormantStorage, shippedDefault: true }), false);
  }
});
