import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureCompletionOverlay } from '../../src/completion/popupRuntime.js';
import { uiAccentVarsFromSettings } from '../../src/ui/codeboxStyle.js';

// Regression guard for the popup accent: the accent CSS
// vars used to be set only when the overlay was first created, so changing the codebox accent in
// settings left the suggestion popup on the old color until the overlay was recreated. The reuse
// path now refreshes them, guarded by a signature stamp so the per-render call writes nothing when
// the accent is unchanged.

function fakeDom() {
  let setPropCalls = 0;
  const makeStyle = () => {
    const vars = {};
    return {
      vars,
      cssText: '',
      setProperty(name, value) { setPropCalls += 1; vars[name] = String(value); },
    };
  };
  const makeEl = () => ({
    id: '', style: makeStyle(), children: [],
    appendChild(c) { this.children.push(c); return c; },
    removeAttribute() {},
  });
  const root = makeEl();
  const documentRef = { createElement: () => makeEl() };
  return { root, documentRef, setPropCalls: () => setPropCalls };
}

test('the popup accent refreshes when settings change on the reuse path', () => {
  const { root, documentRef } = fakeDom();
  const state = { settings: { style: { codeboxBorderHue: 0 } } };
  const deps = { documentRef, overlayRoot: () => root, removeOverlay: () => {} };

  const box = ensureCompletionOverlay(state, deps);
  const red = uiAccentVarsFromSettings(state.settings.style);
  assert.equal(box.style.vars['--nostrodomus-brand-rgb'], red.brand, 'brand applied on create');

  // Change the codebox accent, then ensure again — the SAME box is reused, and the accent must
  // track the new hue rather than stay on the create-time value.
  state.settings.style = { codeboxBorderHue: 220 };
  const reused = ensureCompletionOverlay(state, deps);
  const blue = uiAccentVarsFromSettings(state.settings.style);
  assert.equal(reused, box, 'the live overlay is reused, not recreated');
  assert.notEqual(blue.brand, red.brand, 'sanity: the two hues produce different accents');
  assert.equal(reused.style.vars['--nostrodomus-brand-rgb'], blue.brand, 'accent refreshed on reuse');
});

test('the signature guard skips DOM writes when the accent is unchanged (hot-path safe)', () => {
  const dom = fakeDom();
  const state = { settings: { style: { codeboxBorderHue: 0 } } };
  const deps = { documentRef: dom.documentRef, overlayRoot: () => dom.root, removeOverlay: () => {} };

  ensureCompletionOverlay(state, deps);
  const afterCreate = dom.setPropCalls();
  // Two more ensures with identical settings (the per-render reuse path) must not write the vars.
  ensureCompletionOverlay(state, deps);
  ensureCompletionOverlay(state, deps);
  assert.equal(dom.setPropCalls(), afterCreate, 'unchanged accent must not re-write CSS vars');
});
