import test from 'node:test';
import assert from 'node:assert/strict';

import { lovelaceContextProvider } from '../../src/providers/lovelaceContextProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// A sibling key at the same indent must not be read as a leaf of the key above it: the data and
// target checks (p.endsWith("data"), includes(".data")) would then fail when data: heads the path
// (Developer Tools service YAML), and the second sibling would get the generic root rows.
function rowsAt(doc) {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
  const provider = lovelaceContextProvider({ getDoc: () => doc, getPos: () => doc.length });
  assert.equal(provider.canHandle(ctx), true, 'key-role positions are the provider lane');
  return provider.provide(ctx).map(row => row?.label ?? String(row));
}

test('a root-level data block keeps its rows on the second sibling', () => {
  const labels = rowsAt('data:\n  message: hi\n  ti');
  assert.ok(labels.includes('title:'), `data-block rows expected, got ${JSON.stringify(labels)}`);
  assert.ok(!labels.includes('type:'), 'the generic card rows must not replace the data block');
});

test('a root-level target block keeps its rows on the second sibling', () => {
  const labels = rowsAt('target:\n  entity_id: light.kitchen\n  ar');
  assert.ok(labels.includes('area_id:') && labels.includes('device_id:'), `target rows expected, got ${JSON.stringify(labels)}`);
  assert.ok(!labels.includes('type:'), 'the generic card rows must not replace the target block');
});

test('nested tap_action data rows are identical on the first and second field', () => {
  const first = rowsAt('tap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    ');
  const second = rowsAt('tap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    brightness_pct: 50\n    ');
  assert.deepEqual(second, first, 'the second field gets the same rows as the first');
  assert.ok(first.length > 0);
});
