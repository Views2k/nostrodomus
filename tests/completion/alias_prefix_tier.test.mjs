import test from 'node:test';
import assert from 'node:assert/strict';

import { completionMatchRank } from '../../src/completion/scoring.js';

// A category word in a row's aliases ("entity", "boolean", "service") made every row of that
// kind an exact-prefix match for the first typed characters, level with rows whose own text
// starts with them.
test('a prefix match on the row text ranks above a prefix match on an alias only', () => {
  const own = completionMatchRank({ label: 'entity:', insert: 'entity: ', aliases: ['card'] }, 'ent');
  const aliasOnly = completionMatchRank({ label: 'light.kitchen', insert: 'light.kitchen', aliases: ['entity', 'ha'], keywords: ['entity', 'ha'] }, 'ent');
  assert.equal(own.matched, true);
  assert.equal(aliasOnly.matched, true);
  assert.ok(own.tier < aliasOnly.tier, `own tier ${own.tier} must be better than alias tier ${aliasOnly.tier}`);
});
