// The schemaVersion stamped into the stored settings payload; settingsRuntime.migrateSettings
// brings an older payload up to it. It is storage metadata and not part of the settings in memory.
export const SETTINGS_SCHEMA_VERSION = 2;

// Storage keys that earlier builds kept settings under; the list is empty at present. They are not
// read as fallbacks: settingsRuntime folds a payload found under one into SETTINGS_WRITE_KEY at load
// (values under the write key win) and then deletes the key (migration step 1).
export const SETTINGS_MIGRATION_LEGACY_KEYS = Object.freeze([
]);
