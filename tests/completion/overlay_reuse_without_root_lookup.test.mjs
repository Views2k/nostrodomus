import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureCompletionOverlay } from '../../src/completion/popupRuntime.js';
import { nostrodomusCodeEditorOverlayRoot } from '../../src/editor/overlayRoot.js';
import { uiAccentVarsFromSettings } from '../../src/ui/codeboxStyle.js';

// One refresh asks for the list box three or four times. Each time resolved the
// overlay root again, which costs an active-dialog lookup with layout reads. While the box sits
// in the overlay host of the bound editor's own root, the root cannot have changed.

function makeNode(tag, rootOf = null) {
  const node = {
    tag,
    id: '',
    children: [],
    parentNode: null,
    dataset: {},
    style: { cssText: '', vars: {}, setProperty(name, value) { this.vars[name] = String(value); } },
    appendChild(child) { node.children.push(child); child.parentNode = node; return child; },
    removeChild(child) { node.children = node.children.filter(x => x !== child); child.parentNode = null; return child; },
    removeAttribute() {},
    querySelector(selector) {
      const id = selector.startsWith('#') ? selector.slice(1) : '';
      const walk = el => {
        for (const child of el.children) {
          if (id && child.id === id) return child;
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      return walk(node);
    },
    // The root of the tree the node is in; a node that is not attached is its own root.
    getRootNode() {
      let top = node;
      while (top.parentNode) top = top.parentNode;
      return top === node && rootOf ? rootOf() : top;
    },
  };
  return node;
}

// An editor in a shadow root of its own, as ha-code-editor has.
function editor() {
  const root = makeNode('#shadow-root');
  const dom = root.appendChild(makeNode('div.cm-editor'));
  return { root, view: { dom } };
}

function harness() {
  const body = makeNode('body');
  const documentRef = { body, createElement: tag => makeNode(tag) };
  const first = editor();
  const state = { settings: { style: { codeboxBorderHue: 0 } }, view: first.view, overlay: null, overlayRoot: null };
  let lookups = 0;
  let removed = 0;
  const deps = {
    documentRef,
    // The real resolution, counted. settingsPortalRuntime adds an active-dialog lookup per call.
    overlayRoot: () => { lookups += 1; return nostrodomusCodeEditorOverlayRoot({ documentRef, currentView: state.view }); },
    removeOverlay: () => {
      removed += 1;
      if (state.overlay?.parentNode) state.overlay.parentNode.removeChild(state.overlay);
      state.overlay = null;
      state.overlayRoot = null;
    },
  };
  return { state, deps, first, body, lookups: () => lookups, removed: () => removed };
}

test('the list box of the bound editor is reused without resolving the overlay root again', () => {
  const h = harness();
  const box = ensureCompletionOverlay(h.state, h.deps);
  assert.equal(h.lookups(), 1, 'the first call resolves the root');
  assert.equal(h.state.overlayRoot.getRootNode(), h.first.root, 'the host is in the root of the editor');
  const removedAtCreate = h.removed();

  for (let i = 0; i < 4; i += 1) assert.equal(ensureCompletionOverlay(h.state, h.deps), box);
  assert.equal(h.lookups(), 1, 'the reuse path does not resolve it again');
  assert.equal(h.removed(), removedAtCreate, 'nothing is removed or created');
});

test('the reuse path still refreshes the accent', () => {
  const h = harness();
  const box = ensureCompletionOverlay(h.state, h.deps);
  h.state.settings.style = { codeboxBorderHue: 220 };
  ensureCompletionOverlay(h.state, h.deps);
  assert.equal(box.style.vars['--nostrodomus-brand-rgb'], uiAccentVarsFromSettings(h.state.settings.style).brand);
  assert.equal(h.lookups(), 1);
});

test('another editor, a removed host or a removed box resolves the root again', () => {
  const h = harness();
  const box = ensureCompletionOverlay(h.state, h.deps);
  const removedAtCreate = h.removed();

  const second = editor();
  h.state.view = second.view;
  const moved = ensureCompletionOverlay(h.state, h.deps);
  assert.equal(h.lookups(), 2, 'the bound editor changed');
  assert.equal(h.removed(), removedAtCreate + 1, 'the box of the first editor is removed');
  assert.notEqual(moved, box);
  assert.equal(h.state.overlayRoot.getRootNode(), second.root);

  // Home Assistant re-rendered the editor's root and dropped the host.
  second.root.removeChild(h.state.overlayRoot);
  const recreated = ensureCompletionOverlay(h.state, h.deps);
  assert.equal(h.lookups(), 3, 'the host left the root');
  assert.equal(h.state.overlayRoot.getRootNode(), second.root, 'a new host in the same root');
  assert.notEqual(recreated, moved);

  h.state.overlayRoot.removeChild(recreated);
  ensureCompletionOverlay(h.state, h.deps);
  assert.equal(h.lookups(), 4, 'the box left its host');
});

test('without a bound editor the root is resolved on every call, as before', () => {
  const h = harness();
  h.state.view = null;
  ensureCompletionOverlay(h.state, h.deps);
  ensureCompletionOverlay(h.state, h.deps);
  ensureCompletionOverlay(h.state, h.deps);
  assert.equal(h.lookups(), 3);
});
