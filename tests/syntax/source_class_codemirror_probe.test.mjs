import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourceClassBridgeRuntime } from '../../src/syntax/sourceClassBridgeRuntime.js';

// The CodeMirror module sits on one private field, _loadedCodeMirror, read from the host, the editor
// or the bridge code editor. A rename of that field in HA or CodeMirror would lose syntax coloring,
// so probeCodeMirrorModule keeps the field as the fast path and falls back to finding the module by
// its CodeMirror 6 highlight-API shape.
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

test('probeCodeMirrorModule finds the module under a renamed field by its API shape', () => {
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
