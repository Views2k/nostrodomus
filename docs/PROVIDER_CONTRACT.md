# Nostrodomus Provider Contract

Status: active and enforced in the bundled runtime.

## Provider object

A provider is a small, synchronous completion source registered with `registerProvider(provider)`.

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

- `id`: stable string. It is used for provider settings, diagnostics, and stats.
- `label`: readable name used in diagnostics/settings surfaces.
- `provide(ctx)`: synchronous function returning an array of completion rows.

Optional fields:

- `capabilities`: descriptive list for docs/settings surfaces.
- `priority`: default ordering hint for future provider orchestration.
- `timeoutMs`: per-provider budget override. Defaults to `8` ms and is clamped by the runtime.
- `canHandle(ctx)`: fast pure gate. Missing means always eligible.

## Runtime enforcement

`providerCandidates(ctx)` is the runtime boundary. It must keep these rules:

1. `canHandle(ctx)` is called in its own guard. A throw skips that provider and records `provider:<id>:canHandle`.
2. `provide(ctx)` is called in its own guard. A throw skips that provider and records `provider:<id>:provide`.
3. Provider runtime is measured. A provider exceeding its timeout budget is dropped and records `provider:<id>:timeout`.
4. Return value must be an array. Non-array results are dropped and record `provider:<id>:rows`.
5. Malformed rows are dropped individually and record `provider:<id>:row`.
6. One provider's failure never prevents later providers from contributing rows.

## Completion row shape

The runtime accepts rows with these required fields:

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

Required fields are `id`, `lang`, `type`, `label`, and `insert`, all strings. `source` is expected for attribution but existing built-in rows are allowed through the current compatibility layer. `aliases`, when present, must be an array. `meta`, when present, must be an object.

## Live instance data kinds (HA runtime value lane)

The `ha-runtime-values` provider serves these live data kinds out of the shared
`runtimeData()` cache (`state.runtimeCache`, TTL-gated by
`SECURITY_LIMITS.runtimeCacheMs`; all live data is built in ONE hass/window walk
per cache rebuild — never per keystroke):

- **Live custom-card catalog** (`cards` + `cardMeta` cache keys): the in-page
  `customCards` self-registration registry, normalized to `custom:<type>`,
  identifier-regex validated, deduped, sorted, and capped at
  `SECURITY_LIMITS.maxRuntimeCustomCards` (200). Names are capped at 80 chars,
  descriptions at 200. Card rows carry the human name via `meta.sourceDetail`
  / `meta.documentation` and a name alias. Fail-dark: an absent or malformed
  registry yields exactly the native Lovelace card list; invalid entries are
  skipped silently.
- **Service field schemas** (`serviceFields` cache key): per service id, a
  capped list of `{ field, description, selectorKind, required, advanced }`
  shaped from `hass.services[domain][service].fields`. `selectorKind` is the
  first key of the field's selector object or `""` when the selector is
  absent. Caps: `maxServiceFieldsPerService` (40) and `maxServicesWithFields`
  (400); field names are identifier-regex validated; descriptions are capped
  at 160 chars. Field-key rows are offered only when the cursor is on a key
  inside a `data:`/`service_data:` mapping AND the enclosing block's
  `service:`/`perform_action:`/`action:` scalar names a known service id
  (read from the adapter-parsed `ctx.branchState` — no provider-side YAML
  parsing). Unknown or fieldless services yield zero rows and zero errors.
- **Target entity ordering**: in `target:` → `entity_id:` value contexts with
  an unambiguous service domain, entities of that domain are ordered first
  within the existing entity lane (`homeassistant.*` services keep the plain
  sorted order). This is within-lane ordering only; global provider ordering
  and scoring are unchanged.

Fail-dark guarantee (tested contract): null/partial `hass`, non-object
`states`/`services`, throwing getters at any depth, and malformed registry
entries each degrade that entry only — fewer suggestions, never an exception,
never console output, never a typing stall.

## Current limitation

`src/providers/providerRegistry.js` is a pure, executable contract module wired into the browser bundle through the provider runtime owner; executed tests exercise its public exports directly.


## Executable registry module

`src/providers/providerRegistry.js` exports a pure registry boundary:

- `createProviderRegistry(options)` for stateful test/dev use.
- `registerProvider(provider, registryState)` for duplicate-safe registration.
- `providerCandidates(ctx, registryState, deps)` for guarded candidate collection.
- `providerSummary(registryState, deps)` for diagnostics/settings readouts.
- `validateProviderRow(row)` and `validateProviderRows(provider, rows, stats, deps)` for row-schema enforcement.

The module must stay pure: no DOM, no storage, no host globals, no network, and no UI ownership. Runtime host access remains inside the runtime owner modules.
