import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDoc,
  getDocLength,
  getPos,
  hookDispatch,
  lineInfo,
  unhookDispatch,
} from '../../src/editor/codeMirrorBridge.js';

test('CodeMirror bridge lineInfo preserves runtime line/column shape', () => {
  const info = lineInfo('alpha\nbeta gamma\ndelta', 10);
  assert.equal(info.before, 'alpha\nbeta');
  assert.equal(info.after, ' gamma\ndelta');
  assert.equal(info.line, 'beta gamma');
  assert.equal(info.beforeCursor, 'beta');
  assert.equal(info.afterCursor, ' gamma');
  assert.equal(info.lineStart, 6);
  assert.equal(info.lineEnd, 16);
  assert.equal(info.col, 4);
  assert.equal(info.lineNumber, 2);
});

test('CodeMirror bridge doc helpers tolerate normal and hostile doc shapes', () => {
  const doc = { length: 12, toString: () => 'ignored' };
  assert.equal(getDocLength({ state: { doc } }), 12);
  assert.equal(getDocLength({ state: { doc: { toString: () => 'abc' } } }), 3);
  assert.equal(getDocLength({ state: { doc: { get length() { throw new Error('nope'); } } } }), 0);
  assert.equal(getDoc({ view: { state: { doc: { toString: () => 'yaml text' } } } }), 'yaml text');
  assert.equal(getPos({ view: { state: { selection: { main: { head: 7 } } } } }), 7);
});

test('CodeMirror bridge dispatch hook can be dependency-injected without owning runtime state', () => {
  const calls = [];
  const view = {
    state: {
      doc: { length: 5, toString: () => 'hello' },
      selection: { main: { anchor: 1, head: 4 } },
    },
    dispatch(...args) { calls.push(['original', ...args]); return 'ok'; },
  };
  const state = { hookedView: null, originalDispatch: null };
  const hooked = hookDispatch(view, {
    state,
    looksLikeView: (candidate) => candidate === view,
    unhookDispatch: () => calls.push(['unhook']),
    afterDispatch: (candidate, oldDocLength, oldSel) => calls.push(['after', candidate === view, oldDocLength, oldSel]),
  });
  assert.equal(hooked, true);
  assert.equal(state.hookedView, view);
  assert.equal(view.dispatch('change'), 'ok');
  assert.deepEqual(calls[0], ['unhook']);
  assert.deepEqual(calls[1], ['original', 'change']);
  assert.equal(calls[2][0], 'after');
  assert.equal(calls[2][1], true);
  assert.equal(calls[2][2], 5);
  assert.deepEqual(calls[2][3], { from: 1, to: 4, head: 4 });
  assert.equal(unhookDispatch({ state }), true);
  assert.equal(state.hookedView, null);
  assert.equal(state.originalDispatch, null);
});
