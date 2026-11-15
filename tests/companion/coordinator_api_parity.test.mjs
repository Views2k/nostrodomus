// Runtime coordinator API parity golden baseline.
//
// The external companion scripts and the built-in companion module work together through the
// __nostrodomusRuntimeCoordinatorV1 global, so its shape and version handshake must stay exactly
// the same. This test freezes that shape (the api keys, each key's typeof, the state keys and the
// counter names), taken from a verbatim copy of the installer, which is byte-identical in both
// companions. A second test checks that the copy matches the frozen source, and a third that
// src/companion/coordinatorRuntime.js produces the same surface. If it fails, fix the module, not
// this file.

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
  companionModuleExists,
  companionModuleUrl,
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

test('the coordinator copy exposes the exact frozen api and state surface', () => {
  withCleanGlobal(() => {
    const api = __nostrodomusInstallRuntimeCoordinatorV1({ id: 'parity-test', role: 'test', version: 'x' });
    assertFrozenSurface(api, 'copy');
  });
});

test('the coordinator installer is byte-identical in both companions and the fixture copy', () => {
  const fromV17 = extractInstallerSource(readCompanion(V17_PATH));
  const fromPicker = extractInstallerSource(readCompanion(PICKER_PATH));
  assert.equal(fromV17, fromPicker, 'v17 and picker-safe installers must be byte-identical');

  const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '_fixtures', 'coordinatorInstaller.fixture.mjs');
  const fromFixture = extractInstallerSource(readFileSync(fixturePath, 'utf8'));
  assert.equal(fromFixture, fromV17, 'the fixture copy must not drift from the frozen companion source');
});

// --- Built-in module parity ---
// Contract for src/companion/coordinatorRuntime.js: export
// `installRuntimeCoordinator(descriptor = {})` that installs onto globalThis and
// returns the api with the identical frozen surface + version handshake.
const COORDINATOR_MODULE = 'coordinatorRuntime.js';
test('the built-in coordinator module produces the same frozen surface', async () => {
  assert.ok(companionModuleExists(COORDINATOR_MODULE), `src/companion/${COORDINATOR_MODULE} is missing`);
  const mod = await import(companionModuleUrl(COORDINATOR_MODULE));
  assert.equal(typeof mod.installRuntimeCoordinator, 'function', 'module must export installRuntimeCoordinator()');
  withCleanGlobal(() => {
    const api = mod.installRuntimeCoordinator({ id: 'parity-test', role: 'test', version: 'x' });
    assertFrozenSurface(api, 'built-in');
    assert.equal(globalThis[COORDINATOR_KEY], api, 'the built-in installer must publish the global handshake');
  });
});
