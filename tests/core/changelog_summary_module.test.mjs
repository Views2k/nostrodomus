import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CHANGELOG_SUMMARY, changelogEntries, changelogSummaryTextFromSummary } from '../../src/core/changelogSummary.js';

const PROJECT = JSON.parse(fs.readFileSync(new URL('../../PROJECT.json', import.meta.url), 'utf8'));

test('in-app changelog summary keeps a five-release runtime window synced to PROJECT.json', () => {
  assert.equal(Array.isArray(CHANGELOG_SUMMARY), true);
  assert.equal(CHANGELOG_SUMMARY.length, 5);
  assert.equal(CHANGELOG_SUMMARY[0].version, PROJECT.version);
  for (const release of CHANGELOG_SUMMARY) {
    assert.equal(typeof release.version, 'string');
    assert.equal(typeof release.title, 'string');
    assert.ok(Array.isArray(release.bullets) || Array.isArray(release.entries));
  }
});

test('in-app changelog summary stays compact and runtime-free', () => {
  const source = fs.readFileSync(new URL('../../src/core/changelogSummary.js', import.meta.url), 'utf8');
  assert.ok(Buffer.byteLength(source, 'utf8') < 12 * 1024);
  assert.equal(source.includes('window'), false);
  assert.equal(source.includes('document'), false);
  assert.equal(source.includes('localStorage'), false);
  assert.equal(source.includes('setTimeout'), false);
  assert.equal(source.includes('addEventListener'), false);
  assert.equal(source.includes('querySelector'), false);
});

test('changelog render helpers preserve legacy entries/bullets fallback behavior', () => {
  assert.deepEqual(changelogEntries({ entries: ['a'], bullets: ['b'] }), ['a']);
  assert.deepEqual(changelogEntries({ bullets: ['b'] }), ['b']);
  assert.deepEqual(changelogEntries({}), []);
  assert.deepEqual(changelogEntries(null), []);
});

test('changelog summary text renders version/title + entry bullets (no Status line)', () => {
  const text = changelogSummaryTextFromSummary([
    { version: '1.0.0', title: 'One', bullets: ['first', 'second'] },
    { version: '1.0.1', title: 'Two', entries: ['third'] },
  ]);
  assert.equal(text, '1.0.0 — One\n- first\n- second\n\n1.0.1 — Two\n- third');
});

test('changelog summary text never emits a Status: undefined line', () => {
  const text = changelogSummaryTextFromSummary([
    { version: '1.0.0', title: 'One', bullets: ['only'] },
  ]);
  assert.equal(text.includes('Status:'), false);
  assert.equal(text.includes('undefined'), false);
});
