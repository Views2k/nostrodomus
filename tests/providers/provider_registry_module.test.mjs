import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProviderRegistry,
  providerCandidates,
  providerCandidatesLegacy,
  providerDiagnosticId,
  providerSummary,
  providerTimeoutBudgetMs,
  registerProvider,
  validateProviderRow,
  validateProviderRows,
} from '../../src/providers/providerRegistry.js';

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

function harness({ nowValues = [0, 1], providerEnabled = () => true } = {}) {
  const errors = [];
  const registry = createProviderRegistry({
    now: () => nowValues.length ? nowValues.shift() : 1,
    providerEnabled,
    recordRuntimeError(scope, err, detail = null) {
      errors.push({ scope, message: String(err?.message || err), detail });
    },
    recordRuntimeErrorOnce(scope, err, detail = null) {
      errors.push({ scope, message: String(err?.message || err), detail, once: true });
    },
  });
  return { registry, errors };
}

test('registry registers, replaces duplicate ids, and summarizes providers', () => {
  const { registry } = harness();
  assert.equal(registry.registerProvider({ id: 'demo', label: 'Demo', provide() { return [validRow]; } }), true);
  assert.equal(registry.registerProvider({ id: 'demo', label: 'Demo replacement', provide() { return [validRow]; } }), true);
  assert.equal(registry.state.providers.length, 1);
  const rows = registry.providerCandidates(ctx);
  assert.equal(rows.length, 1);
  const summary = registry.providerSummary();
  assert.equal(summary.length, 1);
  assert.equal(summary[0].id, 'demo');
  assert.equal(summary[0].calls, 1);
  assert.equal(summary[0].lastCount, 1);
});

test('provider canHandle throw is isolated and later providers still contribute', () => {
  const { registry, errors } = harness();
  registry.registerProvider({ id: 'bad-can-handle', label: 'Bad gate', canHandle() { throw new Error('gate broke'); }, provide() { return [validRow]; } });
  registry.registerProvider({ id: 'good', label: 'Good', canHandle() { return true; }, provide() { return [validRow]; } });
  const rows = registry.providerCandidates(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.equal(errors[0].scope, 'provider:bad-can-handle:canHandle');
});

test('provider provide throw is isolated and later providers still contribute', () => {
  const { registry, errors } = harness();
  registry.registerProvider({ id: 'bad-provide', label: 'Bad provide', canHandle() { return true; }, provide() { throw new Error('provide broke'); } });
  registry.registerProvider({ id: 'good', label: 'Good', provide() { return [validRow]; } });
  const rows = registry.providerCandidates(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.equal(errors[0].scope, 'provider:bad-provide:provide');
});

test('provider exceeding timeout budget keeps its rows and is recorded as slow', () => {
  // provide() is synchronous: the time is already spent when the budget is checked, so the
  // finished rows are kept. The slow call is still reported for diagnostics.
  const { registry, errors } = harness({ nowValues: [0, 9, 9, 10] });
  registry.registerProvider({ id: 'slow', label: 'Slow', timeoutMs: 8, provide() { return [validRow]; } });
  registry.registerProvider({ id: 'good', label: 'Good', provide() { return [validRow]; } });
  const rows = registry.providerCandidates(ctx);
  assert.equal(rows.length, 2);
  assert.equal(errors[0].scope, 'provider:slow:timeout');
});

test('malformed provider rows are filtered without dropping valid rows', () => {
  const { registry, errors } = harness();
  registry.registerProvider({ id: 'mixed', label: 'Mixed rows', provide() { return [validRow, { id: 'missing-label', lang: 'yaml', type: 'key', insert: 'x' }, null]; } });
  const rows = registry.providerCandidates(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.ok(errors.some(e => e.scope === 'provider:mixed:row'));
});

test('non-array provider return is dropped with a diagnostic', () => {
  const { registry, errors } = harness();
  registry.registerProvider({ id: 'non-array', label: 'Non array', provide() { return { rows: [validRow] }; } });
  registry.registerProvider({ id: 'good', label: 'Good', provide() { return [validRow]; } });
  const rows = registry.providerCandidates(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.equal(errors[0].scope, 'provider:non-array:rows');
});

test('provider disabled gate skips without recording an error', () => {
  const { registry, errors } = harness({ providerEnabled: id => id !== 'disabled' });
  registry.registerProvider({ id: 'disabled', label: 'Disabled', provide() { return [validRow]; } });
  const rows = registry.providerCandidates(ctx);
  assert.deepEqual(rows, []);
  assert.deepEqual(errors, []);
  const summary = registry.providerSummary();
  assert.equal(summary[0].enabled, false);
  assert.equal(summary[0].skipped, true);
});

test('pure exports work without registry factory', () => {
  const state = { settings: { triggerMode: 'auto', enabledLangs: { yaml: true } }, providers: [], providerStats: {} };
  assert.equal(registerProvider({ id: 'direct', label: 'Direct', provide() { return [validRow]; } }, state), true);
  assert.equal(providerDiagnosticId({ id: 'bad id!' }), 'bad-id-');
  assert.equal(providerTimeoutBudgetMs({ timeoutMs: 999 }), 120);
  assert.equal(providerTimeoutBudgetMs({ capabilities: { timeoutMs: 15 } }), 15);
  assert.equal(providerTimeoutBudgetMs({}, { defaultProviderTimeoutMs: 22, maxProviderTimeoutMs: 120 }), 22);
  assert.equal(validateProviderRow(validRow).ok, true);
  assert.equal(validateProviderRows({ id: 'direct' }, [validRow]).length, 1);
  assert.equal(providerCandidates(ctx, state).length, 1);
  assert.equal(providerSummary(state)[0].id, 'direct');
});


test('legacy provider candidate fallback is module-owned and behavior-matched', () => {
  const errors = [];
  const state = {
    settings: { triggerMode: 'auto', enabledLangs: { yaml: true } },
    providers: [],
    providerStats: {},
  };
  assert.equal(registerProvider({ id: 'legacy-direct', label: 'Legacy direct', provide() { return [validRow]; } }, state), true);
  const rows = providerCandidatesLegacy(ctx, state, {
    now: () => 1,
    providerEnabled: () => true,
    recordRuntimeErrorOnce(scope, err, detail = null) {
      errors.push({ scope, message: String(err?.message || err), detail });
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, validRow.id);
  assert.deepEqual(errors, []);
  assert.equal(state.providerStats['legacy-direct'].calls, 1);
  assert.equal(state.providerStats['legacy-direct'].lastCount, 1);
});
