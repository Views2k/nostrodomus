# Settings Storage Keys Module Contract

`src/core/settingsStorageKeys.js` owns the legacy settings-key migration table. It was
originally the read-fallback key list extracted from `src/main.legacy.js`; since 0.1.63
(Senior Finish Phase 4) the runtime no longer reads legacy keys as fallbacks. Instead,
`src/core/settingsRuntime.js` runs a one-time idempotent migration at settings load:

1. Any payload found under a key in `SETTINGS_MIGRATION_LEGACY_KEYS` is merged into
   `SETTINGS_WRITE_KEY` (existing write-key values win on conflict — deterministic).
2. The merged payload is written to `SETTINGS_WRITE_KEY`.
3. Only after a successful write, the legacy keys are deleted from storage. If the
   delete throws, the write key is already intact and the migration retries next load.

## Ownership

```text
src/core/version.js              owns SETTINGS_WRITE_KEY and runtime identity
src/core/settingsStorageKeys.js  owns SETTINGS_MIGRATION_LEGACY_KEYS (data only)
src/core/settingsRuntime.js      owns load/migrate/reset behavior (storage injected)
dist/nostrodomus.js     bundled browser artifact produced by esbuild
```

## Exported constants

```text
SETTINGS_MIGRATION_LEGACY_KEYS
```

`SETTINGS_LEGACY_KEYS` and `SETTINGS_READ_KEYS` were removed in 0.1.63 with the
read-fallback path. This removal is the migration/removal patch the previous revision
of this contract required; the behavioral coverage lives in
`tests/core/settings_runtime.test.mjs` (legacy-only load, current-wins merge, double-run
no-op, and delete-failure safety).

## Purity rule

The module must stay pure and side-effect-free:

```text
No window/document access
No localStorage/sessionStorage access
No timers
No event listeners
No DOM query/mutation
No Home Assistant runtime reads
No network calls
```

Importing this module must not do anything except construct the frozen key table.

## Behavior-preservation checklist

Before changing this module, verify all of the following remain true:

```text
- SETTINGS_MIGRATION_LEGACY_KEYS stays a frozen, data-only list.
- SETTINGS_WRITE_KEY never appears in the migration table.
- src/core/settingsRuntime.js deletes a legacy key only after the write key holds the merged payload.
- The four migration behavior tests in tests/core/settings_runtime.test.mjs stay green unweakened.
- dist/nostrodomus.js contains the bundled settings-storage key module.
```

Run:

```bash
python3 tools/check_runtime_contracts.py
python3 tools/verify.py
node --check src/core/settingsStorageKeys.js
node --check src/core/settingsRuntime.js
```
