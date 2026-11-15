import test from 'node:test';
import assert from 'node:assert/strict';

import { documentWordProvider, tokenizeDocumentWords } from '../../src/providers/documentWordProvider.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { WORD_FALLBACK_PROVIDER_ID } from '../../src/core/runtimeConstants.js';

test('document word provider tokenizes, dedupes, excludes current prefix, and caps rows', () => {
  const rows = tokenizeDocumentWords('alpha alphabet alphabet sensor.alpha_x light.alpha alpha.more alpha', 'alpha', { maxWords: 3 });
  assert.deepEqual(rows.map(row => row.label), ['alphabet', 'sensor.alpha_x', 'light.alpha']);
  assert.equal(rows.every(row => row.source === WORD_FALLBACK_PROVIDER_ID), true);
});

test('document word provider handles only untyped-kind contexts with supplied doc text', () => {
  const provider = documentWordProvider();
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', documentText: 'alpha beta', valueKind: '' }), true);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', documentText: 'alpha beta', valueKind: 'entity' }), false);
  assert.equal(provider.canHandle({ shouldSuggest: true, lang: 'yaml', documentText: '' }), false);
});

test('scoreItems shows buffer words only when real provider matches are sparse', () => {
  const ctx = { shouldSuggest: true, lang: 'yaml', prefix: 'alp', triggerKind: 'typing', documentText: 'alpha' };
  const real = [
    { id: 'a', lang: 'yaml', type: 'key', label: 'alpha_one', insert: 'alpha_one: ', source: 'static-library' },
    { id: 'b', lang: 'yaml', type: 'key', label: 'alpha_two', insert: 'alpha_two: ', source: 'static-library' },
    { id: 'c', lang: 'yaml', type: 'key', label: 'alpha_three', insert: 'alpha_three: ', source: 'static-library' },
  ];
  const word = { id: 'w', lang: 'yaml', type: 'word', label: 'alpha_buffer', insert: 'alpha_buffer', source: WORD_FALLBACK_PROVIDER_ID };
  assert.equal(scoreItems(ctx, [...real.slice(0, 2), word], { settings: { enabledLangs: { yaml: true }, wordFallback: true } }).some(row => row.id === 'w'), true);
  assert.equal(scoreItems(ctx, [...real, word], { settings: { enabledLangs: { yaml: true }, wordFallback: true } }).some(row => row.id === 'w'), false);
});

test('a capped scan does not strand the regex for the next document', () => {
  // Normalize the module-global /g regex state first (an empty scan leaves lastIndex at 0).
  tokenizeDocumentWords('', '');
  // A call that hits the maxWords cap breaks the loop mid-string, stranding the regex's lastIndex.
  assert.deepEqual(
    tokenizeDocumentWords('aaa bbb ccc ddd eee fff', '', { maxWords: 3 }).map(row => row.label),
    ['aaa', 'bbb', 'ccc'],
  );
  // The next call on a shorter document must find its words: exec must not start from an offset
  // left past the end of the short text.
  assert.deepEqual(tokenizeDocumentWords('zzz', '').map(row => row.label), ['zzz']);
});


test('with a typed prefix only words that can match become rows', async () => {
  const { tokenizeDocumentWords } = await import('../../src/providers/documentWordProvider.js');
  const text = 'kitchen_light living_room bedroom_lamp klaxon sensor.kitchen_temp';
  const labels = (prefix) => tokenizeDocumentWords(text, prefix).map((row) => row.label);
  assert.deepEqual(labels('kit'), ['kitchen_light', 'sensor.kitchen_temp']);
  assert.deepEqual(labels('klt'), ['kitchen_light'], 'letters in order, not only a prefix');
  assert.equal(labels('').length, 5, 'no prefix: every word');
});