// Home Assistant runtime values: the data snapshot read from hass (entities, services and their
// fields, registries, themes, custom cards) and the installed icon sets, and the provider that
// turns it into value rows. The window, document and runtime state come in through the options
// (globalThis when no window is given).

import { HA_VALUE_PROVIDER_ID, NATIVE_CARD_TYPES, SECURITY_LIMITS } from '../core/runtimeConstants.js';
import { safeString } from '../core/string.js';
import { iconSetLabel } from './iconSetCatalog.js';
import { normalizeItem as normalizeLibraryItem } from './staticLibraryProvider.js';
import { surfaceAllows } from './surfaceScope.js';
import * as classifier from '../yaml/yamlContextClassifier.js';
import {
  HA_PANEL_LOVELACE,
  HOME_ASSISTANT,
  HOME_ASSISTANT_MAIN,
  HUI_ROOT,
  PARTIAL_PANEL_RESOLVER,
} from '../editor/haSelectors.js';

// Value kinds that belong to one kind of editor. card-type and action are dashboard values,
// trigger-type and script-action automation and script values. condition-type is shared
// (dashboard visibility uses it), and entities, services, icons, themes, booleans, registries and
// modes fit everywhere, so they are never limited. Reads only ctx; with surface scoping off it
// always allows.
function surfaceAllowsValueKind(ctx, kind) {
  if (kind === "card-type" || kind === "action") return surfaceAllows(ctx, "lovelace");
  if (kind === "trigger-type" || kind === "script-action") return surfaceAllows(ctx, "automation");
  return true;
}

// Reads from Home Assistant objects go through here. A throwing getter, a proxy, a partial hass
// or a malformed registry entry gives the fallback, which means fewer suggestions, not an error
// while typing.
function guardedRead(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

// The card types built into Home Assistant. Installed custom cards register themselves in the
// page's customCards list, which customCardCatalog() reads.
const NATIVE_CARDS = Object.freeze([...NATIVE_CARD_TYPES]);

const CUSTOM_CARD_TYPE_RX = /^[a-z0-9_-]+$/i;
const SERVICE_ID_RX = /^[a-z0-9_]+\.[a-z0-9_]+$/i;
const SERVICE_FIELD_NAME_RX = /^[a-z0-9_]+$/i;
// Registry ids: area/floor/label ids are readable slugs; device ids are opaque hex. All are
// alphanumerics plus underscore/hyphen; anything with a dot, space or quote is rejected.
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
  // The loop reads the list by index through guardedRead instead of iterating it: an array with
  // a throwing index getter or iterator would otherwise end the whole data snapshot build. A bad
  // entry is skipped.
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

// The option values of an enumerated selector (a `select` option list, or a `boolean`), so a
// service-field value can complete them. At most maxServiceFieldOptions; any other shape gives
// []. signatureHelp and lazyResolve read the other keys of a field row.
function serviceFieldOptions(selector, limits) {
  if (!selector || typeof selector !== "object") return [];
  const cap = limits?.maxServiceFieldOptions || 60;
  const sel = selector.select;
  if (sel && typeof sel === "object" && Array.isArray(sel.options)) {
    const out = [];
    for (const opt of sel.options) {
      if (out.length >= cap) break;
      if (typeof opt === "string" || typeof opt === "number" || typeof opt === "boolean") {
        // Bare numbers and booleans ([1, 2, 3], [true, false]) are valid select options too.
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

// Home Assistant groups optional service fields into collapsible sections: an entry
// `{ collapsed, fields: {...} }` whose key (`advanced_fields`) is not a service-data key; only
// the fields inside it are. Like Home Assistant's ha-service-control, this lists the inner
// fields and skips the section key, to a bounded depth. An entry that cannot be read is skipped.
const FIELD_READ_FAILED = Symbol("field-read-failed");
function flattenServiceFields(fields, depth = 0) {
  const out = [];
  if (!fields || typeof fields !== "object" || depth > 3) return out;
  for (const key of guardedRead(() => Object.keys(fields), [])) {
    const info = guardedRead(() => fields[key], FIELD_READ_FAILED);
    if (info === FIELD_READ_FAILED) continue;
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

  // Object.keys never runs getters, and each value read is guarded, so an entry that cannot be
  // read costs only that entry.
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
        // Options that cannot be read leave this field without options.
        options: guardedRead(() => serviceFieldOptions(selector, limits), []),
      };
    }, null);
    if (row) rows.push(row);
  }
  return rows;
}

// The services object each data snapshot was built from. serviceFieldCatalog stops after
// limits.maxServicesWithFields services, in the order Home Assistant registered them, to bound
// the work of a snapshot build. A service past that limit is read here when it is asked for, one
// service at a time, and kept in the snapshot's serviceFields so the other readers of the same
// snapshot find it too. A new snapshot starts from its own catalog again.
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

// One Home Assistant registry (hass.areas, devices, floors or labels): an object keyed by id whose
// values carry a name. Ids are validated, sorted and capped. A registry that cannot be read gives
// { ids: [], names: {} }, and an entry that cannot be read costs only that entry.
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

// Common Material Design icons, offered before the names of the icon sets. Home Assistant has no
// list of its Material Design icons that a page can read.
const COMMON_ICONS = Object.freeze([
  "mdi:home", "mdi:lightbulb", "mdi:thermometer", "mdi:water-percent", "mdi:fan",
  "mdi:power", "mdi:power-plug", "mdi:wifi", "mdi:router-wireless", "mdi:server",
  "mdi:car", "mdi:garage", "mdi:door", "mdi:lock", "mdi:shield-home",
  "mdi:motion-sensor", "mdi:cctv", "mdi:weather-partly-cloudy", "mdi:battery", "mdi:solar-power",
  "mdi:bell", "mdi:calendar", "mdi:camera", "mdi:chart-line", "mdi:chevron-right",
  "mdi:clock-outline", "mdi:cog", "mdi:fire", "mdi:flash", "mdi:home-assistant",
  "mdi:information-outline", "mdi:light-switch", "mdi:play", "mdi:robot", "mdi:script-text",
  "mdi:thermostat", "mdi:toggle-switch", "mdi:transmission-tower", "mdi:weather-night"
]);

const NO_ICON_SET_ICONS = Object.freeze([]);

// The installed icon sets, read through the catalog the caller keeps (options.iconSets, see
// iconSetCatalog.js). Null without one.
function iconSetView(options) {
  const catalog = options?.iconSets;
  if (!catalog || typeof catalog.current !== "function") return null;
  return guardedRead(() => {
    if (typeof catalog.sync === "function") catalog.sync();
    return catalog.current();
  }, null);
}

// The snapshot fields that come from the icon sets.
function iconSetFields(view) {
  return {
    iconSetIcons: view?.ids || NO_ICON_SET_ICONS,
    iconSetPrefixes: view?.prefixes || NO_ICON_SET_ICONS,
    iconKeywords: view?.keywords || null,
    iconSetVersion: view ? view.version : 0,
  };
}

// A kept snapshot with the names of icon sets that arrived since it was built. The rest of the
// data stays; the object is new, so a list scored with the old names is not served again.
function withIconSets(runtimeState, cache, view, now) {
  const next = { ...cache, ...iconSetFields(view), at: now };
  const services = servicesBySnapshot.get(cache);
  if (services) servicesBySnapshot.set(next, services);
  if (runtimeState) runtimeState.runtimeCache = next;
  return next;
}

export function runtimeData(options = {}) {
  const runtimeState = options?.state;
  const limits = options?.limits || SECURITY_LIMITS;
  const nowFn = typeof options?.now === "function" ? options.now : Date.now;
  const now = nowFn();
  const iconView = iconSetView(options);
  const iconSetsChanged = cache => !!iconView && (cache.iconSetVersion || 0) !== iconView.version;
  if (runtimeState?.runtimeCache && now - runtimeState.runtimeCache.at < limits.runtimeCacheMs) {
    const cache = runtimeState.runtimeCache;
    return iconSetsChanged(cache) ? withIconSets(runtimeState, cache, iconView, cache.at) : cache;
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
    if (iconSetsChanged(runtimeState.runtimeCache)) return withIconSets(runtimeState, runtimeState.runtimeCache, iconView, now);
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

  // Registries from the same hass object. A device shows the name the user set before the
  // integration's name.
  const areaCat = registryCatalog(guardedRead(() => hass?.areas, null), { max: limits.maxRuntimeAreas });
  const deviceCat = registryCatalog(guardedRead(() => hass?.devices, null), { max: limits.maxRuntimeDevices, namePick: d => d?.name_by_user || d?.name });
  const floorCat = registryCatalog(guardedRead(() => hass?.floors, null), { max: limits.maxRuntimeFloors });
  const labelCat = registryCatalog(guardedRead(() => hass?.labels, null), { max: limits.maxRuntimeLabels });

  const liveCards = customCardCatalog(options);
  const cards = Array.from(new Set([...NATIVE_CARDS, ...liveCards.cards])).sort();
  const cardMeta = liveCards.cardMeta;

  const icons = COMMON_ICONS;

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
    areas: areaCat.ids, areaNames: areaCat.names,
    devices: deviceCat.ids, deviceNames: deviceCat.names,
    floors: floorCat.ids, floorNames: floorCat.names,
    labels: labelCat.ids, labelNames: labelCat.names,
    ...iconSetFields(iconView),
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

// The ids that matched the last query, in the order of the ids list they came from. An id that
// does not match "ki" (by id, by friendly name or as a subsequence) cannot match "kit", so while
// the user extends the query the next pass reads these matches instead of every indexed id (up to
// 10,000) and sorts them into their groups again. The result is the same as a full pass. Another
// list, names object or list length, or a query that does not extend the last one, runs the full
// pass. The ids list and the names object belong to one data snapshot and do not change.
const lastIdQuery = { ids: null, names: null, size: 0, query: "", matched: null };

// The ids the typed query can match, before the per-query row cap, so that cap never drops a
// matching entity on a large instance. Ids that start with or contain the query come before
// looser matches, as in the scorer. An empty query returns the list unfiltered; a list that is
// not an array gives [] and a query that is not a string counts as empty.
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
  // Ids that start with the query come first, because the caller cuts the result at the row cap:
  // on an instance with more than 750 binary_sensor entities, `sensor.` would otherwise never
  // reach a sensor entity, since every binary_sensor id contains "sensor." as well.
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

// The friendly names of one snapshot in lower case, made once per names object (which does not
// change after the snapshot is built) instead of for each typed character, and dropped with it.
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

// Entity rows by id. A row depends only on the id and the friendly name, so it is built once and
// handed out again until the name changes. The rows are frozen because refreshes share them.
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

function iconKeywordsMatch(words, query) {
  if (!Array.isArray(words)) return false;
  return words.some(word => String(word).toLowerCase().startsWith(query));
}

// The icon ids the typed text can match, best first, cut at `cap` before any row is built: with
// icon sets installed there are tens of thousands of names. `lists` holds the common icons of the
// snapshot and the names of the icon sets, `keywords` the keywords of the names that have them.
// The text matches the whole id (`m3o:ho`) or the name after the prefix (`light`): ids that start
// with it, then names that start with it, names with a word that starts with it (`ceiling-light`),
// names with a keyword that starts with it, names that contain it, and names that hold its
// letters in order. An empty text keeps the order of the lists. An id that is in the first list
// and in a later one is offered once.
export function filterIconIdsByQuery(lists, query, keywords = null, cap = SECURITY_LIMITS.maxRuntimeIcons) {
  const sources = Array.isArray(lists) ? lists.filter(Array.isArray) : [];
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  // The scorer matches letters in order only for a text of letters and digits.
  const looseMatch = q.length >= 2 && /^[a-z0-9]+$/.test(q);
  const first = new Set(sources[0] || []);
  const groups = [[], [], [], [], [], []];
  for (let s = 0; s < sources.length; s += 1) {
    for (const raw of sources[s]) {
      const id = typeof raw === "string" ? raw : "";
      if (!id || (s > 0 && first.has(id))) continue;
      if (!q) {
        groups[0].push(id);
        if (groups[0].length >= cap) return groups[0];
        continue;
      }
      const low = id.toLowerCase();
      if (low.startsWith(q)) {
        groups[0].push(id);
        continue;
      }
      const name = low.slice(low.indexOf(":") + 1);
      if (name.startsWith(q)) groups[1].push(id);
      else if (name.includes(`-${q}`) || name.includes(`_${q}`)) groups[2].push(id);
      else if (keywords && iconKeywordsMatch(keywords.get(id), q)) groups[3].push(id);
      else if (name.includes(q)) groups[4].push(id);
      else if (looseMatch && isSubsequenceMatch(name, q)) groups[5].push(id);
    }
  }
  const out = [];
  for (const group of groups) {
    for (const id of group) {
      if (out.length >= cap) return out;
      out.push(id);
    }
  }
  return out;
}

// Icon rows by id, kept like the entity rows. A row depends on the id, its keywords and whether it
// is one of the common icons, which the scorer ranks first among equal matches.
const ICON_ROW_CACHE_LIMIT = 5000;
const iconRowCache = { normalizeItem: null, providerId: "", rows: new Map() };
function iconRowFor(id, keywords, common, normalizeItem, normalizeKey, providerId) {
  if (iconRowCache.normalizeItem !== normalizeKey || iconRowCache.providerId !== providerId) {
    iconRowCache.normalizeItem = normalizeKey;
    iconRowCache.providerId = providerId;
    iconRowCache.rows = new Map();
  }
  const known = iconRowCache.rows.get(id);
  if (known && known.keywords === keywords && known.common === common) return known.item;
  const colon = id.indexOf(":");
  const prefix = colon > 0 ? id.slice(0, colon) : "mdi";
  const name = colon > 0 ? id.slice(colon + 1) : id;
  const setLabel = iconSetLabel(prefix);
  const item = normalizeItem(
    [`ha.icon.${id}`, "yaml", "icon", id, id, [name, ...(keywords || [])]],
    providerId
  );
  if (item) {
    item.meta = Object.freeze({
      ...(item.meta || {}),
      domain: prefix,
      sourceDetail: setLabel,
      documentation: `Icon from ${setLabel}.`,
      ...(common ? { commonIcon: true } : {}),
    });
    if (Array.isArray(item.aliases)) Object.freeze(item.aliases);
    Object.freeze(item);
  }
  if (iconRowCache.rows.size >= ICON_ROW_CACHE_LIMIT) iconRowCache.rows.clear();
  iconRowCache.rows.set(id, { keywords, common, item: item || null });
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
    // On a large instance the indexed list is far longer than the per-query row cap, so it is
    // filtered by the typed text before the cap; otherwise only the first ids in alphabetical
    // order could be reached (switch.* would never appear). An empty prefix is not filtered.
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
      // The scorer ranks required fields above optional ones (requiredRank).
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
    // Filtered by the typed text before the cap, like the entities, so services late in the
    // alphabet (weather.*, zone.*, zwave_js.*) complete on a large instance.
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
    // The common icons and the names of the installed icon sets (Material Symbols and others),
    // filtered by the typed text before the cap, like the entities.
    const limits = options?.limits || SECURITY_LIMITS;
    const common = Array.isArray(data.icons) ? data.icons : [];
    const keywords = data.iconKeywords instanceof Map ? data.iconKeywords : null;
    const ids = filterIconIdsByQuery([common, data.iconSetIcons || []], options?.prefix, keywords, limits.maxRuntimeIcons || SECURITY_LIMITS.maxRuntimeIcons);
    const commonIds = new Set(common);
    const normalizeKey = typeof options?.normalizeItem === "function" ? options.normalizeItem : limits;
    for (const id of ids) {
      const item = iconRowFor(id, keywords?.get(id) || null, commonIds.has(id), normalizeItem, normalizeKey, providerId);
      if (item) items.push(item);
    }
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
    // Registry rows insert the id and show the name as detail. The name is also an alias, so a
    // typed name matches (device ids are opaque hex; area, floor and label ids are readable).
    // The lists are capped when the snapshot is built, so there is no per-query filter.
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

// The value kind for this position. The classifier decides it from the key and the path. The
// context adapter can also mark a value as an entity from its typed shape (a domain and a dot,
// checked against the entity domains), which the classifier cannot see, so an entity value under
// any key (`humidity: sensor.x`) gets entity rows when the classifier has no kind for the key.
// The same holds for a card type the adapter found from the text: the type: of a card whose list
// item starts with another key (`- features: ...`) has the path of a feature's own type:, and
// only the columns, which the classifier does not see, tell them apart.
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
      // Entity ids inside a template's entity argument (states('|'), is_state('|'),
      // state_attr('|', ...)), when the jinjaLane flag is on. The context runtime sets these
      // ctx fields.
      if (ctx.lang === "jinja" && ctx.jinjaLaneEnabled === true && ctx.jinjaArg && ctx.jinjaArg.expectKind === "entity") return true;
      // An icon name in a template string (`{{ 'm3o:light' if ... }}`); the context adapter sets
      // the icon kind there.
      if (ctx.lang === "jinja" && ctx.valueKind === "icon") return true;
      if (ctx.lang !== "yaml") return false;
      // The value of a service-data field (`effect: |`), when the schemaValues flag is on.
      if (ctx.schemaValuesEnabled === true && isServiceDataFieldValueContext(ctx)) return true;
      if (isServiceDataFieldContext(ctx)) return true;
      const kind = resolvedRuntimeValueKind(ctx);
      if (!kind || isScalarValueKind(kind)) return false;
      if (!surfaceAllowsValueKind(ctx, kind)) return false;
      return ctx.yamlRole === "value" || ctx.yamlRole === "list-key";
    },
    provide(ctx) {
      // The typed text filters the entity and service lists before the per-query cap; the
      // scorer still ranks and limits the result.
      const prefix = ctx?.prefix;
      if (ctx && ctx.lang === "jinja" && ctx.jinjaLaneEnabled === true && ctx.jinjaArg && ctx.jinjaArg.expectKind === "entity") {
        return runtimeRowsForKind("entity", { ...options, prefix });
      }
      if (ctx.lang === "jinja") return ctx.valueKind === "icon" ? runtimeRowsForKind("icon", { ...options, prefix }) : [];
      if (ctx.schemaValuesEnabled === true && isServiceDataFieldValueContext(ctx)) {
        const schemaRows = runtimeRowsForKind("service-field-value", { ...options, serviceId: serviceIdFromContext(ctx), fieldName: String(ctx.yamlKey || "") });
        // A select or boolean field gives its options. A field with another selector (entity,
        // icon) has none and gets the value rows for its kind below.
        if (schemaRows.length) return schemaRows;
      }
      if (isServiceDataFieldContext(ctx)) {
        return runtimeRowsForKind("service-field", { ...options, serviceId: serviceIdFromContext(ctx) });
      }
      const kind = resolvedRuntimeValueKind(ctx);
      if (!surfaceAllowsValueKind(ctx, kind)) return []; // canHandle checks this too
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
    iconSets: rt.iconSetPrefixes?.length || 0,
    iconSetIcons: rt.iconSetIcons?.length || 0,
    actions: rt.actions?.length || 0,
    customCards: Array.isArray(rt.cards) ? rt.cards.filter(type => String(type || "").startsWith("custom:")).length : 0,
    serviceFieldServices: rt.serviceFields && typeof rt.serviceFields === "object" ? Object.keys(rt.serviceFields).length : 0,
    areas: rt.areas?.length || 0,
    devices: rt.devices?.length || 0,
    floors: rt.floors?.length || 0,
    labels: rt.labels?.length || 0,
  };
}
