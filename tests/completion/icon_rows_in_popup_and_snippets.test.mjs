import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';
import { HA_VALUE_PROVIDER_ID } from '../../src/core/runtimeConstants.js';
import { renderCompletionPopup } from '../../src/completion/popupRuntime.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { haRuntimeValueProvider, runtimeData } from '../../src/providers/haRuntimeProvider.js';
import { createIconSetCatalog } from '../../src/providers/iconSetCatalog.js';
import { iconFor, itemKindLabel, shortItemMeta } from '../../src/ui/suggestionPopup.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// Icon rows show the icon itself in the suggestion list, and a snippet placeholder that holds an
// icon offers the icons when Tab reaches it.

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.parentNode = null;
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter(x => x !== child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
  querySelector(selector) {
    if (selector !== '[data-nostrodomus-list="1"]') return null;
    const walk = el => {
      for (const child of el.children || []) {
        if (child.dataset?.nostrodomusList === '1') return child;
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    };
    return walk(this);
  }
}

function fakeDocument(withHaIcon) {
  return {
    createElement: tag => new FakeElement(tag),
    createTextNode: text => ({ tag: '#text', textContent: String(text) }),
    defaultView: withHaIcon ? { customElements: { get: name => (name === 'ha-icon' ? class {} : undefined) } } : {},
  };
}

function renderRows(documentRef, items) {
  const box = new FakeElement('div');
  box.style.display = 'block';
  const state = { settings: { popupSize: 'compact' }, selected: 0, context: { lang: 'yaml', prefix: '' }, items, overlay: box };
  renderCompletionPopup(state, {
    documentRef,
    ensureOverlay: () => box,
    insertItem: () => {},
    openSettings: () => {},
    preserveScrollDuring: fn => fn(),
    measurePerformanceEvent: (_name, _label, fn) => fn(),
    placeAtCursor: () => {},
  });
  return box.querySelector('[data-nostrodomus-list="1"]').children;
}

const ICON_ROW = { label: 'm3o:home', insert: 'm3o:home', type: 'icon', source: 'ha', meta: { sourceDetail: 'Material Symbols Outlined' } };
const KEY_ROW = { label: 'icon:', insert: 'icon: ', type: 'key', source: 'static', meta: {} };

test('with ha-icon defined, an icon row starts with the icon drawn by ha-icon', () => {
  const [iconRow, keyRow] = renderRows(fakeDocument(true), [ICON_ROW, KEY_ROW]);
  assert.equal(iconRow.children[0].tag, 'ha-icon');
  assert.equal(iconRow.children[0].attributes.icon, 'm3o:home');
  assert.ok(iconRow.children[0].style.cssText.includes('--mdc-icon-size:16px'));
  assert.equal(keyRow.children[0].tag, 'span', 'other rows keep their letters');
});

test('without ha-icon, or with a value that is not an icon id, the row keeps its letters', () => {
  const [plain] = renderRows(fakeDocument(false), [ICON_ROW]);
  assert.equal(plain.children[0].tag, 'span');
  assert.equal(plain.children[0].textContent, 'Ic');
  const [odd] = renderRows(fakeDocument(true), [{ ...ICON_ROW, label: 'home"onload', insert: 'home"onload' }]);
  assert.equal(odd.children[0].tag, 'span');
});

test('icon rows are labeled as icons of their set', () => {
  assert.equal(iconFor(ICON_ROW), 'Ic');
  assert.equal(itemKindLabel(ICON_ROW), 'Icon');
  assert.equal(shortItemMeta({ ...ICON_ROW, source: HA_VALUE_PROVIDER_ID }), 'Material Symbols Outlined');
});

async function loadedData() {
  let at = 50000;
  const windowRef = { customIcons: { m3r: { getIcon: async () => ({ path: '' }), getIconList: async () => [{ name: 'home' }, { name: 'light' }] } } };
  const catalog = createIconSetCatalog({ windowRef, now: () => at });
  const options = { state: {}, findHass: () => null, now: () => at, iconSets: catalog };
  runtimeData(options);
  await new Promise(resolve => setTimeout(resolve, 0));
  at += 5000;
  return runtimeData(options);
}

function snippetRuntime(doc, placeholders, data) {
  const view = {
    text: doc,
    dispatches: [],
    // The caret is in the snippet, at its first placeholder.
    state: { selection: { main: { anchor: placeholders[0].start, head: placeholders[0].start } } },
    dispatch(payload) {
      view.dispatches.push(payload);
      const change = payload.changes;
      if (change) view.text = view.text.slice(0, change.from) + change.insert + view.text.slice(change.to);
      if (payload.selection) view.state.selection = { main: { anchor: payload.selection.anchor, head: payload.selection.head ?? payload.selection.anchor } };
    },
  };
  const settings = { keepOpen: false, idlePaneText: true, enterCompletes: true, tabCompletes: true, enabledLangs: { yaml: true }, maxItems: 60 };
  const state = { enabled: true, settings, items: [], selected: 0, overlay: { style: { display: 'none' } }, context: {}, view };
  const provider = haRuntimeValueProvider({ runtimeData: () => data });
  state.snippetSession = { view, from: 0, index: -1, placeholders, allPlaceholders: placeholders.map(p => ({ ...p })), finalCursor: null };
  const runtime = createCompletionRuntime({
    state,
    documentRef: {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    now: () => 1000,
    renderCompletionPopup: () => {},
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    getDoc: () => view.text,
    getPos: () => view.state.selection.main.head,
    detectContext: (text, pos, triggerKind) => detectRuntimeContext(text, pos, { triggerKind, runtimeData: data }),
    scoreItems: ctx => scoreItems(ctx, { settings, providerCandidates: c => (provider.canHandle(c) ? provider.provide(c) : []) }),
    updateContextInspectorPanel: () => {},
    updateSuggestionQualityPanel: () => {},
    recordRuntimeError: () => {},
    recordRuntimeErrorOnce: () => {},
    isViewAllowed: () => true,
    loadLibrary: async () => {},
    logDebug: () => {},
    openSettings: () => {},
    preserveScrollDuring: fn => fn(),
    editorDispatchRepeatPressureActive: () => false,
    recordPerformanceEvent: () => {},
    closeSettings: () => {},
    clearSnippetSession: () => { state.snippetSession = null; },
    moveSnippetPlaceholder: direction => {
      const session = state.snippetSession;
      session.index += direction;
      const p = session.placeholders[session.index];
      view.state.selection = { main: { anchor: p.start, head: p.end } };
    },
    insertItem: () => true,
    isScopedEditorEvent: () => true,
    isNostrodomusUiEvent: () => false,
    pathHasEditorSurface: () => true,
    rememberView: () => {},
    scheduleCodeboxStyleReapply: () => {},
    observerLifecycleCloseDryRunListenerProbe: () => {},
  });
  return { state, runtime, view };
}

const key = name => ({ key: name, preventDefault() {}, stopPropagation() {}, composedPath: () => [] });

test('Tab to a placeholder that holds an icon opens the icons, and Enter replaces the placeholder', async () => {
  const data = await loadedData();
  const doc = 'type: button\nname: Hall\nicon: mdi:home';
  const nameAt = doc.indexOf('Hall');
  const iconAt = doc.indexOf('mdi:home');
  const placeholders = [
    { index: 1, start: nameAt, end: nameAt + 4 },
    { index: 2, start: iconAt, end: iconAt + 8 },
  ];
  const { state, runtime, view } = snippetRuntime(doc, placeholders, data);

  runtime.onKeydown(key('Tab'));
  assert.equal(state.overlay.style.display, 'none', 'the name placeholder has no list');

  runtime.onKeydown(key('Tab'));
  assert.equal(state.overlay.style.display, 'block');
  assert.equal(state.context.snippetChoice, true);
  const labels = state.items.map(item => item.label);
  assert.ok(labels.slice(0, 39).every(label => label.startsWith('mdi:')), 'the common icons lead');
  assert.ok(labels.includes('m3r:light'), 'the installed sets are offered');
  assert.ok(state.items.every(item => item.type === 'icon'));

  state.selected = labels.indexOf('m3r:light');
  runtime.onKeydown(key('Enter'));
  assert.equal(view.text, 'type: button\nname: Hall\nicon: m3r:light');
  assert.deepEqual(view.state.selection.main, { anchor: iconAt, head: iconAt + 'm3r:light'.length }, 'the new text stays selected for Tab');
  assert.equal(state.snippetSession.placeholders[1].end, iconAt + 'm3r:light'.length);
});
