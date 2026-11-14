// Nostrodomus snippet provider module.
// Data-driven provider backed by data/snippets.json.

import { SNIPPET_PROVIDER_ID } from '../core/runtimeConstants.js';
import { completionMatchRank, isScalarConfigContext } from '../completion/scoring.js';
import {
  NOSTRODOMUS_SNIPPET_CATALOG,
  NOSTRODOMUS_SNIPPET_CONTEXT_KIND_SET,
} from '../snippets/catalog.js';
import { cssRuleCanStartAt } from '../yaml/yamlCompletionContext.js';

export { SNIPPET_PROVIDER_ID };

function lower(value) {
  return String(value || '').toLowerCase();
}

export function yamlPathHas(ctx, ...names) {
  const set = new Set(names.map(name => lower(name)));
  return (ctx?.yamlPath || []).some(part => set.has(lower(part)));
}

function pathText(ctx) {
  return lower(ctx?.pathText || (Array.isArray(ctx?.yamlPath) ? ctx.yamlPath.join('.') : ''));
}

// The CSS text of a card_mod or button-card style block (a block scalar under style:, styles:,
// card_mod: or extra_styles:).
function isStyleCssContext(ctx) {
  return ctx?.lang === 'css' && ctx?.scope === 'card-mod-css';
}

export function activeSnippetContextKinds(ctx = {}) {
  if (isStyleCssContext(ctx)) return NOSTRODOMUS_SNIPPET_CONTEXT_KIND_SET.includes('style-block') ? ['style-block'] : [];
  if (!ctx || ctx.lang !== 'yaml') return [];
  if (!(ctx.yamlRole === 'key' || ctx.yamlRole === 'blank' || ctx.yamlRole === 'list-key' || ctx.yamlRole === 'value')) return [];
  if (isScalarConfigContext(ctx)) return [];

  const key = lower(ctx.yamlKey);
  const focus = lower(ctx.focusKind);
  const valueKind = lower(ctx.valueKind);
  const path = pathText(ctx);
  const kinds = [];
  const add = kind => {
    if (NOSTRODOMUS_SNIPPET_CONTEXT_KIND_SET.includes(kind) && !kinds.includes(kind)) kinds.push(kind);
  };

  const inDashboardAction = focus === 'action-block'
    || valueKind === 'action'
    || /(^|\.)(tap_action|hold_action|double_tap_action)(\.|$)/.test(path)
    || ['tap_action', 'hold_action', 'double_tap_action'].includes(key);
  const inTrigger = focus === 'trigger-block' || yamlPathHas(ctx, 'triggers', 'trigger');
  const inCondition = focus === 'condition-block' || yamlPathHas(ctx, 'conditions', 'condition', 'visibility');
  const inActionSeq = focus === 'automation-action' || yamlPathHas(ctx, 'actions', 'sequence', 'then', 'else', 'choose', 'repeat', 'parallel');
  const inTarget = focus === 'target-block' || yamlPathHas(ctx, 'target');
  const inStyle = focus === 'style-block' || path.includes('card_mod') || path.includes('styles') || ctx.scope === 'card-mod-css';
  const rootish = !key && (ctx.yamlRole === 'blank' || ctx.yamlRole === 'key' || ctx.yamlRole === 'list-key');

  if (inDashboardAction) {
    if (valueKind === 'action' && key === 'action') add('lovelace-action-value');
    else add('lovelace-action-block');
  }
  if (inTrigger) add('trigger-block');
  if (inCondition) add('condition-block');
  if (inActionSeq) add('automation-action');
  if (inTarget) add('target-block');
  if (inStyle || ctx.lang === 'css') add('style-block');
  if (rootish) add('dashboard-root');

  return kinds;
}


export function legacySnippetRow(id, label, insert, aliases = [], meta = {}, deps = {}) {
  const normalizeItem = typeof deps.normalizeItem === 'function' ? deps.normalizeItem : null;
  const providerId = deps.providerId || SNIPPET_PROVIDER_ID;
  const item = normalizeItem
    ? normalizeItem([id, 'yaml', 'snippet', label, insert, aliases], providerId)
    : snippetRow({ id, label, insert, aliases });
  if (!item) return null;
  item.meta = {
    ...(item.meta || {}),
    family: meta.family || 'snippet',
    contextKind: meta.contextKind || 'snippet',
    sourceDetail: meta.sourceDetail || 'Nostrodomus snippet',
    documentation: meta.documentation || 'Context-aware Home Assistant YAML template.',
    quickSnippet: true,
    visualKind: 'snippet',
    priority: Number(meta.priority || 80),
    reason: meta.reason || 'context-snippet',
  };
  return item;
}

export function snippetRow(snippet) {
  if (!snippet || typeof snippet !== 'object') return null;
  return {
    id: snippet.id,
    lang: 'yaml',
    type: 'snippet',
    label: snippet.label,
    insert: snippet.insert,
    aliases: Array.isArray(snippet.aliases) ? [...snippet.aliases] : [],
    source: SNIPPET_PROVIDER_ID,
    meta: {
      family: snippet.family || 'snippet',
      contextKind: snippet.contextKind || 'snippet',
      sourceDetail: 'Nostrodomus snippet data',
      documentation: snippet.documentation || 'Context-aware Home Assistant YAML template.',
      quickSnippet: true,
      visualKind: 'snippet',
      priority: Number(snippet.priority || 80),
      reason: 'data-snippet',
      triggers: Array.isArray(snippet.triggers) ? [...snippet.triggers] : [],
    },
  };
}


function freezeSnippetProviderRow(row) {
  if (!row) return null;
  return Object.freeze({
    ...row,
    aliases: Object.freeze([...(row.aliases || [])]),
    meta: Object.freeze({
      ...(row.meta || {}),
      triggers: Object.freeze([...(row.meta?.triggers || [])]),
    }),
  });
}

function frozenObjectFromEntries(entries) {
  const out = Object.create(null);
  for (const [key, value] of entries) out[key] = Object.freeze([...(value || [])]);
  return Object.freeze(out);
}

export function buildSnippetProviderIndex(catalog = NOSTRODOMUS_SNIPPET_CATALOG) {
  const rowsByContextKind = new Map();
  for (const kind of NOSTRODOMUS_SNIPPET_CONTEXT_KIND_SET) rowsByContextKind.set(kind, []);

  for (const snippet of catalog || []) {
    const row = freezeSnippetProviderRow(snippetRow(snippet));
    if (!row) continue;
    const kind = row.meta.contextKind || 'snippet';
    if (!rowsByContextKind.has(kind)) rowsByContextKind.set(kind, []);
    rowsByContextKind.get(kind).push(row);
  }

  for (const rows of rowsByContextKind.values()) {
    rows.sort((a, b) => Number(b.meta?.priority || 80) - Number(a.meta?.priority || 80) || String(a.id).localeCompare(String(b.id)));
  }

  return Object.freeze({
    rowsByContextKind: frozenObjectFromEntries(rowsByContextKind.entries()),
  });
}

const DEFAULT_SNIPPET_PROVIDER_INDEX = buildSnippetProviderIndex(NOSTRODOMUS_SNIPPET_CATALOG);

function snippetIndexFor(catalogOrIndex = DEFAULT_SNIPPET_PROVIDER_INDEX) {
  if (catalogOrIndex?.rowsByContextKind) return catalogOrIndex;
  if (Array.isArray(catalogOrIndex)) {
    if (catalogOrIndex === NOSTRODOMUS_SNIPPET_CATALOG) return DEFAULT_SNIPPET_PROVIDER_INDEX;
    return buildSnippetProviderIndex(catalogOrIndex);
  }
  return DEFAULT_SNIPPET_PROVIDER_INDEX;
}

// The style snippets come in three shapes, and each is valid text in one kind of place only:
//   'css'   CSS rules (`ha-card { ... }`): the CSS text of a style block;
//   'card'  a whole `card_mod:` block: a key of the card, next to type:;
//   'yaml'  YAML for a style block (a button-card styles list, state styles): a key position
//           inside the style block.
// Before, all of them were offered at the YAML key positions of a style block and nowhere else,
// where the CSS rules and the nested `card_mod:` blocks are not valid YAML.
function styleSnippetShape(row) {
  const insert = String(row?.insert || '');
  if (/^card_mod\s*:/.test(insert)) return 'card';
  return /^(?:-\s|[A-Za-z0-9_-]+:(?:\s|$))/.test(insert) ? 'yaml' : 'css';
}

// The card_mod block snippets start with the text `card_mod:`, so everything typed towards the
// key name (`card_`, `card_mod`) matches them as well as it matches the plain `card_mod:` key
// row, and a snippet row ranks ahead of a library key row: in an entities row, Enter on a fully
// typed `card_mod` inserted a whole glass card block. So these snippets are offered only for
// typed text that the key itself does not match (`glass`, `mush`, `card-m`), and not for an
// empty prefix: wherever the plain key row is in the list, they are not.
const CARD_MOD_KEY_ROW = Object.freeze({ label: 'card_mod:', insert: 'card_mod:', aliases: Object.freeze(['cardmod', 'card_mod']) });

function typedTextFitsCardModKey(ctx) {
  // An empty prefix matches every row.
  return completionMatchRank(CARD_MOD_KEY_ROW, String(ctx?.prefix || '')).matched;
}

// The insertion step indents the later lines of a multi-line row at YAML positions only. In the
// CSS text of a block scalar a line at column 0 ends the block, so a CSS row is handed out with
// its later lines already at the indentation of the cursor line.
function cssRowAtCursorIndent(row, ctx) {
  const indent = /^[ \t]*/.exec(String(ctx?.beforeCursor || ''))[0];
  if (!indent || !String(row.insert || '').includes('\n')) return row;
  return { ...row, insert: row.insert.replace(/\n/g, `\n${indent}`) };
}

export function snippetRowsForContext(ctx, catalog = DEFAULT_SNIPPET_PROVIDER_INDEX) {
  const activeKinds = activeSnippetContextKinds(ctx);
  if (!activeKinds.length) return [];
  const index = snippetIndexFor(catalog);
  const rows = [];
  const seen = new Set();
  const cssText = isStyleCssContext(ctx);
  const cssPrefix = cssText ? String(ctx?.prefix || '').toLowerCase() : '';
  const cssRuleFits = cssText && cssRuleCanStartAt(ctx);
  for (const kind of activeKinds) {
    for (const row of index.rowsByContextKind[kind] || []) {
      if (seen.has(row.id)) continue;
      if (kind === 'style-block' && styleSnippetShape(row) !== (cssText ? 'css' : 'yaml')) continue;
      // A CSS rule snippet is offered where a rule can start, and for typed text that its rule
      // starts with (`ha` for `ha-card { ... }`). Matched by the words of its label ("card_mod",
      // "card-mod") it ranked above the CSS variables for `card` inside a rule.
      if (cssText && !(cssRuleFits && String(row.insert || '').slice(0, cssPrefix.length).toLowerCase() === cssPrefix)) continue;
      seen.add(row.id);
      rows.push(cssText ? cssRowAtCursorIndent(row, ctx) : row);
    }
  }
  // A whole card_mod: block goes where the card snippets go, outside any style block, and only
  // when the typed text does not name the card_mod key itself.
  if (activeKinds.includes('dashboard-root') && !activeKinds.includes('style-block') && !typedTextFitsCardModKey(ctx)) {
    for (const row of index.rowsByContextKind['style-block'] || []) {
      if (seen.has(row.id) || styleSnippetShape(row) !== 'card') continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}


export function snippetProvider(options = {}) {
  const index = snippetIndexFor(options.catalog || DEFAULT_SNIPPET_PROVIDER_INDEX);
  return {
    id: SNIPPET_PROVIDER_ID,
    label: 'Nostrodomus snippet provider',
    capabilities: ['yaml', 'snippets', 'home-assistant'],
    priority: 80,
    canHandle(ctx) {
      return (ctx?.lang === 'yaml' || isStyleCssContext(ctx)) && !!ctx?.shouldSuggest;
    },
    provide(ctx) {
      return snippetRowsForContext(ctx, index);
    },
  };
}
