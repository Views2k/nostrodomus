import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourceClassBridgeRuntime } from '../../src/syntax/sourceClassBridgeRuntime.js';

// cm was acquired only as host?._loadedCodeMirror || editor._loadedCodeMirror ||
// bridgeCodeEditor?._loadedCodeMirror -- three reads of the SAME private field, so one HA/CM rename
// of _loadedCodeMirror zeroes all three at once and syntax coloring is lost. probeCodeMirrorModule
// keeps the convention field as the fast path but adds a field-name-independent fallback that finds
// the module by its CodeMirror 6 highlight-API shape.
const fakeCm = () => ({
  tags: {},
  HighlightStyle: { define() {} },
  syntaxHighlighting() {},
  Compartment: function () {},
  StateEffect: { appendConfig: { of() {} } },
});

test('probeCodeMirrorModule finds the module under the conventional field (fast path)', () => {
  const rt = createSourceClassBridgeRuntime();
  const cm = fakeCm();
  assert.equal(rt.probeCodeMirrorModule({ _loadedCodeMirror: cm }), cm);
});

test('probeCodeMirrorModule finds the module under a RENAMED field by its API shape (2B-1)', () => {
  const rt = createSourceClassBridgeRuntime();
  const cm = fakeCm();
  // _loadedCodeMirror is absent on all sources; the module hides under a different property name.
  assert.equal(rt.probeCodeMirrorModule({ unrelated: 1 }, { _cmModuleAfterRename: cm }), cm);
});

test('probeCodeMirrorModule rejects objects that are not a CM6 module, and missing sources', () => {
  const rt = createSourceClassBridgeRuntime();
  assert.equal(rt.probeCodeMirrorModule({ foo: { tags: {} } }), null); // tags only, no API
  assert.equal(rt.probeCodeMirrorModule(null, undefined, 5), null);
});
