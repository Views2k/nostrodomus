# Nostrodomus Provider Contract

A provider is a synchronous source of completion rows. The registry in `src/providers/providerRegistry.js` calls every registered provider for a completion request, guards each call, validates the rows and hands them to scoring. `src/providers/providerRuntime.js` connects the registry to the runtime state, the settings and the runtime error buffer.

## Provider object

```js
{
  id: "stable-kebab-id",
  label: "Human readable label",
  capabilities: ["yaml", "dashboard-action"],
  priority: 100,
  timeoutMs: 8,
  canHandle(ctx) { return true; },
  provide(ctx) { return rows; }
}
```

Required fields:

- `id`: stable string. It keys the provider's setting, its statistics and its diagnostics entries. Registering a provider with an id that is already registered replaces the earlier one.
- `provide(ctx)`: synchronous function that returns an array of completion rows.

Optional fields:

- `label`: readable name for the provider list in Settings and for diagnostics.
- `canHandle(ctx)`: fast gate. A provider without it is asked on every request.
- `timeoutMs`: time budget for one `provide(ctx)` call. The default is 8 ms, the maximum is 120 ms. For local debugging the default can be changed with the `nostrodomusProviderTimeoutMs` key in `localStorage`.
- `capabilities` and `priority`: descriptive. The registry does not read them. Providers are called in registration order, and the order of rows in the suggestion list is decided by scoring (see `docs/SCORING_CONTRACT.md`).

`ctx` is the context descriptor described in `docs/CONTEXT_DESCRIPTOR.md`.

## Registered providers

`buildIndex` in `src/providers/staticLibraryProvider.js` registers the built-in providers in this order when the completion library is loaded:

| Id | Module | Rows |
| --- | --- | --- |
| `static-library` | `src/providers/staticLibraryProvider.js` | Bundled keys and words for YAML, CSS, JavaScript, Jinja, HTML and Python |
| `snippet-templates` | `src/providers/snippetProvider.js` | Snippets from `data/snippets.json`, selected by context |
| `lovelace-context` | `src/providers/lovelaceContextProvider.js` | Dashboard and card keys for the YAML path around the cursor |
| `hacs-catalog` | `src/providers/hacsCatalogProvider.js` | Card types, keys and values of the custom cards in `src/providers/hacsProviderCatalog.js` |
| `ha-runtime-values` | `src/providers/haRuntimeProvider.js` | Values from the running Home Assistant instance |
| `word-fallback` | `src/providers/documentWordProvider.js` | Words from the current editor text |

The ids are constants in `src/core/runtimeConstants.js`.

Other code can add a provider with `window.__nostrodomus.registerProvider(provider)`. Such a provider is called after the built-in ones and stays registered when the index is rebuilt. Every registered provider gets an entry in `settings.providers` and can be turned off there.

## Runtime enforcement

`providerCandidates(ctx)` returns no rows at all when `ctx.shouldSuggest` is false, when the trigger mode is `manual` and the request was not explicit, or when the language of the context is disabled in the settings. A provider that is turned off in the settings is skipped.

For every other provider:

1. `canHandle(ctx)` is called in its own guard. A throw skips that provider and records `provider:<id>:canHandle`.
2. `provide(ctx)` is called in its own guard. A throw skips that provider and records `provider:<id>:provide`.
3. The call is timed. A call that takes longer than the budget is recorded as `provider:<id>:timeout` and counted in `slowCalls`. Its rows are kept: the call is synchronous, so the time is already spent when the budget can be checked.
4. The return value must be an array. Anything else is dropped and records `provider:<id>:rows`.
5. Malformed rows are dropped one by one and record `provider:<id>:row` (at most five diagnostics per call).
6. At most 2000 rows per call are used. More than that records `provider:<id>:row-limit`.
7. One provider's failure never prevents later providers from contributing rows.

The records go to the runtime error buffer (`window.__nostrodomus.runtimeErrors()`). Per-provider counters are available from `providerSummary`, which Settings and diagnostics show.

## Completion row shape

```js
{
  id: "unique-row-id",
  lang: "yaml",
  type: "key",
  label: "name:",
  insert: "name: ",
  source: "provider-id",
  aliases: [],
  meta: {}
}
```

`id`, `lang`, `type` and `label` must be non-empty strings, and `insert` must be a string. `aliases`, when present, must be an array. `meta`, when present, must be an object. A row that fails one of these checks is dropped.

`source` is not validated. Scoring ranks rows by the provider id in `source`, so a row should carry the id of its provider.

## Live instance data

The `ha-runtime-values` provider reads its data from one snapshot built by `runtimeData()` and kept in `state.runtimeCache`. A snapshot is used for `SECURITY_LIMITS.runtimeCacheMs` (2500 ms). After that it is kept as long as Home Assistant has not replaced the objects it was built from, and it is rebuilt after 30 seconds at the latest. Nothing is read from Home Assistant per keystroke outside this snapshot.

The snapshot holds:

- Entity ids with friendly names, and service ids. Up to 10000 entity ids and 3000 service ids are indexed. A query returns at most 750 entity rows and 500 service rows after the typed prefix is applied.
- Areas, devices, floors and labels with their names (at most 300, 750, 100 and 200). They are offered for `area_id:`, `device_id:`, `floor_id:` and `label_id:` when the experimental settings `completions.engineV2` and `completions.registryLane` are on.
- Themes, and fixed lists of card types, common Material Design icons (`icons`), dashboard actions, trigger types, condition types and automation modes.
- Icon sets (`iconSetIcons`, `iconSetPrefixes`, `iconKeywords`, `iconSetVersion`): the names of the icon sets registered in `window.customIcons`, read once per set with its `getIconList`, as Home Assistant's icon picker reads them, and kept as `prefix:name`. Prefixes registered in `window.customIconsets` are known without names. At most 40 sets, 8000 names per set and 40000 names in all are kept. A set that fails or gives no names is asked again after a minute, three times at most. When names arrive, the snapshot is replaced by one that holds them. A query returns at most 500 icon rows after the typed text is applied.
- Custom cards (`cards` and `cardMeta`): the entries of the page's `window.customCards` registry, normalized to `custom:<type>`, validated, deduplicated, sorted and capped at `SECURITY_LIMITS.maxRuntimeCustomCards` (200). Names are cut to 80 characters and descriptions to 200. A card row carries the name as `meta.sourceDetail` and as an alias.
- Service fields (`serviceFields`): per service id a list of `{ field, description, selectorKind, required, advanced, options }` from `hass.services[domain][service].fields`. `selectorKind` is the first key of the field's selector object, or empty. Sections of fields are flattened. The snapshot holds up to 40 fields per service for up to 400 services; a service beyond that is read when it is first asked for. Descriptions are cut to 160 characters.

Field rows are offered when the cursor is on a key directly under `data:` or `service_data:` and the enclosing block names a service. The service id is read from `ctx.branchState` by `serviceIdFromContext(ctx)`; the provider does not parse YAML. An unknown service or a service without fields yields no rows.

In `target:` under `entity_id:`, when the enclosing block names a service outside the `homeassistant` domain, the provider returns the entities of the service's domain before the others, so they are kept when the row limit applies. The order in the suggestion list comes from the scorer (`docs/SCORING_CONTRACT.md`), not from this order.

A missing or partial `hass` object, a non-object `states` or `services`, a getter that throws and a malformed registry entry each reduce the affected data only. The result is fewer suggestions, not an exception and not console output. `tests/providers/ha_runtime_data.test.mjs` covers these cases.

## Registry module

`src/providers/providerRegistry.js` exports:

- `createProviderRegistry(options)`: a registry with its own state, for tests.
- `registerProvider(provider, registryState)`
- `providerCandidates(ctx, registryState, deps)`
- `providerSummary(registryState, deps)`
- `validateProviderRow(row)` and `validateProviderRows(provider, rows, stats, deps)`
- `providerDiagnosticId(provider)` and `providerTimeoutBudgetMs(provider, limits)`
- `DEFAULT_PROVIDER_LIMITS`

The module is pure: no DOM, no storage, no host globals, no network. Access to the browser and to Home Assistant stays in `src/providers/providerRuntime.js` and in the provider modules.
