import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompletionInsertionRuntime } from '../../src/completion/insertionRuntime.js';

// parseSnippetTemplate must only run for snippet items. A non-snippet
// value that happens to contain a literal "$N" (e.g. an MQTT topic mqtt/$0/state)
// must be inserted verbatim, not have its "$0" stripped as a snippet tabstop.
function createView(doc = '') {
  return {
    state: { doc: { length: doc.length, sliceString: () => doc }, selection: { main: { from: 0, to: 0 } } },
    dispatches: [],
    dispatch(payload) {
      this.dispatches.push(payload);
      const inserted = payload?.changes?.insert;
      if (typeof inserted === 'string') this.state.doc.length += inserted.length;
    },
  };
}

function runtimeFor(view) {
  const state = {
    enabled: true,
    view,
    settings: { acceptMode: 'replace' },
    context: { lang: 'yaml', line: 'type: ', beforeCursor: 'type: ', valueKind: 'string', afterKeyColon: true, from: 6, to: 6, wordTo: 6 },
  };
  return createCompletionInsertionRuntime({
    state,
    closeCompletion: () => {},
    recordRecentAcceptedCompletion: () => {},
    scheduleFrame: fn => fn(),
    now: () => 1000,
  });
}

test('non-snippet insert keeps a literal $N in the value (no snippet parse)', () => {
  const view = createView('type: ');
  const ok = runtimeFor(view).insertItem({ label: 'mqtt topic', insert: 'mqtt/$0/state', type: 'card' });
  assert.equal(ok, true);
  const inserted = view.dispatches[0].changes.insert;
  assert.ok(inserted.includes('$0'), `expected literal $0 preserved, got: ${JSON.stringify(inserted)}`);
  assert.ok(!inserted.includes('mqtt//state'), `value corrupted by snippet parse: ${JSON.stringify(inserted)}`);
});

test('snippet insert still parses its tabstops out of the inserted text', () => {
  const view = createView('type: ');
  const ok = runtimeFor(view).insertItem({ label: 'topic', insert: 'mqtt/$0/state', type: 'snippet' });
  assert.equal(ok, true);
  const inserted = view.dispatches[0].changes.insert;
  assert.ok(!inserted.includes('$0'), `snippet tabstop should be parsed out, got: ${JSON.stringify(inserted)}`);
});
