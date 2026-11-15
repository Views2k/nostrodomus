import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxStyleRuntime } from '../../src/ui/codeboxStyleRuntime.js';
import { createStyleDomRuntime } from '../../src/ui/styleDomRuntime.js';
import { codeboxStyleSourceClassSteadyStateSkipDecision } from '../../src/ui/codeboxStyle.js';

// With two code editors on a page, the style target is the editor the user clicked into and typed
// in, not the remembered editor for as long as that one is visible, and not simply the largest one
// in a fresh discovery. Otherwise the user's editor would never be styled or colored, and the
// steady-state skip would answer the request that follows the click for the remembered editor
// and drop it.

function editorStub(name, { width = 600, height = 300, candidate = true, inDialog = true } = {}) {
  return {
    name,
    candidate,
    inDialog,
    isConnected: true,
    querySelector: () => null,
    getBoundingClientRect: () => ({ width, height }),
  };
}

function makeStyleRuntime({ cached = null, editors = [], view = null, dialog = null } = {}) {
  const remembered = [];
  const state = {
    activeEditorCache: { editor: cached, key: cached ? cached.name : '', hit: 0, miss: 0, invalidated: 0 },
    view: view ? { dom: view } : null,
  };
  const runtime = createCodeboxStyleRuntime({
    window: {},
    W: {},
    document: { activeElement: null, createElement: () => ({ style: {}, dataset: {} }) },
    state,
    activeEditDialog: () => dialog,
    visibleStyleEditorCandidate: (editor) => !!editor && editor.candidate !== false && editor.isConnected !== false,
    composedContains: (_dialog, editor) => editor?.inDialog !== false,
    styleEditorFromNode: (node) => (node?.getBoundingClientRect ? node : null),
    rememberActiveCodeboxEditor: (editor, reason) => {
      state.activeEditorCache.editor = editor;
      state.activeEditorCache.key = editor.name;
      remembered.push([editor.name, reason]);
    },
    rememberActiveEditorNoEditor: () => {},
    recordPerformanceEvent: () => {},
    activeEditorNoEditorBackoffAllowed: () => false,
    usableBridgeStyleEditorCandidate: () => null,
    nostrodomusWalkOpenRoots: (_root, visit) => visit({ querySelectorAll: () => editors }),
  });
  return { runtime, state, remembered };
}

test('the editor of the user\'s view takes over from a remembered editor that is still visible', () => {
  const first = editorStub('first', { width: 900, height: 500 });
  const second = editorStub('second', { width: 600, height: 200 });
  const { runtime, state, remembered } = makeStyleRuntime({ cached: first, editors: [first, second], view: second });
  assert.equal(runtime.activeCodeboxStyleEditor(), second, 'the editor the user works in is the target');
  assert.equal(state.activeEditorCache.editor, second);
  assert.equal(remembered.length, 1, 'remembered once, so the companion layer and the syntax owner follow');
  assert.equal(runtime.activeCodeboxStyleEditor(), second, 'and it stays the target');
  assert.equal(remembered.length, 1, 'without being remembered again');

  state.view = { dom: first }; // the user goes back to the first editor
  assert.equal(runtime.activeCodeboxStyleEditor(), first);
});

test('a view editor that cannot be a style target leaves the remembered editor in place', () => {
  const main = editorStub('main');
  const formField = editorStub('form-field', { candidate: false });
  const { runtime, state, remembered } = makeStyleRuntime({ cached: main, editors: [main, formField], view: formField });
  assert.equal(runtime.activeCodeboxStyleEditor(), main);
  assert.equal(remembered.length, 0);
  assert.equal(state.codeboxStyleViewDomChecked, formField, 'recorded, so the steady-state skip keeps working');
});

test('a view inside the remembered editor is checked once and then left to the skip', () => {
  const main = editorStub('main');
  const inner = { name: 'inner', isConnected: true }; // a node of the remembered editor, not the editor element
  const { runtime, state, remembered } = makeStyleRuntime({ cached: main, editors: [main], view: inner });
  // The real styleEditorFromNode resolves such a node to the remembered editor, this stub to no
  // editor. Either way it is not another style target.
  assert.equal(runtime.activeCodeboxStyleEditor(), main);
  assert.equal(remembered.length, 0);
  assert.equal(state.codeboxStyleViewDomChecked, inner);
  state.view = null;
  runtime.activeCodeboxStyleEditor();
  assert.equal(state.codeboxStyleViewDomChecked, null, 'forgotten when the view goes away');
});

test('with a card dialog open, a view editor outside the dialog does not take over', () => {
  const inDialog = editorStub('dialog-editor');
  const behind = editorStub('page-editor', { inDialog: false });
  const { runtime } = makeStyleRuntime({ cached: inDialog, editors: [inDialog, behind], view: behind, dialog: {} });
  assert.equal(runtime.activeCodeboxStyleEditor(), inDialog);
});

test('one editor, or no view: the remembered editor is returned from the cache', () => {
  const only = editorStub('only');
  const sameView = makeStyleRuntime({ cached: only, editors: [only], view: only });
  assert.equal(sameView.runtime.activeCodeboxStyleEditor(), only);
  assert.equal(sameView.state.activeEditorCache.hit, 1, 'a plain cache hit');
  assert.equal(sameView.remembered.length, 0);

  const noView = makeStyleRuntime({ cached: only, editors: [only], view: null });
  assert.equal(noView.runtime.activeCodeboxStyleEditor(), only);
  assert.equal(noView.state.activeEditorCache.hit, 1);
});

test('a fresh discovery picks the editor of the user\'s view over a larger one', () => {
  const large = editorStub('large', { width: 1000, height: 700 });
  const typedIn = editorStub('typed-in', { width: 500, height: 200 });
  const withView = makeStyleRuntime({ cached: null, editors: [large, typedIn], view: typedIn });
  assert.equal(withView.runtime.activeCodeboxStyleEditor(), typedIn);

  const withoutView = makeStyleRuntime({ cached: null, editors: [large, typedIn], view: null });
  assert.equal(withoutView.runtime.activeCodeboxStyleEditor(), large, 'no view: the largest visible editor');
});

function makeSkipRuntime({ cached, view }) {
  const smartSyntax = [];
  const state = {
    activeEditorCache: { editor: cached },
    view: view ? { dom: view } : null,
    codeboxStyleCacheInvalidated: false,
    codeboxStyleLastAppliedAt: 1000,
    codeboxStyleLastEditorKey: cached.name,
  };
  const runtime = createStyleDomRuntime({
    documentRef: { head: null, documentElement: null, body: null },
    state,
    codeboxStyleSourceClassSteadyStateSkipDecision,
    codeboxEditorCacheKey: (editor) => editor.name,
    editorUsesCodeMirrorSourceClassSyntax: () => true,
    scheduleSourceClassSmartSyntax: (editor, reason) => smartSyntax.push([editor.name, reason]),
    visibleStyleEditorCandidate: () => true,
  });
  return { runtime, state, smartSyntax };
}

test('the steady-state skip does not answer for the remembered editor when the user moved to another one', () => {
  const first = editorStub('first');
  const second = editorStub('second');
  const { runtime, state, smartSyntax } = makeSkipRuntime({ cached: first, view: second });
  for (const reason of ['remember-view', 'editor-dispatch']) {
    assert.equal(runtime.maybeSkipSourceClassSteadyStateStyleReapply(reason), false, `${reason}: the reapply runs`);
  }
  assert.deepEqual(smartSyntax, [], 'no syntax pass for the editor the user left');

  // The reapply looked at the second editor and turned it down (too small, a form field).
  state.codeboxStyleViewDomChecked = second;
  assert.equal(runtime.maybeSkipSourceClassSteadyStateStyleReapply('editor-dispatch'), true, 'the skip is back');

  // Or it became the target.
  state.codeboxStyleViewDomChecked = null;
  state.activeEditorCache.editor = second;
  state.codeboxStyleLastEditorKey = 'second';
  assert.equal(runtime.maybeSkipSourceClassSteadyStateStyleReapply('editor-dispatch'), true);
  assert.deepEqual(smartSyntax.map(([name]) => name), ['first', 'second']);
});

test('the steady-state skip is unchanged with one editor, no view, or a view that left the page', () => {
  const only = editorStub('only');
  assert.equal(makeSkipRuntime({ cached: only, view: only }).runtime.maybeSkipSourceClassSteadyStateStyleReapply('editor-dispatch'), true);
  assert.equal(makeSkipRuntime({ cached: only, view: null }).runtime.maybeSkipSourceClassSteadyStateStyleReapply('editor-dispatch'), true);
  const gone = editorStub('gone');
  gone.isConnected = false;
  assert.equal(makeSkipRuntime({ cached: only, view: gone }).runtime.maybeSkipSourceClassSteadyStateStyleReapply('editor-dispatch'), true);
});
