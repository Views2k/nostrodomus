// Settings load/reset lifecycle owner for Nostrodomus runtime.
//
// Storage, defaults, and UI close callbacks are injected so this module owns the
// settings lifecycle without importing browser globals or Home Assistant state.

import { SETTINGS_SCHEMA_VERSION } from './settingsStorageKeys.js';

// Settings-migration ledger: an ordered list of numbered, idempotent
// steps, each run once and gated by the stored payload's schemaVersion. Step 1
// (the legacy-key fold) is a STORAGE-level migration handled by
// migrateLegacySettings() before the payload is read, so its payload transform
// here is a no-op — it records step 1 in the ledger. Future content migrations
// add { toVersion: 2, migrate(payload) {...} }, etc.
const SETTINGS_MIGRATIONS = Object.freeze([
  { toVersion: 1, name: 'legacy-key-fold', migrate: (payload) => payload },
  // v2 (active-line default flip): style.hideActiveLineHighlight first defaulted to false (the
  // current-line wash shown) and now defaults to true (hidden). A value persisted under the old
  // default was never a deliberate choice (the toggle was a no-op then). Drop the stale key so the
  // new default applies; the working toggle re-persists a deliberate choice afterward. Idempotent;
  // preserves every other style key.
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
 * Bring a stored settings payload up to `schemaVersion` through the ledger,
 * stamping the version. A payload written by a NEWER build (schemaVersion >
 * target) is returned untouched (`future: true`) so it is never downgraded or
 * destructively rewritten. Pure; the caller persists/strips as needed.
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
// The merge onto the defaults checks the type of a stored value, not its size, so a hand-edited
// maxItems of 100000 (the row cap of the suggestion list) drew every candidate as a row. Style
// numbers are not listed: they are clamped where they are used.
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

  // One-time storage migration: fold any surviving legacy-key payloads into the write
  // key (existing write-key values win on conflict), then delete the legacy keys.
  // Idempotent — a second run finds no legacy keys and does nothing. Legacy keys are
  // only deleted after the merged payload has been written successfully.
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
        // Bring the stored payload to the current schemaVersion and
        // persist the stamp (a newer-build payload is left untouched). The
        // schemaVersion is storage metadata, stripped from the in-memory
        // settings the runtime uses.
        const { payload, changed, future } = migrateSettings(JSON.parse(raw), schemaVersion);
        if (changed && !future) {
          try { storage?.setItem?.(settingsWriteKey, JSON.stringify(payload)); }
          catch (err) { logWarnOnce('settings-schema-write', 'settings schemaVersion stamp failed; retried next load', err); }
        }
        // Merge onto a MUTABLE deep clone of the defaults, not the frozen DEFAULT_SETTINGS itself.
        // deepMerge shallow-copies the base and only builds fresh objects for keys the stored payload
        // overrides — so merging onto the frozen defaults leaked those frozen nested blocks by
        // reference for any block an (upgrading) user's stored settings omit, and the first nested
        // toggle (completions/style/providers/enabledLangs) then threw "Cannot assign to read only
        // property". A cloned base keeps state.settings fully mutable.
        return clampStoredCounts(deepMerge(cloneDefaultSettings(), stripSchemaVersion(payload)));
      }
    } catch (err) {
      // A corrupt/unparseable payload falls back to defaults below — so the source key was NOT the
      // one actually loaded. Reset it (it was set optimistically before JSON.parse) so
      // loadedSettingsKey() and diagnostics don't misreport that settings came from storage.
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
    // Clear the save-dedupe fingerprint too: saveSettings skips a write when the payload
    // equals settingsLastSerialized. Without this, re-applying a pre-reset value produces
    // the same serialization, the save is deduped, storage stays empty, and the setting is
    // silently lost on reload. Empty string never equals a real payload, so the next save writes.
    state.settingsLastSerialized = '';
    closeSettings(false);
    closeCompletion();
    // The editor is still drawn with the style settings from before the reset (frame, surface,
    // syntax theme). Restyle it with the defaults, as the Reset button of the panel does.
    try { scheduleCodeboxStyleReapply('settings-reset'); } catch { /* styling never stops a reset */ }
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
