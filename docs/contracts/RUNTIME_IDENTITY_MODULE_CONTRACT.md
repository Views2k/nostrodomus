# Runtime Identity Module Contract

`src/core/version.js` is the runtime identity module: the single source of truth
for the version/identity constants bundled into the browser runtime.

## Ownership

```text
src/core/version.js      single source of truth for runtime identity constants
src/main.legacy.js       imports the constants and keeps the active runtime behavior
dist/nostrodomus.js bundled browser artifact produced by esbuild
PROJECT.json             machine-readable project/version metadata
package.json/lock        npm metadata that must match PROJECT.json
src/core/changelogSummary.js  in-app five-release version history (dist SHA in commit message)
```

## Exported constants

`src/core/version.js` owns these exports:

```text
VERSION
PROJECT_VERSION
PROJECT_RELEASE_STATE
LIVE_COMPANION_EDITOR_VERSION
PRODUCT_NAME
LOG_PREFIX
SETTINGS_WRITE_KEY
```

Do not duplicate these constants at the top of `src/main.legacy.js` after this
extraction. The legacy runtime may use the imported bindings, but the module owns
the literal values.

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

This keeps the extraction safe to import before the legacy IIFE starts.

## Build rule

After a wired module import exists, `dist/nostrodomus.js` must be built
with esbuild. Do not publish a legacy-copy fallback artifact, because copying
`src/main.legacy.js` directly would leave an unbundled relative import in the live
Home Assistant resource.

## Change checklist

When bumping versions or changing identity constants, update all of these in the
same patch:

```text
src/core/version.js
PROJECT.json
package.json
package-lock.json
src/core/changelogSummary.js
dist/nostrodomus.js
```

Then run:

```bash
python3 tools/check_runtime_contracts.py
python3 tools/verify.py
node --check src/main.js
node --check src/main.legacy.js
node --check src/core/version.js
node --check dist/nostrodomus.js
```


## Related extraction

`src/core/settingsStorageKeys.js` depends on `SETTINGS_WRITE_KEY` from this module. Keep `SETTINGS_WRITE_KEY` here and keep legacy key arrays in the settings storage keys module so storage identity remains centralized without moving Settings behavior.
