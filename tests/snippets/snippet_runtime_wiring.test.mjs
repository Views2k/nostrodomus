import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/main.legacy.js', 'utf8');
const providerRuntime = readFileSync('src/providers/providerRuntime.js', 'utf8');
const dist = readFileSync('dist/nostrodomus.js', 'utf8');

const expectedSnippetIds = [
  'snip.dashboard.card.mushroom_chips',
  'snip.sequence.parallel',
  'snip.condition.or',
  'snip.card_mod.ha_card',
];

test('live runtime delegates snippet rows through the provider runtime owner', () => {
  assert.match(providerRuntime, /import \* as snippets from '\.\/snippetProvider\.js';/);
  assert.match(providerRuntime, /return snippets\.snippetRowsForContext\(ctx\);/);
  assert.match(providerRuntime, /if \(isScalarConfigContext\(ctx\)\) return \[\];/);
  assert.match(source, /createProviderRuntimeDelegates\(\(\) => providerRuntime\)/);
  assert.match(source, /snippetRowsForContext, snippetProvider, buildIndex/);
  assert.doesNotMatch(source, /add\("snip\.dashboard\.action/);
});

test('bundled runtime contains expanded snippet data and no live import for the provider', () => {
  assert.doesNotMatch(dist, /from ['"]\.\/providers\/snippetProvider\.js['"]/);
  for (const id of expectedSnippetIds) {
    assert.ok(dist.includes(id), `${id} should be bundled into dist`);
  }
});
