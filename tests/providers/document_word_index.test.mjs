// The word fallback scanned the whole document with a regex on every question. The words of a
// text are now found once and filtered per question.

import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenizeDocumentWords } from '../../src/providers/documentWordProvider.js';
import { documentIdentityToken } from '../../src/completion/completionRuntime.js';

// The previous implementation, kept here as the reference for the rows.
function referenceWords(documentText = '', prefix = '', maxWords = 500) {
  const rx = /[A-Za-z][A-Za-z0-9_.:\-/]{2,}/g;
  const current = String(prefix || '').toLowerCase();
  const needle = current.replace(/[^a-z0-9]/g, '');
  const canMatch = (lower) => {
    if (!needle) return true;
    let at = 0;
    for (let i = 0; i < lower.length && at < needle.length; i += 1) if (lower[i] === needle[at]) at += 1;
    return at === needle.length;
  };
  const seen = new Set();
  const out = [];
  let match;
  while ((match = rx.exec(documentText)) && out.length < maxWords) {
    const word = match[0];
    const lower = word.toLowerCase();
    if (lower === current || seen.has(lower)) continue;
    if (word.length > 120) continue;
    if (!canMatch(lower)) continue;
    seen.add(lower);
    out.push(word);
  }
  return out;
}

function sampleDocument(distinct) {
  const lines = ['type: vertical-stack', 'Title: First', 'title: second', `long: ${'x'.repeat(130)}`];
  for (let i = 0; i < distinct; i += 1) lines.push(`entity_${i}: sensor.room_${i % 97}_temperature`, 'name: Kitchen lamp');
  return lines.join('\n');
}

test('the rows are the ones the full scan produced, for any prefix', () => {
  for (const distinct of [3, 400, 4500]) {
    const text = sampleDocument(distinct);
    for (const prefix of ['', 'ti', 'title', 'ent', 'sensor.room', 'kl', 'zzz', 'entity_4499']) {
      const rows = tokenizeDocumentWords(text, prefix);
      assert.deepEqual(rows.map((row) => row.label), referenceWords(text, prefix), `${distinct} words, prefix "${prefix}"`);
      assert.ok(rows.every((row) => Object.isFrozen(row) && row.type === 'word'));
    }
    assert.deepEqual(tokenizeDocumentWords(text, 'e', { maxWords: 7 }).map((row) => row.label), referenceWords(text, 'e', 7));
  }
});

test('a second question about the same text does not scan it again', () => {
  const text = sampleDocument(300);
  tokenizeDocumentWords(text, '');
  const exec = RegExp.prototype.exec;
  let scans = 0;
  RegExp.prototype.exec = function counted(input) {
    if (typeof input === 'string' && input.length === text.length) scans += 1;
    return exec.call(this, input);
  };
  let rows;
  try {
    rows = tokenizeDocumentWords(text, 'kit');
  } finally {
    RegExp.prototype.exec = exec;
  }
  assert.equal(scans, 0);
  assert.deepEqual(rows.map((row) => row.label), ['Kitchen']);
  // Another text is scanned.
  assert.deepEqual(tokenizeDocumentWords('alpha beta', '').map((row) => row.label), ['alpha', 'beta']);
});

test('the completion cache token follows the text without hashing it', () => {
  const a = documentIdentityToken('entity: light.kitchen_main\nname: x');
  const b = documentIdentityToken('entity: light.bedroom_main\nname: x');
  assert.notEqual(a, b, 'same length, other text');
  assert.equal(documentIdentityToken('entity: light.bedroom_main\nname: x'), b, 'same text, same token');
  assert.notEqual(documentIdentityToken('entity: light.kitchen_main\nname: x'), b);
});
