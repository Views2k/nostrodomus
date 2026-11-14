// `expectedKind` is a strict ALIAS of `valueKind` across the REAL context
// corpus. The framework introduces expectedKind as the future "richer expected type" channel;
// today it must return the identical string for every context that already has a
// valueKind, so no existing ranking/gating behavior shifts. If resolveExpectedKind
// diverges from valueKind for a current case, this fence fails.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { resolveExpectedKind } from '../../src/context/contextResolver.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'context');
const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

test('the context fixture corpus is present and non-trivial', () => {
  assert.ok(files.length >= 20, `expected the full context corpus, found ${files.length}`);
});

for (const file of files) {
  test(`expectedKind aliases valueKind — ${file}`, () => {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    const expected = fixture?.expected || {};
    const valueKind = typeof expected.valueKind === 'string' ? expected.valueKind : '';
    // Build a descriptor carrying this fixture's valueKind and confirm the alias is exact.
    assert.equal(resolveExpectedKind({ valueKind: expected.valueKind }), valueKind);
  });
}

test('the corpus exercises a spread of real value kinds (not just empty)', () => {
  const kinds = new Set();
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    const vk = fixture?.expected?.valueKind;
    if (typeof vk === 'string' && vk) kinds.add(vk);
  }
  // entity/service/etc. — ensure the alias was tested against more than the empty string.
  assert.ok(kinds.size >= 3, `expected several distinct valueKinds in the corpus, saw ${kinds.size}: ${[...kinds].join(', ')}`);
});
