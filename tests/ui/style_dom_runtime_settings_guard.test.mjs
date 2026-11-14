import test from 'node:test';
import assert from 'node:assert/strict';

import { createStyleDomRuntime } from '../../src/ui/styleDomRuntime.js';

// The containment sweep's settings guard was doubly dead (it
// checked state.settingsOpen, which nothing writes, against a portal-host id that was
// not in the removal list) while #nostrodomus-settings-root WAS in the list -- so the
// no-active-editor cleanup silently deleted an OPEN settings panel, and the portal
// host was never swept when orphaned. Stubs mirror tests/ui/style_dom_runtime_module.test.mjs.
function makeStyle() {
  const values = new Map();
  const priorities = new Map();
  return {
    setProperty(name, value, priority = '') { values.set(name, value); priorities.set(name, priority); },
    getPropertyValue(name) { return values.get(name) || ''; },
    getPropertyPriority(name) { return priorities.get(name) || ''; },
    removeProperty(name) { values.delete(name); priorities.delete(name); },
  };
}

function makeContainer(name = 'root') {
  const children = [];
  return {
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
}

function makeDocument() {
  const doc = makeContainer('document');
  doc.head = makeContainer('head');
  doc.body = makeContainer('body');
  doc.documentElement = makeContainer('html');
  doc.createElement = localName => ({
    localName,
    id: '',
    style: makeStyle(),
    dataset: {},
    isConnected: true,
    remove() {
      if (this.parentNode?.children) {
        const index = this.parentNode.children.indexOf(this);
        if (index >= 0) this.parentNode.children.splice(index, 1);
      }
      this.parentNode = null;
      this.isConnected = false;
    },
  });
  return doc;
}

function makeRuntime(documentRef, state) {
  const runtime = createStyleDomRuntime({
    documentRef,
    NodeRef: { DOCUMENT_FRAGMENT_NODE: 11 },
    MutationObserverRef: class {
      observe() {}
      disconnect() {}
      takeRecords() { return []; }
    },
    state,
    STYLE_TEXT_SIZE_PRESETS: { base: { fontSize: 14, lineHeight: 1.5 } },
    DARKPLUS_SYNTAX_COLORS: { fg: '#eee' },
    DARKPLUS_STYLE_ID: 'darkplus-style',
    codeboxStyleTokenMap: tokens => tokens,
    codeboxStyleBuildRootCss: () => '',
    codeboxStyleSourceClassSteadyStateSkipDecision: () => ({ skip: true }),
    activeEditDialog: () => null,
    activeTopLayerDialog: () => null,
    codeboxEditorCacheKey: () => 'editor-1',
    codeboxFrameHostForEditor: () => null,
    editorUsesCodeMirrorSourceClassSyntax: () => true,
    homeRoot: () => null,
    mutationRecordsAreCodeMirrorOnly: () => false,
    mutationRecordLooksEditorStructural: () => false,
    nodeLooksLikeCodeMirrorInternals: () => false,
    recordPerformanceEvent: () => {},
    scheduleCodeboxStyleReapply: () => {},
    scheduleSourceClassSmartSyntax: () => {},
    nostrodomusPerfMode: () => 'on',
    visibleStyleEditorCandidate: () => true,
  });
  return runtime;
}

test('the open settings panel survives the containment sweep', () => {
  const documentRef = makeDocument();
  const panel = documentRef.createElement('div');
  panel.id = 'nostrodomus-settings-root';
  documentRef.appendChild(panel);
  const state = { activeEditorCache: {}, observerStats: {}, settingsPanel: panel, settingsPortalHost: null };
  const runtime = makeRuntime(documentRef, state);

  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('no-active-editor-test'), 0);
  assert.equal(panel.parentNode, documentRef, 'the live open panel must not be swept');
});

test('an orphaned portal host is swept once the panel is closed', () => {
  const documentRef = makeDocument();
  const host = documentRef.createElement('div');
  host.id = 'nostrodomus-settings-portal-host-v1';
  documentRef.appendChild(host);
  const state = { activeEditorCache: {}, observerStats: {}, settingsPanel: null, settingsPortalHost: host };
  const runtime = makeRuntime(documentRef, state);

  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('no-active-editor-test'), 1);
  assert.equal(host.parentNode, null, 'the orphaned host must be swept');
  assert.equal(state.settingsPortalHost, null, 'the swept host must not linger in runtime fields');
});

test('the portal host is kept while the panel is open inside it', () => {
  const documentRef = makeDocument();
  const host = documentRef.createElement('div');
  host.id = 'nostrodomus-settings-portal-host-v1';
  documentRef.appendChild(host);
  const panel = documentRef.createElement('div');
  panel.id = 'nostrodomus-settings-root';
  documentRef.appendChild(panel);
  const state = { activeEditorCache: {}, observerStats: {}, settingsPanel: panel, settingsPortalHost: host };
  const runtime = makeRuntime(documentRef, state);

  assert.equal(runtime.removeCodeboxRootStylesFromAllRoots('no-active-editor-test'), 0);
  assert.equal(host.parentNode, documentRef);
  assert.equal(panel.parentNode, documentRef);
});
