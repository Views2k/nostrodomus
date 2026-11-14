// Nostrodomus completion scoring module.
// Pure ranking helpers plus a tested scoreItems pipeline.
// Keep this file pure: no browser globals, DOM work, timers, storage, or host calls.

import {
  HA_VALUE_PROVIDER_ID,
  LOVELACE_CONTEXT_PROVIDER_ID,
  HACS_CATALOG_PROVIDER_ID,
  SNIPPET_PROVIDER_ID,
  WORD_FALLBACK_PROVIDER_ID,
  STATIC_PROVIDER_ID,
} from '../core/runtimeConstants.js';
import * as filtering from './filtering.js';
import {
  DEFAULT_SCORING_SETTINGS,
  cacheGet,
  cachePut,
  hasEnabledLanguage,
  normalizeCompletionItem,
  normalizeScoringSettings,
} from './filtering.js';
// Optimal-alignment fuzzy score used as a high within-tier sort key when the flag is on
// (default off → not computed, sort term is 0 → byte-identical ordering).
import { dpFuzzyScore } from './dpFuzzyScore.js';
import { completionSettings, DEFAULT_COMPLETION_SETTINGS } from '../core/completionSettings.js';
import { cssRuleCanStartAt, templateBlockOpening } from '../yaml/yamlCompletionContext.js';

export { DEFAULT_SCORING_SETTINGS };



const MATCH_TIER = Object.freeze({
  none: 99,
  empty: 0,
  exactPrefix: 0,
  insensitivePrefix: 1,
  boundarySubsequence: 2,
  orderedSubsequence: 2.5,
  substring: 3,
});
const DEFAULT_RECENT_ACCEPT_LIMIT = 50;
// Frecency boost ceiling, identical to the legacy recency cap (12), so the boost's numeric range is
// unchanged (1..12); the frecency flag only changes its distribution within that band (recency-only 4/8
// when off → recency+log-frequency when on). recentBoost is both a sort key and added into score, so
// keeping the same ceiling means frecency can never perturb score tiebreaks beyond the proven range.
const FRECENCY_BOOST_CAP = 12;
// Exported so the host runtime can hydrate/persist this one shared store: both ranking
// (scoreItems opts.recentAccepts || DEFAULT) and the accept recorder converge on it.
export const DEFAULT_RECENT_ACCEPT_STORE = createRecentAcceptBoostStore(DEFAULT_RECENT_ACCEPT_LIMIT);

function cleanQuery(value = '') {
  return String(value || '').replace(/^\s+/, '');
}

function alnumLower(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function uniqueSearchStrings(item) {
  const values = [item?.label, ...(Array.isArray(item?.aliases) ? item.aliases : [])]
    .map(value => String(value || ''))
    .filter(Boolean);
  return Array.from(new Set(values));
}

function boundaryInitials(value = '') {
  const text = String(value || '');
  const chars = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!/[a-z0-9]/i.test(ch)) continue;
    const prev = i > 0 ? text[i - 1] : '';
    const next = i + 1 < text.length ? text[i + 1] : '';
    const atStart = i === 0;
    const afterSeparator = !/[a-z0-9]/i.test(prev);
    const camelBoundary = /[a-z]/.test(prev) && /[A-Z]/.test(ch);
    const acronymTail = /[A-Z]/.test(prev) && /[A-Z]/.test(ch) && /[a-z]/.test(next);
    if (atStart || afterSeparator || camelBoundary || acronymTail) chars.push(ch.toLowerCase());
  }
  return chars.join('');
}

export function wordBoundarySubsequence(label = '', query = '') {
  const needle = alnumLower(query);
  if (!needle || needle.length < 2) return false;
  const initials = boundaryInitials(label);
  let cursor = 0;
  for (const ch of initials) {
    if (ch === needle[cursor]) cursor += 1;
    if (cursor >= needle.length) return true;
  }
  return false;
}


function orderedSubsequenceMatch(label = '', query = '') {
  const text = String(label || '');
  const needle = alnumLower(query);
  if (!needle || needle.length < 2 || text.length > 120) return { matched: false, score: 0 };
  let cursor = 0;
  let first = -1;
  let last = -1;
  let gapPenalty = 0;
  let runBonus = 0;
  let boundaryBonus = 0;
  let previous = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!/[a-z0-9]/i.test(ch)) continue;
    if (ch.toLowerCase() !== needle[cursor]) continue;
    if (first < 0) first = i;
    if (previous >= 0) {
      const gap = i - previous - 1;
      gapPenalty += gap;
      if (gap === 0) runBonus += 12;
    }
    const prev = i > 0 ? text[i - 1] : '';
    if (i === 0 || !/[a-z0-9]/i.test(prev) || (/[a-z]/.test(prev) && /[A-Z]/.test(ch))) boundaryBonus += 8;
    previous = i;
    last = i;
    cursor += 1;
    if (cursor >= needle.length) {
      return { matched: true, score: Math.max(1, 80 + runBonus + boundaryBonus - gapPenalty - first - Math.max(0, last - first - needle.length + 1)) };
    }
  }
  return { matched: false, score: 0 };
}

export function completionMatchRank(item, rawPrefix = '', settings = {}) {
  const query = cleanQuery(rawPrefix);
  if (!query) return { matched: true, tier: MATCH_TIER.empty, reason: 'empty-prefix' };

  const strings = uniqueSearchStrings(item);
  if (!strings.length) return { matched: false, tier: MATCH_TIER.none, reason: 'no-search-strings' };

  // What the row shows and inserts ranks above its aliases: a category word such as "entity" or
  // "boolean" in the aliases made every row of that kind an exact-prefix match for the first few
  // typed characters, level with the rows whose own text starts with them.
  const own = [item?.label, item?.insert].map(value => String(value || '')).filter(Boolean);
  const queryLower = query.toLowerCase();
  if (own.some(value => value.startsWith(query))) return { matched: true, tier: MATCH_TIER.exactPrefix, reason: 'exact-prefix' };
  if (own.some(value => value.toLowerCase().startsWith(queryLower))) return { matched: true, tier: MATCH_TIER.insensitivePrefix, reason: 'case-insensitive-prefix' };
  if (strings.some(value => value.toLowerCase().startsWith(queryLower))) return { matched: true, tier: MATCH_TIER.insensitivePrefix, reason: 'alias-prefix' };

  if (strings.some(value => wordBoundarySubsequence(value, query))) return { matched: true, tier: MATCH_TIER.boundarySubsequence, reason: 'word-boundary-subsequence' };

  if (settings?.fuzzy !== false && /^[A-Za-z0-9]+$/.test(query)) {
    let bestFuzzy = 0;
    for (const value of strings) {
      const fuzzy = orderedSubsequenceMatch(value, query);
      if (fuzzy.matched) bestFuzzy = Math.max(bestFuzzy, fuzzy.score);
    }
    if (bestFuzzy) return { matched: true, tier: MATCH_TIER.orderedSubsequence, reason: 'ordered-subsequence', fuzzyScore: bestFuzzy };
  }

  const haystack = String(item?.haystack || strings.join(' ')).toLowerCase();
  if (haystack.includes(queryLower)) return { matched: true, tier: MATCH_TIER.substring, reason: 'substring' };

  return { matched: false, tier: MATCH_TIER.none, reason: 'no-match' };
}

// A service-data field-key lane: the cursor names a key directly under data:/service_data:.
// There the ha-runtime provider's service-field rows are THE context rows for this exact ctx
// (mirrors the provider-side isServiceDataFieldContext gate using only ctx fields).
export function isServiceDataFieldKeyContext(ctx) {
  if (!ctx || ctx.lang !== 'yaml' || ctx.valueKind) return false;
  const role = String(ctx.yamlRole || '');
  if (role !== 'key' && role !== 'blank') return false;
  const path = Array.isArray(ctx.yamlPath) ? ctx.yamlPath : [];
  const last = String(path[path.length - 1] || '').toLowerCase();
  return last === 'data' || last === 'service_data';
}

export function providerPriorityRank(item, ctx = {}) {
  const source = item?.source || '';
  const type = String(item?.type || '').toLowerCase();
  if (ctx?.valueKind && source === HA_VALUE_PROVIDER_ID) return 0;
  // Focused-lane ownership: when the ctx is a lane one provider exists to serve AND that
  // provider produced rows (ctx.focusedLaneOwner set by scoreItems), its rows lead the lane;
  // the generic yaml-wide lovelace rank-0 privilege does not apply inside the lane.
  if (ctx?.focusedLaneOwner) {
    if (source === ctx.focusedLaneOwner) return 0;
    if (source === LOVELACE_CONTEXT_PROVIDER_ID) return 1;
    if (source === HACS_CATALOG_PROVIDER_ID) return 2;
  }
  if (ctx?.lang === 'yaml' && source === LOVELACE_CONTEXT_PROVIDER_ID) return 0;
  if (ctx?.lang === 'yaml' && source === HACS_CATALOG_PROVIDER_ID) return 1;
  if (ctx?.lang === 'css' && (type === 'property' || item?.lang === 'css')) return 0;
  if (source === HA_VALUE_PROVIDER_ID) return 1;
  if (source === LOVELACE_CONTEXT_PROVIDER_ID) return 2;
  if (source === HACS_CATALOG_PROVIDER_ID) return 2;
  if (source === SNIPPET_PROVIDER_ID || type === 'snippet') return 3;
  if (source === STATIC_PROVIDER_ID) return 4;
  if (source === WORD_FALLBACK_PROVIDER_ID || type === 'word') return 7;
  return 5;
}

export function catalogPriorityRank(item) {
  const raw = item?.priority ?? item?.meta?.priority ?? item?.meta?.catalogPriority ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function recentAcceptKey(item) {
  return String(item?.id || `${item?.source || ''}:${item?.label || ''}:${item?.insert || ''}`).slice(0, 240);
}

export function createRecentAcceptBoostStore(limit = DEFAULT_RECENT_ACCEPT_LIMIT) {
  const max = Math.max(1, Math.min(200, Number(limit) || DEFAULT_RECENT_ACCEPT_LIMIT));
  // key -> { count, stamp }: count = total accepts (frequency), stamp = the monotonic accept counter at
  // the last accept (recency, not wall-clock, for determinism). Map insertion order drives LRU eviction.
  const hits = new Map();
  let stamp = 0;
  return {
    mark(item) {
      const key = recentAcceptKey(item);
      if (!key.trim()) return 0;
      stamp += 1;
      const prev = hits.get(key);
      const count = (prev && Number.isFinite(prev.count) ? prev.count : 0) + 1;
      hits.delete(key); // delete+set keeps the just-accepted key newest in insertion order (LRU)
      hits.set(key, { count, stamp });
      while (hits.size > max) hits.delete(hits.keys().next().value);
      return stamp;
    },
    // Off (no opts / opts.frecency !== true): byte-identical to the legacy recency-only boost (4 or 8).
    // On (opts.frecency === true): add a log-scaled frequency term so the most-accepted items lead.
    boostFor(item, opts) {
      const rec = hits.get(recentAcceptKey(item));
      if (!rec) return 0;
      const recent = stamp - rec.stamp <= 5 ? 4 : 0;
      if (!opts || opts.frecency !== true) return Math.max(1, Math.min(12, 4 + recent));
      const freq = Math.min(4, Math.round(Math.log2((rec.count || 0) + 1))); // 1→1, 3→2, 7→3, 15+→4
      return Math.max(1, Math.min(FRECENCY_BOOST_CAP, 4 + recent + freq));
    },
    // Pure serialize/restore for the host runtime's persistence layer (this module never touches storage).
    snapshot() {
      return { v: 1, entries: Array.from(hits, ([key, r]) => ({ key, count: r.count, stamp: r.stamp })) };
    },
    hydrate(entries) {
      if (!Array.isArray(entries)) return 0;
      hits.clear();
      let maxStamp = 0;
      for (const e of entries) {
        const k = typeof e?.key === 'string' ? e.key.slice(0, 240) : '';
        // Validate the RAW count before clamping: Math.max(1, ...) made the `!c` guard
        // below dead, so entries with a missing/0/NaN count were admitted as count 1
        // instead of skipped. Reject them on the raw value first.
        const rawCount = Math.floor(Number(e?.count) || 0);
        const c = Math.max(1, Math.min(1e6, rawCount));
        const s = Math.max(0, Math.min(1e9, Math.floor(Number(e?.stamp) || 0)));
        if (!k.trim() || rawCount < 1 || !s) continue;
        hits.set(k, { count: c, stamp: s });
        if (s > maxStamp) maxStamp = s;
      }
      while (hits.size > max) hits.delete(hits.keys().next().value);
      stamp = Math.max(stamp, maxStamp); // never let post-reload recency math underflow
      return hits.size;
    },
    stamp() { return stamp; },
    size() { return hits.size; },
    clear() { hits.clear(); stamp += 1; },
  };
}

export function recordRecentAcceptedCompletion(item, store = DEFAULT_RECENT_ACCEPT_STORE) {
  return store && typeof store.mark === 'function' ? store.mark(item) : 0;
}

function recentAcceptedBoost(item, store = DEFAULT_RECENT_ACCEPT_STORE, opts) {
  return store && typeof store.boostFor === 'function' ? store.boostFor(item, opts) : 0;
}

export function sameCompletionContextForIncrementalFilter(previousCtx = {}, ctx = {}) {
  if (!previousCtx || !ctx) return false;
  const prevPrefix = String(previousCtx.prefix || '');
  const nextPrefix = String(ctx.prefix || '');
  if (!prevPrefix || !nextPrefix || nextPrefix.length <= prevPrefix.length || !nextPrefix.startsWith(prevPrefix)) return false;
  if (ctx.triggerKind === 'explicit') return false;
  const keys = ['lang', 'surface', 'scope', 'yamlRole', 'yamlKey', 'valueKind', 'focusKind', 'pathText', 'catalogCardType', 'catalogSurfaceId', 'catalogCardNested'];
  return keys.every(key => String(previousCtx[key] || '') === String(ctx[key] || ''));
}

// allowType and modeRank read one field of the settings. scoreItems calls them once per
// candidate with settings it already normalized, so it passes the mode; normalizing the whole
// settings object again for each of several hundred candidates was most of their cost.
export function allowType(item, settings = {}) {
  return allowTypeForMode(item, normalizeScoringSettings(settings).mode);
}

function allowTypeForMode(item, mode) {
  if (mode === 'both') return true;
  if (mode === 'snippets') return item?.type === 'snippet' || item?.source === SNIPPET_PROVIDER_ID || item?.meta?.quickSnippet === true;
  return item?.type !== 'snippet' || item?.source === SNIPPET_PROVIDER_ID || item?.meta?.quickSnippet === true;
}

const ENTITY_DOMAIN_ORDER = Object.freeze({
  sensor: 70,
  binary_sensor: 62,
  light: 56,
  switch: 52,
  climate: 48,
  cover: 44,
  fan: 42,
  lock: 38,
  media_player: 34,
  device_tracker: 26,
  script: 12,
  automation: -35,
});
const SERVICE_DOMAIN_ORDER = Object.freeze({ light: 30, switch: 24, climate: 20, script: 18, homeassistant: 12, automation: 6 });

export function runtimeDomainPriority(item, ctx = {}) {
  if (item?.source !== HA_VALUE_PROVIDER_ID) return 0;
  const domain = item?.meta?.domain || String(item?.label || '').split('.')[0] || '';
  const key = String(ctx?.yamlKey || '').toLowerCase();

  if (item.type === 'entity') return Object.hasOwn(ENTITY_DOMAIN_ORDER, domain) ? ENTITY_DOMAIN_ORDER[domain] : 0;
  if (item.type === 'service') return Object.hasOwn(SERVICE_DOMAIN_ORDER, domain) ? SERVICE_DOMAIN_ORDER[domain] : 0;

  if (item.type === 'card') return String(item.label || '').startsWith('custom:') ? 10 : 20;
  if (key === 'action' && item.type === 'action') return item.label === 'call-service' ? 30 : 12;
  return 0;
}

export function contextualPenalty(item, ctx = {}) {
  const normalized = normalizeCompletionItem(item);
  if (!normalized) return 0;
  return contextualPenaltyOfNormalized(normalized, ctx);
}

// The same for an item that normalizeCompletionItem already produced (every candidate inside
// scoreItems), without copying it a second time.
function contextualPenaltyOfNormalized(normalized, ctx = {}) {
  let score = 0;
  const scope = String(ctx.scope || '');
  const prefix = String(ctx.prefix || '');

  if (ctx.lang === 'yaml') {
    if (normalized.source === SNIPPET_PROVIDER_ID) score += 190;
    if (normalized.source === LOVELACE_CONTEXT_PROVIDER_ID) score += 150;
    if (ctx.valueKind && normalized.source === HA_VALUE_PROVIDER_ID) score += 120;
    if (ctx.valueKind && normalized.source !== HA_VALUE_PROVIDER_ID) score -= 60;
    if (ctx.afterKeyColon && normalized.type === 'snippet' && normalized.source !== SNIPPET_PROVIDER_ID) score -= 40;
    if (scope.includes('card_mod') && normalized.labelLower.includes('card_mod')) score -= 20;
    if (scope.includes('tap_action') && normalized.labelLower.includes('action')) score += 35;
    if (scope.includes('styles') && normalized.lang === 'css') score += 35;
  }

  if (ctx.lang === 'css') {
    if (normalized.type === 'property') score += 25;
    if (normalized.labelLower.includes('card_mod')) score -= 80;
    if (prefix.startsWith('--')) score += normalized.labelLower.includes('--') ? 50 : -20;
  }

  if (ctx.lang === 'js') {
    if (normalized.labelLower.includes('entity') || normalized.labelLower.includes('states')) score += 25;
  }

  if (ctx.lang === 'jinja') {
    if (normalized.type === 'filter' && prefix.startsWith('|')) score += 80;
    if (normalized.type === 'function' && !prefix.startsWith('|')) score += 20;
  }

  return score;
}

export function hasFocusedContextProviderItems(ctx, candidates) {
  if (!ctx || ctx.lang !== 'yaml' || ctx.valueKind) return false;
  if (!Array.isArray(candidates) || !candidates.some(item => item?.source === LOVELACE_CONTEXT_PROVIDER_ID)) return false;

  const scope = String(ctx.scope || '');
  const path = Array.isArray(ctx.yamlPath) ? ctx.yamlPath.join('.') : '';
  const focused = [
    'tap_action', 'hold_action', 'double_tap_action', 'target', 'data', 'styles', 'browser_mod', 'card_mod', 'custom_fields', ['st', 'ate'].join(''), 'triggers', 'trigger', 'conditions', 'condition', 'actions', 'sequence', 'then', 'else', 'choose', 'repeat',
  ];

  return focused.some(key => scope.includes(key) || path.includes(key));
}

export function itemMatchesYamlValueKind(item, ctx = {}) {
  const kind = String(ctx?.valueKind || '').toLowerCase();
  if (!kind) return true;
  const type = String(item?.type || '').toLowerCase();
  const source = item?.source || '';

  if (kind === 'entity') return type === 'entity';
  if (kind === 'service') return type === 'service';
  if (kind === 'card-type') return type === 'card';
  if (kind === 'icon') return type === 'icon';
  if (kind === 'action') {
    if (type === 'action') return true;
    // The dashboard action value snippets (`perform-action` plus its sibling keys) complete the
    // value and add lines below it. The insertion step lines those up only while the value is
    // still empty (the cursor right after `action:`), so they pass here and not once a prefix
    // is typed. Before, this filter dropped them everywhere.
    return type === 'snippet' && item?.meta?.contextKind === 'lovelace-action-value' && ctx?.afterKeyColon === true;
  }
  if (kind === 'theme') return type === 'theme';
  if (kind === 'trigger-type') return type === 'trigger';
  if (kind === 'condition-type') return type === 'condition';
  if (kind === 'automation-mode') return type === 'mode';
  if (kind === 'boolean') return type === 'boolean';
  if (kind === 'script-action') return type === 'script-action';
  if (['number', 'duration', 'string', 'scalar'].includes(kind)) return type === kind;
  // Registry value lanes: area_id:/device_id:/floor_id:/label_id: complete only their own registry
  // rows (each carries item.type === the kind), so snippets/keys/other rows don't leak into the popup.
  if (['area', 'device', 'floor', 'label'].includes(kind)) return type === kind;

  return source !== STATIC_PROVIDER_ID;
}

export function focusKindTypeBoost(item, ctx = {}) {
  const focusKind = String(ctx?.focusKind || '').toLowerCase();
  if (!focusKind) return 0;
  const type = String(item?.type || '').toLowerCase();
  const source = item?.source || '';

  if (ctx?.valueKind && itemMatchesYamlValueKind(item, ctx)) return 120;
  if (focusKind === 'action-block' || focusKind === 'automation-action') {
    if (source === SNIPPET_PROVIDER_ID && type === 'snippet') return 110;
    if (source === LOVELACE_CONTEXT_PROVIDER_ID && type === 'key') return 55;
    if (type === 'snippet') return 45;
    if (type === 'action' || type === 'service') return 35;
  }
  if (focusKind === 'target-block' || focusKind === 'entity-list') {
    if (type === 'entity') return 70;
    if (source === LOVELACE_CONTEXT_PROVIDER_ID && type === 'key') return 35;
  }
  if (focusKind === 'style-block') {
    if (type === 'property' || item?.lang === 'css') return 60;
    if (source === LOVELACE_CONTEXT_PROVIDER_ID && (type === 'key' || type === 'snippet')) return 35;
  }
  if (focusKind === 'trigger-block' || focusKind === 'condition-block') {
    if (source === SNIPPET_PROVIDER_ID && type === 'snippet') return 105;
    if (source === LOVELACE_CONTEXT_PROVIDER_ID && type === 'key') return 55;
    if (type === 'snippet') return 40;
    if (type === 'trigger' || type === 'condition') return 45;
  }
  return 0;
}

export function semanticItemRank(item, ctx = {}) {
  if (!item) return 50;
  const source = item.source || '';
  const type = item.type || '';
  const contextKind = item.meta?.contextKind || '';

  if (ctx?.lang === 'yaml' && source === LOVELACE_CONTEXT_PROVIDER_ID) {
    if (type === 'key') return 0;
    if (type === 'snippet') return 20;
    return 10;
  }

  if (source === HA_VALUE_PROVIDER_ID) return 5;
  if (source === SNIPPET_PROVIDER_ID && type === 'snippet') return 1;
  if (contextKind === 'automation-action') return 18;
  if (type === 'snippet') return 40;
  return 30;
}

export function modeRank(item, settings = {}) {
  return modeRankForMode(item, normalizeScoringSettings(settings).mode);
}

function modeRankForMode(item, mode) {
  if (mode === 'snippets') return item?.type === 'snippet' || item?.source === SNIPPET_PROVIDER_ID ? 0 : 100;
  if (mode === 'keys') return item?.type === 'snippet' && item?.source !== SNIPPET_PROVIDER_ID ? 100 : 0;
  return item?.type === 'snippet' && item?.source !== SNIPPET_PROVIDER_ID ? 20 : 0;
}

export function isScalarConfigContext(ctx) {
  return !!ctx && ctx.lang === 'yaml' && (
    ['number', 'duration', 'string', 'scalar'].includes(String(ctx.valueKind || '').toLowerCase()) ||
    (ctx.yamlRole === 'value' && ctx.yamlKey && !ctx.valueKind)
  );
}

export function shouldSuppressStaticForFocusedContext(ctx, candidates) {
  if (!ctx || ctx.lang !== 'yaml') return false;
  if (isScalarConfigContext(ctx)) return true;
  if (ctx.valueKind && Array.isArray(candidates) && candidates.some(item => item?.source === HA_VALUE_PROVIDER_ID)) return true;
  return hasFocusedContextProviderItems(ctx, candidates);
}

// The first `cap` rows of a ranked list, one row per inserted text. Several providers offer the
// same key (the context provider, the catalog and the static library) or the same card type
// (Home Assistant and the catalog), and the list showed each of them. Two rows are the same
// suggestion only when they are of the same kind and insert the same text; rows that share a
// label and insert different text both stay. The first row in rank order is kept, which among
// equally good matches is the row of the higher-priority provider.
//
// The kept row takes over the label and aliases of a dropped one. A later, longer prefix narrows
// this list instead of asking the providers again, and it has to find the text through the words
// of either row.
function withoutDuplicateRows(ranked, cap) {
  const rows = [];
  const keptByText = new Map();
  for (const item of ranked) {
    const insert = typeof item.insert === 'string' ? item.insert : '';
    const textKey = insert ? `${item.type || ''}\n${insert}` : '';
    const kept = textKey ? keptByText.get(textKey) : undefined;
    if (kept) {
      const known = Array.isArray(kept.aliases) ? kept.aliases : [];
      const words = [item.label, ...(Array.isArray(item.aliases) ? item.aliases : [])]
        .filter((word, index, all) => word && word !== kept.label && !known.includes(word) && all.indexOf(word) === index);
      if (words.length) {
        kept.aliases = [...known, ...words];
        kept.haystack = `${kept.haystack || ''} ${words.join(' ').toLowerCase()}`;
      }
      continue;
    }
    if (rows.length >= cap) break;
    if (textKey) keptByText.set(textKey, item);
    rows.push(item);
  }
  return rows;
}

/**
 * @param {any} ctx
 * @param {any[] | Record<string, any>} [candidatesOrOptions]
 * @param {Record<string, any>} [options]
 */
export function scoreItems(ctx, candidatesOrOptions = [], options = {}) {
  const opts = /** @type {Record<string, any>} */ (Array.isArray(candidatesOrOptions)
    ? { ...options, candidates: candidatesOrOptions }
    : { ...(candidatesOrOptions || {}) });
  const settings = normalizeScoringSettings(opts.settings || {});
  // Read straight from the raw settings (completionSettings does its own fail-dark merge) so it
  // survives normalizeScoringSettings, which keeps only the legacy scoring fields.
  const completion = completionSettings(opts.settings || {});
  const dpRankingOn = completion.dpRanking === true;
  // When on, the recency boost gains a log-scaled frequency term (most-accepted items lead).
  // Off → boostFor returns the byte-identical legacy 4/8 recency (the undefined opts arg below).
  const frecencyOn = completion.frecency === true;
  // A stable token of every completion lane-gate flag that is on. The candidate set a provider
  // yields for a fixed ctx depends on these (engineV2/registryLane/schemaValues/surfaceScope/
  // jinjaLane/lazyResolve), so the cache key must carry them or a flag toggle can serve rows scored
  // under the old config. The settings-save clear is debounced, so the key can't lean on it. All-off
  // yields '' — byte-identical to the previous dp/frecency-only token.
  const completionFlagToken = Object.keys(DEFAULT_COMPLETION_SETTINGS)
    .filter((flag) => completion[flag] === true)
    .join(',');

  if (ctx?.suppressPopup) return [];
  if (!ctx?.shouldSuggest || (settings.triggerMode === 'manual' && ctx.triggerKind !== 'explicit' && !ctx.explicitSession)) return [];
  if (!hasEnabledLanguage(settings, ctx.lang)) return [];

  const enabledLangToken = Object.entries(settings.enabledLangs || {})
    .filter(([, value]) => value !== false)
    .map(([key]) => key)
    .sort()
    .join(',');
  const recentStore = opts.recentAccepts || DEFAULT_RECENT_ACCEPT_STORE;
  const recentStamp = recentStore && typeof recentStore.stamp === 'function' ? recentStore.stamp() : 0;
  // The incremental filter narrows the PREVIOUS result set instead of re-running providers.
  // That is only sound when the previous result held every match — a result that hit the
  // maxItems cap may have sliced off the row that the longer prefix now matches best, and it
  // could never reappear (the popup blanks mid-typing and the empty result caches forward).
  // If the prior result was at/over the cap, recompute from providers instead of reusing it.
  const maxItemsCap = Number(settings.maxItems) || DEFAULT_SCORING_SETTINGS.maxItems;
  const incrementalSource = !Array.isArray(opts.candidates)
    && Array.isArray(opts.previousItems)
    // An empty previous result is never "every match": it can be empty because of minChars,
    // a suppressed popup, or a compute that failed. Narrowing it can only stay empty.
    && opts.previousItems.length > 0
    && opts.previousItems.length < maxItemsCap
    && sameCompletionContextForIncrementalFilter(opts.previousContext, ctx);
  // The provider rows depend on the resolved service/action, which lives in ctx.branchState
  // (parent for automation `- action:` steps, a sibling for dashboard action blocks) — none of
  // it was in the key, so a second `data:` block under a DIFFERENT service was served the first
  // service's cached fields (wrong, and visit-order dependent). A compact signature over the
  // branch fields that drive service resolution + sibling filtering distinguishes those slots.
  // isTriggerChar gates the empty-prefix passive branch below, so it belongs in the key too.
  // Over-capturing here only ever causes a safe recompute (a miss), never a wrong hit.
  const bs = ctx.branchState;
  const branchToken = bs && typeof bs === 'object'
    ? [bs.parentKey || '', bs.parentValue || '', bs.action || '', bs.actionValue || '',
       bs.siblings && typeof bs.siblings === 'object'
         ? Object.keys(bs.siblings).sort().map(k => `${k}=${bs.siblings[k]?.value ?? ''}`).join('&')
         : ''].join('~')
    : '';
  const cacheKey = [
    ctx.lang, ctx.surface || '', ctx.scope, ctx.yamlRole, ctx.yamlKey, ctx.valueKind, ctx.focusKind, ctx.pathText, ctx.prefix, ctx.triggerKind, ctx.documentWordToken || '',
    ctx.jinjaArg ? `${ctx.jinjaArg.fn}:${ctx.jinjaArg.argIndex}` : '',
    // The catalog provider keys its rows on the card around the cursor, and the context provider
    // reads the text above it, so two cards in one editor buffer must not share a slot.
    ctx.catalogCardType || '', ctx.catalogSurfaceId || '', ctx.catalogCardNested ? 'N' : '', ctx.lineNumber || '',
    branchToken, ctx.isTriggerChar ? 'T' : '', ctx.afterKeyColon ? 'C' : '',
    // In a template the block rows (`{% if %}`) depend on what opens right in front of the typed
    // word: `{% i` and `{{ i` on one line have the same prefix and different rows.
    ctx.lang === 'jinja' ? templateBlockOpening(ctx) : '',
    // The CSS snippet rows carry the indentation of the cursor line in their text, and they are
    // offered only where a rule can start.
    ctx.lang === 'css' ? `${String(ctx.beforeCursor || '').search(/[^ \t]|$/)}${cssRuleCanStartAt(ctx) ? 'r' : ''}` : '',
    settings.mode, settings.maxItems, settings.fuzzy, settings.globalSearch, enabledLangToken, opts.cacheSalt || '', recentStamp, incrementalSource ? 'incremental' : 'provider',
    completionFlagToken,
    // A value that changes when the Home Assistant data the rows are built from is replaced
    // (the scoring runtime numbers the data objects). A list cached for the old data is not
    // served for the new one.
    opts.snapshotToken || '',
  ].join('|');

  const cached = cacheGet(opts.cache, cacheKey);
  if (cached) {
    if (typeof opts.recordSuggestionQuality === 'function') {
      opts.recordSuggestionQuality(ctx, cached, { cacheHit: true, candidateInputCount: cached.length, incrementalFilter: incrementalSource });
    }
    return cached;
  }

  const prefix = cleanQuery(ctx.prefix || '');
  const explicit = ctx.triggerKind === 'explicit';
  const provided = Array.isArray(opts.candidates)
    ? opts.candidates
    : (incrementalSource ? opts.previousItems : (typeof opts.providerCandidates === 'function' ? opts.providerCandidates(ctx) : []));
  // Word-fallback rows are plain objects with a string label, an alias array and a meta object,
  // and up to 500 of them arrive on each provider pass. They are usually dropped a few lines
  // below (three other rows match), so they are normalized only if they stay.
  const isWordRow = item => !!item && typeof item === 'object' && item.source === WORD_FALLBACK_PROVIDER_ID
    && typeof item.label === 'string' && Array.isArray(item.aliases) && !!item.meta && typeof item.meta === 'object'
    && item.labelLower === undefined && item.haystack === undefined;
  let wordRowsPending = false;
  let candidates = provided.map(item => {
    if (isWordRow(item)) { wordRowsPending = true; return item; }
    return normalizeCompletionItem(item);
  }).filter(Boolean);
  // One match rank per candidate for this call: the word-fallback count and the scoring pass
  // both need it.
  const matchRanks = new Map();
  const matchRankOf = item => {
    let rank = matchRanks.get(item);
    if (!rank) { rank = completionMatchRank(item, prefix, settings); matchRanks.set(item, rank); }
    return rank;
  };

  if (isScalarConfigContext(ctx)) {
    candidates = candidates.filter(item => itemMatchesYamlValueKind(item, ctx));
  }
  if (shouldSuppressStaticForFocusedContext(ctx, candidates)) {
    candidates = candidates.filter(item => item?.source !== STATIC_PROVIDER_ID);
  }

  // Focused-lane owner resolution: only when the owner provider actually produced rows for
  // this exact ctx do its rows take the lane lead (otherwise ranking is unchanged).
  const focusedLaneOwner = isServiceDataFieldKeyContext(ctx)
    && candidates.some(item => item?.source === HA_VALUE_PROVIDER_ID)
    ? HA_VALUE_PROVIDER_ID
    : '';
  const rankCtx = focusedLaneOwner ? { ...ctx, focusedLaneOwner } : ctx;

  const hasDocumentWordCandidates = candidates.some(item => item?.source === WORD_FALLBACK_PROVIDER_ID);
  if (settings.wordFallback === false || ctx.valueKind) {
    if (hasDocumentWordCandidates) candidates = candidates.filter(item => item?.source !== WORD_FALLBACK_PROVIDER_ID);
  } else if (hasDocumentWordCandidates) {
    const realMatches = candidates.filter(item => item?.source !== WORD_FALLBACK_PROVIDER_ID && matchRankOf(item).matched).length;
    if (realMatches >= 3) candidates = candidates.filter(item => item?.source !== WORD_FALLBACK_PROVIDER_ID);
  }
  if (wordRowsPending && candidates.some(item => item?.source === WORD_FALLBACK_PROVIDER_ID)) {
    candidates = candidates.map(item => (isWordRow(item) ? normalizeCompletionItem(item) : item));
  }

  const ranked = candidates
    .filter(item => item && hasEnabledLanguage(settings, item.lang))
    .filter(item => allowTypeForMode(item, settings.mode))
    .filter(item => itemMatchesYamlValueKind(item, ctx))
    .map(item => {
      let score = 0;
      const match = matchRankOf(item);

      if (!prefix) {
        // An empty-prefix position right after a key's colon (afterKeyColon) is an intentful
        // value position — the context adapter already set shouldSuggest there via the
        // colon-space trigger. Suppressing it made the popup that ':' opened flicker shut the
        // moment the user typed the trailing space (and reopen on the first value char). Treat
        // afterKeyColon like a trigger so the value list stays up; ':' already showed it, so
        // this adds no new noise, only removes the flicker.
        if (!explicit && !ctx.isTriggerChar && !ctx.afterKeyColon) return null;
        score = item.type === 'snippet' ? 5 : 18;
      } else if (!match.matched) {
        return null;
      } else {
        score += Math.max(20, 180 - (match.tier * 35)) + Math.min(18, Number(match.fuzzyScore || 0) / 8);
      }

      if (item.lang === ctx.lang) score += 40;
      score += runtimeDomainPriority(item, ctx);
      score += focusKindTypeBoost(item, ctx);
      if (item?.meta?.friendly && prefix && String(item.meta.friendly).toLowerCase().includes(prefix.toLowerCase())) score += 45;
      if (item.type === 'key') score += 18;
      if (item.type === 'property') score += 16;
      if (item.type === 'snippet' && settings.mode !== 'snippets') score -= 25;

      score += contextualPenaltyOfNormalized(item, ctx);
      const recentBoost = recentAcceptedBoost(item, recentStore, frecencyOn ? { frecency: true } : undefined);
      return {
        ...item,
        score: score + recentBoost,
        matchTier: match.tier,
        matchReason: match.reason,
        providerRank: providerPriorityRank(item, rankCtx) + modeRankForMode(item, settings.mode),
        // A card's own key offered inside one of the card's blocks (marked by the catalog
        // provider) ranks one step behind the block's nested keys, unless it is typed in full.
        catalogRank: catalogPriorityRank(item) - (item.meta?.ownKeyInBlock === true && item.labelLower !== `${prefix.toLowerCase()}:` ? 1 : 0),
        recentBoost,
        // Required service fields lead within the field lane (required-first ordering, default-on).
        requiredRank: item?.meta?.required === true ? 1 : 0,
        // Optimal-alignment fuzzy quality — only computed when dpRanking is on (else 0, so the
        // sort term below is inert and ordering is byte-identical). Best score across label+aliases.
        dpFuzzy: dpRankingOn && prefix && match.matched
          ? uniqueSearchStrings(item).reduce((best, s) => Math.max(best, dpFuzzyScore(s, prefix)), 0)
          : 0,
      };
    })
    // null: a row that did not match, or an empty prefix that shows nothing.
    .filter(item => item && item.score > 0 && item.matchTier < MATCH_TIER.none)
    .sort((a, b) => (
      a.matchTier - b.matchTier ||
      a.providerRank - b.providerRank ||
      // Required service fields float above optional ones within the field lane.
      (b.requiredRank || 0) - (a.requiredRank || 0) ||
      // dpRanking: within a tier (and after provider relevance), the better optimal-alignment
      // fuzzy match leads, so `lk`→light.kitchen ranks first. Off → both dpFuzzy are 0 → inert.
      (dpRankingOn ? (b.dpFuzzy || 0) - (a.dpFuzzy || 0) : 0) ||
      b.catalogRank - a.catalogRank ||
      b.recentBoost - a.recentBoost ||
      b.score - a.score ||
      String(a.label || '').length - String(b.label || '').length ||
      String(a.label || '').localeCompare(String(b.label || ''))
    ));
  const items = withoutDuplicateRows(ranked, Number(settings.maxItems) || DEFAULT_SCORING_SETTINGS.maxItems);

  // Narrowing the previous rows left nothing. Rows that were filtered out at the shorter prefix
  // (word fallback, lower-ranked providers) may match now, so ask the providers again.
  if (incrementalSource && items.length === 0) {
    return scoreItems(ctx, { ...opts, previousItems: null });
  }

  if (typeof opts.recordSuggestionQuality === 'function') {
    opts.recordSuggestionQuality(ctx, items, { cacheHit: false, candidateInputCount: candidates.length, incrementalFilter: incrementalSource });
  }
  cachePut(opts.cache, cacheKey, items);
  return items;
}

export function camelMatch(label, query) {
  return filtering.camelMatch(label, query);
}

export function compute(triggerKind = 'typing', deps = {}) {
  const readText = typeof deps.readText === 'function' ? deps.readText : () => '';
  const readCursor = typeof deps.readCursor === 'function' ? deps.readCursor : () => 0;
  const detectContext = typeof deps.detectContext === 'function' ? deps.detectContext : () => ({ shouldSuggest: false, lang: 'yaml', triggerKind });
  const ctx = detectContext(readText(), readCursor(), triggerKind);
  const items = scoreItems(ctx, deps);
  if (typeof deps.onComputed === 'function') deps.onComputed(ctx, items);
  return { ctx, items };
}

export function refresh(triggerKind = 'typing', deps = {}) {
  if (typeof deps.isAllowed === 'function' && !deps.isAllowed()) {
    if (typeof deps.close === 'function') deps.close();
    return { ctx: null, items: [] };
  }
  const result = compute(triggerKind, deps);
  if (typeof deps.render === 'function') deps.render(result.ctx, result.items);
  return result;
}

export function requestLiveUpdate(triggerKind = 'typing', deps = {}) {
  const run = () => refresh(triggerKind, deps);
  if (typeof deps.schedule === 'function') return deps.schedule(run);
  return run();
}

// Scalar value-kind classification (scalarValueContext, isScalarValueKind) and the line
// scanning it relies on (currentLine, lineNumber) live in the yaml scanner and the HA runtime
// provider; this module consumes them through ctx.
