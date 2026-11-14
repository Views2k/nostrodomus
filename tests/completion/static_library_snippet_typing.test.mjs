import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIndex, loadLibrary } from '../../src/providers/staticLibraryProvider.js';
import { createCompletionInsertionRuntime } from '../../src/completion/insertionRuntime.js';

// The webdev-pack rows that carry ${N:...} templates must be
// typed 'snippet', or the snippet gate (parseSnippetTemplate only for snippet
// items) makes accepting them insert the literal "${1:click}" text.
const TEMPLATE_ROW_IDS = Object.freeze({
  js: [
    'js.add_event_listener',
    'js.request_animation_frame',
    'js.local_storage_set',
    'js.array_map',
    'js.array_filter',
    'js.array_reduce',
  ],
  html: ['html.md_bold', 'html.md_link', 'html.ha_alert'],
  json: ['json.title', 'json.content', 'json.card', 'json.entity_id'],
});

const ENABLED_LANGS = Object.freeze({ yaml: true, css: true, js: true, jinja: true, html: true, json: true, python: true });

async function createProviderState() {
  const state = {
    settings: { enabledLangs: { ...ENABLED_LANGS }, providers: {}, globalSearch: false },
    completionCache: new Map(),
  };
  await loadLibrary({
    state,
    buildIndex: () => buildIndex({ state, ensureProviderSettings: () => null }),
  });
  if (!state.index) buildIndex({ state, ensureProviderSettings: () => null });
  return state;
}

function indexedItem(state, lang, id) {
  const item = (state.index?.byLang?.[lang] || []).find(row => row?.id === id);
  assert.ok(item, `expected ${id} in the ${lang} pack index`);
  return item;
}

function createView(doc = '') {
  return {
    state: { doc: { length: doc.length, sliceString: () => doc }, selection: { main: { from: 0, to: 0 } } },
    dispatches: [],
    dispatch(payload) {
      this.dispatches.push(payload);
      const inserted = payload?.changes?.insert;
      if (typeof inserted === 'string') this.state.doc.length += inserted.length;
    },
  };
}

function runtimeFor(view, lang) {
  const state = {
    enabled: true,
    view,
    settings: { acceptMode: 'replace' },
    context: { lang, line: '', beforeCursor: '', from: 0, to: 0, wordTo: 0 },
  };
  const runtime = createCompletionInsertionRuntime({
    state,
    closeCompletion: () => {},
    recordRecentAcceptedCompletion: () => {},
    scheduleFrame: fn => fn(),
    now: () => 1000,
  });
  return { runtime, state };
}

test('webdev template rows are typed snippet so their tabstops parse', async () => {
  const state = await createProviderState();
  for (const [lang, ids] of Object.entries(TEMPLATE_ROW_IDS)) {
    for (const id of ids) {
      const item = indexedItem(state, lang, id);
      assert.ok(item.insert.includes('${'), `${id} should carry a \${N:...} template`);
      assert.equal(item.type, 'snippet', `${id} carries a template but is typed '${item.type}'`);
    }
  }
});

test('accepting a webdev template row expands placeholders instead of inserting literal ${N}', async () => {
  const providerState = await createProviderState();

  const mapItem = indexedItem(providerState, 'js', 'js.array_map');
  const jsView = createView('');
  const js = runtimeFor(jsView, 'js');
  assert.equal(js.runtime.insertItem(mapItem), true);
  const jsInserted = jsView.dispatches[0].changes.insert;
  assert.ok(!jsInserted.includes('${'), `literal template reached the document: ${JSON.stringify(jsInserted)}`);
  assert.equal(jsInserted, '.map(x => x)');
  assert.ok(js.state.snippetSession, 'accepting the template should start a tabstop session');
  assert.ok(js.state.snippetSession.placeholders.length >= 2, 'both tabstops should be tracked');

  const titleItem = indexedItem(providerState, 'json', 'json.title');
  const jsonView = createView('');
  const json = runtimeFor(jsonView, 'json');
  assert.equal(json.runtime.insertItem(titleItem), true);
  const jsonInserted = jsonView.dispatches[0].changes.insert;
  assert.ok(!jsonInserted.includes('${'), `literal template reached the document: ${JSON.stringify(jsonInserted)}`);
  assert.equal(jsonInserted, '"title": "Title"');
});

test('bare $N in a non-snippet value still inserts verbatim', () => {
  const view = createView('');
  const { runtime } = runtimeFor(view, 'yaml');
  assert.equal(runtime.insertItem({ label: 'mqtt topic', insert: 'mqtt/$0/state', type: 'card' }), true);
  const inserted = view.dispatches[0].changes.insert;
  assert.ok(inserted.includes('$0'), `expected literal $0 preserved, got: ${JSON.stringify(inserted)}`);
  assert.ok(!inserted.includes('mqtt//state'), `value corrupted by snippet parse: ${JSON.stringify(inserted)}`);
});
