// Picker visual fix: byte-identity + bounded collection unit tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPickerStyleRuntime, buildPickerFixCss, PICKER_STYLE_ID } from '../../src/companion/pickerStyleRuntime.js';
import { PICKER_FIX_SELECTOR } from '../../src/editor/haSelectors.js';
import { readCompanion, PICKER_PATH, extractBacktickTemplate } from './_fixtures/companionSource.mjs';

// --- byte-identity: each injected stylesheet matches picker-safe source exactly ---
test('all seven picker CSS blocks are byte-identical to picker-safe source', () => {
  const src = readCompanion(PICKER_PATH);
  const built = buildPickerFixCss();
  const map = {
    picker: 'pickers.forEach', search: 'searches.forEach', searchInput: 'searchInputs.forEach',
    items: 'items.forEach', ripples: 'ripples.forEach', popover: 'popovers.forEach', popup: 'popups.forEach',
  };
  for (const [key, anchor] of Object.entries(map)) {
    assert.equal(built[key], extractBacktickTemplate(src, anchor, 0), `${key} CSS drifted from source`);
  }
});

// --- DOM stubs for the bounded collection ---
function elem(matchList, { shadowRoot = null } = {}) {
  const set = new Set(matchList);
  return { _m: set, shadowRoot, style: { setProperty: () => {} }, matches(sel) { return set.has(sel); } };
}
function root({ fix = [], hosts = [] } = {}) {
  return {
    querySelectorAll(sel) { return sel === PICKER_FIX_SELECTOR ? fix : hosts; },
    querySelector: () => null,
    appendChild: () => {},
  };
}

test('bounded collection groups targets and descends into host shadow roots', () => {
  const r = createPickerStyleRuntime({ isActive: () => true });
  const picker = elem(['ha-picker-combo-box']);
  const item = elem(['ha-picker-combo-box ha-combo-box-item']);
  const ripple = elem(['ha-picker-combo-box ha-ripple']);
  const search = elem(['ha-input-search']);
  picker.shadowRoot = root({ fix: [item, ripple, search] });
  const dialogRoot = root({ fix: [picker], hosts: [picker] });

  const g = r.collectPickerFixTargets([dialogRoot]);
  assert.deepEqual(g.pickers, [picker]);
  assert.deepEqual(g.items, [item]);
  assert.deepEqual(g.ripples, [ripple]);
  assert.deepEqual(g.searches, [search]);
  // Only them: nothing leaked into other groups
  assert.equal(g.popovers.length, 0);
  assert.equal(g.popups.length, 0);
  assert.equal(g.searchInputs.length, 0);
});

test('depth cap stops descent (targets deeper than maxDepth are not collected)', () => {
  const r = createPickerStyleRuntime({ isActive: () => true, maxDepth: 1 });
  const deepPicker = elem(['ha-picker-combo-box']);
  const mid = elem([], { shadowRoot: root({ fix: [deepPicker], hosts: [deepPicker] }) });
  const top = elem([], { shadowRoot: root({ fix: [mid], hosts: [mid] }) });
  // depth0 root -> top(host) -> depth1 -> mid(host) -> depth2(deepPicker). maxDepth=1 stops at depth1.
  const r0 = root({ fix: [top], hosts: [top] });
  const g = r.collectPickerFixTargets([r0]);
  assert.equal(g.pickers.length, 0, 'picker beyond the depth cap is not collected');
});

test('apply defers during a typing-quiet window (no inject)', () => {
  let injected = 0;
  const documentRef = { createElement: () => { injected += 1; return { style: {} }; } };
  const r = createPickerStyleRuntime({ isActive: () => true, documentRef, deferDuringTyping: () => true });
  assert.equal(r.apply([root({ fix: [elem(['ha-picker-combo-box'])], hosts: [] })]), false, 'deferred');
  assert.equal(injected, 0, 'no style created while deferred');
});

test('apply is a strict no-op while dormant', () => {
  let injected = 0;
  const documentRef = { createElement: () => { injected += 1; return { style: {} }; } };
  const r = createPickerStyleRuntime({ isActive: () => false, documentRef });
  assert.equal(r.apply([root({ fix: [elem(['ha-picker-combo-box'])], hosts: [] })]), false);
  assert.equal(injected, 0);
});

test('active apply injects the byte-identical stylesheet under the shared id (first-injector-wins)', () => {
  const built = buildPickerFixCss();
  const created = [];
  const documentRef = { createElement: () => { const el = { id: '', textContent: '', style: {} }; created.push(el); return el; } };
  const r = createPickerStyleRuntime({ isActive: () => true, documentRef, deferDuringTyping: () => false });

  // a picker whose shadow root has no existing style (we own it)
  const pickerShadow = { _styles: [], querySelector(s) { return this._styles.find((x) => `#${x.id}` === s) || null; }, appendChild(el) { this._styles.push(el); } };
  const picker = { matches: (s) => s === 'ha-picker-combo-box', shadowRoot: pickerShadow, style: { setProperty: () => {} } };
  r.apply([root({ fix: [picker], hosts: [] })]);
  assert.equal(pickerShadow._styles.length, 1, 'one style injected');
  assert.equal(pickerShadow._styles[0].id, PICKER_STYLE_ID);
  assert.equal(pickerShadow._styles[0].textContent, built.picker, 'byte-identical picker CSS injected');

  // first-injector-wins: an externally-owned id is not overwritten
  const extShadow = { _styles: [{ id: PICKER_STYLE_ID, textContent: 'EXTERNAL' }], querySelector(s) { return this._styles.find((x) => `#${x.id}` === s) || null; }, appendChild(el) { this._styles.push(el); } };
  const picker2 = { matches: (s) => s === 'ha-picker-combo-box', shadowRoot: extShadow, style: { setProperty: () => {} } };
  r.apply([root({ fix: [picker2], hosts: [] })]);
  assert.equal(extShadow._styles.length, 1, 'external style left untouched');
  assert.equal(extShadow._styles[0].textContent, 'EXTERNAL');
});

test('overlay host selector is included, not char-spread, in the picker scan selector', () => {
  const src = readFileSync(new URL('../../src/companion/pickerStyleRuntime.js', import.meta.url), 'utf8');
  // OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR is a comma-joined string; spreading it (...) expands it
  // char-by-char into malformed selectors that throw in querySelectorAll. It must be included directly.
  assert.match(src, /\n\s*OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR,/, 'overlay selector included directly into the scan array');
  assert.doesNotMatch(src, /\.\.\.\s*OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR/, 'overlay selector must not be spread (it is a string)');
});
