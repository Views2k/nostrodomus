import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsRuntime, migrateSettings } from '../../src/core/settingsRuntime.js';
import { SETTINGS_SCHEMA_VERSION } from '../../src/core/settingsStorageKeys.js';
import { deepMerge as realDeepMerge } from '../../src/core/settings.js';

test('settings runtime loads first valid configured storage key and records source', () => {
  const storage = new Map([
    ['old-key', '{bad json'],
    ['current-key', JSON.stringify({ mode: 'snippets', nested: { enabled: true } })],
  ]);
  const warns = [];
  const runtime = createSettingsRuntime({
    storage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    settingsWriteKey: 'current-key',
    settingsLegacyKeys: ['old-key'],
    defaultSettings: { mode: 'both', nested: { enabled: false, preserved: true } },
    cloneDefaultSettingsImpl: () => ({ mode: 'both', nested: { enabled: false, preserved: true } }),
    deepMergeImpl: (base, patch) => ({ ...base, ...patch, nested: { ...base.nested, ...patch.nested } }),
    logWarnOnce: (...args) => warns.push(args),
  });

  assert.deepEqual(runtime.loadSettings(), {
    mode: 'snippets',
    nested: { enabled: true, preserved: true },
  });
  assert.equal(runtime.loadedSettingsKey(), 'current-key');
  assert.equal(warns.length, 1);
  assert.equal(warns[0][0], 'bad-settings-old-key');
  assert.equal(storage.has('old-key'), false);
});

test('loadSettings returns a fully MUTABLE tree when stored settings omit a frozen nested block (bug hunt)', () => {
  // Regression: merging a stored payload onto the FROZEN DEFAULT_SETTINGS leaked the frozen nested
  // blocks by reference for any block the payload omitted (an upgrading user), so the first nested
  // toggle threw "Cannot assign to read only property". loadSettings now merges onto a mutable clone.
  const defaultSettings = Object.freeze({
    maxItems: 40,
    completions: Object.freeze({ engineV2: false }),
    providers: Object.freeze({ static: Object.freeze({ enabled: true }) }),
  });
  const runtime = createSettingsRuntime({
    storage: { getItem: () => JSON.stringify({ maxItems: 7 }), setItem: () => {}, removeItem: () => {} },
    settingsWriteKey: 'k',
    defaultSettings,
    cloneDefaultSettingsImpl: () => globalThis.structuredClone(defaultSettings),
    deepMergeImpl: realDeepMerge,
  });
  const s = runtime.loadSettings();
  assert.equal(s.maxItems, 7, 'stored override applied');
  assert.equal(Object.isFrozen(s.completions), false, 'omitted block is not the frozen default');
  assert.notEqual(s.completions, defaultSettings.completions, 'not the frozen reference');
  assert.doesNotThrow(() => { s.completions.engineV2 = true; }, 'nested toggle must not throw');
  assert.doesNotThrow(() => { s.providers.static.enabled = false; }, 'a two-level nested toggle must not throw');
});

test('loadedSettingsKey reports empty after a corrupt payload forces the defaults fallback (bug hunt)', () => {
  const runtime = createSettingsRuntime({
    storage: { getItem: () => '{ not valid json', setItem: () => {}, removeItem: () => {} },
    settingsWriteKey: 'k',
    defaultSettings: { mode: 'both' },
    cloneDefaultSettingsImpl: () => ({ mode: 'both' }),
    deepMergeImpl: realDeepMerge,
    logWarnOnce: () => {},
  });
  assert.deepEqual(runtime.loadSettings(), { mode: 'both' }, 'falls back to defaults');
  assert.equal(runtime.loadedSettingsKey(), '', 'source key not misreported when defaults were used');
});

test('settings runtime reset restores defaults and closes UI surfaces', () => {
  const state = { settings: { mode: 'snippets' } };
  const events = [];
  const removed = [];
  const runtime = createSettingsRuntime({
    storage: { removeItem: key => removed.push(key) },
    settingsWriteKey: 'current-key',
    settingsLegacyKeys: ['old-key'],
    defaultSettings: { mode: 'both' },
    cloneDefaultSettingsImpl: () => ({ mode: 'both' }),
    getState: () => state,
    closeSettings: value => events.push(['settings', value]),
    closeCompletion: () => events.push(['completion']),
    logInfoOnce: (...args) => events.push(['info', ...args]),
    structuredCloneRef: value => ({ ...value }),
  });

  const result = runtime.resetSettings();
  assert.deepEqual(state.settings, { mode: 'both' });
  assert.deepEqual(result, { mode: 'both' });
  assert.notEqual(result, state.settings);
  assert.deepEqual(removed, ['current-key', 'old-key']);
  assert.equal(runtime.loadedSettingsKey(), '');
  assert.deepEqual(events, [
    ['settings', false],
    ['completion'],
    ['info', 'settings-reset', 'settings reset'],
  ]);
});

// __nostrodomus.resetSettings() put the defaults in place and left the editor drawn with the
// old style settings until something else restyled it.
test('settings runtime reset restyles the editor with the defaults', () => {
  const state = { settings: { mode: 'snippets', style: { syntaxTintPreset: 'crimson' } } };
  const restyles = [];
  const runtime = createSettingsRuntime({
    storage: { removeItem: () => {} },
    settingsWriteKey: 'current-key',
    defaultSettings: { mode: 'both', style: { syntaxTintPreset: 'vscodeDarkPlus' } },
    cloneDefaultSettingsImpl: () => ({ mode: 'both', style: { syntaxTintPreset: 'vscodeDarkPlus' } }),
    getState: () => state,
    scheduleCodeboxStyleReapply: (reason) => { restyles.push([reason, state.settings.style.syntaxTintPreset]); },
  });

  runtime.resetSettings();
  assert.deepEqual(restyles, [['settings-reset', 'vscodeDarkPlus']], 'one restyle, asked for after the defaults are in place');

  // A restyle that throws does not stop the reset.
  const failing = createSettingsRuntime({
    storage: { removeItem: () => {} },
    defaultSettings: { mode: 'both' },
    cloneDefaultSettingsImpl: () => ({ mode: 'both' }),
    getState: () => state,
    scheduleCodeboxStyleReapply: () => { throw new Error('no editor'); },
  });
  state.settings = { mode: 'snippets' };
  assert.deepEqual(failing.resetSettings(), { mode: 'both' });

  // With no state there is nothing to restyle.
  const idle = createSettingsRuntime({ cloneDefaultSettingsImpl: () => ({ mode: 'both' }), scheduleCodeboxStyleReapply: () => restyles.push(['unexpected']) });
  idle.resetSettings();
  assert.equal(restyles.length, 1);
});

function migrationRuntime(storage, extra = {}) {
  return createSettingsRuntime({
    storage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
      ...extra,
    },
    settingsWriteKey: 'write-key',
    settingsLegacyKeys: ['legacy-b', 'legacy-a'],
    defaultSettings: { mode: 'both', nested: { enabled: false } },
    cloneDefaultSettingsImpl: () => ({ mode: 'both', nested: { enabled: false } }),
    deepMergeImpl: (base, patch) => ({ ...base, ...patch, nested: { ...base?.nested, ...patch?.nested } }),
  });
}

test('migration: legacy key only -> value lands under write key, legacy key deleted', () => {
  const storage = new Map([['legacy-a', JSON.stringify({ mode: 'snippets' })]]);
  const runtime = migrationRuntime(storage);
  const settings = runtime.loadSettings();
  assert.equal(settings.mode, 'snippets');
  assert.equal(storage.has('legacy-a'), false);
  assert.equal(JSON.parse(storage.get('write-key')).mode, 'snippets');
  assert.equal(runtime.loadedSettingsKey(), 'write-key');
});

test('migration: write key and legacy key both present -> write key wins, legacy gone', () => {
  const storage = new Map([
    ['write-key', JSON.stringify({ mode: 'both', nested: { enabled: true } })],
    ['legacy-a', JSON.stringify({ mode: 'snippets', nested: { enabled: false, old: 1 } })],
  ]);
  const runtime = migrationRuntime(storage);
  const settings = runtime.loadSettings();
  assert.equal(settings.mode, 'both');
  assert.equal(settings.nested.enabled, true);
  assert.equal(settings.nested.old, 1);
  assert.equal(storage.has('legacy-a'), false);
  assert.equal(JSON.parse(storage.get('write-key')).mode, 'both');
});

test('migration: second run is a no-op without error', () => {
  const storage = new Map([['legacy-a', JSON.stringify({ mode: 'snippets' })]]);
  const runtime = migrationRuntime(storage);
  assert.equal(runtime.migrateLegacySettings(), 1);
  const written = storage.get('write-key');
  assert.equal(runtime.migrateLegacySettings(), 0);
  assert.equal(storage.get('write-key'), written);
  assert.equal(storage.has('legacy-a'), false);
});

test('migration: storage delete throwing keeps the write key intact (no data loss)', () => {
  const storage = new Map([['legacy-a', JSON.stringify({ mode: 'snippets' })]]);
  const runtime = migrationRuntime(storage, {
    removeItem: () => { throw new Error('denied'); },
  });
  const settings = runtime.loadSettings();
  assert.equal(settings.mode, 'snippets');
  assert.equal(JSON.parse(storage.get('write-key')).mode, 'snippets');
  assert.equal(storage.has('legacy-a'), true);
});

// HARNESS P5 schemaVersion / migrateSettings ledger.

test('migrateSettings stamps the current schemaVersion on a versionless payload, idempotently', () => {
  const first = migrateSettings({ mode: 'snippets' }, 1);
  assert.equal(first.future, false);
  assert.equal(first.changed, true);
  assert.equal(first.payload.schemaVersion, 1);
  assert.equal(first.payload.mode, 'snippets');
  // Re-running on an already-current payload is a no-op.
  const second = migrateSettings(first.payload, 1);
  assert.equal(second.changed, false);
  assert.equal(second.payload.schemaVersion, 1);
});

test('migrateSettings leaves a newer-build (future-version) payload untouched', () => {
  const result = migrateSettings({ schemaVersion: 99, mode: 'both' }, 1);
  assert.equal(result.future, true);
  assert.equal(result.changed, false);
  assert.deepEqual(result.payload, { schemaVersion: 99, mode: 'both' });
});

test('loadSettings stamps schemaVersion into the stored payload on load (no schemaVersion in returned settings)', () => {
  const storage = new Map([['write-key', JSON.stringify({ mode: 'snippets' })]]);
  const runtime = migrationRuntime(storage);
  const settings = runtime.loadSettings();
  assert.equal(settings.mode, 'snippets');
  assert.equal(settings.schemaVersion, undefined, 'schemaVersion is storage metadata, not an in-memory setting');
  assert.equal(JSON.parse(storage.get('write-key')).schemaVersion, SETTINGS_SCHEMA_VERSION, 'the stored payload carries the current schemaVersion');
});

test('migrateSettings v2 drops a stale stored hideActiveLineHighlight so the new (hidden) default applies', () => {
  // v0.1.150 persisted style.hideActiveLineHighlight=false (old default); v0.1.151 wants the new
  // default (true/hidden). The v2 step removes the stale key (preserving other style settings) so
  // deepMerge(defaults, stored) yields the new default; a deliberate toggle re-persists afterward.
  const r = migrateSettings({ schemaVersion: 1, style: { hideActiveLineHighlight: false, codeTextSize: 'large' } }, 2);
  assert.equal(r.changed, true);
  assert.equal(Object.prototype.hasOwnProperty.call(r.payload.style, 'hideActiveLineHighlight'), false, 'stale active-line key removed');
  assert.equal(r.payload.style.codeTextSize, 'large', 'other style settings preserved');
  assert.equal(r.payload.schemaVersion, 2);
  // idempotent: re-running on the already-migrated payload leaves the key absent
  const again = migrateSettings(r.payload, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(again.payload.style, 'hideActiveLineHighlight'), false);
});

test('loadSettings loads a future-version stored payload safely without a destructive write', () => {
  const writes = [];
  const storage = new Map([['write-key', JSON.stringify({ schemaVersion: 99, mode: 'snippets' })]]);
  const runtime = migrationRuntime(storage, {
    setItem: (key, value) => { writes.push([key, value]); storage.set(key, value); },
  });
  const settings = runtime.loadSettings();
  assert.equal(settings.mode, 'snippets', 'the future payload settings still load (merged with current defaults)');
  assert.equal(writes.length, 0, 'a future-version payload must never be rewritten/downgraded');
  assert.equal(JSON.parse(storage.get('write-key')).schemaVersion, 99, 'the stored future-version stamp is preserved');
});

// --- appended: a stored payload with wrong-typed blocks loads as defaults for those blocks ---
test('loadSettings discards wrong-typed stored blocks instead of handing them to the UI', () => {
  const defaultSettings = Object.freeze({
    maxItems: 12,
    enabledLangs: Object.freeze({ yaml: true, css: true }),
    style: Object.freeze({ scrollbarHue: 195 }),
  });
  const runtime = createSettingsRuntime({
    storage: {
      getItem: () => JSON.stringify({ schemaVersion: 99, maxItems: 7, enabledLangs: null, style: 'x' }),
      setItem: () => {},
      removeItem: () => {},
    },
    settingsWriteKey: 'k',
    defaultSettings,
    cloneDefaultSettingsImpl: () => globalThis.structuredClone(defaultSettings),
    deepMergeImpl: realDeepMerge,
  });
  const s = runtime.loadSettings();
  assert.equal(s.maxItems, 7);
  assert.deepEqual(s.enabledLangs, { yaml: true, css: true });
  assert.deepEqual(s.style, { scrollbarHue: 195 });
  assert.deepEqual(Object.keys(s.enabledLangs), ['yaml', 'css'], 'openSettings reads Object.keys(enabledLangs)');
});

// A stored number of the right type and the wrong size (hand-edited storage) was used as it was.
// maxItems is the row cap of the suggestion list: 100000 drew every candidate as a row.
test('stored minChars and maxItems are brought into the range the panel offers', async () => {
  const { DEFAULT_SETTINGS, cloneDefaultSettings } = await import('../../src/core/settings.js');
  const load = (stored) => createSettingsRuntime({
    storage: { getItem: () => JSON.stringify(stored), setItem: () => {}, removeItem: () => {} },
    settingsWriteKey: 'k',
    defaultSettings: DEFAULT_SETTINGS,
    cloneDefaultSettingsImpl: cloneDefaultSettings,
    deepMergeImpl: realDeepMerge,
  }).loadSettings();

  assert.equal(load({ maxItems: 100000 }).maxItems, 40);
  assert.equal(load({ maxItems: -5 }).maxItems, 1);
  assert.equal(load({ maxItems: 0 }).maxItems, 1);
  assert.equal(load({ maxItems: 7.6 }).maxItems, 8, 'a row count is a whole number');
  assert.equal(load({ minChars: 99 }).minChars, 4);
  assert.equal(load({ minChars: -1 }).minChars, 0);

  // Every value the panel can store is kept as it is.
  for (const maxItems of [6, 8, 12, 16, 20, 32, 40]) assert.equal(load({ maxItems }).maxItems, maxItems);
  for (const minChars of [0, 1, 2, 3, 4]) assert.equal(load({ minChars }).minChars, minChars);

  // A wrong type still falls back to the default (deepMerge), and a number too large for JSON too.
  assert.equal(load({ maxItems: '99' }).maxItems, DEFAULT_SETTINGS.maxItems);
  const overflow = createSettingsRuntime({
    storage: { getItem: () => '{"maxItems":1e999,"minChars":-1e999}', setItem: () => {}, removeItem: () => {} },
    settingsWriteKey: 'k',
    defaultSettings: DEFAULT_SETTINGS,
    cloneDefaultSettingsImpl: cloneDefaultSettings,
    deepMergeImpl: realDeepMerge,
  }).loadSettings();
  assert.equal(overflow.maxItems, DEFAULT_SETTINGS.maxItems);
  assert.equal(overflow.minChars, DEFAULT_SETTINGS.minChars);

  // Other numbers are not touched here: the style values are clamped where they are used.
  assert.equal(load({ style: { scrollbarOpacity: 50 } }).style.scrollbarOpacity, 50);
  assert.equal(load({}).maxItems, DEFAULT_SETTINGS.maxItems);
});

test('with no store at all the settings are the defaults and a reset still works', () => {
  const state = { settings: { mode: 'snippets' } };
  const runtime = createSettingsRuntime({
    storage: null,
    settingsWriteKey: 'k',
    settingsLegacyKeys: ['old'],
    defaultSettings: { mode: 'both' },
    cloneDefaultSettingsImpl: () => ({ mode: 'both' }),
    deepMergeImpl: realDeepMerge,
    getState: () => state,
  });
  assert.deepEqual(runtime.loadSettings(), { mode: 'both' });
  assert.equal(runtime.loadedSettingsKey(), '');
  assert.deepEqual(runtime.resetSettings(), { mode: 'both' });
});
