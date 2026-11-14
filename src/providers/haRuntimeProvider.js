// HA runtime provider module.
// This module must not own active runtime Home Assistant discovery, runtime cache
// mutation, row generation, provider ordering, Settings UI, preview lifecycle,
// popup behavior, or visual styling. Discovery/provider helpers are exported and require
// explicit dependency injection.

import { HA_VALUE_PROVIDER_ID, NATIVE_CARD_TYPES, SECURITY_LIMITS } from '../core/runtimeConstants.js';
import { normalizeItem as normalizeLibraryItem } from './staticLibraryProvider.js';
import { surfaceAllows } from './surfaceScope.js';
import * as classifier from '../yaml/yamlContextClassifier.js';

// Value kinds that are surface-specific. card-type/action are dashboard/card vocabulary;
// trigger-type/script-action are automation/script vocabulary. condition-type is shared
// (dashboard visibility uses it), and entities/services/icons/themes/booleans/registries/modes are
// cross-surface, so none of those are scoped. Pure (ctx-only); gate off → always allows.
function surfaceAllowsValueKind(ctx, kind) {
  if (kind === "card-type" || kind === "action") return surfaceAllows(ctx, "lovelace");
  if (kind === "trigger-type" || kind === "script-action") return surfaceAllows(ctx, "automation");
  return true;
}
import {
  HA_PANEL_LOVELACE,
  HOME_ASSISTANT,
  HOME_ASSISTANT_MAIN,
  HUI_ROOT,
  PARTIAL_PANEL_RESOLVER,
} from '../editor/haSelectors.js';

function safeString(value, maxLen = 512) {
  const s = String(value ?? "");
  if (s.length <= maxLen) return s;
  // A cap landing between a surrogate pair would emit a lone surrogate (ill-formed
  // text → renders as U+FFFD); step back one unit so truncation ends on a whole code point.
  const lastCode = s.charCodeAt(maxLen - 1);
  return s.slice(0, lastCode >= 0xd800 && lastCode <= 0xdbff ? maxLen - 1 : maxLen);
}

function guardedRead(read, fallback) {
  try {
    return read();
  } catch {
    // Annotated fail-dark catch (RUNTIME_DATA.md W4): hostile host objects —
    // throwing getters, proxies, partial hass, malformed registry entries —
    // must degrade to fewer suggestions, never an exception, never console
    // noise, never a typing stall.
    return fallback;
  }
}

// Native Lovelace card types shipped with Home Assistant. Custom cards are no
// longer hardcoded here: every installed custom card self-registers in the
// in-page customCards registry, which customCardCatalog() reads live.
const NATIVE_CARDS = Object.freeze([...NATIVE_CARD_TYPES]);

const CUSTOM_CARD_TYPE_RX = /^[a-z0-9_-]+$/i;
const SERVICE_ID_RX = /^[a-z0-9_]+\.[a-z0-9_]+$/i;
const SERVICE_FIELD_NAME_RX = /^[a-z0-9_]+$/i;
// Registry ids: area/floor/label ids are readable slugs; device ids are opaque hex. All are
// alphanumerics plus underscore/hyphen; anything with a dot/space/quote is hostile and rejected.
const REGISTRY_ID_RX = /^[a-z0-9_-]+$/i;

// The four HA registry kinds mapped to their cache id-list / name-map keys. Each registry is an
// object keyed by id whose value carries a human name; rows insert the id and show the name.
const REGISTRY_KINDS = Object.freeze({
  area: { idsKey: "areas", namesKey: "areaNames" },
  device: { idsKey: "devices", namesKey: "deviceNames" },
  floor: { idsKey: "floors", namesKey: "floorNames" },
  label: { idsKey: "labels", namesKey: "labelNames" },
});

export function customCardCatalog(options = {}) {
    const windowRef = options?.windowRef || globalThis;
    const limits = options?.limits || SECURITY_LIMITS;
    const registry = guardedRead(() => windowRef?.customCards, null);
    if (!Array.isArray(registry)) return { cards: [], cardMeta: {} };

    const byKey = new Map();
    // Guard the ITERATION, not just each entry's build: a hostile customCards (a real array with a
    // throwing index getter or a throwing Symbol.iterator) would otherwise throw straight out of here
    // and abort the whole runtime-data build. Index access + guardedRead degrades a bad entry to a
    // skip (and a bad iterator to an empty list), never an exception — fail-dark law.
    const registryLength = guardedRead(() => registry.length, 0);
    for (let i = 0; i < registryLength; i += 1) {
      const entry = guardedRead(() => registry[i], null);
      if (entry == null) continue;
      const candidate = guardedRead(() => {
        if (!entry || typeof entry !== "object" || typeof entry.type !== "string") return null;
        const raw = entry.type.trim();
        const bare = raw.toLowerCase().startsWith("custom:") ? raw.slice(7) : raw;
        if (!bare || !CUSTOM_CARD_TYPE_RX.test(bare)) return null;
        return {
          type: `custom:${bare}`,
          name: safeString(entry.name || "", 80),
          description: safeString(entry.description || "", 200),
        };
      }, null);
      if (!candidate) continue;
      const key = candidate.type.toLowerCase();
      if (byKey.has(key)) continue;
      byKey.set(key, candidate);
    }

    const kept = Array.from(byKey.values())
      .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
      .slice(0, limits.maxRuntimeCustomCards);

    const cardMeta = {};
    for (const card of kept) {
      if (card.name || card.description) cardMeta[card.type] = { name: card.name, description: card.description };
    }
    return { cards: kept.map(card => card.type), cardMeta };
  }

export function findHass(options = {}) {
    const windowRef = options?.windowRef || globalThis;
    const documentRef = options?.documentRef || windowRef?.document || globalThis?.document;
    if (windowRef?.hass?.states || windowRef?.hass?.services) return windowRef.hass;

    const ha = documentRef?.querySelector?.(HOME_ASSISTANT);
    if (ha?.hass?.states || ha?.hass?.services) return ha.hass;

    const root = ha?.shadowRoot;
    const candidates = [
      root?.querySelector?.(HOME_ASSISTANT_MAIN),
      root?.querySelector?.(PARTIAL_PANEL_RESOLVER),
      root?.querySelector?.(HA_PANEL_LOVELACE),
      root?.querySelector?.(HUI_ROOT),
    ].filter(Boolean);

    for (const el of candidates) {
      if (el?.hass?.states || el?.hass?.services) return el.hass;
    }

    return null;
  }

// Capture an enumerated selector's option values (a `select` option list, or a `boolean`) so a
// service-field value position can complete them. Additive: it never reshapes the existing
// field-row keys (field/description/selectorKind/required/advanced), which signatureHelp and
// lazyResolve are co-tenants of. Bounded (maxServiceFieldOptions) and defensive (non-array/hostile
// shapes degrade to []).
function serviceFieldOptions(selector, limits) {
    if (!selector || typeof selector !== "object") return [];
    const cap = limits?.maxServiceFieldOptions || 60;
    const sel = selector.select;
    if (sel && typeof sel === "object" && Array.isArray(sel.options)) {
      const out = [];
      for (const opt of sel.options) {
        if (out.length >= cap) break;
        if (typeof opt === "string" || typeof opt === "number" || typeof opt === "boolean") {
          // Bare numeric/boolean options ([1,2,3] / [true,false]) are valid HA select options; the
          // string-only branch silently dropped them, emptying such a field or corrupting a mixed list.
          const v = safeString(opt, 80);
          if (v) out.push({ value: v, label: "" });
        } else if (opt && typeof opt === "object") {
          const v = safeString(opt.value ?? "", 80);
          if (v) out.push({ value: v, label: safeString(opt.label ?? "", 80) });
        }
      }
      return out;
    }
    if (Object.prototype.hasOwnProperty.call(selector, "boolean")) {
      return [{ value: "true", label: "" }, { value: "false", label: "" }];
    }
    return [];
  }

// HA groups optional service fields into collapsible SECTIONS: a `{ collapsed, fields: {...} }`
// entry whose key (e.g. `advanced_fields`) is NOT a valid service-data key — only the leaves
// inside it are. HA's own ha-service-control flattens these. Emit the leaf fields and skip the
// section key; recurse a bounded depth. Fail-dark: a hostile/partial entry degrades to nothing.
const FIELD_READ_FAILED = Symbol("field-read-failed");
function flattenServiceFields(fields, depth = 0) {
  const out = [];
  if (!fields || typeof fields !== "object" || depth > 3) return out;
  for (const key of guardedRead(() => Object.keys(fields), [])) {
    const info = guardedRead(() => fields[key], FIELD_READ_FAILED);
    if (info === FIELD_READ_FAILED) continue; // a throwing field getter is skipped (fail-dark)
    const nested = guardedRead(() => (info && typeof info === "object" && info.fields && typeof info.fields === "object" ? info.fields : null), null);
    if (nested) { out.push(...flattenServiceFields(nested, depth + 1)); continue; }
    out.push([key, info]);
  }
  return out;
}

export function serviceFieldCatalog(options = {}) {
    const services = options?.services;
    const limits = options?.limits || SECURITY_LIMITS;
    const out = {};
    if (!services || typeof services !== "object") return out;

    // Object.keys never invokes getters; each value read is guarded so one
    // hostile entry degrades that entry only, not its healthy siblings.
    let serviceCount = 0;
    for (const domain of guardedRead(() => Object.keys(services), [])) {
      if (!SERVICE_FIELD_NAME_RX.test(domain)) continue;
      const svcMap = guardedRead(() => services[domain], null);
      if (!svcMap || typeof svcMap !== "object") continue;
      for (const service of guardedRead(() => Object.keys(svcMap), [])) {
        if (serviceCount >= limits.maxServicesWithFields) return out;
        if (!SERVICE_FIELD_NAME_RX.test(service)) continue;
        const rows = serviceFieldRows(guardedRead(() => svcMap[service], null), limits);
        if (!rows.length) continue;
        out[`${domain}.${service}`.toLowerCase()] = rows;
        serviceCount += 1;
      }
    }
    return out;
  }

// The field rows of one service definition; [] when it has no usable fields.
function serviceFieldRows(def, limits) {
    const fields = guardedRead(() => (def?.fields && typeof def.fields === "object" ? def.fields : null), null);
    if (!fields) return [];
    const rows = [];
    for (const [field, info] of flattenServiceFields(fields)) {
      if (rows.length >= limits.maxServiceFieldsPerService) break;
      if (!SERVICE_FIELD_NAME_RX.test(field)) continue;
      const row = guardedRead(() => {
        const selector = info?.selector;
        const selectorKind = selector && typeof selector === "object"
          ? safeString(Object.keys(selector)[0] || "", 40)
          : "";
        return {
          field,
          description: safeString(info?.description || "", 160),
          selectorKind,
          required: info?.required === true,
          advanced: info?.advanced === true,
          // Additive: a hostile options getter degrades this field's options to [] only.
          options: guardedRead(() => serviceFieldOptions(selector, limits), []),
        };
      }, null);
      if (row) rows.push(row);
    }
    return rows;
  }

// The services object each data snapshot was built from. serviceFieldCatalog stops after
// limits.maxServicesWithFields services, in the order Home Assistant registered them, to bound
// the work of a snapshot build. On an instance with more services the later ones had no field
// rows at all. A service that is not in the snapshot's catalog is read here when it is asked
// for, one service at a time, and kept in the snapshot's serviceFields so the other readers of
// the same snapshot find it too. A new snapshot starts from its own catalog again.
const servicesBySnapshot = new WeakMap();

function serviceFieldsFor(data, serviceId, limits) {
    const known = data?.serviceFields?.[serviceId];
    if (known) return known;
    const services = data && typeof data === "object" ? servicesBySnapshot.get(data) : null;
    const dot = serviceId.indexOf(".");
    if (!services || dot <= 0) return [];
    const domain = serviceId.slice(0, dot);
    const service = serviceId.slice(dot + 1);
    if (!SERVICE_FIELD_NAME_RX.test(domain) || !SERVICE_FIELD_NAME_RX.test(service)) return [];
    const def = guardedRead(() => {
      const svcMap = Object.prototype.hasOwnProperty.call(services, domain) ? services[domain] : null;
      return svcMap && typeof svcMap === "object" && Object.prototype.hasOwnProperty.call(svcMap, service) ? svcMap[service] : null;
    }, null);
    const rows = serviceFieldRows(def, limits);
    if (rows.length && data.serviceFields && typeof data.serviceFields === "object") data.serviceFields[serviceId] = rows;
    return rows;
  }

// Source one HA registry collection (hass.areas/devices/floors/labels). Each is an object
// keyed by id, the value carries a human name. Pure/fail-dark per RUNTIME_DATA.md W4: a
// hostile/partial/throwing registry degrades to {ids:[], names:{}} (fewer suggestions, never an
// exception). Ids are validated, sorted, capped; one bad entry degrades that entry only.
export function registryCatalog(registry, options = {}) {
    const max = Number.isFinite(options?.max) ? options.max : 1000;
    const namePick = typeof options?.namePick === "function" ? options.namePick : (entry => entry?.name);
    const out = { ids: [], names: {} };
    if (!registry || typeof registry !== "object") return out;
    const ids = guardedRead(() => Object.keys(registry), [])
      .filter(id => REGISTRY_ID_RX.test(id))
      .sort()
      .slice(0, max);
    for (const id of ids) {
      out.ids.push(id);
      const name = guardedRead(() => safeString(namePick(registry[id]) || "", 140), "");
      if (name) out.names[id] = name;
    }
    return out;
  }

// Reads the already-parsed branch state the context adapters expose (dashboard
// action blocks carry sibling service/perform_action values; automation steps
// carry the step's own action/service scalar) — no YAML parsing happens here.
export function serviceIdFromContext(ctx) {
    const bs = ctx?.branchState;
    if (!bs || typeof bs !== "object") return "";
    const candidates = [
      bs.siblings?.perform_action?.value,
      bs.siblings?.service?.value,
      bs.siblings?.action?.value,
      bs.action,
      bs.parentKey === "action" || bs.parentKey === "service" ? bs.parentValue : "",
    ];
    for (const candidate of candidates) {
      const token = String(candidate || "").replace(/^['"]|['"]$/g, "").trim();
      if (token && SERVICE_ID_RX.test(token)) return token.toLowerCase();
    }
    return "";
  }

export function isServiceDataFieldContext(ctx) {
    if (!ctx || ctx.lang !== "yaml") return false;
    if (ctx.yamlRole !== "key" && ctx.yamlRole !== "blank") return false;
    const parts = classifier.yamlPathParts(ctx);
    const last = parts[parts.length - 1] || "";
    return last === "data" || last === "service_data";
  }

// The value position of a service-data field (e.g. `effect: |` under data:), as opposed to
// isServiceDataFieldContext which is the key position. The field is ctx.yamlKey and its container
// (the path element above it) must be data/service_data, so a mapping nested deeper under a field
// never mis-fires. Pure; reads only ctx.
export function isServiceDataFieldValueContext(ctx) {
    if (!ctx || ctx.lang !== "yaml") return false;
    if (ctx.yamlRole !== "value") return false;
    const field = String(ctx.yamlKey || "").trim();
    if (!field) return false;
    const parts = classifier.yamlPathParts(ctx);
    if (!Array.isArray(parts) || !parts.length) return false;
    const last = parts[parts.length - 1];
    const container = last === field ? (parts[parts.length - 2] || "") : last;
    return container === "data" || container === "service_data";
  }

export function runtimeData(options = {}) {
    const runtimeState = options?.state;
    const limits = options?.limits || SECURITY_LIMITS;
    const nowFn = typeof options?.now === "function" ? options.now : Date.now;
    const now = nowFn();
    if (runtimeState?.runtimeCache && now - runtimeState.runtimeCache.at < limits.runtimeCacheMs) {
      return runtimeState.runtimeCache;
    }

    const hass = guardedRead(() => (typeof options?.findHass === "function" ? options.findHass() : findHass(options)), null);
    const states = guardedRead(() => (hass?.states && typeof hass.states === "object" ? hass.states : {}), {});
    const services = guardedRead(() => (hass?.services && typeof hass.services === "object" ? hass.services : {}), {});

    // Home Assistant replaces these objects when their content changes. While they are the same
    // objects the snapshot is still right, so an expired one is kept instead of being rebuilt
    // inside a keystroke (sorting every entity id, the service field catalog, the registries).
    // Custom cards register in a plain array, so a kept snapshot is rebuilt after 30 seconds anyway.
    const sources = [
      states, services,
      guardedRead(() => hass?.areas, null), guardedRead(() => hass?.devices, null),
      guardedRead(() => hass?.floors, null), guardedRead(() => hass?.labels, null),
      guardedRead(() => hass?.themes?.themes, null),
    ];
    const kept = runtimeState?.runtimeCacheSources;
    if (hass && runtimeState?.runtimeCache && kept && now - kept.builtAt < 30000
      && kept.sources.length === sources.length && kept.sources.every((value, index) => value === sources[index])) {
      runtimeState.runtimeCache.at = now;
      return runtimeState.runtimeCache;
    }

    const entities = guardedRead(() => Object.keys(states), [])
      .filter(id => /^[a-z_]+\.[a-z0-9_]+$/i.test(id))
      .sort()
      .slice(0, limits.maxRuntimeEntitiesIndexed || limits.maxRuntimeEntities);

    const entityNames = {};
    for (const id of entities) {
      const friendly = guardedRead(() => safeString(states[id]?.attributes?.friendly_name || "", 140), "");
      if (friendly) entityNames[id] = friendly;
    }

    const serviceIds = [];
    for (const domain of guardedRead(() => Object.keys(services), [])) {
      if (!/^[a-z0-9_]+$/i.test(domain)) continue;
      const svcMap = guardedRead(() => services[domain], null);
      if (!svcMap || typeof svcMap !== "object") continue;
      for (const service of guardedRead(() => Object.keys(svcMap), [])) {
        if (/^[a-z0-9_]+$/i.test(service)) serviceIds.push(`${domain}.${service}`);
      }
    }

    const servicesOut = serviceIds.sort().slice(0, limits.maxRuntimeServicesIndexed || limits.maxRuntimeServices);
    const serviceFields = serviceFieldCatalog({ services, limits });
    const themes = guardedRead(() => Object.keys(hass?.themes?.themes || {}), []).sort().slice(0, 80);

    // Registries: areas/devices/floors/labels off the same hass snapshot (no extra walk, no
    // second cache). Devices prefer the user-set name over the integration name; all degrade dark.
    const areaCat = registryCatalog(guardedRead(() => hass?.areas, null), { max: limits.maxRuntimeAreas });
    const deviceCat = registryCatalog(guardedRead(() => hass?.devices, null), { max: limits.maxRuntimeDevices, namePick: d => d?.name_by_user || d?.name });
    const floorCat = registryCatalog(guardedRead(() => hass?.floors, null), { max: limits.maxRuntimeFloors });
    const labelCat = registryCatalog(guardedRead(() => hass?.labels, null), { max: limits.maxRuntimeLabels });

    const liveCards = customCardCatalog(options);
    const cards = Array.from(new Set([...NATIVE_CARDS, ...liveCards.cards])).sort();
    const cardMeta = liveCards.cardMeta;

    const icons = [
      "mdi:home", "mdi:lightbulb", "mdi:thermometer", "mdi:water-percent", "mdi:fan",
      "mdi:power", "mdi:power-plug", "mdi:wifi", "mdi:router-wireless", "mdi:server",
      "mdi:car", "mdi:garage", "mdi:door", "mdi:lock", "mdi:shield-home",
      "mdi:motion-sensor", "mdi:cctv", "mdi:weather-partly-cloudy", "mdi:battery", "mdi:solar-power",
      "mdi:bell", "mdi:calendar", "mdi:camera", "mdi:chart-line", "mdi:chevron-right",
      "mdi:clock-outline", "mdi:cog", "mdi:fire", "mdi:flash", "mdi:home-assistant",
      "mdi:information-outline", "mdi:light-switch", "mdi:play", "mdi:robot", "mdi:script-text",
      "mdi:thermostat", "mdi:toggle-switch", "mdi:transmission-tower", "mdi:weather-night"
    ];

    const actions = [
      "more-info", "toggle", "perform-action", "call-service", "navigate", "url", "assist", "fire-dom-event", "none"
    ];

    const triggerTypes = [
      "state", "numeric_state", "time", "time_pattern", "sun", "event", "calendar", "zone",
      "homeassistant", "mqtt", "template", "webhook", "device", "conversation", "persistent_notification"
    ];

    const conditionTypes = [
      "state", "numeric_state", "time", "sun", "zone", "template", "trigger", "device", "or", "and", "not",
      "screen", "user"
    ];

    const automationModes = ["single", "restart", "queued", "parallel"];
    const booleans = ["true", "false"];
    const scriptActions = [
      "delay", "wait_template", "wait_for_trigger", "event", "repeat", "choose", "if", "parallel",
      "variables", "condition", "stop", "set_conversation_response"
    ];

    const cache = {
      at: now, hasHass: !!hass, entities, entityNames, services: servicesOut, serviceFields, themes,
      cards, cardMeta, icons, actions, triggerTypes, conditionTypes, automationModes, booleans, scriptActions,
      // Registries (each itemized in tests/providers/ha_runtime_data.test.mjs RUNTIME_CACHE_PARITY_KEYS):
      areas: areaCat.ids, areaNames: areaCat.names,
      devices: deviceCat.ids, deviceNames: deviceCat.names,
      floors: floorCat.ids, floorNames: floorCat.names,
      labels: labelCat.ids, labelNames: labelCat.names,
    };
    servicesBySnapshot.set(cache, services);
    if (runtimeState) {
      runtimeState.runtimeCache = cache;
      runtimeState.runtimeCacheSources = { sources, builtAt: now };
    }
    return cache;
  }

export function yamlPathParts(ctx) {
    return classifier.yamlPathParts(ctx);
  }

export function yamlPathIncludes(ctx, names) {
    return classifier.yamlPathIncludes(ctx, names);
  }

export function isDashboardActionContext(ctx) {
    return classifier.isDashboardActionContext(ctx);
  }

export function isAutomationScriptContext(ctx) {
    return classifier.isAutomationScriptContext(ctx);
  }

export function yamlScalarValueKind(ctx) {
    return classifier.yamlScalarValueKind(ctx);
  }

export function isScalarValueKind(kind) {
    return classifier.isScalarValueKind(kind);
  }

export function isScalarConfigContext(ctx) {
    return classifier.isScalarConfigContext(ctx);
  }

export function yamlValueKind(ctx) {
    return classifier.yamlValueKind(ctx);
  }

export function yamlFocusKind(ctx) {
    return classifier.yamlFocusKind(ctx);
  }

export function yamlBlockValueKeyKind(ctx) {
    return classifier.yamlBlockValueKeyKind(ctx);
  }

// Cheap ordered-subsequence test (used to pre-filter the indexed entity list by the typed query).
function isSubsequenceMatch(haystack, needle) {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

// The ids that matched the last query, in the order of the ids list they came from. Each of the
// tests in filterEntityIdsByQuery (the id contains the query, the friendly name contains it, the
// id has its characters in order) can only fail for more ids when the query gets longer: an id
// that does not match "ki" cannot match "kit". So while the user extends the query, the next
// pass reads the matches of the previous one instead of every indexed id (up to 10,000 for each
// typed character) and sorts each of them into its group again with the new query. The
// candidates and their order are those of a full pass. A different list, names object or list
// length, or a query that does not start with the last one, runs the full pass. The ids list and
// the names object belong to one data snapshot and are not changed after it is built.
const lastIdQuery = { ids: null, names: null, size: 0, query: "", matched: null };

// Prefix-aware entity sourcing. Keep the ids the typed query could match, ranked so a
// substring/startsWith hit precedes a looser subsequence hit (the same intent the scorer applies),
// so the per-query row cap never strands a relevant entity on a large install. Empty query →
// unfiltered. Pure, fail-dark (non-array/non-string coerce safely; never throws).
export function filterEntityIdsByQuery(ids, query, names = null) {
  const list = Array.isArray(ids) ? ids : [];
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!q) return list;
  const nameSource = names && typeof names === "object" ? names : null;
  const lowerNames = nameSource ? lowerEntityNames(nameSource) : null;
  // A query that extends the last one, for the same list and names, is answered from the ids
  // that matched the last one (see lastIdQuery).
  const narrowing = lastIdQuery.matched !== null && lastIdQuery.ids === list && lastIdQuery.names === nameSource
    && lastIdQuery.size === list.length && q.startsWith(lastIdQuery.query);
  const source = narrowing ? lastIdQuery.matched : list;
  // Ids that start with the query come first. The caller cuts the result at the per-query row
  // cap, and with all ids that merely contain the query in one group the cut dropped the ids that
  // start with it: on an instance with more than 750 binary_sensor entities, `sensor.` never
  // reached a sensor entity, because every binary_sensor id contains "sensor." as well.
  const prefix = [];
  const strong = [];
  const named = [];
  const weak = [];
  const matched = [];
  for (const id of source) {
    const low = String(id).toLowerCase();
    if (low.startsWith(q)) prefix.push(id);
    else if (low.includes(q)) strong.push(id);
    else {
      // The scorer matches the friendly name through the row's aliases, so the pre-filter has to
      // let those ids through: `kitch` must reach light.hue_bulb_3 named "Kitchen Lamp".
      const friendly = lowerNames ? lowerNames[id] : "";
      if (friendly && friendly.includes(q)) named.push(id);
      else if (isSubsequenceMatch(low, q)) weak.push(id);
      else continue;
    }
    matched.push(id);
  }
  lastIdQuery.ids = list;
  lastIdQuery.names = nameSource;
  lastIdQuery.size = list.length;
  lastIdQuery.query = q;
  lastIdQuery.matched = matched;
  return [...prefix, ...strong, ...named, ...weak];
}

// The friendly names of one snapshot in lower case. Every typed character used to lowercase the
// name of every entity whose id did not contain the query (a new string each, for up to 10,000
// entities). The names object belongs to the data snapshot and is not changed after it is built,
// so its lower-case copy is made once and dropped with the snapshot.
const lowerNamesByNames = new WeakMap();
function lowerEntityNames(names) {
  let lower = lowerNamesByNames.get(names);
  if (lower) return lower;
  lower = Object.create(null);
  for (const id of Object.keys(names)) {
    const friendly = names[id];
    if (friendly) lower[id] = String(friendly).toLowerCase();
  }
  lowerNamesByNames.set(names, lower);
  return lower;
}

// Entity rows by id. A row depends only on the id and the friendly name, so it is built once
// and handed out again until the name changes. Before, each refresh of the entity list
// sanitized and rebuilt up to 750 rows. The rows are frozen: they are shared between refreshes.
const ENTITY_ROW_CACHE_LIMIT = 20000;
const entityRowCache = { normalizeItem: null, providerId: "", rows: new Map() };
function entityRowFor(id, friendly, normalizeItem, normalizeKey, providerId) {
  if (entityRowCache.normalizeItem !== normalizeKey || entityRowCache.providerId !== providerId) {
    entityRowCache.normalizeItem = normalizeKey;
    entityRowCache.providerId = providerId;
    entityRowCache.rows = new Map();
  }
  const known = entityRowCache.rows.get(id);
  if (known && known.friendly === friendly) return known.item;
  const domain = id.split(".")[0] || "entity";
  const item = normalizeItem(
    [`ha.entity.${id}`, "yaml", "entity", id, id, ["entity", domain, friendly].filter(Boolean)],
    providerId
  );
  if (item) {
    item.meta = Object.freeze({ ...(item.meta || {}), domain, friendly, sourceDetail: friendly ? `${friendly} (${domain})` : domain });
    if (Array.isArray(item.aliases)) Object.freeze(item.aliases);
    Object.freeze(item);
  }
  if (entityRowCache.rows.size >= ENTITY_ROW_CACHE_LIMIT) entityRowCache.rows.clear();
  entityRowCache.rows.set(id, { friendly, item: item || null });
  return item || null;
}

export function runtimeRowsForKind(kind, options = {}) {
    const data = typeof options?.runtimeData === "function" ? options.runtimeData() : runtimeData(options);
    const items = [];
    const providerId = options?.providerId || HA_VALUE_PROVIDER_ID;
    const normalizeItem = typeof options?.normalizeItem === "function"
      ? options.normalizeItem
      : (row, source) => normalizeLibraryItem(row, source, { limits: options?.limits || SECURITY_LIMITS });

    function pushRuntime(row, meta = {}) {
      const item = normalizeItem(row, providerId);
      if (!item) return;
      item.meta = { ...(item.meta || {}), ...meta };
      items.push(item);
    }

    if (kind === "entity") {
      const limits = options?.limits || SECURITY_LIMITS;
      const preferredDomain = String(options?.preferredEntityDomain || "");
      const allIds = data.entities || [];
      // Prefix-aware sourcing: on large installs the indexed list far exceeds the per-query row
      // cap, so filter by what's been typed before capping. Otherwise only the first ~750 ids
      // alphabetically are ever reachable (late-alphabet domains like switch.* never appear). The
      // filter mirrors the scorer (startsWith/substring rank above subsequence) so it never drops a
      // candidate the scorer would rank, and the bare prefix '' (popup just opened) is unfiltered.
      const ids = filterEntityIdsByQuery(allIds, options?.prefix, data.entityNames);
      const domainFirst = preferredDomain
        ? [...ids.filter(id => id.startsWith(`${preferredDomain}.`)), ...ids.filter(id => !id.startsWith(`${preferredDomain}.`))]
        : ids;
      const ordered = domainFirst.slice(0, limits.maxRuntimeEntities);
      // The rows are kept per normalize function; without one of the caller's, per limits object.
      const normalizeKey = typeof options?.normalizeItem === "function" ? options.normalizeItem : limits;
      for (const id of ordered) {
        const friendly = data.entityNames?.[id] || "";
        const item = entityRowFor(id, friendly, normalizeItem, normalizeKey, providerId);
        if (item) items.push(item);
      }
    } else if (kind === "service-field") {
      const serviceId = String(options?.serviceId || "");
      const fields = serviceId ? serviceFieldsFor(data, serviceId, options?.limits || SECURITY_LIMITS) : [];
      const domain = serviceId.split(".")[0] || "service";
      for (const fieldInfo of fields) {
        const detailBits = [
          fieldInfo.selectorKind,
          fieldInfo.required ? "required" : "",
          fieldInfo.advanced ? "advanced" : "",
        ].filter(Boolean);
        const meta = { domain };
        // Carry `required` so the scorer floats required service fields above optional ones
        // (required-first ordering, requiredRank term).
        if (fieldInfo.required) meta.required = true;
        if (detailBits.length) meta.sourceDetail = detailBits.join(" · ");
        if (fieldInfo.description) meta.documentation = fieldInfo.description;
        pushRuntime(
          [`ha.service_field.${serviceId}.${fieldInfo.field}`, "yaml", "key", `${fieldInfo.field}:`, `${fieldInfo.field}: `, ["data", "field", serviceId, fieldInfo.selectorKind].filter(Boolean)],
          meta
        );
      }
    } else if (kind === "service-field-value") {
      // Complete the enumerated values of one service-data field (select options).
      const serviceId = String(options?.serviceId || "");
      const fieldName = String(options?.fieldName || "");
      const fields = serviceId ? serviceFieldsFor(data, serviceId, options?.limits || SECURITY_LIMITS) : [];
      const fieldInfo = fields.find(f => f && f.field === fieldName);
      const opts = fieldInfo && Array.isArray(fieldInfo.options) ? fieldInfo.options : [];
      const domain = serviceId.split(".")[0] || "service";
      for (const opt of opts) {
        const value = String(opt?.value || "");
        if (!value) continue;
        const meta = { domain };
        if (opt.label) meta.sourceDetail = opt.label;
        pushRuntime(
          [`ha.service_field_value.${serviceId}.${fieldName}.${value}`, "yaml", "value", value, value, ["value", fieldName, serviceId].filter(Boolean)],
          meta
        );
      }
    } else if (kind === "service") {
      // Prefix-aware, mirroring the entity lane: filter the indexed services by what's typed, THEN cap
      // per query — otherwise only the first maxRuntimeServices alphabetically are ever reachable and
      // late-alphabet services (weather.*, zone.*, zwave_js.*) never complete on large installs.
      const limits = options?.limits || SECURITY_LIMITS;
      const ids = filterEntityIdsByQuery(data.services || [], options?.prefix).slice(0, limits.maxRuntimeServices);
      for (const id of ids) {
        const domain = id.split(".")[0] || "service";
        pushRuntime([`ha.service.${id}`, "yaml", "service", id, id, ["service", domain]], { domain });
      }
    } else if (kind === "card-type") {
      for (const id of data.cards || []) {
        const info = data.cardMeta?.[id];
        const meta = { domain: "lovelace" };
        if (info?.name) {
          meta.sourceDetail = info.name;
          meta.documentation = info.description ? `${info.name} — ${info.description}` : `Custom card: ${info.name}`;
        }
        pushRuntime([`ha.card.${id}`, "yaml", "card", id, id, ["type", "card", "lovelace", info?.name || ""].filter(Boolean)], meta);
      }
    } else if (kind === "icon") {
      for (const id of data.icons || []) pushRuntime([`ha.icon.${id}`, "yaml", "icon", id, id, ["mdi", "icon"]], { domain: "mdi" });
    } else if (kind === "action") {
      for (const id of data.actions || []) pushRuntime([`ha.action.${id}`, "yaml", "action", id, id, ["tap_action", "hold_action", "action"]], { domain: "action" });
    } else if (kind === "theme") {
      for (const id of data.themes || []) pushRuntime([`ha.theme.${id}`, "yaml", "theme", id, id, ["theme"]], { domain: "theme" });
    } else if (kind === "trigger-type") {
      for (const id of data.triggerTypes || []) pushRuntime([`ha.trigger.${id}`, "yaml", "trigger", id, id, ["trigger", "automation"]], { domain: "trigger" });
    } else if (kind === "condition-type") {
      for (const id of data.conditionTypes || []) pushRuntime([`ha.condition.${id}`, "yaml", "condition", id, id, ["condition", "automation"]], { domain: "condition" });
    } else if (kind === "automation-mode") {
      for (const id of data.automationModes || []) pushRuntime([`ha.mode.${id}`, "yaml", "mode", id, id, ["mode", "automation"]], { domain: "automation" });
    } else if (kind === "boolean") {
      for (const id of data.booleans || []) pushRuntime([`ha.boolean.${id}`, "yaml", "boolean", id, id, ["boolean"]], { domain: "yaml" });
    } else if (kind === "script-action") {
      for (const id of data.scriptActions || []) pushRuntime([`ha.script_action.${id}`, "yaml", "script-action", id, id, ["action", "script", "automation"]], { domain: "automation" });
    } else if (REGISTRY_KINDS[kind]) {
      // Registry rows: insert the id, show the human name as detail, and keep the name in the
      // keywords so the scorer fuzzy-matches a typed name (device ids are opaque hex; areas/floors/
      // labels carry readable slug ids). Already capped at source, so no per-query filter is needed.
      const { idsKey, namesKey } = REGISTRY_KINDS[kind];
      for (const id of data[idsKey] || []) {
        const name = data[namesKey]?.[id] || "";
        pushRuntime(
          [`ha.${kind}.${id}`, "yaml", kind, id, id, [kind, `${kind}_id`, name].filter(Boolean)],
          { domain: kind, sourceDetail: name || kind }
        );
      }
    }

    return items;
  }

// The context adapter can mark a VALUE as an entity from its typed shape (a
// domain-dot prefix checked against the live entity domains) -- a lane the
// key-name-only classifier cannot derive from yamlKey/yamlPath alone. When the
// classifier has no kind for the key, honor exactly that entity marking so
// entity values under arbitrary keys (`humidity: sensor.x`) reach the entity
// rows; every keyed kind still comes from the classifier.
// The same holds for a card type the adapter found from the text: the type: of a card whose
// list item starts with another key (`- features: ...`) has the path of a feature's own type:,
// and only the columns, which the classifier does not see, tell them apart.
function resolvedRuntimeValueKind(ctx) {
    const kind = yamlValueKind(ctx);
    if (kind) return kind;
    if (ctx?.valueKind === "entity") return "entity";
    // Only for the type: key itself; no other key takes a card type from the context.
    if (ctx?.valueKind === "card-type" && String(ctx?.yamlKey || "").toLowerCase() === "type") return "card-type";
    return "";
  }

export function haRuntimeValueProvider(options = {}) {
    return {
      id: options?.providerId || HA_VALUE_PROVIDER_ID,
      label: "Home Assistant runtime value provider",
      canHandle(ctx) {
        if (!ctx) return false;
        // Jinja live-entity lane: fire inside a template entity-arg (states('|'), is_state('|'),
        // state_attr('|', …)) when the jinjaLane flag is on. Gated entirely by ctx fields the context
        // runtime sets; flag off / wrong position → falls through to the unchanged yaml-only path.
        if (ctx.lang === "jinja" && ctx.jinjaLaneEnabled === true && ctx.jinjaArg && ctx.jinjaArg.expectKind === "entity") return true;
        if (ctx.lang !== "yaml") return false;
        // A service-data field value position (e.g. `effect: |`). Gated entirely by the ctx flag
        // the context runtime sets; off → falls through to the unchanged path.
        if (ctx.schemaValuesEnabled === true && isServiceDataFieldValueContext(ctx)) return true;
        if (isServiceDataFieldContext(ctx)) return true;
        const kind = resolvedRuntimeValueKind(ctx);
        if (!kind || isScalarValueKind(kind)) return false;
        // A card-type/action value belongs on a dashboard/card surface; a trigger-type/script-action
        // value belongs on an automation/script surface. Entities/services/icons/themes/booleans/
        // condition-types/registries are cross-surface legitimate and are never scoped.
        if (!surfaceAllowsValueKind(ctx, kind)) return false;
        return ctx.yamlRole === "value" || ctx.yamlRole === "list-key";
      },
      provide(ctx) {
        // Prefix-aware sourcing: thread the typed query so the entity list is filtered before the
        // per-query cap (the scorer still ranks/limits the result). Harmless for non-entity kinds.
        const prefix = ctx?.prefix;
        if (ctx && ctx.lang === "jinja" && ctx.jinjaLaneEnabled === true && ctx.jinjaArg && ctx.jinjaArg.expectKind === "entity") {
          return runtimeRowsForKind("entity", { ...options, prefix });
        }
        if (ctx.schemaValuesEnabled === true && isServiceDataFieldValueContext(ctx)) {
          const schemaRows = runtimeRowsForKind("service-field-value", { ...options, serviceId: serviceIdFromContext(ctx), fieldName: String(ctx.yamlKey || "") });
          // Enumerated fields (select/boolean) return their options; an entity/icon/etc.-selector
          // field has none, so fall through to the kind-based value completion below (real entity ids,
          // icons, ...) rather than returning nothing. Without this, turning schemaValues on made
          // entity/icon value completion under data:/service_data: WORSE than with it off.
          if (schemaRows.length) return schemaRows;
        }
        if (isServiceDataFieldContext(ctx)) {
          return runtimeRowsForKind("service-field", { ...options, serviceId: serviceIdFromContext(ctx) });
        }
        const kind = resolvedRuntimeValueKind(ctx);
        if (!surfaceAllowsValueKind(ctx, kind)) return []; // defensive; canHandle already gates
        if (kind === "entity" && yamlPathIncludes(ctx, ["target"])) {
          const serviceDomain = serviceIdFromContext(ctx).split(".")[0] || "";
          if (serviceDomain && serviceDomain !== "homeassistant") {
            return runtimeRowsForKind(kind, { ...options, preferredEntityDomain: serviceDomain, prefix });
          }
        }
        return runtimeRowsForKind(kind, { ...options, prefix });
      }
    };
  }

export function runtimeSummary(runtimeState, options = {}) {
    const nowFn = typeof options?.now === "function" ? options.now : Date.now;
    const rt = runtimeState?.runtimeCache || {};
    return {
      hasHass: !!rt.hasHass,
      ageMs: rt.at ? Math.max(0, nowFn() - rt.at) : null,
      entities: rt.entities?.length || 0,
      services: rt.services?.length || 0,
      themes: rt.themes?.length || 0,
      cards: rt.cards?.length || 0,
      icons: rt.icons?.length || 0,
      actions: rt.actions?.length || 0,
      customCards: Array.isArray(rt.cards) ? rt.cards.filter(type => String(type || "").startsWith("custom:")).length : 0,
      serviceFieldServices: rt.serviceFields && typeof rt.serviceFields === "object" ? Object.keys(rt.serviceFields).length : 0,
      areas: rt.areas?.length || 0,
      devices: rt.devices?.length || 0,
      floors: rt.floors?.length || 0,
      labels: rt.labels?.length || 0,
    };
  }

// Compatibility/static coverage markers for the delegated YAML classifier seam:
// entity-list number duration target-block style-block trigger-type condition-type automation-mode perform_action
// token: scalarValueContext
