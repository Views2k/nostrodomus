import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompletionInsertionRuntime } from '../../src/completion/insertionRuntime.js';

function createView(doc = '') {
  const view = {
    state: {
      doc: { length: doc.length, sliceString: () => doc },
      selection: { main: { from: 0, to: 0 } },
    },
    dispatches: [],
    dispatch(payload) {
      this.dispatches.push(payload);
      const inserted = payload?.changes?.insert;
      if (typeof inserted === 'string') this.state.doc.length += inserted.length;
    },
  };
  return view;
}

test('completion insertion runtime owns accepted row callback wiring', () => {
  const view = createView('type: ');
  const state = {
    enabled: true,
    view,
    settings: { acceptMode: 'replace' },
    context: {
      lang: 'yaml',
      line: 'type: ',
      beforeCursor: 'type: ',
      valueKind: 'string',
      afterKeyColon: true,
      from: 6,
      to: 6,
      wordTo: 6,
    },
  };
  let closed = '';
  let accepted = null;
  const runtime = createCompletionInsertionRuntime({
    state,
    closeCompletion: reason => { closed = reason; },
    recordRecentAcceptedCompletion: item => { accepted = item; },
    scheduleFrame: fn => fn(),
    now: () => 1000,
  });

  const ok = runtime.insertItem({ label: 'custom:mushroom-title-card', insert: 'custom:mushroom-title-card', type: 'card' });
  assert.equal(ok, true);
  assert.equal(view.dispatches.length, 1);
  assert.deepEqual(view.dispatches[0].changes, { from: 6, to: 6, insert: 'custom:mushroom-title-card' });
  assert.equal(closed, 'completion-accepted');
  assert.equal(accepted.label, 'custom:mushroom-title-card');
  assert.equal(state.suppressUntil, 1260);
});

test('completion insertion runtime preserves snippet-session error boundary', () => {
  const state = {
    snippetSession: { view: { dispatch() { throw new Error('dispatch failed'); } }, from: 0, index: 0, placeholders: [{ start: 0, end: 4 }], allPlaceholders: [] },
  };
  const errors = [];
  const runtime = createCompletionInsertionRuntime({
    state,
    looksLikeView: () => true,
    recordRuntimeError: (scope, err, detail) => errors.push({ scope, message: err.message, detail }),
  });

  assert.equal(runtime.moveSnippetPlaceholder(1), false);
  assert.equal(state.snippetSession, null);
  assert.equal(errors[0].scope, 'completion:snippet-placeholder-exit');
});
