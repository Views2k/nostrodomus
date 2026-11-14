import test from 'node:test';
import assert from 'node:assert/strict';
import {
  continuationForAcceptedItem,
  hasSnippetPlaceholders,
  parseSnippetTemplate,
  prepareInsertText,
  startSnippetSession,
  selectSnippetPlaceholder,
  moveSnippetPlaceholder,
  updateSnippetSessionAfterDispatch,
  currentSnippetChoiceRows,
  insertItem,
} from '../../src/completion/insertion.js';

test('completion insertion re-exports snippet template parsing helpers', () => {
  const parsed = parseSnippetTemplate('action: ${1:light.turn_on}\ntarget: $2');
  assert.equal(parsed.text, 'action: light.turn_on\ntarget: ');
  assert.deepEqual(parsed.placeholders, [
    { index: 1, start: 8, end: 21 },
    { index: 2, start: 30, end: 30 },
  ]);
  assert.equal(hasSnippetPlaceholders('entity_id: $1'), true);
});

test('prepareInsertText preserves list-key snippet indentation exactly', () => {
  const ctx = {
    lang: 'yaml',
    yamlRole: 'list-key',
    beforeCursor: '  - ',
    line: '  - ',
  };
  const item = { type: 'snippet' };
  const out = prepareInsertText('- action: ${1:light.turn_on}\n  target:\n    entity_id: ${2:light.example}', ctx, item);
  assert.equal(out, 'action: ${1:light.turn_on}\n    target:\n      entity_id: ${2:light.example}');
});

test('prepareInsertText formats same-line YAML value snippets like the runtime helper', () => {
  const ctx = {
    lang: 'yaml',
    valueKind: 'action',
    afterKeyColon: true,
    line: '    action:',
    beforeCursor: '    action:',
  };
  const item = { type: 'snippet' };
  const out = prepareInsertText('call-service\ntarget:\n  entity_id: light.example', ctx, item);
  assert.equal(out, ' call-service\n    target:\n      entity_id: light.example');
});

test('continuationForAcceptedItem keeps YAML action branches open', () => {
  const ctx = {
    lang: 'yaml',
    valueKind: 'action',
    yamlKey: 'action',
    line: '    action:',
    yamlPath: ['tap_action'],
  };
  assert.deepEqual(
    continuationForAcceptedItem(ctx, { type: 'value', insert: 'call-service' }),
    { append: '\n    ', open: true, reason: 'action-branch' },
  );
});

test('snippet-session helpers are dependency-safe and state-explicit', () => {
  const dispatches = [];
  const view = {
    dispatch(payload) { dispatches.push(payload); },
    state: { doc: { length: 18 } },
  };
  const runtimeState = {};
  const parsed = { placeholders: [{ index: 1, start: 4, end: 8 }, { index: 2, start: 12, end: 12 }] };

  assert.equal(startSnippetSession(runtimeState, view, 10, parsed), true);
  assert.equal(runtimeState.snippetSession.index, 0);
  assert.deepEqual(dispatches.at(-1).selection, { anchor: 14, head: 18 });

  assert.equal(moveSnippetPlaceholder(runtimeState, 1), true);
  assert.equal(runtimeState.snippetSession.index, 1);
  assert.deepEqual(dispatches.at(-1).selection, { anchor: 22, head: 22 });

  assert.equal(updateSnippetSessionAfterDispatch(runtimeState, view, 16, { from: 22, to: 22 }, { getDocLength: () => 20 }), true);
  assert.equal(runtimeState.snippetSession.placeholders[1].end, 16);
});


test('insertItem owns dispatch, suppression, and close behavior through explicit dependencies', () => {
  const dispatches = [];
  const closed = [];
  const runtimeState = {
    enabled: true,
    view: {
      dispatch(payload) { dispatches.push(payload); },
      state: { doc: { length: 12 } },
    },
    context: { lang: 'yaml', from: 4, to: 7, line: '    action:', beforeCursor: '    action:' },
    items: [],
  };

  const ok = insertItem(runtimeState, { type: 'key', insert: 'name' }, {
    looksLikeView: view => !!view?.dispatch,
    closeCompletion: reason => closed.push(reason),
    now: () => 1000,
  });

  assert.equal(ok, true);
  assert.deepEqual(dispatches[0], {
    changes: { from: 4, to: 7, insert: 'name' },
    selection: { anchor: 8 },
    scrollIntoView: true,
    userEvent: 'input.complete',
  });
  assert.equal(runtimeState.suppressUntil, 1260);
  assert.equal(runtimeState.lastExplicitOpen, false);
  assert.deepEqual(closed, ['completion-accepted']);
});

// completion#7
test('prepareInsertText indents the later lines of a same-line value snippet from the key, also behind a list dash', () => {
  const snippet = 'call-service\ntarget:\n  entity_id: light.example';
  const plain = { lang: 'yaml', valueKind: 'action', afterKeyColon: true, line: '    action:', beforeCursor: '    action:' };
  assert.equal(prepareInsertText(snippet, plain, { type: 'snippet' }), ' call-service\n    target:\n      entity_id: light.example', 'no dash (already correct)');
  const listItem = { lang: 'yaml', valueKind: 'action', afterKeyColon: true, line: '  - action:', beforeCursor: '  - action:' };
  assert.equal(prepareInsertText(snippet, listItem, { type: 'snippet' }), ' call-service\n    target:\n      entity_id: light.example', 'the key behind "  - " is in column 4 as well');
});

// completion#15
test('every accepted row is dispatched as a completion, so undo does not join it with the typed prefix', () => {
  // CodeMirror's history joins a change that has no user event, or an input.type one, with the
  // change before it. The typed prefix is input.type; the accept is input.complete, the event
  // CodeMirror's own completion uses.
  const accept = (context, item) => {
    const dispatches = [];
    const runtimeState = {
      enabled: true,
      view: { dispatch(payload) { dispatches.push(payload); }, state: { doc: { length: 40 } } },
      context,
      items: [],
    };
    assert.equal(insertItem(runtimeState, item, { closeCompletion: () => {}, scheduleFrame: () => {}, now: () => 1 }), true);
    assert.equal(dispatches.length, 1, 'one transaction per accept');
    return dispatches[0];
  };
  const plain = accept({ lang: 'yaml', from: 0, to: 3, line: 'ent', beforeCursor: 'ent' }, { type: 'key', insert: 'entity: ' });
  assert.equal(plain.userEvent, 'input.complete');
  assert.deepEqual(plain.changes, { from: 0, to: 3, insert: 'entity: ' });

  const snippet = accept({ lang: 'yaml', from: 0, to: 3, line: 'ser', beforeCursor: 'ser' }, { type: 'snippet', insert: 'service: ${1:light.turn_on}' });
  assert.equal(snippet.userEvent, 'input.complete');
  assert.deepEqual(snippet.selection, { anchor: 9, head: 22 });

  const branch = accept(
    { lang: 'yaml', valueKind: 'action', yamlKey: 'action', yamlPath: ['tap_action'], from: 12, to: 14, line: '    action: ca', beforeCursor: '    action: ca' },
    { type: 'value', insert: 'call-service' },
  );
  assert.equal(branch.userEvent, 'input.complete');
  assert.deepEqual(branch.changes, { from: 12, to: 14, insert: 'call-service\n    ' });
});

test('insertItem schedules bounded continuation opens for branchable YAML values', () => {
  const frames = [];
  const opened = [];
  const runtimeState = {
    enabled: true,
    view: {
      dispatch() {},
      state: { doc: { length: 12 } },
    },
    context: {
      lang: 'yaml',
      valueKind: 'action',
      yamlKey: 'action',
      yamlPath: ['tap_action'],
      from: 12,
      to: 12,
      line: '    action:',
      beforeCursor: '    action:',
    },
    items: [],
  };

  const ok = insertItem(runtimeState, { type: 'value', insert: 'call-service' }, {
    looksLikeView: view => !!view?.dispatch,
    isViewAllowed: view => !!view?.dispatch,
    openCompletion: explicit => { opened.push(explicit); runtimeState.items = [{ label: 'service' }]; },
    scheduleFrame: fn => frames.push(fn),
    now: () => 2000,
  });

  assert.equal(ok, true);
  assert.equal(runtimeState.suppressUntil, 0);
  assert.equal(runtimeState.lastExplicitOpen, true);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.deepEqual(opened, [true]);
});


test('insertItem selects first snippet placeholder in the insertion transaction', () => {
  const dispatches = [];
  const runtimeState = {
    enabled: true,
    view: {
      dispatch(payload) { dispatches.push(payload); },
      state: { doc: { length: 0 } },
    },
    context: { lang: 'yaml', from: 0, to: 0, line: '', beforeCursor: '' },
    items: [],
  };

  const ok = insertItem(runtimeState, {
    type: 'snippet',
    insert: 'service: ${1:light.turn_on}\ntarget:\n  entity_id: ${2:light.example}',
  }, {
    looksLikeView: view => !!view?.dispatch,
    closeCompletion: () => {},
    now: () => 3000,
  });

  assert.equal(ok, true);
  assert.equal(dispatches.length, 1);
  assert.deepEqual(dispatches[0].selection, { anchor: 9, head: 22 });
  assert.equal(runtimeState.snippetSession.index, 0);
  assert.equal(runtimeState.snippetSession.placeholders.length, 2);
});


test('insertItem defaults to replace mode using context wordTo', () => {
  const dispatches = [];
  const runtimeState = {
    enabled: true,
    settings: { acceptMode: 'replace' },
    view: {
      dispatch(payload) { dispatches.push(payload); },
      state: { doc: { length: 24 } },
    },
    context: { lang: 'yaml', from: 0, to: 4, wordTo: 9, line: 'enti_ty_id: light.kitchen', beforeCursor: 'enti' },
    items: [],
  };

  assert.equal(insertItem(runtimeState, { type: 'key', insert: 'entity_id: ' }, { closeCompletion: () => {}, now: () => 1 }), true);
  assert.deepEqual(dispatches[0].changes, { from: 0, to: 9, insert: 'entity_id: ' });
});

test('snippet parser supports $0 final cursor, mirrors, and choices', () => {
  const parsed = parseSnippetTemplate('name: ${1:Room}\nlabel: $1\nmode: ${2|auto,heat,cool|}$0');
  assert.equal(parsed.text, 'name: Room\nlabel: \nmode: auto');
  assert.deepEqual(parsed.placeholders.map(p => p.index), [1, 2]);
  assert.equal(parsed.allPlaceholders.filter(p => p.index === 1).length, 2);
  assert.deepEqual(parsed.finalCursor, { index: 0, start: 29, end: 29 });
  assert.deepEqual(currentSnippetChoiceRows({ placeholders: parsed.placeholders, index: 1 })?.map(row => row.label), ['auto', 'heat', 'cool']);
});

test('snippet mirror replication happens on Tab and final cursor uses $0', () => {
  let doc = 'name: Kitchen\nlabel: \nmode: auto';
  const dispatches = [];
  const view = {
    state: {
      get doc() {
        return {
          length: doc.length,
          sliceString: (from, to) => doc.slice(from, to),
          toString: () => doc,
        };
      },
      selection: { main: { from: 6, to: 13 } },
    },
    dispatch(payload) {
      dispatches.push(payload);
      const changes = Array.isArray(payload.changes) ? payload.changes : (payload.changes ? [payload.changes] : []);
      for (const change of changes.slice().sort((a, b) => b.from - a.from)) {
        doc = doc.slice(0, change.from) + String(change.insert || '') + doc.slice(change.to);
      }
      if (payload.selection) {
        const anchor = payload.selection.anchor;
        const head = payload.selection.head ?? anchor;
        this.state.selection = { main: { from: Math.min(anchor, head), to: Math.max(anchor, head) } };
      }
    },
  };
  const runtimeState = {};
  const parsed = parseSnippetTemplate('name: ${1:Kitchen}\nlabel: $1\nmode: ${2|auto,heat|}$0');
  assert.equal(startSnippetSession(runtimeState, view, 0, parsed), true);
  view.state.selection = { main: { from: 6, to: 13 } };
  assert.equal(moveSnippetPlaceholder(runtimeState, 1), true);
  assert.equal(doc.includes('label: Kitchen'), true);
  assert.equal(moveSnippetPlaceholder(runtimeState, 1), true);
  assert.equal(runtimeState.snippetSession, null);
  assert.equal(dispatches.at(-1).selection.anchor, parsed.finalCursor.start + 'Kitchen'.length);
});

test('exit caret lands AFTER the last placeholder value when a snippet has no $0', () => {
  // Regression: the old `finalCursor || last` fallback parked the caret at the START of the last
  // field (last.start) for every no-$0 snippet — so typing on after a snippet corrupted the last value.
  let doc = 'key: aaa\nother: bbb';
  const dispatches = [];
  const view = {
    state: {
      get doc() { return { length: doc.length, sliceString: (f, t) => doc.slice(f, t), toString: () => doc }; },
      selection: { main: { from: 0, to: 0 } },
    },
    dispatch(payload) {
      dispatches.push(payload);
      const changes = Array.isArray(payload.changes) ? payload.changes : (payload.changes ? [payload.changes] : []);
      for (const change of changes.slice().sort((a, b) => b.from - a.from)) {
        doc = doc.slice(0, change.from) + String(change.insert || '') + doc.slice(change.to);
      }
      if (payload.selection) {
        const anchor = payload.selection.anchor;
        const head = payload.selection.head ?? anchor;
        this.state.selection = { main: { from: Math.min(anchor, head), to: Math.max(anchor, head) } };
      }
    },
  };
  const runtimeState = {};
  const parsed = parseSnippetTemplate('key: ${1:aaa}\nother: ${2:bbb}');
  assert.ok(!parsed.finalCursor, 'a snippet without $0 has no finalCursor');
  const last = parsed.placeholders[parsed.placeholders.length - 1];
  assert.equal(startSnippetSession(runtimeState, view, 0, parsed), true);
  assert.equal(moveSnippetPlaceholder(runtimeState, 1), true); // onto the last placeholder
  assert.equal(moveSnippetPlaceholder(runtimeState, 1), true); // tab past it -> exit
  assert.equal(runtimeState.snippetSession, null);
  assert.equal(dispatches.at(-1).selection.anchor, last.end, 'caret at end of the last value (last.end)');
  assert.notEqual(dispatches.at(-1).selection.anchor, last.start, 'NOT parked at the start of the last field');
});

test('Shift-Tab at the first placeholder stays put, it does not exit the snippet forward (bug hunt 3)', () => {
  let doc = '';
  const view = {
    state: { get doc() { return { length: doc.length, sliceString: (f, t) => doc.slice(f, t), toString: () => doc }; }, selection: { main: { anchor: 0, head: 0 } } },
    dispatch(p) {
      const ch = Array.isArray(p.changes) ? p.changes : (p.changes ? [p.changes] : []);
      for (const c of ch.slice().sort((a, b) => b.from - a.from)) doc = doc.slice(0, c.from) + String(c.insert || '') + doc.slice(c.to);
      if (p.selection) { const a = p.selection.anchor, h = p.selection.head ?? a; view.state.selection = { main: { anchor: a, head: h } }; }
    },
  };
  const rs = {};
  const parsed = parseSnippetTemplate('action: ${1:light.turn_on}\ntarget: ${2:x}\ndata: ${3:y}');
  view.dispatch({ changes: [{ from: 0, to: 0, insert: parsed.text }] });
  startSnippetSession(rs, view, 0, parsed);
  moveSnippetPlaceholder(rs, 1); // to stop 1... wait, index starts 0; ensure we're at 0
  // move back to first
  moveSnippetPlaceholder(rs, -1);
  // Shift-Tab at the first placeholder: session survives, still on stop 1.
  const ret = moveSnippetPlaceholder(rs, -1);
  assert.equal(ret, true);
  assert.notEqual(rs.snippetSession, null, 'the session is NOT destroyed by a backward gesture at the first stop');
  assert.equal(rs.snippetSession.index, 0, 'the caret stays on the first placeholder, it does not jump forward');
  // A forward Tab past the last stop still exits normally.
  assert.equal(moveSnippetPlaceholder(rs, 1), true); // -> stop 2
  assert.equal(moveSnippetPlaceholder(rs, 1), true); // -> stop 3
  assert.equal(moveSnippetPlaceholder(rs, 1), true); // -> exit
  assert.equal(rs.snippetSession, null, 'forward Tab past the last stop still exits the snippet');
});

test('mirror replication through the hooked dispatch does not double-shift later placeholders (bug hunt 3/4)', async () => {
  // The shipped button-card snippet mirrors ${3:detail} with ${4} sitting between the two copies.
  // Renaming stop 3 then Tab used to fire updateSnippetSessionAfterDispatch DURING the mirror dispatch,
  // shifting stop 4 a second time — so Tab selected "['sensor.examp" instead of sensor.example and
  // typing corrupted the Jinja. A reentrancy guard makes the mirror bookkeeping the sole authority.
  const { createEditorDispatchRuntime } = await import('../../src/editor/editorDispatchRuntime.js');
  let doc = '';
  const view = {
    dom: {}, coordsAtPos: () => ({ left: 0, top: 0, bottom: 0, right: 0 }),
    state: { get doc() { return { length: doc.length, sliceString: (f, t) => doc.slice(f, t), toString: () => doc }; }, selection: { main: { anchor: 0, head: 0 } } },
    dispatch(p) {
      const ch = Array.isArray(p.changes) ? p.changes : (p.changes ? [p.changes] : []);
      for (const c of ch.slice().sort((a, b) => b.from - a.from)) doc = doc.slice(0, c.from) + String(c.insert || '') + doc.slice(c.to);
      if (p.selection) { const a = p.selection.anchor, h = p.selection.head ?? a; view.state.selection = { main: { anchor: a, head: h } }; }
    },
    sel() { return view.state.selection.main; },
  };
  const rs = {};
  const rt = createEditorDispatchRuntime({ state: {}, updateSnippetSessionAfterDispatch: (v, ol, os) => updateSnippetSessionAfterDispatch(rs, v, ol, os) });
  const body = "custom_fields:\n  ${3:detail}: |\n    [[[ return states['${4:sensor.example}']?.state ?? ''; ]]]\nstyles:\n  custom_fields:\n    ${3:detail}: x";
  const parsed = parseSnippetTemplate(body);
  view.dispatch({ changes: [{ from: 0, to: 0, insert: parsed.text }] });
  assert.equal(rt.hookDispatch(view), true, 'the view is hooked');
  startSnippetSession(rs, view, 0, parsed);
  // Navigate to the ${3} stop, rename detail->temp (delta -2), then Tab (replicate mirror + advance to ${4}).
  const stop3Index = rs.snippetSession.placeholders.findIndex(p => p.index === 3);
  selectSnippetPlaceholder(rs.snippetSession, stop3Index, { looksLikeView: () => true });
  const s3 = view.sel();
  view.dispatch({ changes: [{ from: s3.anchor, to: s3.head, insert: 'temp' }], selection: { anchor: s3.anchor + 4, head: s3.anchor + 4 } });
  moveSnippetPlaceholder(rs, 1, { looksLikeView: () => true }); // Tab -> mirror + stop 4
  const s4 = view.sel();
  assert.equal(doc.slice(s4.anchor, s4.head), 'sensor.example', 'stop 4 selection is not offset by the mirror delta');
  assert.equal((doc.match(/temp:/g) || []).length, 2, 'both mirror copies were renamed');
  assert.ok(doc.includes("states['sensor.example']"), 'the Jinja states[...] is intact, not corrupted');
});

test('updateSnippetSessionAfterDispatch tracks the current placeholder for edits before it and at its boundaries (bug hunt 3/4)', () => {
  // The old "touched" test never shifted the current placeholder for an edit entirely BEFORE it
  // (a click+type earlier → returning to it selected a stale range) and mis-SHRANK it on a delete
  // just PAST its end. Model insert vs delete/replace explicitly. Current placeholder = [10,16].
  const cases = [
    ['insert 2 before (@5)', 100, 102, 5, 5, [12, 18]],
    ['backspace left boundary [9,10]', 100, 99, 9, 10, [9, 15]],
    ['delete right boundary [16,17] (outside → unchanged)', 100, 99, 16, 17, [10, 16]],
    ['insert inside (@13)', 100, 101, 13, 13, [10, 17]],
    ['replace whole selected [10,16]', 100, 104, 10, 16, [10, 20]],
    ['insert at end (@16 → grow)', 100, 101, 16, 16, [10, 17]],
    ['insert after (@20 → unchanged)', 100, 101, 20, 20, [10, 16]],
    ['delete inside [12,13]', 100, 99, 12, 13, [10, 15]],
  ];
  for (const [label, oldLen, newLen, from, to, expect] of cases) {
    const view = { state: { doc: { length: newLen } } };
    const rs = { snippetSession: { view, from: 0, index: 0, placeholders: [{ index: 1, start: 10, end: 16 }], allPlaceholders: [{ index: 1, start: 10, end: 16 }], finalCursor: null } };
    updateSnippetSessionAfterDispatch(rs, view, oldLen, { from, to });
    const c = rs.snippetSession.placeholders[0];
    assert.deepEqual([c.start, c.end], expect, label);
    // the allPlaceholders mirror-entry for the current placeholder tracks identically
    const a = rs.snippetSession.allPlaceholders[0];
    assert.deepEqual([a.start, a.end], expect, `${label} (allPlaceholders)`);
  }
});
