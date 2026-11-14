import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsPortalRuntime, OVERLAY_ROOT_DIAGNOSTIC_SCOPES } from '../../src/ui/settingsPortalRuntime.js';

function makeStyle() {
  const values = new Map();
  const priorities = new Map();
  return {
    setProperty(name, value, priority = '') {
      values.set(name, value);
      priorities.set(name, priority);
    },
    getPropertyValue(name) { return values.get(name) || ''; },
    getPropertyPriority(name) { return priorities.get(name) || ''; },
  };
}

function makeElement(localName = 'div') {
  const children = [];
  const el = {
    localName,
    id: '',
    open: false,
    dataset: {},
    style: makeStyle(),
    children,
    parentNode: null,
    appendChild(child) {
      if (child.parentNode?.children) {
        const oldIndex = child.parentNode.children.indexOf(child);
        if (oldIndex >= 0) child.parentNode.children.splice(oldIndex, 1);
      }
      child.parentNode = this;
      if (!children.includes(child)) children.push(child);
      return child;
    },
    querySelector(selector) {
      if (String(selector).startsWith('#')) return children.find(child => child.id === String(selector).slice(1)) || null;
      return null;
    },
    querySelectorAll() { return children; },
    getBoundingClientRect() { return { width: 500, height: 300, left: 0, top: 0 }; },
  };
  return el;
}

function makeDocument() {
  const body = makeElement('body');
  const documentElement = makeElement('html');
  return {
    body,
    documentElement,
    createElement: makeElement,
    querySelectorAll() { return []; },
  };
}

function makeRuntime(overrides = {}) {
  const documentRef = overrides.documentRef || makeDocument();
  const state = overrides.state || {};
  const errors = [];
  const runtime = createSettingsPortalRuntime({
    documentRef,
    getComputedStyleRef: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    NodeRef: { DOCUMENT_FRAGMENT_NODE: 11 },
    state,
    nostrodomusPerfMode: () => overrides.perfMode || 'standard',
    recordRuntimeErrorOnce: (...args) => errors.push(args),
    activeEditDialog: () => overrides.activeEditDialog || null,
    activeTopLayerDialogFromModule: () => overrides.topLayerDialog || null,
    homeRoot: () => overrides.homeRoot || null,
    activeCodeboxStyleEditor: () => overrides.editor || null,
    integrationDocumentStyleRoot: () => overrides.integrationRoot || null,
  });
  return { runtime, documentRef, state, errors };
}

test('settings portal runtime exposes protected overlay-root diagnostic scopes', () => {
  assert.equal(OVERLAY_ROOT_DIAGNOSTIC_SCOPES.includes('editor:walk-open-root-query'), true);
  assert.equal(OVERLAY_ROOT_DIAGNOSTIC_SCOPES.includes('cm-root-completions-overlay'), true);
});

test('settings portal runtime mounts the settings portal in the active top-layer dialog', () => {
  const topLayerDialog = makeElement('dialog');
  topLayerDialog.open = true;
  const { runtime, state } = makeRuntime({ topLayerDialog });

  const host = runtime.settingsPortalRoot();

  assert.equal(host.id, 'nostrodomus-settings-portal-host-v1');
  assert.equal(host.parentNode, topLayerDialog);
  assert.equal(host.dataset.nostrodomusPurpose, 'settings-portal');
  assert.equal(host.dataset.nostrodomusPortalRootKind, 'top-layer-dialog');
  assert.equal(host.style.getPropertyValue('position'), 'fixed');
  assert.equal(host.style.getPropertyPriority('z-index'), 'important');
  assert.equal(state.settingsPortalHost, host);
  assert.equal(state.settingsPortalRootKind, 'top-layer-dialog');
});

test('settings portal runtime falls back through dialog shadow root, editor root, HA root, and document body', () => {
  const dialogShadow = makeElement('shadow-root');
  const dialog = { shadowRoot: dialogShadow };
  assert.equal(makeRuntime({ activeEditDialog: dialog }).runtime.activeSettingsPortalRoot(), dialogShadow);

  const editorRoot = makeElement('editor-root');
  editorRoot.nodeType = 11;
  editorRoot.host = { localName: 'ha-code-editor' };
  const editor = { getRootNode: () => editorRoot };
  assert.equal(makeRuntime({ editor }).runtime.activeSettingsPortalRoot(), editorRoot);

  const homeRoot = makeElement('home-root');
  assert.equal(makeRuntime({ homeRoot }).runtime.activeSettingsPortalRoot(), homeRoot);

  const { runtime, documentRef } = makeRuntime();
  assert.equal(runtime.activeSettingsPortalRoot(), documentRef.body);
});

test('settings portal runtime records targeted and legacy overlay traversal metrics', () => {
  const targeted = makeRuntime({ perfMode: 'standard' });
  targeted.runtime.recordOverlayRootTraversal({ selector: 'ha-code-editor', children: 2, hosts: 1 });
  assert.equal(targeted.state.overlayRootTraversalMode, 'targeted');
  assert.equal(targeted.state.overlayRootTargetedTraversals, 1);
  assert.equal(targeted.state.lastOverlayRootTraversal.selector, 'ha-code-editor');

  const legacy = makeRuntime({ perfMode: 'legacy' });
  legacy.runtime.recordOverlayRootTraversal({ children: 3, hosts: 0 });
  assert.equal(legacy.state.overlayRootTraversalMode, 'legacy-wildcard');
  assert.equal(legacy.state.overlayRootLegacyWildcardTraversals, 1);
});
