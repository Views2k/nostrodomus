import test from 'node:test';
import assert from 'node:assert/strict';

import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';
import { createIconSetCatalog, iconListNames, iconSetLabel } from '../../src/providers/iconSetCatalog.js';

// The catalog reads the icon sets in window.customIcons the way Home Assistant's icon picker does:
// each prefix with its getIconList. The names arrive asynchronously.

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function clock(start = 10000) {
  const c = { at: start, now: () => c.at, advance: ms => { c.at += ms; } };
  return c;
}

function materialSymbolsWindow() {
  // The shape the Material Symbols integration registers: six prefixes, names as { name }.
  const customIcons = {};
  for (const set of ['m3o', 'm3of', 'm3s', 'm3sf', 'm3r', 'm3rf']) {
    customIcons[set] = {
      getIcon: async () => ({ path: 'M0 0h24v24H0z' }),
      getIconList: async () => [{ name: 'home' }, { name: 'light' }, { name: 'add-home' }],
    };
  }
  return { customIcons };
}

test('the names of every registered icon set arrive after its getIconList resolves', async () => {
  const c = clock();
  const catalog = createIconSetCatalog({ windowRef: materialSymbolsWindow(), now: c.now });
  catalog.sync();
  const before = catalog.current();
  assert.deepEqual(before.ids, [], 'no names before the lists resolve');
  assert.deepEqual(before.prefixes, ['m3o', 'm3of', 'm3r', 'm3rf', 'm3s', 'm3sf'], 'the prefixes are known at once, sorted');

  await flush();
  const after = catalog.current();
  assert.notEqual(after.version, before.version);
  assert.equal(after.ids.length, 18);
  assert.deepEqual(after.ids.slice(0, 3), ['m3o:home', 'm3o:light', 'm3o:add-home']);
  assert.ok(after.ids.includes('m3rf:light'));
  assert.equal(catalog.current(), after, 'the same object until a set changes');
  assert.ok(Object.isFrozen(after.ids));
  assert.deepEqual(catalog.summary(), { sets: 6, setsWithNames: 6, icons: 18 });
});

test('names are checked: strings or objects with a name, each once, keywords kept', () => {
  const { names, keywords } = iconListNames([
    'plain',
    { name: 'with-keywords', keywords: ['lamp', 42, '', 'x'.repeat(41), 'bulb'] },
    { name: 'plain' },
    { name: 'has space' },
    { name: '<b>bad</b>' },
    { name: 'x'.repeat(81) },
    { nope: true },
    null,
    7,
    { name: '  trimmed  ' },
  ]);
  assert.deepEqual(names, ['plain', 'with-keywords', 'trimmed']);
  assert.deepEqual(keywords.get('with-keywords'), ['lamp', 'bulb']);
  assert.equal(keywords.has('plain'), false);
  assert.deepEqual(iconListNames('not a list').names, []);
});

test('a set without getIconList and a set in customIconsets are known prefixes without names', async () => {
  const c = clock();
  const windowRef = {
    customIcons: { brand: { getIcon: async () => ({ path: '' }) } },
    customIconsets: { oldset: async () => ({ path: '' }) },
  };
  const catalog = createIconSetCatalog({ windowRef, now: c.now });
  catalog.sync();
  await flush();
  assert.deepEqual(catalog.current().prefixes, ['brand', 'oldset']);
  assert.deepEqual(catalog.current().ids, []);
});

test('a set that fails is asked again a minute later, three times at most', async () => {
  const c = clock();
  let calls = 0;
  const windowRef = { customIcons: { flaky: { getIcon: async () => ({}), getIconList: async () => { calls += 1; throw new Error('not ready'); } } } };
  const catalog = createIconSetCatalog({ windowRef, now: c.now });
  catalog.sync();
  await flush();
  assert.equal(calls, 1);
  c.advance(30000);
  catalog.sync();
  await flush();
  assert.equal(calls, 1, 'not again within the minute');
  for (let i = 0; i < 5; i += 1) {
    c.advance(61000);
    catalog.sync();
    await flush();
  }
  assert.equal(calls, 3);
});

test('a set that gives no names, then names, is read on the retry', async () => {
  const c = clock();
  let list = [];
  const windowRef = { customIcons: { late: { getIcon: async () => ({}), getIconList: async () => list } } };
  const catalog = createIconSetCatalog({ windowRef, now: c.now });
  catalog.sync();
  await flush();
  assert.deepEqual(catalog.current().ids, []);
  list = [{ name: 'tree' }];
  c.advance(61000);
  catalog.sync();
  await flush();
  assert.deepEqual(catalog.current().ids, ['late:tree']);
});

test('sets registered later are read on a sync a second or more after the last one', async () => {
  const c = clock();
  const windowRef = { customIcons: {} };
  let changes = 0;
  const catalog = createIconSetCatalog({ windowRef, now: c.now, onChange: () => { changes += 1; } });
  catalog.sync();
  windowRef.customIcons.m3o = { getIcon: async () => ({}), getIconList: async () => [{ name: 'home' }] };
  c.advance(500);
  catalog.sync();
  await flush();
  assert.deepEqual(catalog.current().ids, [], 'within a second the sets are not read again');
  c.advance(600);
  catalog.sync();
  await flush();
  assert.deepEqual(catalog.current().ids, ['m3o:home']);
  assert.equal(changes, 2, 'one change for the new prefix, one for its names');
});

test('a throwing registry, getter, list or listener does not throw out of the catalog', async () => {
  const c = clock();
  const windowRef = {
    get customIcons() { throw new Error('blocked'); },
  };
  const catalog = createIconSetCatalog({ windowRef, now: c.now });
  assert.doesNotThrow(() => catalog.sync());

  const hostile = {
    customIcons: {
      a: { get getIconList() { throw new Error('getter'); } },
      b: { getIcon: async () => ({}), getIconList: () => { throw new Error('sync throw'); } },
      c: { getIcon: async () => ({}), getIconList: async () => new Proxy([], { get() { throw new Error('proxy'); } }) },
      d: { getIcon: async () => ({}), getIconList: async () => [{ name: 'ok' }] },
    },
  };
  const other = createIconSetCatalog({ windowRef: hostile, now: c.now, onChange: () => { throw new Error('listener'); } });
  assert.doesNotThrow(() => other.sync());
  await flush();
  assert.deepEqual(other.current().ids, ['d:ok']);
});

test('the per-set, total and set-count caps hold, and invalid prefixes are skipped', async () => {
  const c = clock();
  const names = Array.from({ length: 30 }, (_, i) => ({ name: `n${i}` }));
  const customIcons = { 'bad prefix': { getIconList: async () => names } };
  for (let i = 0; i < 6; i += 1) customIcons[`s${i}`] = { getIcon: async () => ({}), getIconList: async () => names };
  const limits = { ...SECURITY_LIMITS, maxIconSets: 4, maxIconsPerSet: 10, maxIconSetIcons: 25 };
  const catalog = createIconSetCatalog({ windowRef: { customIcons }, limits, now: c.now });
  catalog.sync();
  await flush();
  const view = catalog.current();
  assert.deepEqual(view.prefixes, ['s0', 's1', 's2', 's3']);
  assert.equal(view.ids.length, 25);
  assert.equal(view.ids.filter(id => id.startsWith('s0:')).length, 10);
});

test('icon set labels name the Material sets and fall back to the prefix', () => {
  assert.equal(iconSetLabel('mdi'), 'Material Design Icons');
  assert.equal(iconSetLabel('m3rf'), 'Material Symbols Rounded, filled');
  assert.equal(iconSetLabel('phu'), 'Icon set phu');
});
