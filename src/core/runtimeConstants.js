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
  // How many entity ids the runtime snapshot keeps to filter from by prefix. maxRuntimeEntities caps
  // the rows of one query; this cap is higher so an install with thousands of entities can still
  // complete domains late in the alphabet, not only the first 750 ids.
  maxRuntimeEntitiesIndexed: 10000,
  maxRuntimeServices: 500,
  // Like maxRuntimeEntitiesIndexed: more service ids are kept than one query returns, so services
  // late in the alphabet (zwave_js.*, zha.*) can be completed on large installs.
  maxRuntimeServicesIndexed: 3000,
  // Registries (areas, devices, floors, labels): capped where registryCatalog reads them, not per
  // query. Areas, floors and labels are small; devices get the entity cap. Registry rows are not
  // filtered by id prefix: a device id is opaque and matches by name through the scorer's keywords.
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
