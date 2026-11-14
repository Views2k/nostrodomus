import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  providerCandidatesLegacy,
  providerDiagnosticId as providerDiagnosticIdFromRegistryModule,
  providerTimeoutBudgetMs as providerTimeoutBudgetMsFromRegistryModule,
  validateProviderRow as validateProviderRowFromRegistryModule,
  validateProviderRows as validateProviderRowsFromRegistryModule,
} from '../../src/providers/providerRegistry.js';
import {
  boundedRuntimeErrorString,
  safeRuntimeErrorDetail,
} from '../../src/core/diagnostics.js';

const root = process.cwd();
const runtime = readFileSync(join(root, 'src/main.legacy.js'), 'utf8');
const telemetryRuntime = readFileSync(join(root, 'src/diagnostics/telemetryRuntime.js'), 'utf8');
const providerRuntime = readFileSync(join(root, 'src/providers/providerRuntime.js'), 'utf8');
const mainLegacyAdapters = readFileSync(join(root, 'src/composition/mainLegacyAdapters.js'), 'utf8');

test('registry and diagnostics keep their contract exports callable', () => {
  // These imports were previously implicit existence checks (unused bindings);
  // assert them explicitly so the contract is visible and lint-clean.
  const contractExports = {
    providerDiagnosticIdFromRegistryModule,
    providerTimeoutBudgetMsFromRegistryModule,
    validateProviderRowFromRegistryModule,
    validateProviderRowsFromRegistryModule,
    boundedRuntimeErrorString,
    safeRuntimeErrorDetail,
  };
  for (const [name, fn] of Object.entries(contractExports)) {
    assert.equal(typeof fn, 'function', `${name} must remain an exported function`);
  }
});

function createFallbackHarness({ nowValues = [0, 1], localStorageValue = null } = {}) {
  const errors = [];
  const state = {
    settings: { triggerMode: 'auto', enabledLangs: { yaml: true } },
    providers: [],
    providerStats: {},
  };
  const limits = Object.freeze({
    maxRowsPerPack: 2000,
    defaultProviderTimeoutMs: 8,
    maxProviderTimeoutMs: 120,
    maxProviderMalformedDiagnostics: 5,
  });
  const deps = {
    now: () => nowValues.length ? nowValues.shift() : 1,
    providerEnabled: () => true,
    limits,
    recordRuntimeError(scope, err, detail = null) {
      errors.push({ scope, message: String(err?.message || err), detail });
      return errors.at(-1);
    },
    recordRuntimeErrorOnce(scope, err, detail = null) {
      errors.push({ scope, message: String(err?.message || err), detail });
      return errors.at(-1);
    },
  };
  void localStorageValue;
  return {
    state,
    errors,
    providerCandidatesLegacy(ctx) {
      return providerCandidatesLegacy(ctx, state, deps);
    },
  };
}

const validRow = Object.freeze({
  id: 'test.valid',
  lang: 'yaml',
  type: 'key',
  label: 'name:',
  insert: 'name: ',
  source: 'test-provider',
  aliases: [],
  meta: { family: 'test' },
});
const ctx = Object.freeze({ shouldSuggest: true, triggerKind: 'typing', lang: 'yaml' });

test('runtime provider registry is wired through the provider runtime owner with legacy fallback', () => {
  assert.match(runtime, /import \{\s*createProviderRuntime\s*\} from ['"]\.\/providers\/providerRuntime\.js['"]/s);
  assert.match(runtime, /const PROVIDER_SETTINGS_META = providerRuntime\.PROVIDER_SETTINGS_META;/);
  assert.match(providerRuntime, /import \* as registry from ['"]\.\/providerRegistry\.js['"]/);
  assert.match(providerRuntime, /return registry\.registerProvider\(provider, state\);/);
  assert.match(providerRuntime, /registry\.providerCandidates\(ctx, state, runtimeProviderRegistryDeps\(\)\)/);
  assert.match(providerRuntime, /registry\.providerCandidatesLegacy\(ctx, state, runtimeProviderRegistryDeps\(\)\)/);
  assert.match(runtime, /const \{ providerCandidates \} = createMainLegacyProviderAdapters\(\{/);
  assert.match(mainLegacyAdapters, /return providerRuntime\.providerCandidates\(ctx\);/);
  assert.match(mainLegacyAdapters, /return providerRuntime\.providerCandidatesLegacy\(ctx\);/);
  assert.match(telemetryRuntime, /ctx\.providerSummary\(state, \{/);
  assert.match(telemetryRuntime, /return providerSummaryLegacy\(\);/);
  assert.match(runtime, /providerSummary: providerRegistry\.providerSummary/);
});

test('legacy fallback provider canHandle throw is isolated and later providers still contribute', () => {
  const h = createFallbackHarness();
  h.state.providers = [
    { id: 'bad-can-handle', label: 'Bad gate', canHandle() { throw new Error('gate broke'); }, provide() { return [validRow]; } },
    { id: 'good', label: 'Good', canHandle() { return true; }, provide() { return [validRow]; } },
  ];
  const rows = h.providerCandidatesLegacy(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.equal(h.errors[0].scope, 'provider:bad-can-handle:canHandle');
});

test('legacy fallback provider provide throw is isolated and later providers still contribute', () => {
  const h = createFallbackHarness();
  h.state.providers = [
    { id: 'bad-provide', label: 'Bad provide', canHandle() { return true; }, provide() { throw new Error('provide broke'); } },
    { id: 'good', label: 'Good', provide() { return [validRow]; } },
  ];
  const rows = h.providerCandidatesLegacy(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.equal(h.errors[0].scope, 'provider:bad-provide:provide');
});

test('provider stats.error is cleared once the provider recovers', () => {
  const h = createFallbackHarness();
  let broken = true;
  h.state.providers = [
    { id: 'recovering', label: 'Recovering', canHandle() { return true; }, provide() { if (broken) throw new Error('transient outage'); return [validRow]; } },
  ];
  h.providerCandidatesLegacy(ctx);
  assert.equal(h.state.providerStats.recovering.error, 'transient outage', 'error recorded on failure');
  broken = false; // the provider recovers
  h.providerCandidatesLegacy(ctx);
  assert.equal(h.state.providerStats.recovering.error, '', 'stale error cleared once provide() succeeds');
  assert.equal(h.state.providerStats.recovering.lastCount, 1, 'a recovered call still reports its row count');
});

test('legacy fallback provider exceeding timeout budget keeps its rows and is recorded as slow', () => {
  const h = createFallbackHarness({ nowValues: [0, 9, 9, 10] });
  h.state.providers = [
    { id: 'slow', label: 'Slow', timeoutMs: 8, provide() { return [validRow]; } },
    { id: 'good', label: 'Good', provide() { return [validRow]; } },
  ];
  const rows = h.providerCandidatesLegacy(ctx);
  assert.equal(rows.length, 2);
  assert.equal(h.errors[0].scope, 'provider:slow:timeout');
});

test('legacy fallback malformed provider rows are filtered without dropping valid rows', () => {
  const h = createFallbackHarness();
  h.state.providers = [
    { id: 'mixed', label: 'Mixed rows', provide() { return [validRow, { id: 'missing-label', lang: 'yaml', type: 'key', insert: 'x' }, null]; } },
  ];
  const rows = h.providerCandidatesLegacy(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.ok(h.errors.some(e => e.scope === 'provider:mixed:row'));
});

test('legacy fallback non-array provider return is dropped with a diagnostic', () => {
  const h = createFallbackHarness();
  h.state.providers = [
    { id: 'non-array', label: 'Non array', provide() { return { rows: [validRow] }; } },
    { id: 'good', label: 'Good', provide() { return [validRow]; } },
  ];
  const rows = h.providerCandidatesLegacy(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.equal(h.errors[0].scope, 'provider:non-array:rows');
});
