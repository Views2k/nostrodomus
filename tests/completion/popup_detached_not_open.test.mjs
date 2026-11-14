import test from 'node:test';
import assert from 'node:assert/strict';

import { completionPopupIsOpen } from '../../src/completion/popupRuntime.js';
import { createEditorDispatchRuntime } from '../../src/editor/editorDispatchRuntime.js';

// Home Assistant removes the list together with the dialog that hosted it. The
// box keeps display:block, so it counted as open and the first change in the next editor asked
// for a live update, which showed the list there without Ctrl+Space.
test('a list whose box was removed from the page is not open', () => {
  assert.equal(completionPopupIsOpen({ overlay: { style: { display: 'block' }, isConnected: false } }), false);
});

test('a shown list in the page is open, a hidden one is not', () => {
  assert.equal(completionPopupIsOpen({ overlay: { style: { display: 'block' }, isConnected: true } }), true);
  assert.equal(completionPopupIsOpen({ overlay: { style: { display: 'none' }, isConnected: true } }), false);
  assert.equal(completionPopupIsOpen({ overlay: { style: { display: 'block' } } }), true, 'a box that does not report whether it is connected counts as before');
  assert.equal(completionPopupIsOpen({ overlay: null }), false);
  assert.equal(completionPopupIsOpen(null), false);
});

test('a change in the next editor does not ask for a live update for a removed list', () => {
  const requests = [];
  const state = { settings: { keepOpen: false }, overlay: { style: { display: 'block' }, isConnected: false } };
  const runtime = createEditorDispatchRuntime({
    state,
    windowRef: {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestLiveUpdate: () => requests.push('live-update'),
    popupIsOpen: () => completionPopupIsOpen(state),
  });
  let doc = { length: 3 };
  const view = {
    dom: {},
    coordsAtPos() {},
    get state() { return { doc, selection: { main: { anchor: 0, head: 0 } } }; },
    dispatch() { doc = { length: doc.length + 1 }; },
  };
  assert.equal(runtime.hookDispatch(view), true);
  view.dispatch({});
  assert.deepEqual(requests, [], 'the removed list is not refreshed');

  state.overlay.isConnected = true;
  view.dispatch({});
  assert.deepEqual(requests, ['live-update'], 'a list that is on the page still is');
});
