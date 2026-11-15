// Loading, migrating and resetting the stored settings. Storage, defaults and the UI callbacks
// are injected, so this module uses no browser globals and no Home Assistant state.

import { SETTINGS_SCHEMA_VERSION } from './settingsStorageKeys.js';

// The settings migrations, in order. A step runs for a stored payload whose schemaVersion is
// below its toVersion, and running it twice changes nothing. Step 1, folding the legacy keys into
// the write key, happens in storage (migrateLegacySettings) before the payload is read, so its
// transform here leaves the payload as it is.
const SETTINGS_MIGRATIONS = Object.freeze([
  { toVersion: 1, name: 'legacy-key-fold', migrate: (payload) => payload },
  // Step 2: style.hideActiveLineHighlight defaults to true. A value stored before schema version 2
  // was saved while that toggle had no effect, so it is dropped and the default applies. Every
  // other style key is kept.
  {
    toVersion: 2,
    name: 'active-line-default-reset',
    migrate: (payload) => {
      if (payload && payload.style && Object.prototype.hasOwnProperty.call(payload.style, 'hideActiveLineHighlight')) {
        const nextStyle = { ...payload.style };
        delete nextStyle.hideActiveLineHighlight;
        return { ...payload, style: nextStyle };
      }
      return payload;
    },
  },
]);

/**
 * Brings a stored settings payload up to `schemaVersion` through the migrations and stamps the
 * version. A payload written by a newer build (a higher schemaVersion) is returned as it is, with
 * `future: true`, so it is never downgraded or rewritten. Pure; the caller stores the result.
 */
export function migrateSettings(stored, schemaVersion = SETTINGS_SCHEMA_VERSION) {
  const from = Number(stored && stored.schemaVersion) || 0;
  if (from > schemaVersion) return { payload: stored, changed: false, future: true };
  let payload = stored && typeof stored === 'object' ? { ...stored } : {};
  let changed = false;
  for (const step of SETTINGS_MIGRATIONS) {
    if (step.toVersion > from && step.toVersion <= schemaVersion) {
      payload = step.migrate(payload) || payload;
      changed = true;
    }
  }
  if (payload.schemaVersion !== schemaVersion) {
    payload = { ...payload, schemaVersion };
    changed = true;
  }
  return { payload, changed, future: false };
}

// The two counts the completion code uses as they are stored, with the range the panel offers.
// The merge onto the defaults checks the type of a stored value, not its size: a hand-edited
// maxItems of 100000 (the row cap of the suggestion list) would draw every candidate as a row.
// Style numbers are not listed: they are clamped where they are used.
const STORED_COUNT_RANGES = Object.freeze({
  minChars: Object.freeze([0, 4]),
  maxItems: Object.freeze([1, 40]),
});

function stripSchemaVersion(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = { ...payload };
  delete clone.schemaVersion;
  return clone;
}

/**
 * @param {{
 *   storage?: { getItem?: Function, setItem?: Function, removeItem?: Function } | null,
 *   settingsWriteKey?: string,
 *   settingsLegacyKeys?: readonly string[],
 *   defaultSettings?: any,
 *   cloneDefaultSettingsImpl?: () => any,
 *   deepMergeImpl?: (base: any, patch: any) => any,
 *   logWarnOnce?: (...args: any[]) => void,
 *   logInfoOnce?: (...args: any[]) => void,
 *   getState?: () => any,
 *   closeSettings?: (...args: any[]) => void,
 *   closeCompletion?: (...args: any[]) => void,
 *   scheduleCodeboxStyleReapply?: (reason: string) => void,
 *   applyCompanionEditorLayer?: (editor: any) => void,
 *   recordRuntimeErrorOnce?: (scope: string, err: any, detail?: any) => void,
 *   structuredCloneRef?: (value: any) => any,
 *   schemaVersion?: number,
 * }} [deps]
 */
export function createSettingsRuntime({
  storage = null,
  settingsWriteKey = '',
  settingsLegacyKeys = [],
  defaultSettings = {},
  cloneDefaultSettingsImpl = () => structuredClone(defaultSettings),
  deepMergeImpl = (_base, patch) => patch,
  logWarnOnce = () => {},
  logInfoOnce = () => {},
  getState = () => null,
  closeSettings = () => {},
  closeCompletion = () => {},
  scheduleCodeboxStyleReapply = () => {},
  applyCompanionEditorLayer = () => {},
  recordRuntimeErrorOnce = () => {},
  structuredCloneRef = globalThis.structuredClone?.bind?.(globalThis),
  schemaVersion = SETTINGS_SCHEMA_VERSION,
} = {}) {
  let loadedSettingsStorageKey = '';

  function cloneDefaultSettings() {
    return cloneDefaultSettingsImpl();
  }

  function deepMerge(base, patch) {
    return deepMergeImpl(base, patch);
  }

  function cloneForReturn(value) {
    if (typeof structuredCloneRef === 'function') return structuredCloneRef(value);
    return JSON.parse(JSON.stringify(value));
  }

  // Folds the payloads stored under legacy keys into the write key (values already under the write
  // key win), then deletes the legacy keys, but only after the merged payload has been written. A
  // second run finds no legacy keys and does nothing.
  function migrateLegacySettings() {
    if (!storage || !settingsWriteKey || !settingsLegacyKeys.length) return 0;
    let current = null;
    try {
      const raw = storage.getItem?.(settingsWriteKey);
      if (raw) current = JSON.parse(raw);
    } catch (err) {
      logWarnOnce(`bad-settings-${settingsWriteKey}`, 'ignored bad settings key', settingsWriteKey, err);
    }
    const found = [];
    let merged = current;
    for (const key of settingsLegacyKeys) {
      let raw = null;
      try { raw = storage.getItem?.(key); } catch { /* storage denied */ continue; }
      if (!raw) continue;
      found.push(key);
      try {
        const legacy = JSON.parse(raw);
        merged = merged === null ? legacy : deepMerge(legacy, merged);
      } catch (err) {
        logWarnOnce(`bad-settings-${key}`, 'dropped unparseable legacy settings key', key, err);
      }
    }
    if (!found.length) return 0;
    try {
      if (merged !== null) storage.setItem?.(settingsWriteKey, JSON.stringify(merged));
    } catch (err) {
      logWarnOnce('settings-migrate-write', 'legacy settings migration write failed; legacy keys kept for retry', err);
      return 0;
    }
    for (const key of found) {
      try { storage.removeItem?.(key); } catch { /* storage denied: retried next load */ }
    }
    logInfoOnce('settings-migrated', 'migrated legacy settings keys', found.length);
    return found.length;
  }

  function clampStoredCounts(settings) {
    if (!settings || typeof settings !== 'object') return settings;
    for (const [key, [min, max]] of Object.entries(STORED_COUNT_RANGES)) {
      const value = settings[key];
      if (typeof value !== 'number') continue;
      // 1e999 in the stored text parses to Infinity: not a count, so the default stands.
      const count = Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : defaultSettings?.[key];
      if (count !== value) settings[key] = count;
    }
    return settings;
  }

  function loadSettings() {
    loadedSettingsStorageKey = '';
    migrateLegacySettings();
    try {
      const raw = storage?.getItem?.(settingsWriteKey);
      if (raw) {
        loadedSettingsStorageKey = settingsWriteKey;
        // Bring the stored payload to the current schemaVersion and store the stamp (a payload
        // from a newer build is left as it is). schemaVersion is storage metadata and is not part
        // of the settings the runtime uses.
        const { payload, changed, future } = migrateSettings(JSON.parse(raw), schemaVersion);
        if (changed && !future) {
          try { storage?.setItem?.(settingsWriteKey, JSON.stringify(payload)); }
          catch (err) { logWarnOnce('settings-schema-write', 'settings schemaVersion stamp failed; retried next load', err); }
        }
        // Merge onto a mutable clone of the defaults, not the frozen DEFAULT_SETTINGS: deepMerge
        // copies the base shallowly and builds new objects only for the blocks the stored payload
        // has, so a block the payload lacks would stay frozen and the first change to it
        // (completions, style, providers, enabledLangs) would throw.
        return clampStoredCounts(deepMerge(cloneDefaultSettings(), stripSchemaVersion(payload)));
      }
    } catch (err) {
      // A payload that cannot be parsed falls back to the defaults below, so no stored key was
      // loaded; loadedSettingsKey() and diagnostics must not report one.
      loadedSettingsStorageKey = '';
      logWarnOnce(`bad-settings-${settingsWriteKey}`, 'ignored bad settings key', settingsWriteKey, err);
    }

    return cloneDefaultSettings();
  }

  function resetSettings() {
    const state = getState?.();
    if (!state) return cloneDefaultSettings();
    for (const key of [settingsWriteKey, ...settingsLegacyKeys]) {
      try { storage?.removeItem?.(key); } catch { /* storage denied */ }
    }
    loadedSettingsStorageKey = '';
    state.settings = cloneDefaultSettings();
    // saveSettings skips a write when the payload equals settingsLastSerialized. Setting a value
    // from before the reset again would give the same text, the write would be skipped and storage
    // would stay empty, so the setting would be lost on reload. An empty string never equals a
    // payload, so the next save writes.
    state.settingsLastSerialized = '';
    closeSettings(false);
    closeCompletion();
    // The editor is still drawn with the style settings from before the reset (frame, surface,
    // syntax theme). Restyle it with the defaults, as the Reset button of the panel does. The
    // style reapply does not run the companion layer, which draws the editor warning and glass
    // dialog sheets, so that is applied too.
    try { scheduleCodeboxStyleReapply('settings-reset'); } catch { /* styling never stops a reset */ }
    try { applyCompanionEditorLayer(state.activeEditorCache?.editor); } catch (err) { recordRuntimeErrorOnce('settings:reset-companion-layer', err, { phase: 'resetSettings' }); }
    logInfoOnce('settings-reset', 'settings reset');
    return cloneForReturn(state.settings);
  }

  function loadedSettingsKey() {
    return loadedSettingsStorageKey;
  }

  return {
    cloneDefaultSettings,
    deepMerge,
    loadSettings,
    loadedSettingsKey,
    migrateLegacySettings,
    resetSettings,
  };
}
