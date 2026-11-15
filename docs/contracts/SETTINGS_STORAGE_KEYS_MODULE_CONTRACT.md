# Settings Storage Keys Module Contract

Settings are stored in the browser's `localStorage` as one JSON payload. This contract covers the storage keys, the schema version of the payload and the migration that runs when settings are loaded.

## Modules

```text
src/core/version.js              SETTINGS_WRITE_KEY ("nostrodomus.settings")
src/core/settingsStorageKeys.js  SETTINGS_SCHEMA_VERSION, SETTINGS_MIGRATION_LEGACY_KEYS
src/core/settingsRuntime.js      load, migrate and reset (storage is passed in)
src/core/settings.js             DEFAULT_SETTINGS and the merge of stored values onto the defaults
src/ui/settingsPanelRuntime.js   saving
```

## Exported constants

`src/core/settingsStorageKeys.js` exports:

- `SETTINGS_SCHEMA_VERSION`: the version number stamped into the stored payload as `schemaVersion`. Currently `2`.
- `SETTINGS_MIGRATION_LEGACY_KEYS`: a frozen list of storage keys that older builds wrote. It is empty at present.

## Loading

`loadSettings` in `src/core/settingsRuntime.js` does the following:

1. Legacy keys. Any payload found under a key in `SETTINGS_MIGRATION_LEGACY_KEYS` is merged into the payload under `SETTINGS_WRITE_KEY`; values already stored under the write key win. The merged payload is written, and the runtime deletes a legacy key only after the write key holds the merged payload. If the write fails, the legacy keys stay and the step runs again on the next load. A second run finds nothing and does nothing.
2. Schema version. The payload is passed through the numbered steps in `SETTINGS_MIGRATIONS` that are newer than its `schemaVersion`, then stamped with the current version and written back. A payload with a higher `schemaVersion` than this build knows is left untouched.
3. Merge. The payload, without `schemaVersion`, is merged onto a copy of `DEFAULT_SETTINGS`. A stored value is used only when it has the same type as the default. `minChars` and `maxItems` are clamped to the range the settings panel offers.

An unreadable payload is ignored and the defaults are used. `resetSettings` removes the write key and all legacy keys.

A change to the meaning of a stored setting needs a new step in `SETTINGS_MIGRATIONS` and a higher `SETTINGS_SCHEMA_VERSION`. Steps are idempotent and are never removed or renumbered.

## Purity

`src/core/settingsStorageKeys.js` must stay free of side effects:

```text
No window/document access
No localStorage/sessionStorage access
No timers
No event listeners
No DOM query or mutation
No Home Assistant runtime reads
No network calls
```

`tools/verify.py` and `tools/check_runtime_contracts.py` check this. `src/core/settingsRuntime.js` does not touch `localStorage` directly either; it receives the storage object from `src/app.js`, which lets the tests run it against a fake.

## Tests

`tests/core/settings_runtime.test.mjs` covers the legacy-key migration (legacy payload only, write key wins, second run does nothing, a failing delete keeps the write key intact), the schema steps, wrong-typed stored values and the reset.
