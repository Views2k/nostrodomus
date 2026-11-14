// Nostrodomus completion scoring runtime glue.
//
// Keep pure scoring math in ./scoring.js. This module binds that pure pipeline
// to live runtime state behind thin delegates.

import {
  allowType,
  camelMatch,
  contextualPenalty,
  focusKindTypeBoost,
  hasFocusedContextProviderItems,
  isServiceDataFieldKeyContext,
  itemMatchesYamlValueKind,
  modeRank,
  runtimeDomainPriority,
  scoreItems,
  semanticItemRank,
  shouldSuppressStaticForFocusedContext,
} from './scoring.js';

function enabledProviderSalt(providerSettings = {}) {
  return Object.entries(providerSettings || {})
    .filter(([, cfg]) => cfg?.enabled !== false)
    .map(([key]) => key)
    .sort()
    .join(',');
}

// The positions where rows built from the Home Assistant data snapshot can be in the list: a
// YAML value or list item, a key of a service data block, and an entity argument in a template.
// Everywhere else (YAML keys, CSS, JavaScript) the snapshot is not asked for.
function usesRuntimeSnapshot(ctx) {
  if (!ctx || !ctx.shouldSuggest || ctx.suppressPopup) return false;
  if (ctx.lang === 'jinja') return !!ctx.jinjaArg;
  if (ctx.lang !== 'yaml') return false;
  return ctx.yamlRole === 'value' || ctx.yamlRole === 'list-key' || isServiceDataFieldKeyContext(ctx);
}

export function createScoringRuntime(options = {}) {
  const state = options.state || {};
  const ensureProviderSettings = typeof options.ensureProviderSettings === 'function'
    ? options.ensureProviderSettings
    : () => ({});
  const providerCandidates = typeof options.providerCandidates === 'function'
    ? options.providerCandidates
    : () => [];
  const recordSuggestionQuality = typeof options.recordSuggestionQuality === 'function'
    ? options.recordSuggestionQuality
    : () => null;
  // The Home Assistant data snapshot (entities, services, registries). A cached list is valid
  // only for the snapshot it was scored with, so the cache key carries a number that changes
  // when the snapshot object is replaced. Asking for the snapshot here also lets it refresh when
  // it is due: a cache hit does not call the providers, so before this a list that was cached
  // once kept its old entities until something else cleared the cache.
  const runtimeData = typeof options.runtimeData === 'function' ? options.runtimeData : null;
  const snapshotNumbers = new WeakMap();
  let lastSnapshotNumber = 0;

  function snapshotToken(ctx) {
    if (!runtimeData || !usesRuntimeSnapshot(ctx)) return '';
    let snapshot = null;
    try {
      snapshot = runtimeData();
    } catch {
      return '';
    }
    if (!snapshot || typeof snapshot !== 'object') return '';
    let number = snapshotNumbers.get(snapshot);
    if (!number) {
      lastSnapshotNumber += 1;
      number = lastSnapshotNumber;
      snapshotNumbers.set(snapshot, number);
    }
    return number;
  }

  return {
    allowType(item) {
      return allowType(item, state.settings || {});
    },

    runtimeDomainPriority(item, ctx) {
      return runtimeDomainPriority(item, ctx);
    },

    contextualPenalty(item, ctx) {
      return contextualPenalty(item, ctx);
    },

    hasFocusedContextProviderItems(ctx, candidates) {
      return hasFocusedContextProviderItems(ctx, candidates);
    },

    itemMatchesYamlValueKind(item, ctx) {
      return itemMatchesYamlValueKind(item, ctx);
    },

    focusKindTypeBoost(item, ctx) {
      return focusKindTypeBoost(item, ctx);
    },

    semanticItemRank(item, ctx) {
      return semanticItemRank(item, ctx);
    },

    modeRank(item) {
      return modeRank(item, state.settings || {});
    },

    shouldSuppressStaticForFocusedContext(ctx, candidates) {
      return shouldSuppressStaticForFocusedContext(ctx, candidates);
    },

    scoreItems(ctx) {
      return scoreItems(ctx, {
        settings: state.settings || {},
        cache: state.completionCache,
        cacheSalt: enabledProviderSalt(ensureProviderSettings()),
        snapshotToken: snapshotToken(ctx),
        previousContext: state.context,
        previousItems: state.items,
        providerCandidates,
        recordSuggestionQuality,
      });
    },

    camelMatch(label, query) {
      return camelMatch(label, query);
    },
  };
}

export default createScoringRuntime;
