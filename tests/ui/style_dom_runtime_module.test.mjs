import test from 'node:test';
import assert from 'node:assert/strict';

import { createStyleDomRuntime } from '../../src/ui/styleDomRuntime.js';

function makeStyle() {
  const values = new Map();
  const priorities = new Map();
  return {
    setProperty(name, value, priority = '') { values.set(name, value); priorities.set(name, priority); },
    getPropertyValue(name) { return values.get(name) || ''; },
    getPropertyPriority(name) { return priorities.get(name) || ''; },
    removeProperty(name) { values.delete(name); priorities.delete(name); },
    _values: values,
    _priorities: priorities,
  };
}

function makeContainer(name = 'root') {
  const children = [];
  const container = {
    name,
    children,
    appendChild(node) {
      if (node.parentNode && node.parentNode.children) {
        const oldIndex = node.parentNode.children.indexOf(node);
        if (oldIndex >= 0) node.parentNode.children.splice(oldIndex, 1);
      }
      node.parentNode = this;
      if (!children.includes(node)) children.push(node);
      return node;
    },
    querySelector(selector) {
      const text = String(selector);
      if (text.startsWith('#')) return children.find(child => child.id === text.slice(1)) || null;
      if (text.startsWith('style#')) return children.find(child => child.localName === 'style' && child.id === text.slice('style#'.length)) || null;
      return null;
    },
    getElementById(id) {
      return children.find(child => child.id === id) || null;
    },
    removeChild(node) {
      const index = children.indexOf(node);
      if (index >= 0) children.splice(index, 1);
      if (node.parentNode === this) node.parentNode = null;
      return node;
    },
    querySelectorAll(selector) {
      const selectors = String(selector).split(',').map(part => part.trim()).filter(Boolean);
      return children.filter(child => selectors.some(part => part === `#${child.id}` || part === child.localName));
    },
  };
  return container;
}

function makeDocument() {
  const head = makeContainer('head');
  const body = makeContainer('body');
  const doc = makeContainer('document');
  doc.head = head;
  doc.body = body;
  doc.documentElement = makeContainer('html');
  doc.createElement = localName => ({
    localName,
    id: '',
    style: makeStyle(),
    dataset: {},
    remove() {
      if (this.parentNode?.children) {
        const index = this.parentNode.children.indexOf(this);
        if (index >= 0) this.parentNode.children.splice(index, 1);
      }
      this.parentNode = null;
    },
  });
  return doc;
}

function makeRuntime(overrides = {}) {
  const documentRef = overrides.documentRef || makeDocument();
  const state = overrides.state || { activeEditorCache: {}, observerStats: {} };
  const calls = [];
  const runtime = createStyleDomRuntime({
    documentRef,
    NodeRef: { DOCUMENT_FRAGMENT_NODE: 11 },
    MutationObserverRef: class {
      constructor(fn) { this.fn = fn; this.observed = []; }
      observe(target, options) { this.observed.push({ target, options }); }
      disconnect() { this.disconnected = true; }
      takeRecords() { return []; }
    },
    state,
    DARKPLUS_SYNTAX_COLORS: { fg: '#eee' },
    DARKPLUS_STYLE_ID: 'darkplus-style',
    codeboxStyleTokenMap: tokens => tokens,
    codeboxStyleBuildRootCss: options => `fg:${options.syntaxFg};frame:${options.frame}`,
    codeboxStyleSourceClassSteadyStateSkipDecision: () => ({ skip: true }),
    activeEditDialog: () => overrides.dialog || null,
    activeTopLayerDialog: () => overrides.topLayerDialog || null,
    codeboxEditorCacheKey: () => 'editor-1',
    codeboxFrameHostForEditor: () => overrides.frameHost || null,
    editorUsesCodeMirrorSourceClassSyntax: () => true,
    homeRoot: () => overrides.homeRoot || null,
    mutationRecordsAreCodeMirrorOnly: records => records?.cmOnly === true,
    mutationRecordLooksEditorStructural: () => false,
    nodeLooksLikeCodeMirrorInternals: node => node?.cmInternal === true,
    recordPerformanceEvent: (...args) => calls.push(['performance', ...args]),
    scheduleCodeboxStyleReapply: (...args) => calls.push(['styleReapply', ...args]),
    scheduleSourceClassSmartSyntax: (...args) => calls.push(['sourceClass', ...args]),
    nostrodomusPerfMode: () => overrides.perfMode || 'on',
    visibleStyleEditorCandidate: editor => editor?.visible !== false,
    ...overrides,
  });
  return { runtime, state, calls, documentRef };
}

test('style DOM owner creates stable style elements and keeps them attached to the root container', () => {
  const { runtime, documentRef } = makeRuntime();

  const first = runtime.ensureStableStyleElement(documentRef, 'nostrodomus-test-style');
  const second = runtime.ensureStableStyleElement(documentRef, 'nostrodomus-test-style');

  assert.equal(first.style.id, 'nostrodomus-test-style');
  assert.equal(second.style.id, 'nostrodomus-test-style');
  assert.equal(first.style, second.style);
  assert.equal(second.style.parentNode, documentRef.head);
  assert.equal(second.style.dataset.nostrodomusStableStyleNode, '1');
});

test('style DOM owner applies token CSS variables with important priority', () => {
  const { runtime } = makeRuntime();
  const el = { style: makeStyle() };

  assert.equal(runtime.applyCodeboxStyleTokensToElement(el, { '--nostrodomus-token': '42px' }), true);
  assert.equal(el.style.getPropertyValue('--nostrodomus-token'), '42px');
  assert.equal(el.style.getPropertyPriority('--nostrodomus-token'), 'important');
  assert.equal(runtime.applyCodeboxStyleTokensToElement(el, { '--nostrodomus-token': '42px' }), false);
});

test('style DOM owner discovers only active editor ownership-chain roots', () => {
  const editorRoot = makeContainer('editorRoot');
  editorRoot.nodeType = 11;
  editorRoot.host = { isConnected: true };
  const frameRoot = makeContainer('frameRoot');
  frameRoot.nodeType = 11;
  frameRoot.host = { isConnected: true };
  const frameHost = { getRootNode: () => frameRoot };
  const editor = { getRootNode: () => editorRoot, parentElement: null };
  const { runtime, documentRef } = makeRuntime({ frameHost });

  const roots = runtime.discoverOpenStyleRoots(editor);

  assert.equal(roots.includes(documentRef), true);
  assert.equal(roots.includes(editorRoot), true);
  assert.equal(roots.includes(frameRoot), true);
});

test('style DOM owner removes stale codebox styles and records bounded traversal stats', () => {
  const documentRef = makeDocument();
  const stale = documentRef.createElement('style');
  stale.id = 'nostrodomus-codebox-root-style-v1';
  documentRef.appendChild(stale);
  const { runtime, state, calls } = makeRuntime({ documentRef });

  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('test-cleanup'), 1);
  assert.equal(stale.parentNode, null);
  assert.equal(state.dashboardContainmentCleanupShadowTraversalMode, 'targeted');
  assert.deepEqual(calls.find(call => call[1] === 'dashboard-style-containment-cleanup'), [
    'performance',
    'dashboard-style-containment-cleanup',
    0,
    '1 removed:test-cleanup',
  ]);
});

test('style DOM owner installs mutation guard outside CodeMirror internals', () => {
  const editor = {
    querySelectorAll: () => [],
    closest: selector => selector === 'ha-code-editor' ? { host: true } : null,
    parentElement: { parent: true },
  };
  const { runtime, state } = makeRuntime();

  runtime.installCodeboxStyleMutationGuard(editor);

  assert.equal(state.styleMutationEditor, editor);
  assert.equal(state.observerStats.styleMutationGuardTargets, 3);
  assert.equal(state.styleMutationObserver.observed.length, 3);
});

// The cleanup walk descends only through the dashboard and dialog hosts. The root style is also put
// into every shadow root above the editor, and for an editor panel (automation or script YAML, the
// template tool) those roots, and the one of home-assistant-main, hang below hosts the walk does
// not enter. The owner tracks the roots it styled, so the stylesheet does not stay there after
// uninstall or after the editor is gone.
test('style DOM owner removes the root style from roots the cleanup walk does not reach', () => {
  const documentRef = makeDocument();
  const { runtime } = makeRuntime({ documentRef });
  const shadowRoot = (name) => {
    const root = makeContainer(name);
    root.nodeType = 11;
    root.host = { isConnected: true };
    return root;
  };
  const panelRoot = shadowRoot('ha-automation-editor');
  const mainRoot = shadowRoot('home-assistant-main');
  for (const root of [documentRef, panelRoot, mainRoot]) {
    assert.equal(runtime.ensureRootCodeboxStyle(root, 'css'), true);
    assert.equal(runtime.ensureRootCodeboxStyle(root, 'css'), false, 'unchanged on the second pass');
  }
  assert.equal(panelRoot.children.length, 1);
  assert.equal(mainRoot.children.length, 1);

  const removed = runtime.removeCodeboxRootStylesFromAllRoots('uninstall');
  assert.equal(panelRoot.children.length, 0, 'panel root cleaned');
  assert.equal(mainRoot.children.length, 0, 'home-assistant-main root cleaned');
  assert.equal(documentRef.head.children.length, 0, 'document head cleaned');
  assert.equal(removed, 3);
  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('again'), 0, 'nothing left to remove');
});

test('style DOM owner forgets a tracked root that left the page instead of holding on to it', () => {
  const documentRef = makeDocument();
  const { runtime } = makeRuntime({ documentRef });
  const closed = makeContainer('closed-dialog-editor');
  closed.nodeType = 11;
  closed.isConnected = true;
  runtime.ensureRootCodeboxStyle(closed, 'css');
  closed.isConnected = false; // the dialog closed and its editor left the page
  const next = makeContainer('next-editor');
  next.nodeType = 11;
  next.isConnected = true;
  runtime.ensureRootCodeboxStyle(next, 'css');
  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('cleanup'), 1, 'only the root still on the page is visited');
  assert.equal(closed.children.length, 1, 'the detached root is not touched');
  assert.equal(next.children.length, 0);
});

// A panel editor that is hidden but still in the page (a tab page kept alive) keeps its root
// style through a style pass that finds no editor; an uninstall removes it.
test('style DOM owner keeps the root style of a remembered root that still holds an editor', () => {
  const documentRef = makeDocument();
  const { runtime } = makeRuntime({ documentRef });
  const root = makeContainer('hidden-panel-editor');
  root.nodeType = 11;
  root.isConnected = true;
  runtime.ensureRootCodeboxStyle(root, 'css');
  const ownQuery = root.querySelector?.bind(root);
  root.querySelector = (selector) => (selector === '.cm-editor' ? { localName: 'div' } : (ownQuery ? ownQuery(selector) : null));

  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('no-active-editor-style'), 0);
  assert.equal(root.children.length, 1, 'the root style stays while the editor is there');
  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('no-active-editor-style'), 0, 'and the root stays remembered');
  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('uninstall', { everyOwnedNode: true }), 1);
  assert.equal(root.children.length, 0);
});

// The completion popup sits in a host layer that covers the window, placed in the editor's own
// root. For a panel editor the cleanup walk does not reach that root, so an uninstall left the
// layer there.
test('style DOM owner clears a styled root of every owned node on uninstall, and only of the root style otherwise', () => {
  const build = () => {
    const documentRef = makeDocument();
    const { runtime } = makeRuntime({ documentRef });
    const panelEditorRoot = makeContainer('panel-code-editor');
    panelEditorRoot.nodeType = 11;
    panelEditorRoot.isConnected = true;
    runtime.ensureRootCodeboxStyle(panelEditorRoot, 'css');
    const hostLayer = documentRef.createElement('div');
    hostLayer.id = 'nostrodomus-cm-root-overlay-host';
    panelEditorRoot.appendChild(hostLayer);
    const foreign = documentRef.createElement('div');
    foreign.id = 'home-assistant-toolbar';
    panelEditorRoot.appendChild(foreign);
    return { runtime, panelEditorRoot, hostLayer, foreign };
  };

  const cleanup = build();
  assert.equal(cleanup.runtime.removeCodeboxRootStylesFromAllRoots('no-active-editor-style'), 1);
  assert.deepEqual(cleanup.panelEditorRoot.children, [cleanup.hostLayer, cleanup.foreign], 'a pass without an editor removes the root style only');

  const uninstall = build();
  assert.equal(uninstall.runtime.removeCodeboxRootStylesFromAllRoots('uninstall', { everyOwnedNode: true }), 2);
  assert.deepEqual(uninstall.panelEditorRoot.children, [uninstall.foreign], 'the host layer is gone, Home Assistant\'s own node stays');
});
