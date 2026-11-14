// Nostrodomus HACS catalog provider wiring.
// Consumes src/providers/hacsProviderCatalog.js through the existing provider registry.
// Keep this module pure: no DOM, browser storage, timers, network, popup, insertion, or HA host reads.

import { HACS_CATALOG_PROVIDER_ID } from '../core/runtimeConstants.js';
import {
  MAIN_PROVIDER_SURFACES,
  getProviderSurface,
  getProviderSurfaceByCardType,
  normalizeProviderCardType,
  normalizeProviderSurfaceId,
} from './hacsProviderCatalog.js';

export { HACS_CATALOG_PROVIDER_ID };

const YAML_CONTEXT_ROLES = new Set(['key', 'blank', 'list-key', 'value']);

function clean(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function unique(values = []) {
  return Array.from(new Set(values.map(value => clean(value)).filter(Boolean)));
}

function frozenRow(row) {
  return Object.freeze({
    ...row,
    aliases: Object.freeze([...(row.aliases || [])]),
    meta: Object.freeze({ ...(row.meta || {}) }),
  });
}

function keyInsert(key) {
  const raw = clean(key);
  if (!raw) return '';
  if (['cards', 'entities', 'series', 'columns', 'map_modes', 'tiles', 'icons', 'append_tiles', 'append_icons', 'sub_button', 'modules'].includes(raw)) return `${raw}:`;
  if (['card', 'filter', 'header', 'layout', 'map_source', 'calibration_source', 'bar', 'color', 'show', 'duration', 'kiosk_mode', 'mobile_settings', 'user_settings', 'entity_settings'].includes(raw)) return `${raw}:`;
  return `${raw}: `;
}

function valueHintType(value) {
  const normalized = lower(value);
  if (normalized === 'true' || normalized === 'false') return 'boolean';
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return 'number';
  if (normalized.startsWith('custom:')) return 'card';
  if (/^[a-z_]+\.[a-z0-9_]+$/i.test(normalized)) return 'service';
  return 'value';
}

function cardTypeRow(surface, cardType) {
  return frozenRow({
    id: `hacs.${surface.id}.card-type.${cardType.replace(/[^a-z0-9]+/gi, '-')}`,
    lang: 'yaml',
    type: 'card',
    label: cardType,
    insert: cardType,
    aliases: unique([surface.label, surface.id, ...(surface.aliases || []), ...(surface.resourcePatterns || [])]),
    source: HACS_CATALOG_PROVIDER_ID,
    meta: {
      surfaceId: surface.id,
      catalogPriority: surface.priority,
      priority: surface.priority,
      sourceDetail: surface.label,
      documentation: `${surface.label} card type from the bundled HACS provider catalog.`,
      contextKind: 'hacs-card-type',
      upstreamVersion: surface.upstreamVersion || '',
      verifiedAt: surface.verifiedAt || '',
    },
  });
}

function keyRow(surface, key) {
  return frozenRow({
    id: `hacs.${surface.id}.key.${key.replace(/[^a-z0-9_-]+/gi, '-')}`,
    lang: 'yaml',
    type: 'key',
    label: `${key}:`,
    insert: keyInsert(key),
    aliases: unique([key, surface.label, surface.id, ...(surface.aliases || [])]),
    source: HACS_CATALOG_PROVIDER_ID,
    meta: {
      surfaceId: surface.id,
      catalogPriority: surface.priority,
      priority: surface.priority,
      sourceDetail: surface.label,
      documentation: `${key} option for ${surface.label}.`,
      contextKind: 'hacs-catalog-key',
      upstreamVersion: surface.upstreamVersion || '',
      verifiedAt: surface.verifiedAt || '',
    },
  });
}

function valueRow(surface, value) {
  return frozenRow({
    id: `hacs.${surface.id}.value.${value.replace(/[^a-z0-9_-]+/gi, '-')}`,
    lang: 'yaml',
    type: valueHintType(value),
    label: value,
    insert: value,
    aliases: unique([surface.label, surface.id, ...(surface.aliases || [])]),
    source: HACS_CATALOG_PROVIDER_ID,
    meta: {
      surfaceId: surface.id,
      catalogPriority: surface.priority,
      priority: surface.priority,
      sourceDetail: surface.label,
      documentation: `${value} value hint for ${surface.label}.`,
      contextKind: 'hacs-catalog-value',
      upstreamVersion: surface.upstreamVersion || '',
      verifiedAt: surface.verifiedAt || '',
    },
  });
}

function freezeRowList(rows) {
  return Object.freeze(rows.map(frozenRow));
}

function objectFromEntries(entries) {
  const out = Object.create(null);
  for (const [key, value] of entries) out[key] = value;
  return Object.freeze(out);
}

function buildHacsCatalogIndex(catalog = MAIN_PROVIDER_SURFACES) {
  const surfaces = Object.freeze([...(catalog || [])]);
  const cardTypeRows = [];
  const surfaceEntries = [];
  const cardTypeEntries = [];
  const keyEntries = [];
  const valueEntries = [];

  for (const surface of surfaces) {
    const normalizedId = normalizeProviderSurfaceId(surface?.id);
    if (!normalizedId) continue;

    surfaceEntries.push([normalizedId, surface]);
    for (const alias of surface.aliases || []) surfaceEntries.push([normalizeProviderSurfaceId(alias), surface]);

    for (const cardType of surface.cardTypes || []) {
      const row = cardTypeRow(surface, cardType);
      cardTypeRows.push(row);
      cardTypeEntries.push([normalizeProviderCardType(cardType), surface]);
    }

    keyEntries.push([surface.id, freezeRowList(unique([...(surface.yamlKeys || []), ...(surface.nestedKeys || [])]).map(key => keyRow(surface, key)))]);
    valueEntries.push([surface.id, freezeRowList(unique([...(surface.valueHints || []), ...(surface.serviceHints || [])]).map(value => valueRow(surface, value)))]);
  }

  return Object.freeze({
    surfaces,
    cardTypeRows: freezeRowList(cardTypeRows),
    surfaceById: objectFromEntries(surfaceEntries.filter(([key]) => key)),
    surfaceByCardType: objectFromEntries(cardTypeEntries.filter(([key]) => key)),
    keyRowsBySurfaceId: objectFromEntries(keyEntries),
    valueRowsBySurfaceId: objectFromEntries(valueEntries),
  });
}

// The key rows of a surface for a position inside one of the card's blocks: the surface's
// nestedKeys first, then its other keys. The catalog does not say reliably which keys belong
// inside a block (include: of an auto-entities filter and unit: of a mini-graph entity are listed
// with the card's own keys), so no key is left out. The other keys are copies marked
// ownKeyInBlock: the scorer puts a marked row behind the nested keys that match the typed text
// equally well, unless the key is typed in full. Built on the first request for a surface and
// kept with its key rows.
const blockKeyRowsByKeyRows = new WeakMap();

function blockKeyRowsOf(surface, keyRows) {
  const known = blockKeyRowsByKeyRows.get(keyRows);
  if (known) return known;
  const nested = new Set(unique(surface.nestedKeys || []));
  const first = [];
  const rest = [];
  for (const row of keyRows) {
    if (nested.has(String(row.label).slice(0, -1))) first.push(row);
    else rest.push(frozenRow({ ...row, meta: { ...row.meta, ownKeyInBlock: true } }));
  }
  const rows = Object.freeze([...first, ...rest]);
  blockKeyRowsByKeyRows.set(keyRows, rows);
  return rows;
}

// The index of the built-in catalog is built on first use. Building it while the module loads
// cost every page load several milliseconds, with or without an editor on the page.
let defaultCatalogIndex = null;

function defaultCatalogIndexOnce() {
  if (!defaultCatalogIndex) defaultCatalogIndex = buildHacsCatalogIndex(MAIN_PROVIDER_SURFACES);
  return defaultCatalogIndex;
}

function indexFor(catalogOrIndex) {
  if (catalogOrIndex?.cardTypeRows && catalogOrIndex?.keyRowsBySurfaceId) return catalogOrIndex;
  if (Array.isArray(catalogOrIndex) && catalogOrIndex !== MAIN_PROVIDER_SURFACES) return buildHacsCatalogIndex(catalogOrIndex);
  return defaultCatalogIndexOnce();
}

/**
 * @param {Record<string, any>} [ctx]
 * @param {any} [catalogOrIndex]
 */
export function surfaceFromCatalogContext(ctx = {}, catalogOrIndex = undefined) {
  if (!ctx || typeof ctx !== 'object') return null;
  const index = indexFor(catalogOrIndex);
  if (ctx.catalogSurfaceId) return index.surfaceById[normalizeProviderSurfaceId(ctx.catalogSurfaceId)] || getProviderSurface(ctx.catalogSurfaceId);
  if (ctx.catalogCardType) return index.surfaceByCardType[normalizeProviderCardType(ctx.catalogCardType)] || getProviderSurfaceByCardType(ctx.catalogCardType);
  return null;
}

export function catalogCardTypeRows(catalogOrIndex = undefined) {
  return indexFor(catalogOrIndex).cardTypeRows.slice();
}

export function catalogKeyRowsForSurface(surface, catalogOrIndex = undefined) {
  if (!surface) return [];
  const index = indexFor(catalogOrIndex);
  return (index.keyRowsBySurfaceId[surface.id] || freezeRowList(unique([...(surface.yamlKeys || []), ...(surface.nestedKeys || [])]).map(key => keyRow(surface, key)))).slice();
}

// The keys of a surface for a position inside one of the card's blocks (series items, show:,
// tap_action:): every key of the surface, its nestedKeys ranked first (see blockKeyRowsOf).
export function catalogBlockKeyRowsForSurface(surface, catalogOrIndex = undefined) {
  if (!surface) return [];
  const index = indexFor(catalogOrIndex);
  const keyRows = index.keyRowsBySurfaceId[surface.id];
  return keyRows ? blockKeyRowsOf(surface, keyRows).slice() : catalogKeyRowsForSurface(surface, index);
}

export function catalogValueRowsForSurface(surface, catalogOrIndex = undefined) {
  if (!surface) return [];
  const index = indexFor(catalogOrIndex);
  return (index.valueRowsBySurfaceId[surface.id] || freezeRowList(unique([...(surface.valueHints || []), ...(surface.serviceHints || [])]).map(value => valueRow(surface, value)))).slice();
}

export function catalogRowsForContext(ctx = {}, catalogOrIndex = undefined) {
  if (!ctx || ctx.lang !== 'yaml' || !ctx.shouldSuggest) return [];
  const index = indexFor(catalogOrIndex);
  if (ctx.valueKind === 'card-type') return catalogCardTypeRows(index);

  const surface = surfaceFromCatalogContext(ctx, index);
  if (!surface) return [];
  if (!surface.lanes.includes('yaml')) return [];

  const role = lower(ctx.yamlRole);
  if (role === 'value') return catalogValueRowsForSurface(surface, index);
  // catalogCardNested comes from the context adapter: the cursor is inside one of the card's
  // blocks. Every key of the surface is offered at both depths; inside a block the nested keys
  // rank first.
  if (YAML_CONTEXT_ROLES.has(role)) {
    return ctx.catalogCardNested === true ? catalogBlockKeyRowsForSurface(surface, index) : catalogKeyRowsForSurface(surface, index);
  }
  return [];
}

export function hacsCatalogProvider(options = {}) {
  let builtIndex = null;
  const catalogIndex = () => {
    if (!builtIndex) builtIndex = options.catalog ? buildHacsCatalogIndex(options.catalog) : defaultCatalogIndexOnce();
    return builtIndex;
  };
  return {
    id: options.providerId || HACS_CATALOG_PROVIDER_ID,
    label: 'HACS catalog provider',
    capabilities: ['yaml', 'hacs-catalog', 'home-assistant'],
    priority: 82,
    timeoutMs: 8,
    canHandle(ctx) {
      if (!ctx?.shouldSuggest || ctx.lang !== 'yaml') return false;
      if (ctx.valueKind === 'card-type') {
        // The index is built on first use. Built here, it is ready before provide() runs: the
        // registry times provide() against the provider's budget, and the one-time build inside
        // it was reported as a provider that exceeded its budget.
        catalogIndex();
        return true;
      }
      if (!YAML_CONTEXT_ROLES.has(lower(ctx.yamlRole))) return false;
      return !!surfaceFromCatalogContext(ctx, catalogIndex());
    },
    provide(ctx) {
      return catalogRowsForContext(ctx, catalogIndex());
    },
  };
}
