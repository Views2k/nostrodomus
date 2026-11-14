// Provider Contract v2.
//
// Pure contract data only. This module describes the lane-aware provider shape.
// It must not register providers, call Home Assistant, read browser state, open
// the popup, insert text, or change live scoring behavior.

import { LANGUAGE_LANE_IDS, getLanguageLane } from './languageLanes.js';
import { MAIN_PROVIDER_SURFACES, hacsProviderCatalogStatus, providerSurfacesForLane } from '../providers/hacsProviderCatalog.js';
import { LANE_RANKING_FIXTURES, laneRankingFixtureStatus } from './laneRankingFixtures.js';

export const PROVIDER_CONTRACT_V2_VERSION = 1;
export const PROVIDER_CONTRACT_V2_STAGE = "priority10-provider-contract-v2-main-provider-engineering";

function freezeLaneContract(contract) {
  return Object.freeze({
    ...contract,
    providerFamilies: Object.freeze([...(contract.providerFamilies || [])]),
    requiredCapabilities: Object.freeze([...(contract.requiredCapabilities || [])]),
    rankingSignals: Object.freeze([...(contract.rankingSignals || [])]),
    requiredFixtureTags: Object.freeze([...(contract.requiredFixtureTags || [])]),
    mustNotSurface: Object.freeze([...(contract.mustNotSurface || [])]),
  });
}

export const PROVIDER_CONTRACT_V2_LANES = Object.freeze([
  freezeLaneContract({
    laneId: "yaml",
    providerFamilies: ["static-library", "ha-runtime", "lovelace-context", "hacs-card", "chart-card", "layout", "ha-service", "snippet"],
    requiredCapabilities: ["yaml-key-suggestions", "yaml-value-suggestions", "entity-value-suggestions", "service-value-suggestions", "custom-card-type-suggestions", "snippet-suggestions"],
    rankingSignals: ["yamlPath", "currentKey", "valueKind", "detectedCardType", "providerSurfacePriority", "runtimeEntityDomain"],
    requiredFixtureTags: ["yaml", "lovelace", "hacs-card-type"],
    mustNotSurface: ["raw-css-property-list-in-host-card-type", "javascript-return-keywords-outside-js-template"],
  }),
  freezeLaneContract({
    laneId: "jinja2",
    providerFamilies: ["template", "ha-runtime", "snippet"],
    requiredCapabilities: ["template-function-suggestions", "template-filter-suggestions", "entity-runtime-suggestions", "template-snippets"],
    rankingSignals: ["templateDelimiter", "functionPrefix", "filterPipe", "entityDomainPrefix", "yamlHostPath"],
    requiredFixtureTags: ["jinja2", "template", "runtime"],
    mustNotSurface: ["custom-card-types-before-template-functions", "css-selectors-before-template-filters"],
  }),
  freezeLaneContract({
    laneId: "css",
    providerFamilies: ["css", "card-mod", "snippet"],
    requiredCapabilities: ["css-property-suggestions", "css-selector-suggestions", "ha-css-variable-suggestions", "card-mod-selector-snippets"],
    rankingSignals: ["selectorContext", "propertyContext", "cssVariablePrefix", "cardModYamlPath", "styleBlockDepth"],
    requiredFixtureTags: ["css", "card-mod", "selector"],
    mustNotSurface: ["service-names-inside-css", "custom-card-types-inside-property-block"],
  }),
  freezeLaneContract({
    laneId: "javascript",
    providerFamilies: ["javascript", "ha-frontend", "snippet"],
    requiredCapabilities: ["button-card-template-symbols", "ha-frontend-symbols", "safe-js-snippets"],
    rankingSignals: ["tripleBracketTemplate", "identifierPrefix", "buttonCardYamlPath", "templateLiteralContext"],
    requiredFixtureTags: ["javascript", "button-card", "template"],
    mustNotSurface: ["yaml-card-keys-before-js-symbols", "css-selectors-before-js-symbols"],
  }),
  freezeLaneContract({
    laneId: "json",
    providerFamilies: ["json", "service-data", "integration", "snippet"],
    requiredCapabilities: ["json-key-suggestions", "json-value-suggestions", "service-data-object-shape", "integration-payload-snippets"],
    rankingSignals: ["jsonObjectDepth", "quotedKeyPrefix", "serviceDomain", "yamlHostPath"],
    requiredFixtureTags: ["json", "service", "payload"],
    mustNotSurface: ["unquoted-yaml-keys-inside-strict-json", "css-selector-snippets-inside-json"],
  }),
  freezeLaneContract({
    laneId: "markdown-html",
    providerFamilies: ["markdown", "html", "ha-elements", "snippet"],
    requiredCapabilities: ["markdown-snippets", "safe-html-element-suggestions", "ha-element-fragments"],
    rankingSignals: ["markdownBlockContext", "htmlTagPrefix", "yamlHostPath", "linkOrEmphasisContext"],
    requiredFixtureTags: ["markdown", "html", "content"],
    mustNotSurface: ["raw-service-list-before-markdown-snippets", "chart-card-yaml-keys-inside-markdown"],
  }),
]);

export const PROVIDER_CONTRACT_V2_REQUIRED_SURFACES = Object.freeze([
  "home-assistant-core",
  "card-mod",
  "mushroom",
  "button-card",
  "mini-graph-card",
  "apexcharts-card",
  "bubble-card",
  "browser-mod",
  "auto-entities",
  "layout-card",
  "stack-in-card",
  "swipe-card",
  "vertical-stack-in-card",
  "atomic-calendar-revive",
  "clock-weather-card",
  "uptime-card",
  "flex-table-card",
  "xiaomi-vacuum-map-card",
  "kiosk-mode",
  "better-thermostat-ui-card",
]);

export function getProviderContractV2Lane(laneId) {
  const normalized = String(laneId ?? "").trim().toLowerCase();
  return PROVIDER_CONTRACT_V2_LANES.find((lane) => lane.laneId === normalized) || null;
}

export function providerContractV2SurfacesForLane(laneId) {
  const lane = getLanguageLane(laneId);
  if (!lane) return Object.freeze([]);
  return providerSurfacesForLane(lane.id);
}

export function providerContractV2Readiness() {
  const catalog = hacsProviderCatalogStatus();
  const ranking = laneRankingFixtureStatus();
  const knownLaneContracts = PROVIDER_CONTRACT_V2_LANES.every((contract) => LANGUAGE_LANE_IDS.includes(contract.laneId));
  const requiredSurfacesPresent = PROVIDER_CONTRACT_V2_REQUIRED_SURFACES.every((surfaceId) => MAIN_PROVIDER_SURFACES.some((surface) => surface.id === surfaceId));
  const laneFixtureCoverage = PROVIDER_CONTRACT_V2_LANES.every((contract) => LANE_RANKING_FIXTURES.some((fixture) => fixture.expectedLaneIds.includes(contract.laneId) || fixture.laneId === contract.laneId));
  return Object.freeze({
    ok: knownLaneContracts && requiredSurfacesPresent && laneFixtureCoverage && catalog.ok && ranking.ok,
    stage: PROVIDER_CONTRACT_V2_STAGE,
    contractVersion: PROVIDER_CONTRACT_V2_VERSION,
    laneCount: PROVIDER_CONTRACT_V2_LANES.length,
    laneIds: PROVIDER_CONTRACT_V2_LANES.map((contract) => contract.laneId),
    requiredSurfaceIds: PROVIDER_CONTRACT_V2_REQUIRED_SURFACES.slice(),
    requiredSurfacesPresent,
    laneFixtureCoverage,
    catalog,
    ranking,
    registersProviders: false,
    drivesAutocomplete: false,
    opensPopup: false,
    insertsText: false,
    mutatesScoring: false,
  });
}
