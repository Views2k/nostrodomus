// Nostrodomus completion filtering helpers.
// Keep this file pure: no browser globals, DOM work, timers, storage, fetch,
// runtime state, or Home Assistant host access.

import { SECURITY_LIMITS } from '../core/runtimeConstants.js';

export const DEFAULT_SCORING_SETTINGS = Object.freeze({
  mode: 'both',
  maxItems: 40,
  fuzzy: true,
  globalSearch: false,
  triggerMode: 'auto',
  wordFallback: true,
  enabledLangs: Object.freeze({ yaml: true, css: true, js: true, jinja: true, html: true, json: true }),
});

/**
 * @param {Record<string, any>} [settings]
 * @returns {{ mode: string, maxItems: number, fuzzy: boolean, globalSearch: boolean, triggerMode: string, wordFallback: boolean, enabledLangs: Record<string, boolean> } & Record<string, any>}
 */
export function normalizeScoringSettings(settings = {}) {
  return {
    ...DEFAULT_SCORING_SETTINGS,
    ...settings,
    enabledLangs: {
      ...DEFAULT_SCORING_SETTINGS.enabledLangs,
      ...(settings?.enabledLangs || {}),
    },
  };
}

export function normalizeCompletionItem(item) {
  if (!item || typeof item !== 'object') return null;
  const label = String(item.label || '');
  const aliases = Array.isArray(item.aliases) ? item.aliases : [];
  const labelLower = String(item.labelLower || label).toLowerCase();
  const haystack = String(item.haystack || [label, item.insert, ...aliases].filter(Boolean).join(' ')).toLowerCase();
  return {
    ...item,
    label,
    aliases,
    labelLower,
    haystack,
    meta: item.meta && typeof item.meta === 'object' ? item.meta : {},
  };
}

export function hasEnabledLanguage(settings, lang) {
  const enabled = settings?.enabledLangs || {};
  return enabled[lang] === true;
}

export function cacheGet(cache, key) {
  return cache && typeof cache.get === 'function' ? cache.get(key) : null;
}

export function cachePut(cache, key, value, maxEntries = SECURITY_LIMITS.maxCacheEntries) {
  if (!cache || typeof cache.set !== 'function') return;
  // Bound the scoring cache so it can't leak on the keystroke path: a Map preserves insertion
  // order, so evicting keys().next().value drops the oldest entry (FIFO) before we grow past the
  // cap. Mirrors the bounded cacheSet in staticLibraryProvider so both writers behave the same.
  if (maxEntries > 0
      && typeof cache.size === 'number' && cache.size >= maxEntries
      && typeof cache.keys === 'function') {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
}

export function camelMatch(label, query) {
  if (!query || String(query).length < 2) return false;
  const caps = String(label).replace(/[^A-Z0-9]/g, '').toLowerCase();
  return caps.includes(String(query).toLowerCase());
}


function matchPrefixSpan(label = '', query = '', insensitive = false) {
  const text = String(label || '');
  const needle = String(query || '');
  if (!needle) return [];
  const hay = insensitive ? text.toLowerCase() : text;
  const q = insensitive ? needle.toLowerCase() : needle;
  return hay.startsWith(q) ? [{ start: 0, end: Math.min(text.length, needle.length) }] : [];
}

function boundaryMatchSpans(label = '', query = '') {
  const text = String(label || '');
  const needle = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!needle || needle.length < 2) return [];
  let cursor = 0;
  const hits = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!/[a-z0-9]/i.test(ch)) continue;
    const prev = i > 0 ? text[i - 1] : '';
    const next = i + 1 < text.length ? text[i + 1] : '';
    const atStart = i === 0;
    const afterSeparator = !/[a-z0-9]/i.test(prev);
    const camelBoundary = /[a-z]/.test(prev) && /[A-Z]/.test(ch);
    const acronymTail = /[A-Z]/.test(prev) && /[A-Z]/.test(ch) && /[a-z]/.test(next);
    if (!(atStart || afterSeparator || camelBoundary || acronymTail)) continue;
    if (ch.toLowerCase() === needle[cursor]) {
      hits.push({ start: i, end: i + 1 });
      cursor += 1;
      if (cursor >= needle.length) return hits;
    }
  }
  return [];
}

function orderedSubsequenceSpans(label = '', query = '') {
  const text = String(label || '');
  const needle = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!needle || needle.length < 2 || text.length > 120) return [];
  let cursor = 0;
  const hits = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!/[a-z0-9]/i.test(ch)) continue;
    if (ch.toLowerCase() === needle[cursor]) {
      hits.push({ start: i, end: i + 1 });
      cursor += 1;
      if (cursor >= needle.length) return hits;
    }
  }
  return [];
}

function substringSpan(label = '', query = '') {
  const text = String(label || '');
  const needle = String(query || '');
  if (!needle) return [];
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  return at >= 0 ? [{ start: at, end: at + needle.length }] : [];
}

function mergeAdjacentSpans(spans = []) {
  const sorted = spans
    .map(span => ({ start: Math.max(0, Number(span.start) || 0), end: Math.max(0, Number(span.end) || 0) }))
    .filter(span => span.end > span.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else out.push({ ...span });
  }
  return out;
}

export function matchSpans(label = '', query = '', tierOrReason = '') {
  const reason = typeof tierOrReason === 'string' ? tierOrReason : String(tierOrReason ?? '');
  const tier = typeof tierOrReason === 'number' ? tierOrReason : NaN;
  if (!query) return [];
  if (reason === 'exact-prefix' || tier === 0) return matchPrefixSpan(label, query, false);
  if (reason === 'case-insensitive-prefix' || tier === 1) return matchPrefixSpan(label, query, true);
  if (reason === 'word-boundary-subsequence' || tier === 2) return mergeAdjacentSpans(boundaryMatchSpans(label, query));
  if (reason === 'ordered-subsequence' || tier === 2.5) return mergeAdjacentSpans(orderedSubsequenceSpans(label, query));
  if (reason === 'substring' || tier === 3) return substringSpan(label, query);
  return [];
}
