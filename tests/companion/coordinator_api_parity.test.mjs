// ABSORB P0b — runtime coordinator API parity golden baseline. FROZEN.
//
// D-COEXIST rides on the __nostrodomusRuntimeCoordinatorV1 global keeping the EXACT
// same shape and version handshake, so an externally-loaded legacy companion and
// the absorbed module interoperate. This test freezes that shape: the api key set,
// each key's typeof, the state object's key set, and the counter names — captured
// from a verbatim transplant of the (byte-identical-across-both-companions)
// installer. A faithfulness guard proves the transplant has not drifted from the
// frozen source. When src/companion/coordinatorRuntime.js lands (P1), this same
// unmodified test asserts the absorbed module produces the identical surface.
// Do NOT modify this file during the ABSORB order.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { __nostrodomusInstallRuntimeCoordinatorV1 } from './_fixtures/coordinatorInstaller.fixture.mjs';
import {
  readCompanion,
  V17_PATH,
  PICKER_PATH,
  extractInstallerSource,
  absorbedModuleExists,
  absorbedModulePath,
} from './_fixtures/companionSource.mjs';

const COORDINATOR_KEY = '__nostrodomusRuntimeCoordinatorV1';
const VERSION_ID = 'nostrodomus-runtime-coordinator-v1';

const API_SURFACE = Object.freeze([
  'isQuiet', 'markQuiet', 'noteSuppression', 'now', 'register', 'remaining', 'snapshot', 'state', 'version',
]);
const API_TYPEOFS = Object.freeze({
  isQuiet: 'function', markQuiet: 'function', noteSuppression: 'function', now: 'function',
  register: 'function', remaining: 'function', snapshot: 'function', state: 'object', version: 'string',
});
const STATE_KEYS = Object.freeze(['counters', 'installedAt', 'quietWindows', 'runtimes']);
const COUNTER_KEYS = Object.freeze(['quietMarks', 'registered', 'suppressions']);

function withCleanGlobal(fn) {
  const prior = globalThis[COORDINATOR_KEY];
  delete globalThis[COORDINATOR_KEY];
  try {
    return fn();
  } finally {
    if (prior === undefined) delete globalThis[COORDINATOR_KEY];
    else globalThis[COORDINATOR_KEY] = prior;
  }
}

function assertFrozenSurface(api, label) {
  assert.deepEqual(Object.keys(api).sort(), [...API_SURFACE], `${label}: api key set`);
  for (const key of API_SURFACE) {
    assert.equal(typeof api[key], API_TYPEOFS[key], `${label}: typeof api.${key}`);
  }
  assert.equal(api.version, VERSION_ID, `${label}: version handshake`);
  assert.deepEqual(Object.keys(api.state).sort(), [...STATE_KEYS], `${label}: state key set`);
  assert.deepEqual(Object.keys(api.state.counters).sort(), [...COUNTER_KEYS], `${label}: counter names`);
}

test('coordinator (transplant copy) exposes the exact frozen api + state surface', () => {
  withCleanGlobal(() => {
    const api = __nostrodomusInstallRuntimeCoordinatorV1({ id: 'parity-test', role: 'test', version: 'x' });
    assertFrozenSurface(api, 'transplant');
  });
});

test('coordinator installer is byte-identical across both companions and the transplant fixture', () => {
  const fromV17 = extractInstallerSource(readCompanion(V17_PATH));
  const fromPicker = extractInstallerSource(readCompanion(PICKER_PATH));
  assert.equal(fromV17, fromPicker, 'v17 and picker-safe installers must be byte-identical');

  const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '_fixtures', 'coordinatorInstaller.fixture.mjs');
  const fromFixture = extractInstallerSource(readFileSync(fixturePath, 'utf8'));
  assert.equal(fromFixture, fromV17, 'transplant fixture must not drift from frozen companion source');
});

// --- Absorbed-module parity ---
// CONTRACT for src/companion/coordinatorRuntime.js: export
// `installRuntimeCoordinator(descriptor = {})` that installs onto globalThis and
// returns the api with the identical frozen surface + version handshake.
const COORDINATOR_MODULE = 'coordinatorRuntime.js';
test('absorbed coordinator module produces the identical frozen surface', async () => {
  assert.ok(absorbedModuleExists(COORDINATOR_MODULE), `src/companion/${COORDINATOR_MODULE} is missing — the absorb landed at v0.1.136 and this module is load-bearing; fix the move/rename, never skip`);
  const mod = await import(absorbedModulePath(COORDINATOR_MODULE));
  assert.equal(typeof mod.installRuntimeCoordinator, 'function', 'module must export installRuntimeCoordinator()');
  withCleanGlobal(() => {
    const api = mod.installRuntimeCoordinator({ id: 'parity-test', role: 'test', version: 'x' });
    assertFrozenSurface(api, 'absorbed');
    assert.equal(globalThis[COORDINATOR_KEY], api, 'absorbed installer must publish the global handshake');
  });
});
