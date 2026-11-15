// Language fixture corpus.
//
// This module is contract/test data only. It is pure and does not read editor
// state, browser globals, Home Assistant data, storage, timers, or provider
// settings. Live autocomplete behavior does not depend on this corpus.

export const LANGUAGE_FIXTURE_CORPUS_VERSION = 1;
export const LANGUAGE_FIXTURE_CORPUS_STAGE = "fixture-detector-contract";
export const CURSOR_MARKER = "▮";

function freezeFixture(fixture) {
  return Object.freeze({
    ...fixture,
    yamlPath: Object.freeze([...(fixture.yamlPath || [])]),
    tags: Object.freeze([...(fixture.tags || [])]),
  });
}

export const LANGUAGE_FIXTURES = Object.freeze([
  freezeFixture({
    id: "yaml-service-action-positive",
    laneId: "yaml",
    expectation: "positive",
    description: "Host YAML service/action key with no embedded scalar evidence.",
    yamlPath: ["automation", "action", "0", "action"],
    scalarStyle: "plain",
    text: "action: light.turn_▮on",
    tags: ["host", "service", "action"],
  }),
  freezeFixture({
    id: "yaml-card-type-positive",
    laneId: "yaml",
    expectation: "positive",
    description: "Host YAML card type key remains YAML, not Markdown or JSON.",
    yamlPath: ["views", "0", "cards", "0", "type"],
    scalarStyle: "plain",
    text: "type: custom:mushroom-▮template-card",
    tags: ["host", "lovelace", "card"],
  }),
  freezeFixture({
    id: "yaml-ambiguous-plain-scalar",
    laneId: "yaml",
    expectation: "ambiguous",
    description: "Plain scalar with weak evidence must stay in YAML instead of guessing an embedded lane.",
    yamlPath: ["cards", "0", "name"],
    scalarStyle: "plain",
    text: "name: Kitchen ▮Status",
    tags: ["host", "ambiguous"],
  }),

  freezeFixture({
    id: "jinja-template-expression-positive",
    laneId: "jinja2",
    expectation: "positive",
    description: "Jinja expression delimiters inside a YAML scalar activate the Jinja2 lane.",
    yamlPath: ["cards", "0", "secondary"],
    scalarStyle: "folded",
    text: "secondary: >\n  {{ states('sensor.kitchen_▮temperature') }}",
    tags: ["embedded", "template", "expression"],
  }),
  freezeFixture({
    id: "jinja-template-block-positive",
    laneId: "jinja2",
    expectation: "positive",
    description: "Jinja block delimiters inside Markdown content activate the Jinja2 lane.",
    yamlPath: ["cards", "0", "content"],
    scalarStyle: "literal",
    text: "content: |\n  {% if is_state('binary_sensor.door', 'on') ▮%}Open{% endif %}",
    tags: ["embedded", "template", "block"],
  }),
  freezeFixture({
    id: "jinja-negative-double-brace-text",
    laneId: "yaml",
    expectation: "negative",
    description: "Unbalanced decorative braces are not enough to leave YAML.",
    yamlPath: ["cards", "0", "name"],
    scalarStyle: "plain",
    text: "name: Sensor {{ label ▮",
    tags: ["negative", "template"],
  }),

  freezeFixture({
    id: "css-card-mod-style-positive",
    laneId: "css",
    expectation: "positive",
    description: "card_mod style block scalar activates the CSS lane.",
    yamlPath: ["cards", "0", "card_mod", "style"],
    scalarStyle: "literal",
    text: "style: |\n  ha-card {\n    border-radius: 18▮px;\n  }",
    tags: ["embedded", "card_mod", "css"],
  }),
  freezeFixture({
    id: "css-theme-variable-positive",
    laneId: "css",
    expectation: "positive",
    description: "CSS custom properties inside card_mod remain CSS.",
    yamlPath: ["card_mod", "style"],
    scalarStyle: "literal",
    text: ":host {\n  --ha-card-background: rgba(0,0,0,0.▮35);\n}",
    tags: ["embedded", "css-variable"],
  }),
  freezeFixture({
    id: "css-negative-normal-style-name",
    laneId: "yaml",
    expectation: "negative",
    description: "A YAML key named style without block CSS evidence remains YAML.",
    yamlPath: ["cards", "0", "style"],
    scalarStyle: "plain",
    text: "style: horizontal ▮",
    tags: ["negative", "css"],
  }),

  freezeFixture({
    id: "javascript-button-card-template-positive",
    laneId: "javascript",
    expectation: "positive",
    description: "button-card triple-bracket template activates the JavaScript lane.",
    yamlPath: ["cards", "0", "name"],
    scalarStyle: "literal",
    text: "name: |\n  [[[ return entity.attributes.friendly_▮name; ]]]",
    tags: ["embedded", "button-card", "javascript"],
  }),
  freezeFixture({
    id: "javascript-button-card-label-positive",
    laneId: "javascript",
    expectation: "positive",
    description: "button-card label JS template remains JavaScript.",
    yamlPath: ["cards", "0", "label"],
    scalarStyle: "literal",
    text: "label: |\n  [[[ const v = states['sensor.temp'].state; return `${v}°▮`; ]]]",
    tags: ["embedded", "template-literal"],
  }),
  freezeFixture({
    id: "javascript-negative-brackets-in-markdown",
    laneId: "markdown-html",
    expectation: "negative",
    description: "Markdown link brackets are not JavaScript template evidence.",
    yamlPath: ["cards", "0", "content"],
    scalarStyle: "literal",
    text: "content: |\n  [Open dashboard▮](https://example.invalid)",
    tags: ["negative", "markdown"],
  }),

  freezeFixture({
    id: "json-service-data-positive",
    laneId: "json",
    expectation: "positive",
    description: "JSON-shaped service data object activates the JSON lane.",
    yamlPath: ["sequence", "0", "data"],
    scalarStyle: "plain",
    text: "data: {\"brightness_pct\": 45, \"transition\": ▮1}",
    tags: ["embedded", "service-data", "json"],
  }),
  freezeFixture({
    id: "json-manifest-object-positive",
    laneId: "json",
    expectation: "positive",
    description: "Manifest-like inline object activates the JSON lane.",
    yamlPath: ["custom_fields", "payload"],
    scalarStyle: "plain",
    text: "payload: {\"type\": \"call_service\", \"domain\": \"light▮\"}",
    tags: ["embedded", "json-object"],
  }),
  freezeFixture({
    id: "json-negative-yaml-flow-list",
    laneId: "yaml",
    expectation: "negative",
    description: "YAML flow lists are not JSON without key/value object evidence.",
    yamlPath: ["entity_id"],
    scalarStyle: "plain",
    text: "entity_id: [light.kitchen, light.hall▮]",
    tags: ["negative", "yaml-flow"],
  }),

  freezeFixture({
    id: "markdown-content-positive",
    laneId: "markdown-html",
    expectation: "positive",
    description: "Markdown card content activates the Markdown/HTML lane.",
    yamlPath: ["cards", "0", "content"],
    scalarStyle: "literal",
    text: "content: |\n  ## Kitchen\n  Tap **lights▮** for controls.",
    tags: ["embedded", "markdown"],
  }),
  freezeFixture({
    id: "markdown-ha-element-positive",
    laneId: "markdown-html",
    expectation: "positive",
    description: "Safe Home Assistant element markup inside Markdown activates Markdown/HTML.",
    yamlPath: ["cards", "0", "content"],
    scalarStyle: "literal",
    text: "content: |\n  <ha-icon icon=\"mdi:lightbulb▮\"></ha-icon>",
    tags: ["embedded", "html", "ha-element"],
  }),
  freezeFixture({
    id: "markdown-negative-yaml-icon",
    laneId: "yaml",
    expectation: "negative",
    description: "YAML icon values are not Markdown/HTML.",
    yamlPath: ["cards", "0", "icon"],
    scalarStyle: "plain",
    text: "icon: mdi:lightbulb-▮on",
    tags: ["negative", "markdown"],
  }),
]);

const LANGUAGE_FIXTURE_IDS = Object.freeze(LANGUAGE_FIXTURES.map((fixture) => fixture.id));

export function languageFixtureCursorOffset(fixture) {
  const text = String(fixture?.text ?? "");
  return text.indexOf(CURSOR_MARKER);
}

export function languageFixtureTextWithoutCursor(fixture) {
  return String(fixture?.text ?? "").replace(CURSOR_MARKER, "");
}

export function getLanguageFixture(id) {
  const normalized = String(id ?? "").trim();
  return LANGUAGE_FIXTURES.find((fixture) => fixture.id === normalized) || null;
}

export function fixturesForLanguageLane(laneId) {
  const normalized = String(laneId ?? "").trim().toLowerCase();
  return Object.freeze(LANGUAGE_FIXTURES.filter((fixture) => fixture.laneId === normalized));
}

export function languageFixtureCorpusStatus() {
  const byLane = Object.create(null);
  const byExpectation = Object.create(null);
  for (const fixture of LANGUAGE_FIXTURES) {
    byLane[fixture.laneId] = (byLane[fixture.laneId] || 0) + 1;
    byExpectation[fixture.expectation] = (byExpectation[fixture.expectation] || 0) + 1;
  }
  return Object.freeze({
    ok: true,
    stage: LANGUAGE_FIXTURE_CORPUS_STAGE,
    corpusVersion: LANGUAGE_FIXTURE_CORPUS_VERSION,
    fixtureCount: LANGUAGE_FIXTURES.length,
    fixtureIds: LANGUAGE_FIXTURE_IDS.slice(),
    byLane: Object.freeze({ ...byLane }),
    byExpectation: Object.freeze({ ...byExpectation }),
    runtimeBehavior: "unchanged",
    drivesAutocomplete: false,
  });
}
