import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTopLayerDialog } from '../../src/editor/activeEditor.js';

function rootWith(nodes = []) {
  return {
    querySelectorAll(selector) {
      if (selector === 'dialog') return nodes.filter(node => node.tag === 'dialog');
      if (selector === '*') return nodes;
      return [];
    },
  };
}

test('activeTopLayerDialog returns modal dialog from active dialog shadow root', () => {
  const modal = { tag: 'dialog', open: true, appendChild() {}, matches(selector) { return selector === ':modal'; } };
  const state = {};
  const result = activeTopLayerDialog({
    documentRef: rootWith([]),
    state,
    activeEditDialog: () => ({ shadowRoot: rootWith([modal]) }),
    homeRoot: () => null,
  });

  assert.equal(result, modal);
});

test('activeTopLayerDialog preserves legacy-restored shadow traversal diagnostics', () => {
  const nested = { tag: 'dialog', open: true, appendChild() {}, matches() { return false; } };
  const host = { shadowRoot: rootWith([nested]) };
  const state = {};
  const result = activeTopLayerDialog({
    documentRef: rootWith([host]),
    state,
    activeEditDialog: () => null,
    homeRoot: () => null,
  });

  assert.equal(result, nested);
  assert.equal(state.settingsTopLayerDialogShadowTraversalMode, 'legacy-restored');
  assert.equal(state.settingsTopLayerDialogLegacyWildcardShadowTraversals, 1);
  assert.equal(state.lastSettingsTopLayerDialogShadowTraversal.reason, 'activeTopLayerDialog-settings-portal-hotfix');
});
