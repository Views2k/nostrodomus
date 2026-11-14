import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsPanelRuntime } from '../src/ui/settingsPanelRuntime.js';
import { createSettingsRuntime } from '../src/core/settingsRuntime.js';
import { SETTINGS_SCHEMA_VERSION } from '../src/core/settingsStorageKeys.js';

test('settingsPanelRuntime owns saveSettings write/skip behavior', () => {
  const writes = [];
  const events = [];
  let cacheClears = 0;
  const state = {
    settings: { enabled: true, minChars: 2 },
    settingsLastSerialized: '',
    settingsSaveStats: null,
  };
  const runtime = createSettingsPanelRuntime({
    state,
    SETTINGS_WRITE_KEY: 'nostrodomus.test.settings',
    settingsStorage: {
      setItem(key, value) { writes.push([key, value]); },
    },
    recordPerformanceEvent(name, ms, reason) { events.push({ name, ms, reason }); },
    clearCompletionCache() { cacheClears += 1; },
  });

  assert.equal(runtime.saveSettings('unit-write'), true);
  // HARNESS P5: the stored payload stamps schemaVersion (storage metadata).
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'nostrodomus.test.settings');
  assert.deepEqual(JSON.parse(writes[0][1]), { ...state.settings, schemaVersion: SETTINGS_SCHEMA_VERSION });
  assert.equal(cacheClears, 1);
  assert.equal(state.settingsSaveStats.writes, 1);
  assert.equal(events.at(-1).name, 'settings-save-write');

  assert.equal(runtime.saveSettings('unit-skip'), false);
  assert.equal(writes.length, 1);
  assert.equal(cacheClears, 1);
  assert.equal(state.settingsSaveStats.skippedUnchanged, 1);
  assert.equal(events.at(-1).name, 'settings-save-skipped-unchanged');
});

test('saveSettings fails dark when storage throws (quota/blocked), no exception escapes (bug hunt)', () => {
  const errs = [];
  let cacheClears = 0;
  const state = { settings: { enabled: true }, settingsLastSerialized: '', settingsSaveStats: null };
  const runtime = createSettingsPanelRuntime({
    state,
    SETTINGS_WRITE_KEY: 'nostrodomus.test.settings',
    settingsStorage: {
      setItem() { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; },
    },
    recordPerformanceEvent() {},
    clearCompletionCache() { cacheClears += 1; },
    recordRuntimeErrorOnce(key, err) { errs.push([key, err?.name]); },
  });

  let result;
  assert.doesNotThrow(() => { result = runtime.saveSettings('unit-quota'); }, 'a storage write failure must not throw');
  assert.equal(result, false, 'returns false on write failure');
  assert.deepEqual(errs, [['settings:save-write', 'QuotaExceededError']], 'recorded once');
  assert.equal(cacheClears, 0, 'no cache clear on a failed write');
  assert.equal(state.settingsLastSerialized, '', 'lastSerialized untouched so the next save retries');
  assert.notEqual(state.settingsSaveStats.writes, 1, 'write count not incremented on failure');
});

test('a failed save is remembered until a save succeeds', () => {
  let full = true;
  const state = { settings: { enabled: true }, settingsLastSerialized: '', settingsSaveStats: null };
  const runtime = createSettingsPanelRuntime({
    state,
    SETTINGS_WRITE_KEY: 'nostrodomus.test.settings',
    settingsStorage: {
      setItem() { if (full) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } },
    },
    recordPerformanceEvent() {},
    clearCompletionCache() {},
    recordRuntimeErrorOnce() {},
  });

  assert.equal(runtime.saveSettings('unit-quota'), false);
  assert.equal(state.settingsSaveStats.lastWriteError, 'The quota has been exceeded.');
  assert.equal(state.settingsSaveStats.lastReason, 'unit-quota-write-failed');

  full = false;
  assert.equal(runtime.saveSettings('unit-retry'), true, 'the same payload is written once storage accepts it');
  assert.equal(state.settingsSaveStats.lastWriteError, '', 'a successful save clears the failure');
});

test('resetSettings clears the save-dedupe stamp so re-applying a pre-reset value persists (bug hunt 3)', () => {
  const KEY = 'nostrodomus.test.settings';
  const store = new Map();
  const storage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
  };
  const state = { settings: { keepOpen: false }, settingsLastSerialized: '', settingsSaveStats: null };
  const panel = createSettingsPanelRuntime({
    state,
    SETTINGS_WRITE_KEY: KEY,
    settingsStorage: storage,
    recordPerformanceEvent() {},
    clearCompletionCache() {},
    recordRuntimeErrorOnce() {},
  });
  const settings = createSettingsRuntime({
    storage,
    settingsWriteKey: KEY,
    defaultSettings: { keepOpen: false },
    cloneDefaultSettingsImpl: () => ({ keepOpen: false }),
    getState: () => state,
  });

  // 1) enable + save → written to storage
  state.settings = { keepOpen: true };
  assert.equal(panel.saveSettings('enable'), true);
  assert.ok(store.has(KEY), 'first save writes');

  // 2) reset → storage cleared, defaults restored
  settings.resetSettings();
  assert.equal(store.has(KEY), false, 'reset removed the stored payload');

  // 3) re-apply the SAME setting the user had before the reset → must persist again
  state.settings = { keepOpen: true };
  assert.equal(panel.saveSettings('re-enable'), true, 'the re-applied value is NOT deduped against a stale stamp');
  assert.ok(store.has(KEY), 'the re-applied setting is persisted (survives reload)');
  assert.equal(JSON.parse(store.get(KEY)).keepOpen, true);
});

test('saveSettings never downgrades a future-build schemaVersion stamp (bug hunt 4)', () => {
  const KEY = 'nostrodomus.test.settings';
  const store = new Map();
  const storage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  // A newer build wrote a higher schemaVersion; loadSettings preserved it (future guard).
  store.set(KEY, JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION + 1, style: { v3: false } }));
  const state = { settings: { style: { v3: false }, enabled: true }, settingsLastSerialized: '', settingsSaveStats: null };
  const rt = createSettingsPanelRuntime({ state, SETTINGS_WRITE_KEY: KEY, settingsStorage: storage, recordPerformanceEvent() {}, clearCompletionCache() {}, recordRuntimeErrorOnce() {} });
  state.settings.enabled = false;
  rt.saveSettings('toggle');
  assert.equal(JSON.parse(store.get(KEY)).schemaVersion, SETTINGS_SCHEMA_VERSION + 1, 'the future stamp is preserved, not downgraded');

  // With no future payload present, a save stamps the current version as before.
  const s2 = new Map();
  const storage2 = { getItem: k => (s2.has(k) ? s2.get(k) : null), setItem: (k, v) => s2.set(k, v), removeItem: k => s2.delete(k) };
  const st2 = { settings: { enabled: true }, settingsLastSerialized: '', settingsSaveStats: null };
  const rt2 = createSettingsPanelRuntime({ state: st2, SETTINGS_WRITE_KEY: KEY, settingsStorage: storage2, recordPerformanceEvent() {}, clearCompletionCache() {}, recordRuntimeErrorOnce() {} });
  rt2.saveSettings('first');
  assert.equal(JSON.parse(s2.get(KEY)).schemaVersion, SETTINGS_SCHEMA_VERSION, 'normal save stamps the current version');
});
