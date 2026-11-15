import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import { runPublicRuntimeContract } from '../../tools/public_runtime_contract_runner.mjs';

const PROJECT = JSON.parse(readFileSync(new URL('../../PROJECT.json', import.meta.url), 'utf8'));

test('the built dist exposes the public Nostrodomus runtime contract', async () => {
  const result = await runPublicRuntimeContract();
  assert.equal(result.ok, true);
  assert.match(result.contract.version, new RegExp(`^nostrodomus-v${PROJECT.version.replaceAll('.', '\\.')}-.+`));
  assert.equal(result.contract.preferredApi, true);
  for (const method of ['debug', 'health', 'performanceStats', 'runtimeErrors', 'clientCapabilities', 'settings', 'resetSettings', 'uninstall']) {
    assert.equal(result.contract.methods[method], true, `${method} method exists`);
  }
  for (const providerId of ['static-library', 'snippet-templates', 'lovelace-context', 'ha-runtime-values']) {
    assert.ok(result.contract.providers.includes(providerId), `provider ${providerId} is registered`);
  }
  assert.ok(!result.contract.diagnosticsGlobals.some(key => key !== '__nostrodomus' && key !== '__nostrodomusRuntimeCoordinatorV1'));
  assert.ok(result.contract.counts.libraryPackCount >= 1);
  assert.ok(result.contract.counts.indexKeyCount >= 1);
  assert.equal(result.contract.counts.runtimeErrorCount, 0);
  assert.match(result.contractHash, /^[a-f0-9]{64}$/);
});
