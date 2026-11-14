import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIndex, loadLibrary, staticLibraryProvider } from '../../src/providers/staticLibraryProvider.js';
import { scoreItems } from '../../src/completion/scoring.js';

const ENABLED_LANGS = Object.freeze({ yaml: true, css: true, js: true, jinja: true, html: true, json: true, python: true });

async function createProviderState() {
  const state = {
    settings: { enabledLangs: { ...ENABLED_LANGS }, providers: {}, globalSearch: false },
    completionCache: new Map(),
  };
  await loadLibrary({
    state,
    buildIndex: () => buildIndex({
      state,
      ensureProviderSettings: () => null,
    }),
  });
  if (!state.index) buildIndex({ state, ensureProviderSettings: () => null });
  return state;
}

test('static provider covers JSON and Markdown-HTML rows', async () => {
  const state = await createProviderState();
  const provider = staticLibraryProvider({ state });

  const jsonCtx = { shouldSuggest: true, lang: 'json', prefix: '"ti', triggerKind: 'typing', isTriggerChar: true };
  assert.equal(provider.canHandle(jsonCtx), true);
  const jsonRows = scoreItems(jsonCtx, provider.provide(jsonCtx), { settings: { enabledLangs: { json: true }, maxItems: 20 } });
  assert.ok(jsonRows.some(row => row.label === '"title"'));
  assert.ok(jsonRows.some(row => row.label === 'browser_mod popup payload'));

  const htmlCtx = { shouldSuggest: true, lang: 'html', prefix: '<ha', triggerKind: 'typing', isTriggerChar: true };
  assert.equal(provider.canHandle(htmlCtx), true);
  const htmlRows = scoreItems(htmlCtx, provider.provide(htmlCtx), { settings: { enabledLangs: { html: true }, maxItems: 20 } });
  assert.ok(htmlRows.some(row => row.label === '<ha-alert>'));
  assert.ok(htmlRows.some(row => row.label === '<ha-icon>'));

  const mdCtx = { shouldSuggest: true, lang: 'html', prefix: '**', triggerKind: 'typing', isTriggerChar: true };
  const mdRows = scoreItems(mdCtx, provider.provide(mdCtx), { settings: { enabledLangs: { html: true }, maxItems: 20 } });
  assert.ok(mdRows.some(row => row.label === '**bold**'));
});
