// The suggestion pipeline wired the way src/main.legacy.js wires it: context detection, the
// registered providers (library, snippets, context rows, catalog, Home Assistant values, words),
// the scoring runtime with the default settings, and insertItem for accepting a row. For tests
// that check the list a user sees at a cursor position and what Enter does there.

import { cloneDefaultSettings } from '../../src/core/settings.js';
import { createProviderRuntime } from '../../src/providers/providerRuntime.js';
import { createRuntimeContextRuntime } from '../../src/yaml/runtimeContextRuntime.js';
import { dashboardActionBranchState } from '../../src/yaml/runtimeContextAdapter.js';
import { createScoringRuntime } from '../../src/completion/scoringRuntime.js';
import { insertItem } from '../../src/completion/insertion.js';
import { makeHassFixture } from './hassFixture.mjs';

export const CURSOR = '<|>';

export async function suggestionPipeline(options = {}) {
  const settings = { ...cloneDefaultSettings(), ...(options.settings || {}) };
  const state = { settings, providers: [], providerStats: {}, completionCache: new Map(), context: null, items: [] };
  const cursor = { doc: '', pos: 0 };
  const windowRef = { hass: options.hass === undefined ? makeHassFixture() : options.hass, customCards: [] };
  const providerRuntime = createProviderRuntime({
    state,
    window: windowRef,
    document: null,
    getDoc: () => cursor.doc,
    getPos: () => cursor.pos,
    yamlBranchState: dashboardActionBranchState,
    logIndexed() {},
    now: () => 1000,
  });
  await providerRuntime.loadLibrary();
  const contextRuntime = createRuntimeContextRuntime({ state, runtimeData: providerRuntime.runtimeData });
  const scoringRuntime = createScoringRuntime({
    state,
    ensureProviderSettings: providerRuntime.ensureProviderSettings,
    providerCandidates: ctx => providerRuntime.providerCandidates(ctx),
    runtimeData: providerRuntime.runtimeData,
  });

  // The list at the cursor of `marked` (the text with CURSOR at the cursor), as a first request:
  // no previous list and an empty cache.
  function listAt(marked, triggerKind = 'typing') {
    const pos = marked.indexOf(CURSOR);
    const doc = marked.replace(CURSOR, '');
    cursor.doc = doc;
    cursor.pos = pos;
    state.completionCache.clear();
    state.context = null;
    state.items = [];
    const ctx = contextRuntime.detectContext(doc, pos, triggerKind);
    const items = ctx.shouldSuggest ? scoringRuntime.scoreItems(ctx) : [];
    return { doc, pos, ctx, items, labels: items.map(item => item.label) };
  }

  // The text after accepting `item` (the first row when none is given), with CURSOR at the new
  // cursor position (the start of the selected placeholder, when one is selected).
  function accept(result, item = result.items[0]) {
    const view = {
      text: result.doc,
      state: { doc: { get length() { return view.text.length; } }, selection: { main: { anchor: result.pos, head: result.pos } } },
      dispatch(payload) {
        const change = payload.changes;
        if (change) view.text = view.text.slice(0, change.from) + change.insert + view.text.slice(change.to);
        if (payload.selection) view.state.selection = { main: { anchor: payload.selection.anchor, head: payload.selection.head ?? payload.selection.anchor } };
      },
    };
    const runtimeState = { enabled: true, settings: { acceptMode: 'replace' }, view, context: result.ctx, items: [] };
    insertItem(runtimeState, item, { closeCompletion: () => {}, scheduleFrame: () => {}, now: () => 1, recordRecentAcceptedCompletion: () => {} });
    const { anchor, head } = view.state.selection.main;
    const from = Math.min(anchor, head);
    return view.text.slice(0, from) + CURSOR + view.text.slice(from);
  }

  return { state, listAt, accept };
}
