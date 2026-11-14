// Passive signature help.
//
// A display-only argument hint for the call the cursor is inside: the active service's field
// schema (from the live serviceFields catalog) or a Home Assistant Jinja function's signature
// (curated, because HA ships no client-side schema for these). It renders as a static line at the
// top of the suggestion popup; it intercepts no events, traps no focus, and owns no global element
// (no-touch list), so it can never steal Enter/Tab or the cursor.
//
// Pure: no DOM, window, storage, timers, network, or host reads — it reads only the context
// descriptor + the runtimeData snapshot handed in, and fails dark to null. Never throws.

import { isServiceDataFieldContext, serviceIdFromContext } from '../providers/haRuntimeProvider.js';

// The most common HA Jinja template functions/globals and their argument names. Curated (no
// introspection alternative). Used only to label the parameter the cursor sits on — names only.
const JINJA_SIGNATURES = Object.freeze({
  states: ['entity_id'],
  is_state: ['entity_id', 'state'],
  state_attr: ['entity_id', 'attribute'],
  is_state_attr: ['entity_id', 'attribute', 'value'],
  has_value: ['entity_id'],
  state_translated: ['entity_id'],
  expand: ['entity_or_group', '...'],
  area_id: ['lookup_value'],
  area_name: ['lookup_value'],
  area_entities: ['area_name_or_id'],
  area_devices: ['area_name_or_id'],
  device_id: ['entity_id_or_name'],
  device_attr: ['device_id', 'attr_name'],
  device_entities: ['device_id'],
  is_device_attr: ['device_id', 'attr_name', 'value'],
  label_id: ['lookup_value'],
  label_name: ['lookup_value'],
  label_entities: ['label_id_or_name'],
  label_devices: ['label_id_or_name'],
  label_areas: ['label_id_or_name'],
  relative_time: ['datetime'],
  as_timestamp: ['value', 'default'],
  as_datetime: ['value', 'default'],
  now: [],
  today_at: ['time_str'],
  integration_entities: ['integration'],
});

function serviceSignature(ctx, snapshot) {
  if (!isServiceDataFieldContext(ctx)) return null;
  const id = serviceIdFromContext(ctx);
  if (!id) return null;
  const catalog = snapshot && typeof snapshot === 'object' ? snapshot.serviceFields : null;
  // serviceFields is keyed lowercase (see serviceFieldCatalog); serviceIdFromContext already
  // lowercases, but match lazyResolve.js and lowercase here too so the lookup can never miss.
  const fields = catalog && typeof catalog === 'object' ? catalog[id.toLowerCase()] : null;
  if (!Array.isArray(fields) || !fields.length) return null;
  const activeKey = String(ctx.yamlKey || ctx.prefix || '').trim().toLowerCase();
  const params = fields.slice(0, 24).map((f) => ({
    name: f && f.field ? f.field : '',
    required: !!(f && f.required),
    active: !!activeKey && !!f && String(f.field).toLowerCase() === activeKey,
  })).filter((p) => p.name);
  if (!params.length) return null;
  const activeField = activeKey ? fields.find((f) => f && String(f.field).toLowerCase() === activeKey) : null;
  return { title: id, kind: 'service', params, doc: (activeField && activeField.description) || '' };
}

function jinjaSignature(ctx) {
  const ja = ctx && ctx.jinjaArg;
  if (!ja || !ja.fn) return null;
  const sig = JINJA_SIGNATURES[ja.fn];
  if (!sig) return null;
  const idx = Number(ja.argIndex) || 0;
  const params = sig.map((name, i) => ({ name, required: false, active: i === idx }));
  return { title: ja.fn, kind: 'jinja', params, doc: '' };
}

/**
 * The signature-hint model for the call the cursor is inside, or null when there is none.
 * @param {Record<string, any>|null|undefined} ctx the resolved completion context
 * @param {Record<string, any>|null|undefined} snapshot the runtimeData() cache
 * @returns {{title: string, kind: string, params: Array<{name: string, required: boolean, active: boolean}>, doc: string}|null}
 */
export function signatureHintModel(ctx, snapshot) {
  if (!ctx || typeof ctx !== 'object') return null;
  try {
    return jinjaSignature(ctx) || serviceSignature(ctx, snapshot || {});
  } catch {
    return null;
  }
}

/**
 * Plain-text rendering, e.g. light.turn_on(entity_id*, [brightness], color_name). Required params
 * carry a *, the active param is wrapped in [ ]. Used by the popup renderer and the tests.
 */
export function signatureHintText(model) {
  if (!model || !Array.isArray(model.params) || !model.params.length) return '';
  try {
    const parts = model.params.map((p) => {
      const name = p.required ? `${p.name}*` : p.name;
      return p.active ? `[${name}]` : name;
    });
    return `${model.title}(${parts.join(', ')})`;
  } catch {
    return '';
  }
}
