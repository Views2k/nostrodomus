import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';
import { completionKeyAction } from '../../src/completion/keymap.js';
import { renderCompletionPopup } from '../../src/completion/popupRuntime.js';

// settings#15. Settings opened only from a mousedown on the gear in the list header (or from the
// console). With the list open, Ctrl+, now opens them, and the gear answers a keyboard or
// assistive-technology activation as well.

const open = { popupOpen: true, scoped: true, viewAllowed: true };
const listState = () => ({ settings: {}, items: [{ label: 'name:', matchTier: 0 }], selected: 0, context: { lang: 'yaml', yamlRole: 'key', prefix: 'na' } });

test('Ctrl+, with the list open is the open-settings key', () => {
  assert.deepEqual(completionKeyAction({ key: ',', code: 'Comma', ctrlKey: true }, listState(), open), { type: 'open-settings', prevent: true, stop: true });
  // The idle pane has the gear too.
  assert.equal(completionKeyAction({ key: ',', ctrlKey: true }, { ...listState(), items: [] }, open).type, 'open-settings');
});

test('the key is taken only while the list is open in the editor, and only as Ctrl+,', () => {
  const event = { key: ',', code: 'Comma', ctrlKey: true };
  assert.equal(completionKeyAction(event, listState(), { ...open, popupOpen: false }).type, 'none', 'list closed');
  assert.equal(completionKeyAction(event, { ...listState(), settings: { keepOpen: true } }, { ...open, popupOpen: false }).type, 'none', 'list closed, keep-open mode');
  assert.equal(completionKeyAction(event, listState(), { ...open, scoped: false }).type, 'none', 'not from the editor');
  assert.equal(completionKeyAction({ ...event, altKey: true }, listState(), open).type, 'none', 'AltGr combination');
  assert.equal(completionKeyAction({ ...event, metaKey: true }, listState(), open).type, 'none', 'with the meta key');
  assert.equal(completionKeyAction({ key: ',', code: 'Comma', metaKey: true }, listState(), open).type, 'none', 'Cmd+, belongs to the browser');
  assert.equal(completionKeyAction({ key: ',', code: 'Comma' }, listState(), open).type, 'none', 'a typed comma');
  assert.equal(completionKeyAction({ key: 'k', ctrlKey: true }, listState(), open).type, 'none', 'another Ctrl key');
});

test('the other list keys are unchanged', () => {
  assert.equal(completionKeyAction({ key: ' ', code: 'Space', ctrlKey: true }, listState(), open).type, 'toggle-close');
  assert.equal(completionKeyAction({ key: 'Enter' }, listState(), open).type, 'accept');
  assert.equal(completionKeyAction({ key: 'Escape' }, listState(), open).type, 'close-escape');
  assert.equal(completionKeyAction({ key: 'Home', ctrlKey: true }, listState(), open).type, 'none');
});

test('the runtime opens Settings on Ctrl+, and keeps the key from the editor', async () => {
  const calls = [];
  const state = {
    enabled: true,
    settings: { keepOpen: false, idlePaneText: true, enterCompletes: true, tabCompletes: true },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
  };
  const runtime = createCompletionRuntime({
    state,
    documentRef: {},
    cancelAnimationFrame: () => {},
    requestAnimationFrame: fn => { fn(); return 1; },
    clearTimeout: () => {},
    setTimeout: () => 2,
    now: () => 1000,
    renderCompletionPopup: () => {},
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => 'na',
    getPos: () => 2,
    detectContext: (_doc, at, triggerKind) => ({ shouldSuggest: true, lang: 'yaml', yamlRole: 'key', prefix: 'na', from: 0, to: at, triggerKind, branchState: null }),
    scoreItems: () => [{ label: 'name:', insert: 'name: ', matchTier: 0 }],
    updateContextInspectorPanel: () => {},
    updateSuggestionQualityPanel: () => {},
    recordRuntimeError: (scope, err) => { throw err; },
    recordRuntimeErrorOnce: () => {},
    isViewAllowed: () => true,
    loadLibrary: async () => {},
    logDebug: () => {},
    openSettings: () => calls.push('openSettings'),
    preserveScrollDuring: fn => fn(),
    editorDispatchRepeatPressureActive: () => false,
    recordPerformanceEvent: () => {},
    closeSettings: () => calls.push('closeSettings'),
    clearSnippetSession: () => {},
    moveSnippetPlaceholder: () => {},
    insertItem: item => calls.push(['insert', item?.label]),
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => true,
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  const press = (event) => {
    const seen = { prevented: false, stopped: false };
    runtime.onKeydown({ ...event, preventDefault: () => { seen.prevented = true; }, stopPropagation: () => { seen.stopped = true; } });
    return seen;
  };

  assert.deepEqual(press({ key: ',', code: 'Comma', ctrlKey: true }), { prevented: false, stopped: false }, 'list closed: the key is left alone');
  assert.deepEqual(calls, []);

  await runtime.open(true);
  assert.deepEqual(press({ key: ',', code: 'Comma', ctrlKey: true }), { prevented: true, stopped: true });
  assert.deepEqual(calls, ['openSettings']);
});

// The gear button.

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.listeners = {};
    this.className = '';
    this.id = '';
    this.textContent = '';
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter(x => x !== child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get firstChild() { return this.children[0] || null; }
  querySelector() { return null; }
  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const hit = child.find?.(predicate);
      if (hit) return hit;
    }
    return null;
  }
  fire(type, extra = {}) {
    const event = { type, prevented: false, stopped: false, preventDefault() { event.prevented = true; }, stopPropagation() { event.stopped = true; }, ...extra };
    for (const handler of this.listeners[type] || []) handler(event);
    return event;
  }
}

function gearOf(items) {
  const opened = [];
  const box = new FakeElement('div');
  box.style.display = 'block';
  renderCompletionPopup({ settings: { popupSize: 'compact', idlePaneText: true }, lastExplicitOpen: true, selected: 0, context: { lang: 'yaml', prefix: '' }, items, overlay: box }, {
    documentRef: { createElement: tag => new FakeElement(tag), createTextNode: text => ({ tag: '#text', textContent: String(text) }) },
    ensureOverlay: () => box,
    insertItem: () => {},
    openSettings: () => opened.push('open'),
    preserveScrollDuring: fn => fn(),
    measurePerformanceEvent: (_name, _label, fn) => fn(),
  });
  return { gear: box.find(el => el.dataset?.nostrodomusSettings === '1'), opened };
}

for (const [label, items] of [['the list', [{ label: 'alpha', type: 'key' }]], ['the idle pane', []]]) {
  test(`the gear in ${label} opens Settings from the mouse, as before, and from a keyboard activation`, () => {
    const { gear, opened } = gearOf(items);
    assert.ok(gear, 'the gear is rendered');
    assert.equal(gear.tag, 'button');
    assert.equal(gear.type, 'button');
    assert.equal(gear.attributes['aria-label'], 'Open settings');
    assert.equal(gear.attributes['aria-keyshortcuts'], 'Control+,');
    assert.equal(gear.title, 'Open settings (Ctrl+,)');

    // Mouse: the mousedown opens; the click that follows it does not open a second time.
    assert.equal(gear.fire('mousedown').prevented, true);
    gear.fire('click', { detail: 1 });
    assert.deepEqual(opened, ['open']);

    // Enter or Space on the focused button, or a screen reader's activation: a click without a mousedown.
    const click = gear.fire('click', { detail: 0 });
    assert.deepEqual(opened, ['open', 'open']);
    assert.equal(click.prevented, true);
  });
}
