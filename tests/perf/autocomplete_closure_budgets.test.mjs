// Perf budgets, kept apart from the functional suites.
// Run via `npm run test:perf`; excluded from the default `npm test` walk so
// the required gate is timing-flake-free by construction. Functional
// assertions for these scenarios remain in their original files:
//   - tests/autocomplete/autocomplete_closure_quality.test.mjs
//   - tests/autocomplete/autocomplete_new_surface_closure.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { scoreItems } from '../../src/completion/scoring.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { hacsCatalogProvider } from '../../src/providers/hacsCatalogProvider.js';
import { MAIN_PROVIDER_SURFACES } from '../../src/providers/hacsProviderCatalog.js';
import { snippetProvider } from '../../src/providers/snippetProvider.js';

const FIXTURE = 'tests/fixtures/autocomplete/busy_thermostat_dashboard.yaml';

// Mirrors the NEW_SURFACES list in tests/autocomplete/autocomplete_new_surface_closure.test.mjs
// (not imported: importing a .test.mjs module would re-register its tests).
const NEW_SURFACES = [
  'vertical-stack-in-card',
  'atomic-calendar-revive',
  'clock-weather-card',
  'uptime-card',
  'flex-table-card',
  'xiaomi-vacuum-map-card',
  'kiosk-mode',
  'better-thermostat-ui-card',
];

function bestOf(label, fn, budgetMs) {
  let result;
  let best = Number.POSITIVE_INFINITY;
  // Warm the module/JIT path outside the measured samples; take the best of many
  // samples so scheduler noise on a busy host cannot fail a budget the code meets.
  for (let i = 0; i < 4; i += 1) fn();
  for (let i = 0; i < 32; i += 1) {
    const started = performance.now();
    result = fn();
    best = Math.min(best, performance.now() - started);
  }
  assert.ok(best <= budgetMs, `${label} exceeded ${budgetMs}ms: ${best.toFixed(3)}ms`);
  return { result, best };
}

const catalogProvider = hacsCatalogProvider();
const snippetTemplateProvider = snippetProvider();

function completionCandidates(ctx) {
  return [
    ...(catalogProvider.canHandle(ctx) ? catalogProvider.provide(ctx) : []),
    ...(snippetTemplateProvider.canHandle(ctx) ? snippetTemplateProvider.provide(ctx) : []),
  ];
}

test('perf: busy thermostat scoreItems stays under the 2ms budget', () => {
  const raw = readFileSync(FIXTURE, 'utf8');
  const marker = '__CURSOR__';
  const markerIndex = raw.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'fixture must contain cursor marker');
  const doc = raw.replace(marker, 'show_');
  const ctx = detectRuntimeContext(doc, markerIndex + 'show_'.length, { triggerKind: 'typing', settings: { minChars: 1 } });
  assert.equal(ctx.shouldSuggest, true);

  bestOf('busy thermostat scoreItems', () => scoreItems(ctx, {
    providerCandidates: completionCandidates,
    settings: { enabledLangs: { yaml: true }, maxItems: 20 },
  }), 2);
});

test('perf: all-surface indexed provider sweep stays under the 2ms budget', () => {
  const provider = hacsCatalogProvider();
  bestOf('all-surface indexed provider sweep', () => {
    let count = 0;
    for (const surface of MAIN_PROVIDER_SURFACES) {
      count += provider.provide({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogSurfaceId: surface.id }).length;
      count += provider.provide({ shouldSuggest: true, lang: 'yaml', yamlRole: 'value', catalogSurfaceId: surface.id }).length;
    }
    return count;
  }, 2);
});

test('perf: new surface key/value provider sweep stays under the 2ms budget', () => {
  const provider = hacsCatalogProvider();
  bestOf('new surface key/value provider sweep', () => {
    let count = 0;
    for (const id of NEW_SURFACES) {
      count += provider.provide({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', catalogSurfaceId: id }).length;
      count += provider.provide({ shouldSuggest: true, lang: 'yaml', yamlRole: 'value', catalogSurfaceId: id }).length;
    }
    return count;
  }, 2);
});
