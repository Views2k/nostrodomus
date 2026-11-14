import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreItems } from '../../src/completion/scoring.js';

// Regression guard: the scoreItems cache
// key omitted the completion lane-gate flags. Because the candidate set a provider yields for a
// fixed context depends on those flags (engineV2/registryLane/schemaValues/surfaceScope/jinjaLane/
// lazyResolve) and the settings-save cache clear is debounced, a flag toggle could serve rows
// scored under the old config from state.completionCache. The key now carries every completion flag.

const ctx = () => ({ shouldSuggest: true, lang: 'yaml', prefix: 'x', triggerKind: 'explicit' });
const row = (label) => ({ id: label, lang: 'yaml', label, insert: label, source: 'static-library' });

test('control: identical config + context returns the cached rows (proves the cache is live)', () => {
  const cache = new Map();
  const a = scoreItems(ctx(), [row('xalpha')], { settings: {}, cache });
  // Same ctx + settings but different candidates: a live cache must return the first result, so any
  // difference in the flag test below is attributable to the key changing, not to a dead cache.
  const b = scoreItems(ctx(), [row('xbravo')], { settings: {}, cache });
  assert.equal(a[0].label, 'xalpha');
  assert.equal(b[0].label, 'xalpha', 'unchanged config must hit the cache');
});

test('a lane-gate flag toggle invalidates the cache for the same context', () => {
  const cache = new Map();
  const off = scoreItems(ctx(), [row('xoff')], { settings: { completions: { registryLane: false } }, cache });
  const on = scoreItems(ctx(), [row('xon')], { settings: { completions: { engineV2: true, registryLane: true } }, cache });
  assert.equal(off[0].label, 'xoff');
  assert.equal(on[0].label, 'xon', 'a flag toggle must not serve the stale off-config rows from cache');
});

test('each of the lane-gate flags is part of the cache identity', () => {
  for (const flag of ['engineV2', 'lazyResolve', 'jinjaLane', 'registryLane', 'schemaValues', 'surfaceScope']) {
    const cache = new Map();
    const before = scoreItems(ctx(), [row('xbefore')], { settings: { completions: {} }, cache });
    const after = scoreItems(ctx(), [row('xafter')], { settings: { completions: { [flag]: true } }, cache });
    assert.equal(before[0].label, 'xbefore');
    assert.equal(after[0].label, 'xafter', `toggling ${flag} must miss the cache`);
  }
});
