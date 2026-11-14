// Phase 1 universal-completions flag home. Locks: defaults all OFF (so the engine is a no-op
// out of the box), boolean-only override merge, and fail-dark to defaults on missing/hostile
// input. These flags gate the completion-engine superset; if any default flips to true by
// accident, behavior would change silently — this test is the fence.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_COMPLETION_SETTINGS,
  completionSettings,
  engineV2Enabled,
} from '../../src/core/completionSettings.js';

const FLAG_KEYS = ['engineV2', 'lazyResolve', 'jinjaLane', 'registryLane', 'schemaValues', 'surfaceScope', 'dpRanking', 'frecency', 'signatureHelp'];

test('every default flag is OFF (the engine ships as a no-op)', () => {
  assert.deepEqual(Object.keys(DEFAULT_COMPLETION_SETTINGS).sort(), [...FLAG_KEYS].sort());
  for (const key of FLAG_KEYS) {
    assert.equal(DEFAULT_COMPLETION_SETTINGS[key], false, `${key} must default false`);
  }
});

test('defaults object is frozen (cannot be mutated in place)', () => {
  assert.ok(Object.isFrozen(DEFAULT_COMPLETION_SETTINGS));
});

test('completionSettings fails dark to defaults on missing / hostile input', () => {
  for (const bad of [undefined, null, 0, 'x', [], { completions: null }, { completions: 'nope' }, { completions: 5 }]) {
    assert.deepEqual(completionSettings(bad), { ...DEFAULT_COMPLETION_SETTINGS }, `bad input ${JSON.stringify(bad)}`);
  }
});

test('only boolean overrides are honored; non-booleans fall back to default', () => {
  const merged = completionSettings({
    completions: { engineV2: true, jinjaLane: 'yes', dpRanking: 1, frecency: false },
  });
  assert.equal(merged.engineV2, true, 'boolean true honored');
  assert.equal(merged.frecency, false, 'boolean false honored');
  assert.equal(merged.jinjaLane, false, 'string ignored → default');
  assert.equal(merged.dpRanking, false, 'number ignored → default');
  assert.equal(merged.lazyResolve, false, 'unspecified → default');
  assert.equal(completionSettings({ completions: { frecency: true } }).frecency, true, 'frecency:true merges through');
});

test('completionSettings returns a fresh object (no shared mutable state)', () => {
  const a = completionSettings({ completions: { engineV2: true } });
  a.engineV2 = false;
  assert.equal(completionSettings({ completions: { engineV2: true } }).engineV2, true, 'no cross-call leakage');
  assert.notEqual(a, DEFAULT_COMPLETION_SETTINGS, 'never returns the frozen default by reference');
});

test('engineV2Enabled reflects the merged engineV2 flag', () => {
  assert.equal(engineV2Enabled(undefined), false);
  assert.equal(engineV2Enabled({}), false);
  assert.equal(engineV2Enabled({ completions: {} }), false);
  assert.equal(engineV2Enabled({ completions: { engineV2: false } }), false);
  assert.equal(engineV2Enabled({ completions: { engineV2: true } }), true);
  assert.equal(engineV2Enabled({ completions: { engineV2: 'true' } }), false, 'truthy non-boolean does NOT enable');
});
