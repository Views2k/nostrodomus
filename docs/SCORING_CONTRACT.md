# Nostrodomus Scoring Contract

`src/completion/scoring.js` ranks completion rows. It takes the context descriptor and the rows the providers returned, and returns the rows the popup shows, in order.

## Purity rules

The scoring module does not read browser or runtime state. It must not reference:

- `state`
- `document`
- `window`
- `localStorage` / `sessionStorage`
- DOM query or listener APIs
- network APIs
- dynamic code execution APIs

Everything it needs is passed in as an argument, so ranking can be tested without a Home Assistant browser session. `tests/test_scoring_module_purity_static.py` scans the module for these tokens, and the tests under `tests/scoring/` run it directly.

`src/completion/scoringRuntime.js` is the caller in the browser bundle. It supplies the settings, the provider candidates, the result cache and the previous result.

## `scoreItems`

```js
scoreItems(ctx, candidates, options)
scoreItems(ctx, options)   // candidates come from options.providerCandidates(ctx)
```

`ctx` is the context descriptor (`docs/CONTEXT_DESCRIPTOR.md`). `candidates` is an array of provider rows (`docs/PROVIDER_CONTRACT.md`):

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
  triggerMode: string,
  wordFallback: boolean,
  enabledLangs: { yaml: true, css: true, js: true, jinja: true, html: true, json: true },
  completions: { dpRanking: boolean, frecency: boolean }
}
```

The defaults are `DEFAULT_SCORING_SETTINGS` in `src/completion/filtering.js` (`mode: 'both'`, `maxItems: 40`).

Other options: `cache` (an object with `get` and `set`), `recentAccepts` (a store from `createRecentAcceptBoostStore`), `previousItems` and `previousContext` (the last result, for narrowing while the user keeps typing), `recordSuggestionQuality` (a diagnostics callback).

### Gates

`scoreItems` returns no rows when:

- `ctx.suppressPopup` is set,
- `ctx.shouldSuggest` is false,
- `settings.triggerMode` is `manual` and the request is not explicit (`ctx.triggerKind !== 'explicit'` and no `ctx.explicitSession`),
- the language of the context is disabled in `settings.enabledLangs`.

With an empty prefix, rows are returned only for an explicit request, after a trigger character, or right after the colon of a key.

### Filtering

- When the context has a value kind, only rows whose type fits it stay: entity rows for an entity value, service rows for a service value, and so on (`itemMatchesYamlValueKind`).
- Static library rows are dropped in a plain scalar value position, and when a focused provider has rows for the position: the Home Assistant value provider for a value kind, or the context provider inside blocks such as `tap_action`, `target`, `data`, `styles`, `card_mod`, triggers and conditions.
- Word fallback rows are dropped when `settings.wordFallback` is false, when the context has a value kind, or when three or more other rows match the prefix.
- Rows of a disabled language and rows excluded by `settings.mode` are dropped.
- A row must match the prefix. The match tiers, best first: exact prefix of the label or insert text, case-insensitive prefix (label, insert text or an alias), word-boundary subsequence (`ta` for `tap_action`), ordered subsequence (only when `settings.fuzzy` is on), substring.

### Order

Rows are sorted by these keys, in this order:

1. Match tier.
2. Provider rank (`providerPriorityRank` plus the mode rank). In a value position the Home Assistant value provider leads. In YAML the context provider leads, then the card catalog. Snippets, the static library and word fallback follow.
3. Required service fields before optional ones.
4. The alignment score of the fuzzy match, when `completions.dpRanking` is on.
5. Catalog priority (`priority` of the row or of its `meta`).
6. The recent-accept boost.
7. The numeric score (language match, domain priority, focus-kind boost, row type, contextual penalties).
8. Shorter label first, then label in alphabetical order.

After sorting, rows of the same type that insert the same text are merged into the first one, and the list is cut to `settings.maxItems`.

Each returned row carries `score`, `matchTier`, `matchReason`, `providerRank`, `catalogRank`, `recentBoost`, `requiredRank` and `dpFuzzy` next to the provider's fields.

### Cache and incremental filtering

With a `cache`, a result is stored under a key built from the context fields, the settings and the tokens passed in `options` (`cacheSalt`, `snapshotToken`). A hit returns the stored list and calls `recordSuggestionQuality(ctx, rows, { cacheHit: true, ... })` when that callback is supplied.

When the new prefix extends the previous one in the same context and the previous result was not cut at `maxItems`, the previous rows are narrowed instead of asking the providers again. If narrowing leaves nothing, the providers are asked.

## Other exports

Ranking helpers, used by `scoreItems` and by tests:

- `completionMatchRank(item, prefix, settings)`
- `wordBoundarySubsequence(label, query)`
- `providerPriorityRank(item, ctx)`
- `catalogPriorityRank(item)`
- `allowType(item, settings)`
- `modeRank(item, settings)`
- `runtimeDomainPriority(item, ctx)`
- `contextualPenalty(item, ctx)`
- `focusKindTypeBoost(item, ctx)`
- `semanticItemRank(item, ctx)`
- `itemMatchesYamlValueKind(item, ctx)`
- `hasFocusedContextProviderItems(ctx, candidates)`
- `shouldSuppressStaticForFocusedContext(ctx, candidates)`
- `isScalarConfigContext(ctx)`
- `isServiceDataFieldKeyContext(ctx)`
- `sameCompletionContextForIncrementalFilter(previousCtx, ctx)`
- `camelMatch(label, query)`

Recent accepts: `createRecentAcceptBoostStore(limit)`, `DEFAULT_RECENT_ACCEPT_STORE`, `recordRecentAcceptedCompletion(item, store)` and `recentAcceptKey(item)`. The store keeps counts in memory. `src/main.legacy.js` loads and saves it under the `nostrodomus.frecency` storage key.

`compute`, `refresh` and `requestLiveUpdate` run detection, scoring and rendering through injected functions.

## Fixture corpus

Ranking fixtures live in `tests/fixtures/ranking/*.json`. Each fixture has:

- `name`
- `rationale`: the ranking a user should see, and why
- `ctx`
- `candidates`
- `expectedTopIds`

`tests/scoring/scoring_module.test.mjs` checks that every fixture is documented and that `scoreItems` returns the expected top rows. The corpus covers these contexts:

- Lovelace action keys
- Home Assistant entity values
- automation action service values
- CSS in card_mod style blocks
- Jinja filters

A change to scoring weights needs a fixture for the behavior it changes. When a change makes an existing fixture fail, the commit states the ranking decision and why the old expectation was wrong.
