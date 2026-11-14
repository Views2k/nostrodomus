// Nostrodomus runtime constants shared by the active browser bundle.
//
// Constants only. Keep this module free of DOM access, storage access, events,
// timers, and Home Assistant runtime reads.

export const SECURITY_LIMITS = Object.freeze({
  maxItemLabel: 160,
  maxInsertText: 4000,
  maxAlias: 96,
  maxAliases: 24,
  maxRowsPerPack: 2000,
  maxDocScanChars: 24000,
  maxYamlPathLines: 360,
  maxCacheEntries: 64,
  maxRuntimeEntities: 750,
  // The full entity-id list kept in the runtime snapshot to filter from (prefix-aware sourcing).
  // maxRuntimeEntities caps the rows returned per query; this caps how many ids are indexed so
  // large installs (thousands of entities) can complete late-alphabet domains, not just the first
  // 750 alphabetically. Bounds the per-cache-cycle build; the per-query row count stays bounded by
  // maxRuntimeEntities after the prefix filter.
  maxRuntimeEntitiesIndexed: 10000,
  maxRuntimeServices: 500,
  // Like maxRuntimeEntitiesIndexed: index more service ids than the per-query row cap so the
  // service value lane can prefix-filter to late-alphabet services (zwave_js.*, zha.*, ...) on
  // large installs instead of only ever reaching the first 500 alphabetically.
  maxRuntimeServicesIndexed: 3000,
  // Registries (areas/devices/floors/labels): caps applied at source in registryCatalog, not as a
  // per-query filter like entities. Areas/floors/labels are small; devices get the entity-scale cap.
  // No prefix filter is applied to registry rows: device ids are opaque (matched by name via the
  // scorer's keywords), so id-prefix filtering would wrongly drop name matches; the scorer ranks them.
  maxRuntimeAreas: 300,
  maxRuntimeDevices: 750,
  maxRuntimeFloors: 100,
  maxRuntimeLabels: 200,
  maxRuntimeCustomCards: 200,
  maxServiceFieldsPerService: 40,
  maxServicesWithFields: 400,
  // Cap the enumerated option values captured per service field (select options).
  maxServiceFieldOptions: 60,
  runtimeCacheMs: 2500,
  defaultProviderTimeoutMs: 8,
  maxProviderTimeoutMs: 120,
  maxProviderMalformedDiagnostics: 5,
});

export const STATIC_PROVIDER_ID = "static-library";
export const HA_VALUE_PROVIDER_ID = "ha-runtime-values";
export const LOVELACE_CONTEXT_PROVIDER_ID = "lovelace-context";
export const HACS_CATALOG_PROVIDER_ID = "hacs-catalog";
export const SNIPPET_PROVIDER_ID = "snippet-templates";
export const WORD_FALLBACK_PROVIDER_ID = "word-fallback";

// Native Lovelace card types shipped with Home Assistant (the value of a card's type: key).
export const NATIVE_CARD_TYPES = Object.freeze([
  "alarm-panel", "area", "button", "calendar", "conditional", "entities", "entity",
  "entity-filter", "gauge", "glance", "grid", "heading", "history-graph",
  "horizontal-stack", "humidifier", "iframe", "light", "logbook", "map", "markdown",
  "media-control", "picture", "picture-elements", "picture-entity", "picture-glance",
  "plant-status", "sensor", "shopping-list", "statistic", "statistics-graph",
  "thermostat", "tile", "todo-list", "vertical-stack", "weather-forecast", "webpage"
]);
