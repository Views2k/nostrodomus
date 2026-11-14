# Nostrodomus Scoring Contract

Status: active.

The scoring engine is the ranking seam for Nostrodomus completion rows. It must stay pure so ranking changes can be tested without a Home Assistant browser session.

## Source of truth

`src/completion/scoring.js` is the scoring module source of truth and is wired into the browser bundle.

## Purity rules

The scoring module must not read browser or runtime globals. In particular, it must not reference:

- `state`
- `document`
- `window`
- `localStorage` / `sessionStorage`
- DOM query/listener APIs
- network APIs
- dynamic code execution APIs

The static purity test and executed scoring tests enforce this. Inputs must be passed as arguments.

## Public ranking functions

The module exports these stable helpers for tests and future runtime wiring:

- `allowType(item, settings)`
- `runtimeDomainPriority(item, ctx)`
- `contextualPenalty(item, ctx)`
- `hasFocusedContextProviderItems(ctx, candidates)`
- `itemMatchesYamlValueKind(item, ctx)`
- `focusKindTypeBoost(item, ctx)`
- `semanticItemRank(item, ctx)`
- `modeRank(item, settings)`
- `isScalarConfigContext(ctx)`
- `shouldSuppressStaticForFocusedContext(ctx, candidates)`
- `scoreItems(ctx, candidatesOrOptions, options)`
- `camelMatch(label, query)`

`compute`, `refresh`, and `requestLiveUpdate` remain exported as dependency-injected adapters so historical static contracts remain satisfied without runtime globals.

## `scoreItems` contract

`scoreItems(ctx, candidates, options)` ranks completion rows from already-collected candidates.

`ctx` is the current completion context descriptor.

`candidates` is an array of provider rows with the de facto row shape:

```js
{ id, lang, type, label, insert, aliases: [], source, meta: {} }
```

`options.settings` may include:

```js
{
  mode: 'both' | 'snippets' | 'keys',
  maxItems: number,
  fuzzy: boolean,
  globalSearch: boolean,
  triggerMode: 'auto' | 'manual',
  enabledLangs: { yaml: true, css: true, js: true, jinja: true }
}
```

The function returns scored rows sorted by semantic rank, score, then label.

## Fixture corpus

Ranking fixtures live in `tests/fixtures/ranking/*.json`.

Each fixture must include:

- `name`
- `rationale`
- `ctx`
- `candidates`
- `expectedTopIds`

Do not change scoring weights and fixture expectations in the same patch unless the patch explicitly documents the ranking decision and why the old expectation was wrong.

## Future wiring rule

Changes to this module must keep the fixture corpus covering the behavior being changed and must preserve visual/codebox contracts.

## Fixture coverage minimum

As of v31.6.101, the ranking fixture corpus must cover at least these context families before runtime wiring:

- Lovelace action/key contexts.
- Home Assistant runtime entity values.
- Automation action service values.
- CSS/card_mod style contexts.
- Jinja filter contexts.

Each fixture must include a rationale explaining the user-visible ranking expectation. The scoring test suite validates that fixtures are documented and that the expected top rows remain stable.

## Cache and diagnostics-adapter behavior

`scoreItems` may use an optional cache object with `get`/`set` methods. A cache hit must return the same ranked result for the same context/settings signature and must call `recordSuggestionQuality(ctx, rows, { cacheHit: true, ... })` when that callback is supplied.

Gate behavior is part of the scoring contract:

- `ctx.shouldSuggest === false` returns no rows.
- `settings.triggerMode === 'manual'` returns rows only for explicit triggers.
- Disabled languages in `settings.enabledLangs` suppress matching rows.

These behaviors are covered by executed tests and should not be changed during weight tuning.
