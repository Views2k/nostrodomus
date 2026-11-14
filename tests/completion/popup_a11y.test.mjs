import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeActiveCompletion,
  syncCompletionEditorAria,
  clearCompletionPopupA11y,
  closeCompletionPopup,
} from '../../src/completion/popupRuntime.js';

// Accessibility: the completion popup announces its active option to a live region and wires
// the ARIA combobox pattern onto the focused editor so a screen reader follows selection.

function fakeContent() {
  const attrs = {};
  return {
    attrs,
    setAttribute(k, v) { attrs[k] = String(v); },
    removeAttribute(k) { delete attrs[k]; },
  };
}

function stateWith(items, selected, content) {
  return {
    items,
    selected,
    activeEditorCache: content ? { editor: { querySelector: (s) => (s === '.cm-content' ? content : null) } } : null,
  };
}

test('describeActiveCompletion reads out label, kind, and position', () => {
  const items = [{ label: 'light.turn_on', type: 'service' }, { label: 'light.toggle', type: 'service' }];
  assert.equal(describeActiveCompletion(stateWith(items, 1)), 'light.toggle, service, 2 of 2');
  assert.equal(describeActiveCompletion(stateWith(items, 0)), 'light.turn_on, service, 1 of 2');
  // hyphenated kinds read as words; empty/clamped inputs are safe.
  assert.equal(describeActiveCompletion(stateWith([{ label: 'state', type: 'trigger-type' }], 0)), 'state, trigger type, 1 of 1');
  assert.equal(describeActiveCompletion(stateWith([], 0)), '');
  assert.equal(describeActiveCompletion(stateWith(items, 99)), 'light.toggle, service, 2 of 2', 'out-of-range selection clamps');
});

test('syncCompletionEditorAria sets the combobox attributes on the focused .cm-content when open', () => {
  const content = fakeContent();
  const state = stateWith([{ label: 'a' }, { label: 'b' }], 1, content);
  syncCompletionEditorAria(state, true);
  assert.equal(content.attrs['aria-controls'], 'nostrodomus-listbox');
  assert.equal(content.attrs['aria-expanded'], 'true');
  assert.equal(content.attrs['aria-activedescendant'], 'nostrodomus-intelli-option-1');
});

test('syncCompletionEditorAria clears the attributes when closed or empty', () => {
  const content = fakeContent();
  const state = stateWith([{ label: 'a' }], 0, content);
  syncCompletionEditorAria(state, true);
  syncCompletionEditorAria(state, false);
  assert.equal(content.attrs['aria-expanded'], undefined);
  assert.equal(content.attrs['aria-controls'], undefined);
  assert.equal(content.attrs['aria-activedescendant'], undefined);
  // Open with no items is treated as closed (nothing to point at).
  syncCompletionEditorAria(stateWith([], 0, content), true);
  assert.equal(content.attrs['aria-expanded'], undefined);
});

test('syncCompletionEditorAria is fail-dark with no editor handle', () => {
  assert.doesNotThrow(() => syncCompletionEditorAria(stateWith([{ label: 'a' }], 0, null), true));
  assert.doesNotThrow(() => syncCompletionEditorAria({}, true));
  assert.doesNotThrow(() => syncCompletionEditorAria(null, true));
});

test('closeCompletionPopup clears the announcer and the editor combobox ARIA', () => {
  const content = fakeContent();
  const announcer = { textContent: 'light.toggle, service, 2 of 2' };
  const overlay = { style: { display: 'block' } };
  const state = { ...stateWith([{ label: 'a' }], 0, content), overlay, a11yAnnouncer: announcer };
  syncCompletionEditorAria(state, true);
  assert.equal(content.attrs['aria-expanded'], 'true', 'precondition: open state set the attributes');

  closeCompletionPopup(state);
  assert.equal(overlay.style.display, 'none', 'popup hidden');
  assert.equal(announcer.textContent, '', 'announcer cleared on close');
  assert.equal(content.attrs['aria-expanded'], undefined, 'editor combobox ARIA cleared on close');
});

test('clearCompletionPopupA11y clears both surfaces directly', () => {
  const content = fakeContent();
  const announcer = { textContent: 'x' };
  const state = { ...stateWith([{ label: 'a' }], 0, content), a11yAnnouncer: announcer };
  syncCompletionEditorAria(state, true);
  clearCompletionPopupA11y(state);
  assert.equal(announcer.textContent, '');
  assert.equal(content.attrs['aria-activedescendant'], undefined);
});

test('ARIA is written to the SERVED completion view, not the styling cache when they differ', () => {
  const served = fakeContent();
  const styling = fakeContent();
  const state = {
    items: [{ label: 'a' }], selected: 0,
    view: { contentDOM: served },  // the editor the completion is serving
    activeEditorCache: { editor: { querySelector: (s) => (s === '.cm-content' ? styling : null) } },
  };
  syncCompletionEditorAria(state, true);
  assert.equal(served.attrs['aria-expanded'], 'true', 'the served view gets the combobox ARIA');
  assert.ok(!('aria-expanded' in styling.attrs), 'the styling-cache editor does NOT get it');
  // Fallback: with no view, the styling cache is still used (existing behavior preserved).
  const legacy = stateWith([{ label: 'a' }], 0, fakeContent());
  syncCompletionEditorAria(legacy, true);
});
