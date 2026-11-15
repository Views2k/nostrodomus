import test from 'node:test';
import assert from 'node:assert/strict';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import { runtimeData } from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { signatureHintModel, signatureHintText } from '../../src/completion/signatureHelp.js';
import { makeHassFixture } from '../fixtures/hassFixture.mjs';

// The signature hint needs isServiceDataFieldContext, so a sibling field at the same indent must
// not be read as a leaf of the field above it, or the hint would vanish for every field after the
// first. signature_help.test.mjs checks the model with a hand-built context; this suite uses the
// real detected context.
const snapshot = runtimeData({ state: {}, limits: SECURITY_LIMITS, windowRef: {}, findHass: () => makeHassFixture(), now: () => 1_000 });

function hintAt(doc) {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
  return signatureHintText(signatureHintModel(ctx, snapshot));
}

test('the hint survives past the first completed field', () => {
  assert.equal(
    hintAt('actions:\n  - action: light.turn_on\n    data:\n      entity_id: light.kitchen\n      bright'),
    'light.turn_on(transition, rgb_color, brightness_pct, effect)'
  );
});

test('a fully typed second field highlights its parameter', () => {
  assert.equal(
    hintAt('actions:\n  - action: light.turn_on\n    data:\n      transition: 1\n      brightness_pct'),
    'light.turn_on(transition, rgb_color, [brightness_pct], effect)'
  );
});

test('pin: the first-field hint is unchanged', () => {
  assert.equal(
    hintAt('actions:\n  - action: light.turn_on\n    data:\n      '),
    'light.turn_on(transition, rgb_color, brightness_pct, effect)'
  );
});
