import test from 'node:test';
import assert from 'node:assert/strict';

import { dashboardActionBranchState, detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { serviceIdFromContext } from '../../src/providers/haRuntimeProvider.js';

// The dashboard action branch belongs to the tap_action, hold_action or double_tap_action block
// that encloses the cursor, also when the cursor is deeper than that key.

const LATER_CARD = [
  'cards:',
  '  - type: button',
  '    tap_action:',
  '      action: call-service',
  '      service: light.turn_on',
  '  - type: entities',
  '    entities:',
  '      - entity: light.a',
  '        ',
].join('\n');

test('a deeper position in a later card does not take an earlier card\'s action branch', () => {
  const branch = dashboardActionBranchState(LATER_CARD, LATER_CARD.length);
  assert.notEqual(branch?.parentKey, 'tap_action', JSON.stringify(branch));
  assert.equal(branch?.missingKeys, undefined, 'no dashboard action keys are missing here');
  const ctx = detectRuntimeContext(LATER_CARD, LATER_CARD.length, { triggerKind: 'explicit' });
  assert.equal(serviceIdFromContext(ctx), '', 'the earlier card\'s service does not apply');
});

test('the enclosing action block is still found from deeper lines and across comments', () => {
  const inData = 'type: button\ntap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    ';
  assert.equal(dashboardActionBranchState(inData, inData.length)?.parentKey, 'tap_action');
  const withComment = 'type: button\ntap_action:\n# note\n  action: toggle\n  ';
  const branch = dashboardActionBranchState(withComment, withComment.length);
  assert.equal(branch?.parentKey, 'tap_action', 'a comment line does not close the block');
  assert.equal(branch?.actionValue, 'toggle');
});

test('a comment line does not close the block of a key at the cursor column', () => {
  const lines = ['cards:', '  - type: button', '    tap_action:', '      action: toggle', '    '];
  const plain = lines.join('\n');
  const commented = [...lines.slice(0, 3), '# note', ...lines.slice(3)].join('\n');
  const expected = dashboardActionBranchState(plain, plain.length);
  assert.equal(expected?.parentKey, 'tap_action');
  const branch = dashboardActionBranchState(commented, commented.length);
  assert.equal(branch?.parentKey, 'tap_action');
  assert.deepEqual(branch?.missingKeys, expected.missingKeys);
});
