import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeEditDialog,
  activeEditorReadoutDeepActivePath,
  activeEditorReadoutFindView,
  activeEditorReadoutLinePosition,
  activeEditorReadoutLooksLikeView,
  activeEditorReadoutNodeViewCandidates,
  activeEditorReadoutRedactSnapshot,
  activeEditorReadoutString,
  activeEditorReadoutTraversalScopedEnabled,
  activeEditorReadoutVisible,
  createActiveEditorContextSnapshotReadout,
  activeEditorReadoutWalkRoots,
  ACTIVE_EDITOR_READOUT_TARGETED_SHADOW_HOST_SELECTOR,
  closestFromPath,
  composedContains,
  homeRoot,
  isScopedEditorEvent,
  recordActiveEditorReadoutTraversal,
  looksLikeView,
  editCardDialogCandidates,
  dialogCodeEditorElement,
  dialogCodeEditorView,
  viewFromEvent,
  pathHasEditorSurface,
  pathInsideActiveDialog,
  visible,
  visibleDialogSurface,
} from '../../src/editor/activeEditor.js';

function installDomGlobals({ dialogVisible = true } = {}) {
  global.Node = { ELEMENT_NODE: 1 };
  global.getComputedStyle = (el) => ({
    display: el?.styleDisplay || 'block',
    visibility: el?.styleVisibility || 'visible',
  });

  const content = {
    nodeType: 1,
    getBoundingClientRect: () => ({ width: dialogVisible ? 320 : 0, height: dialogVisible ? 240 : 0 }),
  };
  const dialog = {
    shadowRoot: {
      querySelector: (selector) => selector === '.content' ? content : null,
    },
  };
  const homeShadow = {
    querySelectorAll: (selector) => selector === 'hui-dialog-edit-card' ? [dialog] : [],
  };
  global.document = {
    querySelector: (selector) => selector === 'home-assistant' ? { shadowRoot: homeShadow } : null,
  };
  return { content, dialog, homeShadow };
}

test('active editor visible helper rejects a narrow box, a hidden element and null', () => {
  installDomGlobals();
  const el = {
    nodeType: 1,
    getBoundingClientRect: () => ({ width: 30, height: 30 }),
  };
  assert.equal(visible(el), true);
  assert.equal(visible({ ...el, getBoundingClientRect: () => ({ width: 20, height: 30 }) }), false);
  assert.equal(visible({ ...el, styleDisplay: 'none' }), false);
  assert.equal(visible(null), false);
});

test('active editor path helpers find direct and closest matches', () => {
  const direct = { matches: (selector) => selector === '.cm-editor' };
  const nested = {
    matches: () => false,
    closest: (selector) => selector === '.cm-content' ? direct : null,
  };
  assert.equal(closestFromPath([nested], '.cm-content'), direct);
  assert.equal(closestFromPath([direct], '.cm-editor'), direct);
  assert.equal(closestFromPath([], '.cm-editor'), null);
});

test('active editor composedContains walks through shadow hosts and parents', () => {
  const host = {};
  const shadowChild = { getRootNode: () => ({ host }) };
  const parent = {};
  const child = { parentElement: parent, getRootNode: () => ({}) };
  assert.equal(composedContains(host, shadowChild), true);
  assert.equal(composedContains(parent, child), true);
  assert.equal(composedContains({}, child), false);
});

test('active editor dialog and scoped event helpers find the HA edit dialog and accept an editor event inside it', () => {
  const { dialog } = installDomGlobals();
  assert.equal(homeRoot(), global.document.querySelector('home-assistant').shadowRoot);
  assert.equal(activeEditDialog(), dialog);

  const cmNode = { matches: (selector) => selector.includes('.cm-content') };
  const event = { composedPath: () => [cmNode, dialog] };
  assert.equal(pathHasEditorSurface([cmNode]), true);
  assert.equal(pathInsideActiveDialog([dialog]), true);
  assert.equal(isScopedEditorEvent(event), true);
});

test('dialog surface acceptance covers legacy .content and the 2026.6 ha-dialog anatomy', () => {
  installDomGlobals();
  const visibleBox = { nodeType: 1, getBoundingClientRect: () => ({ width: 320, height: 240 }) };
  const hiddenBox = { nodeType: 1, getBoundingClientRect: () => ({ width: 0, height: 0 }) };

  // Legacy shape: visible .content in the dialog's shadow root.
  assert.equal(
    visibleDialogSurface({ shadowRoot: { querySelector: (s) => (s === '.content' ? visibleBox : null) } }),
    true,
  );

  // 2026.6 shape: no .content; ha-dialog in the dialog shadow, div.body in
  // ha-dialog's shadow. Without it activeEditDialog finds no 2026.6 card dialog.
  const haDialog2026 = {
    ...hiddenBox,
    shadowRoot: { querySelector: (s) => (s === 'div.body' ? visibleBox : null) },
  };
  assert.equal(
    visibleDialogSurface({ shadowRoot: { querySelector: (s) => (s === 'ha-dialog' ? haDialog2026 : null) } }),
    true,
  );

  // 2026.6 wa-dialog fallback when div.body is absent.
  const haDialogWa = {
    ...hiddenBox,
    shadowRoot: { querySelector: (s) => (s === 'wa-dialog' ? visibleBox : null) },
  };
  assert.equal(
    visibleDialogSurface({ shadowRoot: { querySelector: (s) => (s === 'ha-dialog' ? haDialogWa : null) } }),
    true,
  );

  // Last resort: a visible ha-dialog host itself.
  const haDialogBare = {
    ...visibleBox,
    shadowRoot: { querySelector: () => null },
  };
  assert.equal(
    visibleDialogSurface({ shadowRoot: { querySelector: (s) => (s === 'ha-dialog' ? haDialogBare : null) } }),
    true,
  );

  // Closed/hidden dialogs are still rejected: nothing visible anywhere.
  const haDialogHidden = {
    ...hiddenBox,
    shadowRoot: { querySelector: () => null },
  };
  assert.equal(
    visibleDialogSurface({ shadowRoot: { querySelector: (s) => (s === 'ha-dialog' ? haDialogHidden : null) } }),
    false,
  );
  assert.equal(visibleDialogSurface({ shadowRoot: { querySelector: () => null } }), false);
  assert.equal(visibleDialogSurface(null), false);

  // activeEditDialog finds a 2026.6-shaped dialog end to end.
  const dialog2026 = { shadowRoot: { querySelector: (s) => (s === 'ha-dialog' ? haDialog2026 : null) } };
  global.document = {
    querySelector: (selector) =>
      selector === 'home-assistant'
        ? { shadowRoot: { querySelectorAll: (s) => (s === 'hui-dialog-edit-card' ? [dialog2026] : []) } }
        : null,
  };
  assert.equal(activeEditDialog(), dialog2026);
});

test('dialog candidates cover document, legacy root, and depth-1 child shadow mounts', () => {
  installDomGlobals();
  const docDialog = { id: 'doc-level' };
  const legacyDialog = { id: 'legacy-root' };
  const depth1Dialog = { id: 'depth-1' };

  const mainChild = {
    shadowRoot: { querySelectorAll: (s) => (s === 'hui-dialog-edit-card' ? [depth1Dialog] : []) },
  };
  const plainChild = {};
  global.document = {
    querySelectorAll: (s) => (s === 'hui-dialog-edit-card' ? [docDialog] : []),
    querySelector: (selector) =>
      selector === 'home-assistant'
        ? {
            shadowRoot: {
              querySelectorAll: (s) => (s === 'hui-dialog-edit-card' ? [legacyDialog] : []),
              children: [plainChild, mainChild],
            },
          }
        : null,
  };

  // All three mounts found, deduped, document-level first (cheapest probe).
  assert.deepEqual(editCardDialogCandidates(), [docDialog, legacyDialog, depth1Dialog]);

  // A dialog only one shadow level below the legacy root, as in Home Assistant 2026.6:
  // activeEditDialog finds it when its surface is visible.
  const visibleBody = { nodeType: 1, getBoundingClientRect: () => ({ width: 320, height: 240 }) };
  const movedDialog = {
    shadowRoot: {
      querySelector: (s) =>
        s === 'ha-dialog'
          ? { nodeType: 1, getBoundingClientRect: () => ({ width: 0, height: 0 }), shadowRoot: { querySelector: (q) => (q === 'div.body' ? visibleBody : null) } }
          : null,
    },
  };
  global.document = {
    querySelectorAll: () => [],
    querySelector: (selector) =>
      selector === 'home-assistant'
        ? {
            shadowRoot: {
              querySelectorAll: () => [],
              children: [{ shadowRoot: { querySelectorAll: (s) => (s === 'hui-dialog-edit-card' ? [movedDialog] : []) } }],
            },
          }
        : null,
  };
  assert.equal(activeEditDialog(), movedDialog);

  // Stubbed documents without querySelectorAll stay safe (try/catch path).
  global.document = { querySelector: () => null };
  assert.deepEqual(editCardDialogCandidates(), []);
  assert.equal(activeEditDialog(), null);
});

test('2026.6 binding: dialog editor view binds via DOM when the composedPath is retargeted', () => {
  installDomGlobals();
  const box = (w = 300, h = 200) => ({ nodeType: 1, getBoundingClientRect: () => ({ width: w, height: h }) });

  // Build the 2026.6 shadow chain: dialog ▸ ha-dialog ▸ wa-dialog ▸ ha-code-editor.
  const cmEditor = box();
  const view = { state: { doc: { length: 3 } }, dispatch() {}, dom: cmEditor, coordsAtPos() {} };
  const haCodeEditor = {
    ...box(),
    tagName: 'HA-CODE-EDITOR',
    codemirror: view,
    shadowRoot: { querySelector: (s) => (s === '.cm-editor' ? cmEditor : null) },
  };
  const waShadow = {
    querySelectorAll: (s) => (s === 'ha-code-editor' ? [haCodeEditor] : s === '*' ? [haCodeEditor] : []),
  };
  const waDialog = { ...box(), tagName: 'WA-DIALOG', shadowRoot: waShadow };
  const haDialogShadow = {
    querySelector: (s) => (s === 'div.body' ? box() : null),
    querySelectorAll: (s) => (s === 'ha-code-editor' ? [] : s === '*' ? [waDialog] : []),
  };
  const haDialog = { ...box(), tagName: 'HA-DIALOG', shadowRoot: haDialogShadow };
  const dialogShadow = {
    querySelector: (s) => (s === 'ha-dialog' ? haDialog : null),
    querySelectorAll: (s) => (s === 'ha-code-editor' ? [] : s === '*' ? [haDialog] : []),
  };
  const dialog = { ...box(), tagName: 'HUI-DIALOG-EDIT-CARD', shadowRoot: dialogShadow };

  // composedContains chain: cmEditor ▸ ha-code-editor ▸ wa-dialog ▸ ha-dialog ▸ dialog.
  cmEditor.getRootNode = () => ({ host: haCodeEditor });
  haCodeEditor.getRootNode = () => ({ host: waDialog });
  waDialog.getRootNode = () => ({ host: haDialog });
  haDialog.getRootNode = () => ({ host: dialog });
  dialog.getRootNode = () => ({});

  global.document = {
    querySelectorAll: (s) => (s === 'hui-dialog-edit-card' ? [dialog] : []),
    querySelector: (selector) =>
      selector === 'home-assistant'
        ? { shadowRoot: { querySelectorAll: () => [], children: [] } }
        : null,
  };

  // The DOM finder reaches the editor through three shadow layers…
  assert.equal(dialogCodeEditorElement(dialog), haCodeEditor);
  assert.equal(dialogCodeEditorView(), view);

  // …isScopedEditorEvent treats a retargeted path (no editor-surface nodes,
  // only the dialog) as scoped because the dialog hosts an editor…
  const retargetedEvent = { composedPath: () => [waDialog, dialog], target: waDialog };
  assert.equal(isScopedEditorEvent(retargetedEvent), true);

  // …and viewFromEvent binds the dialog's view via the DOM fallback.
  assert.equal(viewFromEvent(retargetedEvent, { state: {} }), view);

  // A dashboard event (no active edit dialog) stays out of scope.
  global.document = { querySelectorAll: () => [], querySelector: () => null };
  assert.equal(isScopedEditorEvent({ composedPath: () => [box()], target: box() }), false);
  assert.equal(dialogCodeEditorView(), null);
});

test('active editor view-shape helper accepts only CodeMirror-like views', () => {
  assert.equal(looksLikeView({
    state: {},
    dispatch() {},
    dom: {},
    coordsAtPos() {},
  }), true);
  assert.equal(looksLikeView({ state: {}, dispatch() {}, dom: {} }), false);
  assert.equal(looksLikeView(null), false);
});

test('active editor diagnostics readout helpers truncate strings, reject a too small box and recognize a view by its state and dom', () => {
  installDomGlobals();
  assert.equal(activeEditorReadoutString('abcdef', 4), 'abcd…');
  assert.equal(activeEditorReadoutString(null, 4), '');

  const visibleEl = {
    nodeType: 1,
    getBoundingClientRect: () => ({ width: 9, height: 9 }),
  };
  assert.equal(activeEditorReadoutVisible(visibleEl), true);
  assert.equal(activeEditorReadoutVisible({ ...visibleEl, getBoundingClientRect: () => ({ width: 8, height: 9 }) }), false);
  assert.equal(activeEditorReadoutVisible(null), false);

  assert.equal(activeEditorReadoutLooksLikeView({
    state: { doc: { toString: () => 'abc' }, selection: { main: { head: 1 } } },
    dom: {},
  }), true);
  assert.equal(activeEditorReadoutLooksLikeView({ state: {}, dom: {} }), false);
});

test('active editor line position helper keeps cursor previews bounded', () => {
  const cursor = activeEditorReadoutLinePosition('one\ntwo three\nfour', 9, {
    string: (value) => activeEditorReadoutString(value, 5),
  });
  assert.deepEqual(cursor, {
    pos: 9,
    lineNumber: 2,
    column: 5,
    linePreview: 'two t…',
    beforeCursorPreview: 'two t',
    afterCursorPreview: 'hree',
  });

  const clamped = activeEditorReadoutLinePosition('abc', 99);
  assert.equal(clamped.pos, 3);
  assert.equal(clamped.lineNumber, 1);
  assert.equal(clamped.column, 3);
});


test('active editor readout traversal settings helpers read the perf mode and count the traversals by mode', () => {
  const legacyStorage = { getItem: (key) => key === 'nostrodomusPerf' ? 'legacy' : null };
  const defaultStorage = { getItem: () => 'on' };

  assert.equal(activeEditorReadoutTraversalScopedEnabled({ storage: legacyStorage }), false);
  assert.equal(activeEditorReadoutTraversalScopedEnabled({ storage: defaultStorage }), true);

  const state = {};
  const first = recordActiveEditorReadoutTraversal(state, { mode: 'targeted', selector: 'home-assistant', children: 2, visits: 3, queuedRoots: 1 });
  assert.equal(state.activeEditorReadoutTraversalMode, 'targeted');
  assert.equal(state.activeEditorReadoutTargetedTraversals, 1);
  assert.equal(first.selector, 'home-assistant');
  assert.equal(first.children, 2);

  recordActiveEditorReadoutTraversal(state, { mode: 'legacy-wildcard' });
  assert.equal(state.activeEditorReadoutLegacyWildcardTraversals, 1);
  assert.equal(state.lastActiveEditorReadoutTraversal.mode, 'legacy-wildcard');
});

test('active editor diagnostics discovery helpers stay bounded and read-only', () => {
  installDomGlobals();
  const view = {
    state: { doc: { toString: () => 'type: custom:button-card' }, selection: { main: { head: 4 } } },
    dom: {
      nodeType: 1,
      getBoundingClientRect: () => ({ width: 120, height: 80 }),
      contains: (node) => node?.tagName === 'TEXTAREA',
    },
  };
  const editorNode = {
    tagName: 'HA-CODE-EDITOR',
    className: '',
    cmTile: { view },
    querySelector: () => null,
  };
  const root = {
    activeElement: editorNode,
    querySelectorAll: () => [editorNode],
  };
  editorNode.shadowRoot = { activeElement: { tagName: 'TEXTAREA' } };

  const activePath = activeEditorReadoutDeepActivePath({ document: root });
  assert.deepEqual(activePath.map((node) => node.tagName), ['HA-CODE-EDITOR', 'TEXTAREA']);
  assert.deepEqual(activeEditorReadoutNodeViewCandidates(editorNode), [view]);

  const visited = [];
  activeEditorReadoutWalkRoots(root, (node) => visited.push(node.tagName), { maxNodeVisits: 8 });
  assert.deepEqual(visited, ['HA-CODE-EDITOR']);

  const targetedVisited = [];
  const traversalSummaries = [];
  const shadowRoot = { querySelectorAll: () => [] };
  const targetedRoot = {
    querySelectorAll: (selector) => {
      assert.equal(selector, ACTIVE_EDITOR_READOUT_TARGETED_SHADOW_HOST_SELECTOR);
      return [{ tagName: 'HOME-ASSISTANT', shadowRoot }, editorNode];
    },
  };
  activeEditorReadoutWalkRoots(targetedRoot, (node) => targetedVisited.push(node.tagName), {
    maxNodeVisits: 8,
    targetedTraversal: true,
    onTraversal: (summary) => traversalSummaries.push(summary),
  });
  assert.deepEqual(targetedVisited, ['HOME-ASSISTANT', 'HA-CODE-EDITOR']);
  assert.equal(traversalSummaries[0].mode, 'targeted');
  assert.equal(traversalSummaries[0].children, 2);

  const found = activeEditorReadoutFindView({
    document: root,
    string: (value) => activeEditorReadoutString(value, 12),
    maxCandidates: 4,
    maxNodeVisits: 8,
  });
  assert.equal(found.view, view);
  assert.equal(found.candidateCount, 1);
  assert.deepEqual(found.activePath, ['HA-CODE-EDIT…', 'TEXTAREA']);
});

test('active editor diagnostics redaction helper truncates the snapshot strings and adds the cursor', () => {
  const redacted = activeEditorReadoutRedactSnapshot({
    ok: true,
    stage: 'stage-name-that-is-way-too-long',
    version: 2,
    dryRunOnly: true,
    snapshot: {
      language: 'yaml-language-name-that-is-too-long',
      scope: 'lovelace-card',
      confidence: 0.75,
      yaml: { key: 'value' },
      branch: { path: ['cards'] },
      card: { type: 'button' },
      suggestion: { mode: 'key' },
      runtime: { providers: 3 },
    },
    warnings: ['warning-one-that-is-long', 'warning-two'],
  }, {
    pos: 5,
    lineNumber: 1,
    column: 5,
    linePreview: 'line',
    beforeCursorPreview: 'bef',
    afterCursorPreview: 'aft',
  }, {
    string: (value, limit) => activeEditorReadoutString(value, Math.min(limit, 10)),
  });

  assert.equal(redacted.ok, true);
  assert.equal(redacted.dryRunOnly, true);
  assert.equal(redacted.redacted, true);
  assert.equal(redacted.snapshot.cursor.pos, 5);
  assert.equal(redacted.snapshot.language, 'yaml-langu…');
  assert.equal(redacted.snapshot.yaml.key, 'value');
  assert.deepEqual(redacted.warnings, ['warning-on…', 'warning-tw…']);
});



test('active editor context snapshot readout helper reports the editor, the cursor and the snapshot of the active view', () => {
  installDomGlobals();
  const view = {
    state: { doc: { toString: () => 'type: custom:button-card' }, selection: { main: { head: 4 } } },
    dom: {
      nodeType: 1,
      getBoundingClientRect: () => ({ width: 120, height: 80 }),
      contains: (node) => node?.tagName === 'TEXTAREA',
    },
  };
  const editorNode = {
    tagName: 'HA-CODE-EDITOR',
    className: '',
    cmTile: { view },
    querySelector: () => null,
  };
  const root = {
    activeElement: editorNode,
    querySelectorAll: () => [editorNode],
  };
  editorNode.shadowRoot = { activeElement: { tagName: 'TEXTAREA' } };
  const traversals = [];
  const readout = createActiveEditorContextSnapshotReadout({
    document: root,
    stage: 'test-stage',
    version: 7,
    maxCandidates: 4,
    maxNodeVisits: 8,
    traversalScoped: () => true,
    onTraversal: (summary) => traversals.push(summary),
    collectSnapshot: ({ doc, pos, scope }) => ({
      ok: true,
      stage: scope,
      version: 2,
      dryRunOnly: true,
      snapshot: { language: 'yaml', scope: 'lovelace', confidence: 0.9 },
      warnings: [`${doc.length}:${pos}`],
    }),
  });

  assert.equal(readout.ok, true);
  assert.equal(readout.stage, 'test-stage');
  assert.equal(readout.version, 7);
  assert.equal(readout.editorFound, true);
  assert.equal(readout.editor.cursorOffset, 4);
  assert.equal(readout.snapshot.stage, 'active-editor-console-diagnostics');
  assert.equal(readout.snapshot.snapshot.language, 'yaml');
  assert.equal(traversals[0].mode, 'targeted');
});
