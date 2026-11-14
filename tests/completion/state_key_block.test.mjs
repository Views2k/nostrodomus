import test from 'node:test';
import assert from 'node:assert/strict';

import { itemOpensYamlBlock } from '../../src/completion/insertion.js';

// Accepting the condition row `state:` put the cursor on a new indented line, as if state: held a
// block. Only a button-card's state: does.
test('state: opens a block only for button-card rows', () => {
  const ctx = { lang: 'yaml' };
  const row = (contextKind) => ({ type: 'key', label: 'state:', insert: contextKind === 'condition' ? 'state: ' : 'state:', meta: contextKind ? { contextKind } : {} });
  assert.equal(itemOpensYamlBlock(ctx, row('condition')), false);
  assert.equal(itemOpensYamlBlock(ctx, row('')), false, 'the static state: row');
  assert.equal(itemOpensYamlBlock(ctx, row('button-card')), true);
  assert.equal(itemOpensYamlBlock(ctx, row('styles')), true);
  assert.equal(itemOpensYamlBlock(ctx, { type: 'key', label: 'data:', insert: 'data:' }), true);
});
