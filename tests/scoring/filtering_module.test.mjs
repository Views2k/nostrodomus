import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SCORING_SETTINGS,
  cacheGet,
  cachePut,
  camelMatch,
  hasEnabledLanguage,
  normalizeCompletionItem,
  normalizeScoringSettings,
  matchSpans,
} from '../../src/completion/filtering.js';

import { scoreItems, camelMatch as scoringCamelMatch } from '../../src/completion/scoring.js';

test('filtering module normalizes settings and enabled language gates', () => {
  const settings = normalizeScoringSettings({ enabledLangs: { yaml: false, css: true }, maxItems: 7 });
  assert.equal(settings.maxItems, 7);
  assert.equal(settings.enabledLangs.yaml, false);
  assert.equal(settings.enabledLangs.css, true);
  assert.equal(settings.enabledLangs.js, true);
  assert.equal(hasEnabledLanguage(settings, 'yaml'), false);
  assert.equal(hasEnabledLanguage(settings, 'css'), true);
});

test('filtering module normalizes completion item search fields', () => {
  const item = normalizeCompletionItem({ label: 'Call Service', insert: 'action: light.turn_on', aliases: ['perform action'] });
  assert.equal(item.labelLower, 'call service');
  assert.ok(item.haystack.includes('perform action'));
  assert.deepEqual(item.meta, {});
  assert.equal(normalizeCompletionItem(null), null);
});

test('filtering module cache helpers are safe with missing cache', () => {
  const cache = new Map();
  cachePut(cache, 'a', [1]);
  assert.deepEqual(cacheGet(cache, 'a'), [1]);
  assert.equal(cacheGet(null, 'a'), null);
  assert.doesNotThrow(() => cachePut(null, 'a', [1]));
});

test('scoring module delegates camelMatch compatibility to filtering helper', () => {
  assert.equal(camelMatch('CallServiceAction', 'csa'), true);
  assert.equal(scoringCamelMatch('CallServiceAction', 'csa'), true);
  assert.equal(scoringCamelMatch('call service action', 'csa'), false);
});

test('scoreItems still uses filtering defaults after module split', () => {
  const ctx = { shouldSuggest: true, lang: 'yaml', prefix: 'light', triggerKind: 'explicit' };
  const items = scoreItems(ctx, [
    { id: '1', lang: 'yaml', type: 'service', label: 'light.turn_on', insert: 'light.turn_on', source: 'ha-runtime' },
    { id: '2', lang: 'css', type: 'property', label: 'color', insert: 'color:', source: 'static-library' },
  ], { settings: DEFAULT_SCORING_SETTINGS });
  assert.equal(items[0].label, 'light.turn_on');
});


test('matchSpans returns visible-label highlights for prefix, boundary, fuzzy, and substring tiers', () => {
  assert.deepEqual(matchSpans('entity_id', 'ent', 'exact-prefix'), [{ start: 0, end: 3 }]);
  assert.deepEqual(matchSpans('Entity ID', 'ent', 'case-insensitive-prefix'), [{ start: 0, end: 3 }]);
  assert.deepEqual(matchSpans('mini-graph-card', 'mgc', 'word-boundary-subsequence'), [
    { start: 0, end: 1 },
    { start: 5, end: 6 },
    { start: 11, end: 12 },
  ]);
  assert.deepEqual(matchSpans('user', 'usr', 'ordered-subsequence'), [
    { start: 0, end: 2 },
    { start: 3, end: 4 },
  ]);
  assert.deepEqual(matchSpans('custom:button-card', 'button', 'substring'), [{ start: 7, end: 13 }]);
  assert.deepEqual(matchSpans('display label', 'aliasOnly', 'substring'), []);
});
