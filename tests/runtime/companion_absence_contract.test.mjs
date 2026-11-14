import test from 'node:test';
import assert from 'node:assert/strict';

import { runPublicRuntimeContract } from '../../tools/public_runtime_contract_runner.mjs';

// Companion absence-proof (steward P4): the contract runner boots the built
// dist with NO pre-existing coordinator global, NO v17 editor bridge, and NO
// picker-safe companion loaded. These tests pin exactly what was observed on
// the unmodified runtime (reports/COMPANION_ABSENCE_OBSERVATION.txt):
// boot does not crash, the console carries exactly the one ready banner,
// diagnostics tell the truth about being alone, and zero runtime errors are
// recorded. This documents reality; it does not improve it.

const result = await runPublicRuntimeContract();
const api = globalThis.__nostrodomus;

test('runtime boots without companions: no crash, public contract intact', () => {
  assert.equal(result.ok, true);
  assert.ok(api, 'window.__nostrodomus installed');
  assert.equal(result.contract.preferredApi, true);
});

test('console output without companions is exactly the one ready banner', () => {
  // Observed: a single info-level "✦ NOSTRODOMUS   v<version>   ready" line,
  // zero warn/error/debug output. Pin the observed truth.
  assert.equal(result.runtimeLogs.length, 1);
  assert.equal(result.runtimeLogs[0].level, 'info');
  assert.match(result.runtimeLogs[0].message, /NOSTRODOMUS\s+v\d+\.\d+\.\d+\s+ready/);
  assert.deepEqual(result.runtimeLogs.filter(l => l.level === 'warn' || l.level === 'error'), []);
});

test('diagnostics are truthful about companion absence', () => {
  const health = api.health();
  assert.equal(health.requiredOk, true, 'all required health checks pass without companions');
  for (const check of health.checks) {
    if (check.severity === 'required') assert.equal(check.ok, true, `required check ${check.name}`);
  }

  // The main runtime installs its own coordinator and is the only registrant —
  // no phantom companion entries.
  const coordinator = globalThis.__nostrodomusRuntimeCoordinatorV1;
  assert.ok(coordinator, 'main runtime installs the coordinator when none exists');
  const debug = api.debug();
  assert.equal(debug.runtimeCoordinator.available, true);
  assert.equal(debug.runtimeCoordinator.version, 'nostrodomus-runtime-coordinator-v1');
  assert.deepEqual(
    debug.runtimeCoordinator.runtimes.map(r => r.id),
    ['main-completion-runtime'],
    'coordinator truthfully lists only the main runtime',
  );
});

test('no runtime errors are recorded when companions are absent', () => {
  const errors = api.runtimeErrors();
  assert.equal(errors.ok, true);
  assert.equal(errors.items.length, 0);
  assert.equal(errors.stats.total, 0);
});
