# Runtime Constants Module Contract

`src/core/runtimeConstants.js` holds the constants that several runtime modules share. It contains no behavior.

## Exports

```text
SECURITY_LIMITS
STATIC_PROVIDER_ID
HA_VALUE_PROVIDER_ID
LOVELACE_CONTEXT_PROVIDER_ID
HACS_CATALOG_PROVIDER_ID
SNIPPET_PROVIDER_ID
WORD_FALLBACK_PROVIDER_ID
NATIVE_CARD_TYPES
```

`SECURITY_LIMITS` is a frozen object with the upper bounds the runtime applies to data it did not produce itself:

- row text: `maxItemLabel`, `maxInsertText`, `maxAlias`, `maxAliases`, `maxRowsPerPack`
- document scanning: `maxDocScanChars`, `maxYamlPathLines`
- result cache: `maxCacheEntries`
- Home Assistant data: `maxRuntimeEntities`, `maxRuntimeEntitiesIndexed`, `maxRuntimeServices`, `maxRuntimeServicesIndexed`, `maxRuntimeAreas`, `maxRuntimeDevices`, `maxRuntimeFloors`, `maxRuntimeLabels`, `maxRuntimeCustomCards`, `maxServiceFieldsPerService`, `maxServicesWithFields`, `maxServiceFieldOptions`, `runtimeCacheMs`
- providers: `defaultProviderTimeoutMs`, `maxProviderTimeoutMs`, `maxProviderMalformedDiagnostics`

The provider ids are the `id` values of the built-in providers (`docs/PROVIDER_CONTRACT.md`). `NATIVE_CARD_TYPES` lists the card types that ship with Home Assistant.

## Purity

The module must stay deterministic and free of side effects:

```text
No window/document access
No localStorage/sessionStorage access
No timers
No event listeners
No DOM query or mutation
No Home Assistant runtime reads
No network calls
```

`tools/verify.py` and `tools/check_runtime_contracts.py` fail when the module references one of these, when an export listed above is missing, or when `src/app.js` declares `SECURITY_LIMITS` or a provider id itself.

Provider registration, suggestion logic and everything else that uses these values lives in the modules that import them.
