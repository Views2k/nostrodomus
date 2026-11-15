import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDoc,
  getDocLength,
  getPos,
} from '../../src/editor/codeMirrorBridge.js';

test('CodeMirror bridge doc helpers tolerate normal and hostile doc shapes', () => {
  const doc = { length: 12, toString: () => 'ignored' };
  assert.equal(getDocLength({ state: { doc } }), 12);
  assert.equal(getDocLength({ state: { doc: { toString: () => 'abc' } } }), 3);
  assert.equal(getDocLength({ state: { doc: { get length() { throw new Error('nope'); } } } }), 0);
  assert.equal(getDoc({ view: { state: { doc: { toString: () => 'yaml text' } } } }), 'yaml text');
  assert.equal(getPos({ view: { state: { selection: { main: { head: 7 } } } } }), 7);
});
