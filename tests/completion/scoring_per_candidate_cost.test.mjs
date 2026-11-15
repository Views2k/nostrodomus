// scoreItems normalized the whole settings object twice for every candidate (allowType and
// modeRank each did), on top of once for the call.

import test from 'node:test';
import assert from 'node:assert/strict';

import { allowType, modeRank, scoreItems } from '../../src/completion/scoring.js';
import { STATIC_PROVIDER_ID, WORD_FALLBACK_PROVIDER_ID } from '../../src/core/runtimeConstants.js';

function settingsThatCountCopies() {
  const counter = { copies: 0 };
  const settings = { mode: 'both', enabledLangs: { yaml: true } };
  // Every normalization spreads the settings, which reads this property once.
  Object.defineProperty(settings, 'copyProbe', { enumerable: true, get() { counter.copies += 1; return 1; } });
  return { settings, counter };
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({
  id: `row-${i}`, lang: 'yaml', type: 'key', label: `entity_${i}`, insert: `entity_${i}: `, source: STATIC_PROVIDER_ID,
}));

test('the settings are normalized a fixed number of times, not per candidate', () => {
  const ctx = { shouldSuggest: true, lang: 'yaml', yamlRole: 'key', prefix: 'ent', triggerKind: 'typing' };
  const few = settingsThatCountCopies();
  const fewItems = scoreItems({ ...ctx }, { candidates: rows(5), settings: few.settings });
  const many = settingsThatCountCopies();
  const manyItems = scoreItems({ ...ctx }, { candidates: rows(400), settings: many.settings });
  assert.equal(fewItems.length, 5);
  assert.ok(manyItems.length > 5);
  assert.equal(many.counter.copies, few.counter.copies, 'the number of copies does not grow with the candidates');
});

test('allowType and modeRank keep their answers for raw settings', () => {
  const snippet = { type: 'snippet', source: 'other' };
  const key = { type: 'key', source: STATIC_PROVIDER_ID };
  assert.equal(allowType(snippet, { mode: 'keys' }), false);
  assert.equal(allowType(snippet, { mode: 'snippets' }), true);
  assert.equal(allowType(key, { mode: 'snippets' }), false);
  assert.equal(allowType(key, {}), true);
  assert.equal(modeRank(snippet, { mode: 'keys' }), 100);
  assert.equal(modeRank(key, { mode: 'snippets' }), 100);
  assert.equal(modeRank(snippet, {}), 20);
});

test('word rows that stay in the list are scored like any other row', () => {
  const ctx = { shouldSuggest: true, lang: 'yaml', yamlRole: 'key', prefix: 'kit', triggerKind: 'typing' };
  const word = Object.freeze({ id: 'word-fallback.kitchen', lang: 'yaml', type: 'word', label: 'Kitchen', insert: 'Kitchen', source: WORD_FALLBACK_PROVIDER_ID, aliases: Object.freeze([]), meta: Object.freeze({ provider: 'word-fallback' }) });
  const items = scoreItems(ctx, { candidates: [word, ...rows(2)], settings: { enabledLangs: { yaml: true } } });
  assert.deepEqual(items.map((item) => item.label), ['Kitchen']);
  assert.equal(items[0].labelLower, 'kitchen');
  assert.equal(items[0].haystack, 'kitchen kitchen');
  // Three other rows match, so the word rows are dropped.
  const crowded = scoreItems({ ...ctx, prefix: 'ent' }, {
    candidates: [{ ...word, label: 'entrance', insert: 'entrance', id: 'word-fallback.entrance' }, ...rows(4)],
    settings: { enabledLangs: { yaml: true } },
  });
  assert.ok(crowded.every((item) => item.source !== WORD_FALLBACK_PROVIDER_ID));
});
