// Nostrodomus word-fallback provider.
// Pure provider: no DOM, no editor reads, no timers, no storage, no network.
// It derives words only from ctx.documentText supplied by the completion runtime.

import { WORD_FALLBACK_PROVIDER_ID } from '../core/runtimeConstants.js';

const WORD_RX = /[A-Za-z][A-Za-z0-9_.:\-/]{2,}/g;

// The distinct words of the last document, in document order. The provider is asked on every
// refresh while the list is open, and the document only changes when the user types, so the
// words are found once per text instead of once per question. At most WORD_INDEX_LIMIT words
// are kept; a document with more is scanned on from `resumeAt` for the words past the limit.
const WORD_INDEX_LIMIT = 4000;
let indexedText = null;
let indexedWords = [];
let indexedResumeAt = -1; // -1: the whole text was indexed

function documentWordIndex(text) {
  if (text === indexedText) return;
  const words = [];
  const seen = new Set();
  let resumeAt = -1;
  WORD_RX.lastIndex = 0; // module-scoped /g regex: reset so a prior capped call's stranded lastIndex never zeroes this scan
  let match;
  while ((match = WORD_RX.exec(text))) {
    const word = String(match[0] || '');
    if (word.length > 120) continue;
    const lower = word.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    words.push({ word, lower });
    if (words.length >= WORD_INDEX_LIMIT) { resumeAt = WORD_RX.lastIndex; break; }
  }
  indexedText = text;
  indexedWords = words;
  indexedResumeAt = resumeAt;
}

function wordRow(word, lower) {
  return Object.freeze({
    id: `word-fallback.${lower.slice(0, 96)}`,
    lang: 'yaml',
    type: 'word',
    label: word,
    insert: word,
    source: WORD_FALLBACK_PROVIDER_ID,
    aliases: Object.freeze([]),
    meta: Object.freeze({ provider: 'word-fallback' }),
  });
}

export function tokenizeDocumentWords(documentText = '', prefix = '', options = {}) {
  const maxWords = Math.max(1, Math.min(500, Number(options.maxWords) || 500));
  const current = String(prefix || '').toLowerCase();
  const seen = new Set();
  const rows = [];
  const text = String(documentText || '');
  let match;
  // Only words that can match what is typed become rows: the scorer accepts a word when the
  // typed letters and digits occur in it in order. Without this every keystroke built a row
  // object for each of up to 500 words and discarded nearly all of them.
  const needle = current.replace(/[^a-z0-9]/g, '');
  const canMatch = (lower) => {
    if (!needle) return true;
    let at = 0;
    for (let i = 0; i < lower.length && at < needle.length; i += 1) {
      if (lower[i] === needle[at]) at += 1;
    }
    return at === needle.length;
  };
  documentWordIndex(text);
  for (let i = 0; i < indexedWords.length && rows.length < maxWords; i += 1) {
    const { word, lower } = indexedWords[i];
    if (lower === current || !canMatch(lower)) continue;
    rows.push(wordRow(word, lower));
  }
  if (indexedResumeAt < 0 || rows.length >= maxWords) return rows;
  // A document with more distinct words than the index keeps: scan the rest as before.
  for (const entry of indexedWords) seen.add(entry.lower);
  WORD_RX.lastIndex = indexedResumeAt;
  while ((match = WORD_RX.exec(text)) && rows.length < maxWords) {
    const word = String(match[0] || '');
    const lower = word.toLowerCase();
    if (lower === current || seen.has(lower)) continue;
    if (word.length > 120) continue;
    if (!canMatch(lower)) continue;
    seen.add(lower);
    rows.push(wordRow(word, lower));
  }
  return rows;
}

export function documentWordProvider(options = {}) {
  const maxWords = Math.max(1, Math.min(500, Number(options.maxWords) || 500));
  return {
    id: WORD_FALLBACK_PROVIDER_ID,
    label: 'Word fallback provider',
    canHandle(ctx) {
      if (!ctx?.shouldSuggest || !ctx?.documentText) return false;
      if (ctx.valueKind) return false;
      return ['yaml', 'css', 'js', 'jinja', 'html', 'json'].includes(String(ctx.lang || ''));
    },
    provide(ctx) {
      return tokenizeDocumentWords(ctx.documentText, ctx.prefix, { maxWords }).map(row => ({ ...row, lang: ctx.lang || row.lang }));
    },
  };
}
