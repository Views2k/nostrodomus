import test from 'node:test';
import assert from 'node:assert/strict';

import { dashboardActionBranchState } from '../../src/yaml/runtimeContextAdapter.js';

// The dashboard action-branch state must be scoped to the block the cursor actually sits in.
// Two regressions: (1) the fallback reached across into an earlier sibling card's tap_action;
// (2) a dash-prefixed action parent mis-measured its child indent.

test('a card that follows a tap_action card does NOT inherit that action branch (bug hunt 3)', () => {
  // Cursor typing a key in the SECOND card; the first card has a tap_action.
  const doc = 'cards:\n  - type: button\n    tap_action:\n      action: toggle\n  - type: entities\n    ent';
  const branch = dashboardActionBranchState(doc, doc.length);
  // The cursor is a top-level card-key position — it must not be classified as inside the
  // earlier card's action block (which would suppress the card-key vocabulary).
  assert.ok(!branch || branch.parentKey !== 'tap_action', `must not adopt the sibling card's tap_action, got ${JSON.stringify(branch)}`);
});

test('a genuine ancestor action block is still detected (no over-correction)', () => {
  const doc = 'type: button\ntap_action:\n  action: toggle\n  ';
  const branch = dashboardActionBranchState(doc, doc.length);
  assert.equal(branch?.kind, 'action-block');
  assert.equal(branch?.parentKey, 'tap_action');
  assert.equal(branch?.actionValue, 'toggle');
});

test('a dash-prefixed action parent measures child indent from the key column (bug hunt 3)', () => {
  // `  - tap_action:` puts its children at column 6 (line indent 2 + dash "- " 2 + 2), not 4.
  const doc = 'entities:\n  - tap_action:\n      action: toggle\n      ';
  const branch = dashboardActionBranchState(doc, doc.length);
  assert.equal(branch?.childIndent, 6, 'child indent accounts for the dash offset');
  assert.equal(branch?.actionValue, 'toggle', 'the dash-parent child action: value is collected');
  assert.deepEqual(branch?.missingKeys, ['confirmation'], 'the toggle branch narrows to confirmation: (action already used)');
  // Non-dash equivalent still measures from the line indent.
  const plainDoc = 'type: button\ntap_action:\n  action: toggle\n  ';
  assert.equal(dashboardActionBranchState(plainDoc, plainDoc.length)?.childIndent, 2);
});
