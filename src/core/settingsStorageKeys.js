// The stored settings payload carries a schemaVersion so future
// builds migrate it through an ordered, version-gated ledger
// (settingsRuntime.migrateSettings). Step 1 of that ledger is the legacy-key
// fold below (a storage-level migration). schemaVersion is storage metadata —
// stamped into the stored payload, stripped from the in-memory settings.
export const SETTINGS_SCHEMA_VERSION = 2;

// Storage keys written by pre-0.1.x builds. They are no longer read as fallbacks:
// settingsRuntime merges any surviving payloads into SETTINGS_WRITE_KEY once at load
// (write-key values win on conflict) and then deletes them from storage.
export const SETTINGS_MIGRATION_LEGACY_KEYS = Object.freeze([
]);
