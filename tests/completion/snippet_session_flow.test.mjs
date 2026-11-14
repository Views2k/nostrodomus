import test from 'node:test';
import assert from 'node:assert/strict';
import {
  insertItem,
  moveSnippetPlaceholder,
  updateSnippetSessionAfterDispatch,
} from '../../src/completion/insertion.js';
import { createEditorDispatchRuntime } from '../../src/editor/editorDispatchRuntime.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// [C] end to end through the hooked dispatch: insert a snippet, type over stop 1, accept a
// completion for it, then Tab has to select stop 2.
test('Tab reaches the next placeholder after a completion was accepted inside the current one', () => {
  let doc = 'actions:\n  - ';
  const view = {
    dom: {},
    coordsAtPos: () => ({ left: 0, top: 0, bottom: 0, right: 0 }),
    state: {
      get doc() { return { length: doc.length, sliceString: (from, to) => doc.slice(from, to), toString: () => doc }; },
      selection: { main: { anchor: doc.length, head: doc.length } },
    },
    dispatch(payload) {
      const changes = Array.isArray(payload.changes) ? payload.changes : (payload.changes ? [payload.changes] : []);
      for (const change of changes.slice().sort((a, b) => b.from - a.from)) {
        doc = doc.slice(0, change.from) + String(change.insert || '') + doc.slice(change.to);
      }
      if (payload.selection) {
        const anchor = payload.selection.anchor;
        view.state.selection = { main: { anchor, head: payload.selection.head ?? anchor } };
      }
    },
  };
  const runtimeState = { enabled: true, settings: { acceptMode: 'replace' }, view, items: [] };
  const dispatchRuntime = createEditorDispatchRuntime({
    state: {},
    updateSnippetSessionAfterDispatch: (v, oldLength, oldSelection) => updateSnippetSessionAfterDispatch(runtimeState, v, oldLength, oldSelection),
  });
  assert.equal(dispatchRuntime.hookDispatch(view), true);
  const accept = (item, triggerKind = 'explicit') => {
    runtimeState.context = detectRuntimeContext(doc, view.state.selection.main.head, { triggerKind });
    return insertItem(runtimeState, item, { closeCompletion: () => {}, scheduleFrame: () => {}, now: () => 1 });
  };

  assert.equal(accept({ type: 'snippet', label: 'service action step', insert: 'action: ${1:light.turn_on}\ntarget:\n  entity_id: ${2:light.example}' }), true);
  const stop1 = view.state.selection.main;
  assert.equal(doc.slice(stop1.anchor, stop1.head), 'light.turn_on', 'stop 1 is selected after the insert');

  // The user types `sw` over stop 1 and accepts `switch.turn_on` from the popup.
  view.dispatch({ changes: { from: stop1.anchor, to: stop1.head, insert: 'sw' }, selection: { anchor: stop1.anchor + 2 } });
  assert.equal(accept({ type: 'service', label: 'switch.turn_on', insert: 'switch.turn_on' }, 'typing'), true);
  assert.ok(doc.includes('action: switch.turn_on\n'), doc);
  assert.ok(runtimeState.snippetSession, 'the snippet session is still active');

  assert.equal(moveSnippetPlaceholder(runtimeState, 1), true);
  const stop2 = view.state.selection.main;
  assert.equal(doc.slice(stop2.anchor, stop2.head), 'light.example', 'Tab selects stop 2');
});
