// Language-lane registry.
//
// This module is design-contract data only. Keep it pure and runtime-free:
// no DOM access, no browser storage, no timers, no events, no Home Assistant reads,
// and no provider registration. Live completion behavior does not depend on these lanes.

export const LANGUAGE_ENGINE_DESIGN_VERSION = 1;
export const LANGUAGE_ENGINE_STAGE = "language-lanes";

export const LANGUAGE_LANES = Object.freeze([
  Object.freeze({
    id: "yaml",
    label: "YAML",
    role: "host",
    activation: "Home Assistant dashboard, automation, script, and package YAML",
    embedded: false,
    providerFamilies: Object.freeze(["static-library", "ha-runtime", "lovelace-context", "snippet"]),
    fixtureGroup: "yaml-host",
  }),
  Object.freeze({
    id: "jinja2",
    label: "Jinja2 / HA templates",
    role: "embedded",
    activation: "Template delimiters such as {{ ... }} and {% ... %} inside YAML or Markdown scalars",
    embedded: true,
    providerFamilies: Object.freeze(["template", "ha-runtime", "snippet"]),
    fixtureGroup: "jinja-template",
  }),
  Object.freeze({
    id: "css",
    label: "CSS / card_mod",
    role: "embedded",
    activation: "card_mod style blocks, theme variables, selectors, and CSS custom properties",
    embedded: true,
    providerFamilies: Object.freeze(["css", "card-mod", "snippet"]),
    fixtureGroup: "css-card-mod",
  }),
  Object.freeze({
    id: "javascript",
    label: "JavaScript / TS-style",
    role: "embedded",
    activation: "button-card JavaScript templates and custom-card expression contexts",
    embedded: true,
    providerFamilies: Object.freeze(["javascript", "ha-frontend", "snippet"]),
    fixtureGroup: "javascript-expression",
  }),
  Object.freeze({
    id: "json",
    label: "JSON",
    role: "embedded",
    activation: "manifest-like structures, service-data objects, and JSON-shaped configuration values",
    embedded: true,
    providerFamilies: Object.freeze(["json", "service-data", "snippet"]),
    fixtureGroup: "json-object",
  }),
  Object.freeze({
    id: "markdown-html",
    label: "Markdown / HTML",
    role: "embedded",
    activation: "Markdown card content, inline HTML fragments, and safe Home Assistant element markup",
    embedded: true,
    providerFamilies: Object.freeze(["markdown", "html", "ha-elements", "snippet"]),
    fixtureGroup: "markdown-html-fragment",
  }),
]);

export const LANGUAGE_LANE_IDS = Object.freeze(LANGUAGE_LANES.map((lane) => lane.id));

export function normalizeLanguageLaneId(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function getLanguageLane(id) {
  const normalized = normalizeLanguageLaneId(id);
  return LANGUAGE_LANES.find((lane) => lane.id === normalized) || null;
}

export function isKnownLanguageLane(id) {
  return getLanguageLane(id) !== null;
}

export function languageLaneRegistryStatus() {
  return Object.freeze({
    ok: true,
    stage: LANGUAGE_ENGINE_STAGE,
    designVersion: LANGUAGE_ENGINE_DESIGN_VERSION,
    laneCount: LANGUAGE_LANES.length,
    laneIds: LANGUAGE_LANE_IDS.slice(),
    runtimeBehavior: "unchanged",
    registersProviders: false,
    drivesAutocomplete: false,
    opensPopup: false,
    insertsText: false,
  });
}
