// Lazy detail resolution for the highlighted completion item.
//
// Pure: takes a completion item and a runtimeData snapshot (the cached Home Assistant data) and
// returns { documentation, detail } for the highlighted row. The list calls this only for the
// selected row and only when the lazyResolve flag is on.
//
// No DOM, window, storage, timers, network, or Home Assistant reads: it reads only the snapshot
// it is given. Missing, partial or unexpected input gives null, and the caller keeps the generic
// documentation. Never throws.

const ENTITY_ID_RX = /^[a-z_]+\.[a-z0-9_]+/i;

function idFromItem(item) {
  const raw = String(item?.insert ?? item?.label ?? '').trim();
  const m = raw.match(ENTITY_ID_RX);
  return m ? m[0] : '';
}

function rawIdFromItem(item) {
  // Registry ids (area/device/floor/label) are not dotted and devices are hex — take the token verbatim.
  return String(item?.insert ?? item?.label ?? '').trim().replace(/[:\s].*$/, '');
}

function plainObject(value) {
  return value && typeof value === 'object' ? value : null;
}

export function resolveServiceDetail(item, snapshot) {
  const id = idFromItem(item);
  if (!id) return null;
  const catalog = plainObject(snapshot?.serviceFields);
  const fields = catalog ? catalog[id.toLowerCase()] : null;
  if (!Array.isArray(fields) || !fields.length) return null;
  const names = fields.map((f) => (f && f.required ? `${f.field}*` : f && f.field ? f.field : '')).filter(Boolean);
  const lines = [id];
  if (names.length) lines.push(`Fields: ${names.slice(0, 16).join(', ')}${names.length > 16 ? ', …' : ''}`);
  for (const f of fields.slice(0, 4)) {
    if (f && f.field && f.description) lines.push(`${f.field} — ${f.description}`);
  }
  return { documentation: lines.join('\n'), detail: names.length ? `${names.length} fields` : undefined };
}

export function resolveEntityDetail(item, snapshot) {
  const id = idFromItem(item);
  if (!id) return null;
  const names = plainObject(snapshot?.entityNames);
  const friendly = (names && names[id]) || item?.meta?.friendly || '';
  // Without a friendly name there is nothing to add: the generic documentation shows the id.
  if (!friendly) return null;
  const domain = id.split('.')[0] || '';
  const lines = [`${friendly} (${id})`];
  if (domain) lines.push(`Domain: ${domain}`);
  return { documentation: lines.join('\n'), detail: String(friendly) };
}

const REGISTRY_NAME_MAP = {
  area: 'areaNames',
  device: 'deviceNames',
  floor: 'floorNames',
  label: 'labelNames',
};

export function resolveRegistryDetail(item, snapshot) {
  const mapKey = REGISTRY_NAME_MAP[item?.type];
  if (!mapKey) return null;
  const id = rawIdFromItem(item);
  if (!id) return null;
  const names = plainObject(snapshot?.[mapKey]);
  const name = names ? names[id] : '';
  if (!name) return null;
  return { documentation: `${name} (${id})`, detail: String(name) };
}

/**
 * Enrich the highlighted completion item's documentation/detail from the live runtime snapshot.
 * Returns null when there is nothing richer to add (caller keeps the generic documentation).
 * @param {Record<string, any>|null|undefined} item
 * @param {Record<string, any>|null|undefined} snapshot the runtimeData() cache
 * @returns {{documentation?: string, detail?: string}|null}
 */
export function resolveItemDetail(item, snapshot) {
  if (!item || typeof item !== 'object' || !snapshot || typeof snapshot !== 'object') return null;
  try {
    if (item.type === 'service') return resolveServiceDetail(item, snapshot);
    if (item.type === 'entity') return resolveEntityDetail(item, snapshot);
    if (REGISTRY_NAME_MAP[item.type]) return resolveRegistryDetail(item, snapshot);
  } catch {
    return null;
  }
  return null;
}
