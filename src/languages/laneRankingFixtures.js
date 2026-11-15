// Per-lane ranking fixture contract.
//
// Contract/fixture data only. These cases describe expected provider/ranking
// behavior for lane-aware autocomplete. They do not drive live scoring,
// provider registration, popup rendering, or insertion behavior.

export const LANE_RANKING_FIXTURE_VERSION = 1;
export const LANE_RANKING_FIXTURE_STAGE = "lane-ranking-fixtures";

function freezeRankingFixture(fixture) {
  return Object.freeze({
    ...fixture,
    yamlPath: Object.freeze([...(fixture.yamlPath || [])]),
    expectedLaneIds: Object.freeze([...(fixture.expectedLaneIds || [])]),
    expectedProviderFamilies: Object.freeze([...(fixture.expectedProviderFamilies || [])]),
    expectedSurfaceIds: Object.freeze([...(fixture.expectedSurfaceIds || [])]),
    expectedTopLabels: Object.freeze([...(fixture.expectedTopLabels || [])]),
    forbiddenTopLabels: Object.freeze([...(fixture.forbiddenTopLabels || [])]),
    tags: Object.freeze([...(fixture.tags || [])]),
  });
}

export const LANE_RANKING_FIXTURES = Object.freeze([
  freezeRankingFixture({
    id: "yaml-lovelace-custom-card-types",
    laneId: "yaml",
    description: "Custom card type values should surface core/HACS card types before generic scalar snippets.",
    yamlPath: ["views", "0", "cards", "0", "type"],
    text: "type: custom:▮",
    expectedLaneIds: ["yaml"],
    expectedProviderFamilies: ["hacs-card", "lovelace-context", "snippet"],
    expectedSurfaceIds: ["apexcharts-card", "mini-graph-card", "mushroom", "button-card", "bubble-card", "layout-card", "auto-entities"],
    expectedTopLabels: ["custom:apexcharts-card", "custom:mini-graph-card", "custom:mushroom-template-card", "custom:button-card", "custom:bubble-card"],
    forbiddenTopLabels: ["return", "ha-card { }", "states("],
    tags: ["yaml", "lovelace", "hacs-card-type"],
  }),
  freezeRankingFixture({
    id: "css-card-mod-style-block",
    laneId: "css",
    description: "card_mod style blocks should prioritize CSS/card-mod selectors, variables, and snippets.",
    yamlPath: ["cards", "0", "card_mod", "style"],
    text: "style: |\n  ha-card {\n    ▮\n  }",
    expectedLaneIds: ["css"],
    expectedProviderFamilies: ["card-mod", "css", "snippet"],
    expectedSurfaceIds: ["card-mod"],
    expectedTopLabels: ["ha-card { }", ":host { }", "--ha-card-background", "border-radius", "backdrop-filter"],
    forbiddenTopLabels: ["custom:apexcharts-card", "light.turn_on", "return entity"],
    tags: ["css", "card-mod", "selector"],
  }),
  freezeRankingFixture({
    id: "yaml-mini-graph-card-keys",
    laneId: "yaml",
    description: "mini-graph-card config should prioritize its chart keys and entity history patterns.",
    yamlPath: ["cards", "0"],
    text: "type: custom:mini-graph-card\n▮",
    expectedLaneIds: ["yaml"],
    expectedProviderFamilies: ["hacs-card", "chart-card", "snippet"],
    expectedSurfaceIds: ["mini-graph-card"],
    expectedTopLabels: ["entities", "hours_to_show", "points_per_hour", "line_width", "color_thresholds", "show"],
    forbiddenTopLabels: ["apex_config", "return", "card_type"],
    tags: ["yaml", "mini-graph", "chart"],
  }),
  freezeRankingFixture({
    id: "yaml-apexcharts-card-series",
    laneId: "yaml",
    description: "apexcharts-card series contexts should prioritize series/apex_config/yaxis keys.",
    yamlPath: ["cards", "0", "series", "0"],
    text: "type: custom:apexcharts-card\nseries:\n  - entity: sensor.power\n    ▮",
    expectedLaneIds: ["yaml"],
    expectedProviderFamilies: ["hacs-card", "chart-card", "snippet"],
    expectedSurfaceIds: ["apexcharts-card"],
    expectedTopLabels: ["entity", "name", "type", "group_by", "apex_config", "yaxis"],
    forbiddenTopLabels: ["card_type", "ha-card { }", "custom:mini-graph-card"],
    tags: ["yaml", "apexcharts", "chart"],
  }),
  freezeRankingFixture({
    id: "yaml-mushroom-template-card",
    laneId: "yaml",
    description: "Mushroom template cards should keep entity/template/action keys prominent.",
    yamlPath: ["cards", "0"],
    text: "type: custom:mushroom-template-card\nentity: light.kitchen\n▮",
    expectedLaneIds: ["yaml", "jinja2", "css"],
    expectedProviderFamilies: ["hacs-card", "template-card", "card-mod", "snippet"],
    expectedSurfaceIds: ["mushroom", "card-mod"],
    expectedTopLabels: ["primary", "secondary", "icon", "icon_color", "tap_action", "card_mod"],
    forbiddenTopLabels: ["apex_config", "slidesPerView", "data_generator"],
    tags: ["yaml", "mushroom", "template-card"],
  }),
  freezeRankingFixture({
    id: "javascript-button-card-template",
    laneId: "javascript",
    description: "button-card triple-bracket templates should prioritize JS/HA frontend symbols over YAML card keys.",
    yamlPath: ["cards", "0", "label"],
    text: "label: |\n  [[[ const value = states['sensor.temp'].state; ▮ ]]]",
    expectedLaneIds: ["javascript"],
    expectedProviderFamilies: ["javascript", "ha-frontend", "snippet"],
    expectedSurfaceIds: ["button-card"],
    expectedTopLabels: ["return", "entity", "states", "hass", "variables", "Number()"],
    forbiddenTopLabels: ["custom:mini-graph-card", "ha-card { }", "service"],
    tags: ["javascript", "button-card", "template"],
  }),
  freezeRankingFixture({
    id: "jinja-template-expression",
    laneId: "jinja2",
    description: "Template expressions should prioritize HA template helpers, filters, and entity runtime values.",
    yamlPath: ["cards", "0", "secondary"],
    text: "secondary: >\n  {{ states('sensor.kitchen_▮') }}",
    expectedLaneIds: ["jinja2"],
    expectedProviderFamilies: ["template", "ha-runtime", "snippet"],
    expectedSurfaceIds: ["home-assistant-core", "mushroom"],
    expectedTopLabels: ["states(", "is_state(", "state_attr(", "| float", "| default"],
    forbiddenTopLabels: ["custom:apexcharts-card", "ha-card { }", "slidesPerView"],
    tags: ["jinja2", "template", "runtime"],
  }),
  freezeRankingFixture({
    id: "json-browser-mod-popup-payload",
    laneId: "json",
    description: "JSON service payload objects should prioritize strict quoted keys and browser_mod popup payload shape.",
    yamlPath: ["actions", "0", "data"],
    text: "data: {\"title\": \"Kitchen\", \"content\": {▮}}",
    expectedLaneIds: ["json"],
    expectedProviderFamilies: ["json", "service-data", "integration", "snippet"],
    expectedSurfaceIds: ["browser-mod", "home-assistant-core"],
    expectedTopLabels: ["\"title\"", "\"content\"", "\"card\"", "\"dismissable\"", "\"autoclose\""],
    forbiddenTopLabels: ["ha-card { }", "custom:apexcharts-card", "return"],
    tags: ["json", "service", "payload"],
  }),
  freezeRankingFixture({
    id: "markdown-html-card-content",
    laneId: "markdown-html",
    description: "Markdown card content should prioritize markdown/html-safe fragments instead of YAML card schemas.",
    yamlPath: ["cards", "0", "content"],
    text: "content: |\n  ## Kitchen\n  <ha-icon icon=\"mdi:lightbulb\"></ha-icon> ▮",
    expectedLaneIds: ["markdown-html"],
    expectedProviderFamilies: ["markdown", "html", "ha-elements", "snippet"],
    expectedSurfaceIds: ["home-assistant-core"],
    expectedTopLabels: ["**bold**", "[link](url)", "<ha-icon>", "<ha-alert>", "<br>"],
    forbiddenTopLabels: ["custom:mini-graph-card", "series", "border-radius"],
    tags: ["markdown", "html", "content"],
  }),
  freezeRankingFixture({
    id: "yaml-browser-mod-service-call",
    laneId: "yaml",
    description: "browser_mod service/action contexts should prioritize browser_mod services and popup schema.",
    yamlPath: ["actions", "0", "service"],
    text: "service: browser_mod.▮",
    expectedLaneIds: ["yaml", "json"],
    expectedProviderFamilies: ["ha-service", "integration", "snippet"],
    expectedSurfaceIds: ["browser-mod"],
    expectedTopLabels: ["browser_mod.popup", "browser_mod.close_popup", "browser_mod.navigate", "browser_mod.refresh", "fire-dom-event"],
    forbiddenTopLabels: ["custom:mushroom-template-card", "border-radius", "series"],
    tags: ["yaml", "browser_mod", "service"],
  }),
]);

const LANE_RANKING_FIXTURE_IDS = Object.freeze(LANE_RANKING_FIXTURES.map((fixture) => fixture.id));

export function rankingFixturesForLane(laneId) {
  const normalized = String(laneId ?? "").trim().toLowerCase();
  return Object.freeze(LANE_RANKING_FIXTURES.filter((fixture) => fixture.laneId === normalized));
}

export function rankingFixturesForSurface(surfaceId) {
  const normalized = String(surfaceId ?? "").trim().toLowerCase();
  return Object.freeze(LANE_RANKING_FIXTURES.filter((fixture) => fixture.expectedSurfaceIds.includes(normalized)));
}

export function laneRankingFixtureStatus() {
  const byLane = Object.create(null);
  const surfaces = new Set();
  for (const fixture of LANE_RANKING_FIXTURES) {
    byLane[fixture.laneId] = (byLane[fixture.laneId] || 0) + 1;
    fixture.expectedSurfaceIds.forEach((surface) => surfaces.add(surface));
  }
  return Object.freeze({
    ok: true,
    stage: LANE_RANKING_FIXTURE_STAGE,
    fixtureVersion: LANE_RANKING_FIXTURE_VERSION,
    fixtureCount: LANE_RANKING_FIXTURES.length,
    fixtureIds: LANE_RANKING_FIXTURE_IDS.slice(),
    byLane: Object.freeze({ ...byLane }),
    surfaceIds: Object.freeze([...surfaces].sort()),
    includesMainHacsSurfaces: ["card-mod", "mini-graph-card", "apexcharts-card"].every((surface) => surfaces.has(surface)),
    drivesAutocomplete: false,
    registersProviders: false,
    opensPopup: false,
    insertsText: false,
  });
}
