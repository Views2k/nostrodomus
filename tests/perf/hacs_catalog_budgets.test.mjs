// Perf budgets relocated from tests/providers/hacs_catalog_phase_c_fixtures.test.mjs
// (RUNTIME_DATA.md P4/W5). Run via `npm run test:perf`; excluded from the default
// `npm test` walk. The functional row-content assertions for the same scenarios
// remain in the original file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  catalogRowsForContext,
  hacsCatalogProvider,
} from '../../src/providers/hacsCatalogProvider.js';
import { MAIN_PROVIDER_SURFACES } from '../../src/providers/hacsProviderCatalog.js';

function assertRowsBudgeted(label, fn, budgetMs = 8) {
  // Warm once so the fixture measures provider work, not first-touch module/JIT noise in the
  // full test runner. Use the best of three synchronous calls to keep the gate stable while
  // still catching accidental scans or async-shaped provider work.
  let rows = fn();
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i += 1) {
    const started = performance.now();
    rows = fn();
    best = Math.min(best, performance.now() - started);
  }
  assert.ok(best <= budgetMs, `${label} exceeded ${budgetMs}ms budget: ${best.toFixed(3)}ms`);
  return rows;
}

test('perf: card type row generation stays under the 8ms budget', () => {
  const rows = assertRowsBudgeted('card type row generation', () => catalogRowsForContext({
    shouldSuggest: true,
    lang: 'yaml',
    yamlRole: 'value',
    valueKind: 'card-type',
  }));
  assert.ok(rows.length > 0);
});

test('perf: per-surface key/nested/value row generation stays under the 8ms budget', () => {
  const provider = hacsCatalogProvider();

  for (const surface of MAIN_PROVIDER_SURFACES) {
    const ctx = {
      shouldSuggest: true,
      lang: 'yaml',
      yamlRole: 'key',
      catalogSurfaceId: surface.id,
    };

    assertRowsBudgeted(`${surface.id} key rows`, () => provider.provide(ctx));

    if (surface.nestedKeys.length) {
      assertRowsBudgeted(`${surface.id} nested rows`, () => provider.provide({
        ...ctx,
        yamlRole: 'list-key',
        pathText: `${surface.id}.nested`,
      }));
    }

    assertRowsBudgeted(`${surface.id} value rows`, () => provider.provide({
      ...ctx,
      yamlRole: 'value',
    }));
  }
});

test('perf: catalog provider canHandle remains a cheap resolved-context lookup', () => {
  const provider = hacsCatalogProvider();
  const contexts = MAIN_PROVIDER_SURFACES.map(surface => ({
    shouldSuggest: true,
    lang: 'yaml',
    yamlRole: 'key',
    catalogSurfaceId: surface.id,
  }));

  const started = performance.now();
  for (let i = 0; i < 50; i += 1) {
    for (const ctx of contexts) assert.equal(provider.canHandle(ctx), true);
  }
  const elapsed = performance.now() - started;
  assert.ok(elapsed <= 8, `canHandle sweep exceeded 8ms budget: ${elapsed.toFixed(3)}ms`);
});
