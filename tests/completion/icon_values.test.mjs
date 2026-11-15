import test from 'node:test';
import assert from 'node:assert/strict';

import { insertItem } from '../../src/completion/insertion.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import { filterIconIdsByQuery, haRuntimeValueProvider, runtimeData, runtimeRowsForKind } from '../../src/providers/haRuntimeProvider.js';
import { createIconSetCatalog } from '../../src/providers/iconSetCatalog.js';
import { snippetProvider } from '../../src/providers/snippetProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// Icon values with the icon sets installed in Home Assistant (here two Material Symbols sets),
// typed bare, in single or double quotes, and inside a template string. Each case runs the real
// context detection, the real providers and scorer, and the real insert.

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const SETTINGS = { enabledLangs: { yaml: true, jinja: true }, maxItems: 40, acceptMode: 'replace' };

function iconWindow() {
  const list = names => async () => names.map(name => ({ name }));
  return {
    customIcons: {
      m3o: { getIcon: async () => ({ path: '' }), getIconList: list(['home', 'light', 'add-home', 'lightbulb', 'emergency-home']) },
      m3r: { getIcon: async () => ({ path: '' }), getIconList: list(['home', 'light', 'ceiling-light']) },
      brand: { getIcon: async () => ({ path: '' }), getIconList: async () => [{ name: 'acme', keywords: ['company'] }] },
    },
  };
}

async function loadedData() {
  let at = 100000;
  const state = {};
  const catalog = createIconSetCatalog({ windowRef: iconWindow(), now: () => at });
  const options = { state, findHass: () => null, now: () => at, iconSets: catalog };
  runtimeData(options);
  await flush();
  at += 5000;
  return runtimeData(options);
}

function editableView(initial) {
  const view = {
    text: initial,
    state: { doc: { get length() { return view.text.length; } }, selection: { main: { anchor: 0, head: 0 } } },
    dispatch(payload) {
      const change = payload.changes;
      if (change) view.text = view.text.slice(0, change.from) + change.insert + view.text.slice(change.to);
      if (payload.selection) view.state.selection = { main: { anchor: payload.selection.anchor, head: payload.selection.head ?? payload.selection.anchor } };
    },
  };
  return view;
}

// The document is written with the caret as `|`.
function listAt(data, docWithCaret, triggerKind = 'typing') {
  const pos = docWithCaret.indexOf('|');
  const doc = docWithCaret.replace('|', '');
  const ctx = detectRuntimeContext(doc, pos, { triggerKind, runtimeData: data });
  const providers = [snippetProvider(), haRuntimeValueProvider({ runtimeData: () => data })];
  const shown = scoreItems(ctx, {
    settings: SETTINGS,
    providerCandidates: () => providers.flatMap(provider => (provider.canHandle(ctx) ? provider.provide(ctx) : [])),
  });
  return { ctx, doc, shown, labels: shown.map(row => row.label) };
}

function accept(data, docWithCaret, label, triggerKind = 'typing') {
  const { ctx, doc, shown } = listAt(data, docWithCaret, triggerKind);
  const item = shown.find(row => row.label === label);
  assert.ok(item, `${label} is offered at ${JSON.stringify(docWithCaret)}, got ${JSON.stringify(shown.map(row => row.label).slice(0, 10))}`);
  const view = editableView(doc);
  const runtimeState = { enabled: true, settings: SETTINGS, view, context: ctx, items: shown };
  assert.equal(insertItem(runtimeState, item, { closeCompletion: () => {}, scheduleFrame: () => {}, now: () => 1 }), true);
  const head = view.state.selection.main.head;
  return view.text.slice(0, head) + '|' + view.text.slice(head);
}

test('the names of the installed icon sets are in the runtime data', async () => {
  const data = await loadedData();
  assert.ok(data.icons.includes('mdi:home'), 'the common mdi icons stay');
  assert.ok(data.iconSetIcons.includes('m3o:home') && data.iconSetIcons.includes('m3r:ceiling-light'));
  assert.deepEqual(data.iconSetPrefixes, ['brand', 'm3o', 'm3r']);
  assert.deepEqual(data.iconKeywords.get('brand:acme'), ['company']);
});

test('names that arrive while the snapshot is fresh replace it with a new object', async () => {
  let at = 100000;
  const state = {};
  const catalog = createIconSetCatalog({ windowRef: iconWindow(), now: () => at });
  const options = { state, findHass: () => null, now: () => at, iconSets: catalog };
  const first = runtimeData(options);
  assert.deepEqual(first.iconSetIcons, []);
  await flush();
  at += 100; // still inside runtimeCacheMs
  const second = runtimeData(options);
  assert.notEqual(second, first, 'a new snapshot, so a list scored with the old names is not reused');
  assert.ok(second.iconSetIcons.includes('m3o:light'));
  assert.equal(second.entities, first.entities, 'the rest of the data is kept');
  assert.equal(runtimeData(options), second, 'and kept while nothing changes');
});

test('without a catalog the snapshot has no icon set names', () => {
  const data = runtimeData({ state: {}, findHass: () => null, now: () => 1 });
  assert.deepEqual(data.iconSetIcons, []);
  assert.deepEqual(data.iconSetPrefixes, []);
  assert.ok(data.icons.length > 0);
});

test('the icon filter puts id prefixes, name prefixes and word starts first and stops at the cap', () => {
  const common = ['mdi:home', 'mdi:lightbulb'];
  const sets = ['m3o:add-home', 'm3o:home', 'm3o:home-work', 'm3o:emergency-home', 'm3o:hmm', 'm3r:home', 'm3o:ohome'];
  assert.deepEqual(
    filterIconIdsByQuery([common, sets], 'home'),
    ['mdi:home', 'm3o:home', 'm3o:home-work', 'm3r:home', 'm3o:add-home', 'm3o:emergency-home', 'm3o:ohome'],
  );
  assert.deepEqual(filterIconIdsByQuery([common, sets], 'm3o:ho'), ['m3o:home', 'm3o:home-work']);
  assert.deepEqual(filterIconIdsByQuery([common, sets], '', null, 3), ['mdi:home', 'mdi:lightbulb', 'm3o:add-home']);
  assert.deepEqual(filterIconIdsByQuery([common, sets], 'h', null, 2), ['mdi:home', 'm3o:home']);
  assert.deepEqual(filterIconIdsByQuery([common, ['mdi:home', 'm3o:x']], 'mdi:h'), ['mdi:home'], 'an id in both lists once');
  assert.deepEqual(filterIconIdsByQuery([common, ['brand:acme']], 'comp', new Map([['brand:acme', ['company']]])), ['brand:acme']);
  assert.deepEqual(filterIconIdsByQuery(null, 'x'), []);
});

test('icon rows name their set, and the common icons are marked', async () => {
  const data = await loadedData();
  const rows = runtimeRowsForKind('icon', { runtimeData: () => data, prefix: 'home', limits: SECURITY_LIMITS });
  const byLabel = Object.fromEntries(rows.map(row => [row.label, row]));
  assert.equal(byLabel['m3o:home'].meta.sourceDetail, 'Material Symbols Outlined');
  assert.equal(byLabel['m3r:home'].meta.sourceDetail, 'Material Symbols Rounded');
  assert.equal(byLabel['mdi:home'].meta.commonIcon, true);
  assert.equal(byLabel['m3o:home'].meta.commonIcon, undefined);
  assert.ok(byLabel['m3o:home'].aliases.includes('home'), 'the name without its prefix matches too');
  assert.equal(runtimeRowsForKind('icon', { runtimeData: () => data, prefix: 'home', limits: SECURITY_LIMITS })[0], rows[0], 'rows are reused');
});

test('icons complete bare, in single quotes and in double quotes', async () => {
  const data = await loadedData();
  assert.equal(accept(data, 'type: button\nicon: m3o:ho|', 'm3o:home'), 'type: button\nicon: m3o:home|');
  assert.equal(accept(data, "type: button\nicon: 'm3o:ho|'", 'm3o:home'), "type: button\nicon: 'm3o:home|'");
  assert.equal(accept(data, "type: button\nicon: 'm3o:ho|", 'm3o:home'), "type: button\nicon: 'm3o:home|");
  assert.equal(accept(data, 'type: button\nicon: "m3r:li|"', 'm3r:light'), 'type: button\nicon: "m3r:light|"');
  assert.equal(accept(data, "type: entities\nentities:\n  - entity: light.desk\n    icon: 'ceil|'", 'm3r:ceiling-light'), "type: entities\nentities:\n  - entity: light.desk\n    icon: 'm3r:ceiling-light|'");
  // A value that is already there is replaced up to its closing quote.
  assert.equal(accept(data, "type: button\nicon: 'm3o:|home'", 'm3o:light'), "type: button\nicon: 'm3o:light|'");
});

test('the name without its prefix finds the icon in every set, common icons first', async () => {
  const data = await loadedData();
  const { labels } = listAt(data, "type: button\nicon: 'home|'");
  assert.equal(labels[0], 'mdi:home');
  for (const label of ['m3o:home', 'm3r:home']) assert.ok(labels.includes(label), label);
});

test('an opening quote right after the key keeps the icon list, and the value goes inside the quotes', async () => {
  const data = await loadedData();
  for (const doc of ["type: button\nicon: '|'", "type: button\nicon: '|", 'type: button\nicon: "|"']) {
    const { ctx, labels } = listAt(data, doc);
    assert.equal(ctx.valueKind, 'icon');
    assert.equal(ctx.shouldSuggest, true, doc);
    assert.ok(labels.includes('mdi:home') && labels.includes('m3o:home'), `${doc}: ${labels.slice(0, 5)}`);
  }
  assert.equal(accept(data, "type: button\nicon: '|'", 'm3o:home'), "type: button\nicon: 'm3o:home|'");
  assert.equal(accept(data, 'type: button\nicon: "|', 'mdi:home'), 'type: button\nicon: "mdi:home|');
});

test('after the closing quote the value is finished and nothing is offered', async () => {
  const data = await loadedData();
  const { ctx, shown } = listAt(data, "type: button\nicon: 'm3o:home'|");
  assert.equal(ctx.shouldSuggest, false);
  assert.deepEqual(shown, []);
});

test('an icon name in a template string gets the icon list', async () => {
  const data = await loadedData();
  const doc = "type: custom:mushroom-template-card\nicon: \"{{ 'm3o:li|' if is_state('light.desk', 'on') else 'mdi:lightbulb-off' }}\"";
  const { ctx, shown } = listAt(data, doc);
  assert.equal(ctx.lang, 'jinja');
  assert.equal(ctx.valueKind, 'icon');
  assert.ok(shown.length > 0 && shown.every(row => row.type === 'icon'), 'only icons');
  assert.equal(
    accept(data, doc, 'm3o:light'),
    "type: custom:mushroom-template-card\nicon: \"{{ 'm3o:light|' if is_state('light.desk', 'on') else 'mdi:lightbulb-off' }}\"",
  );
  assert.equal(
    accept(data, "icon: >-\n  {% set night = \"mdi:|\" %}\n  {{ night }}", 'mdi:weather-night'),
    "icon: >-\n  {% set night = \"mdi:weather-night|\" %}\n  {{ night }}",
  );
  assert.equal(listAt(data, "icon: \"{{ 'brand:ac|' }}\"").ctx.valueKind, 'icon', 'any installed set prefix');
});

test('other template strings are not icon names', async () => {
  const data = await loadedData();
  for (const doc of [
    "content: \"{{ 'foo:ba|' }}\"",                  // not an icon prefix
    "content: \"{{ states('sensor.te|') }}\"",       // an entity argument
    "content: \"{{ 'mdi:home' }} m|\"",               // outside the string
    "content: \"{{ mdi:ho| }}\"",                     // not in a string
  ]) {
    assert.notEqual(listAt(data, doc).ctx.valueKind, 'icon', doc);
  }
});
