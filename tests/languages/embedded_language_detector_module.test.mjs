import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMBEDDED_LANGUAGE_DETECTOR_STAGE,
  EMBEDDED_LANGUAGE_DETECTOR_VERSION,
  detectEmbeddedLanguage,
  detectLanguageFixture,
  embeddedLanguageDetectorImplementationStatus,
} from '../../src/languages/embeddedLanguageDetector.js';
import { getLanguageFixture } from '../../src/languages/languageFixtures.js';

const fixtureIds = [
  ['yaml-ambiguous-plain-scalar', 'yaml'],
  ['jinja-template-expression-positive', 'jinja2'],
  ['css-card-mod-style-positive', 'css'],
  ['javascript-button-card-template-positive', 'javascript'],
  ['json-service-data-positive', 'json'],
  ['markdown-content-positive', 'markdown-html'],
];

test('observe-only detector reports status without driving autocomplete', () => {
  assert.equal(EMBEDDED_LANGUAGE_DETECTOR_VERSION, 1);
  assert.equal(EMBEDDED_LANGUAGE_DETECTOR_STAGE, 'priority10-observe-only-embedded-language-detector');

  const status = embeddedLanguageDetectorImplementationStatus();
  assert.equal(status.ok, true);
  assert.equal(status.observeOnly, true);
  assert.equal(status.registersProviders, false);
  assert.equal(status.drivesAutocomplete, false);
  assert.equal(status.opensPopup, false);
  assert.equal(status.insertsText, false);
  assert.equal(status.mutatesScoring, false);
  assert.ok(status.fixtureCount >= 18);
  assert.ok(status.rankingFixtureCount >= 10);
  assert.equal(status.failing, 0);
});

test('observe-only detector classifies fixture lanes conservatively', () => {
  for (const [id, laneId] of fixtureIds) {
    const result = detectLanguageFixture(getLanguageFixture(id));
    assert.equal(result.ok, true, id);
    assert.equal(result.actualLaneId, laneId, id);
    assert.equal(result.result.drivesAutocomplete, false, id);
  }
});

test('observe-only detector handles partial cursor contexts before live routing', () => {
  assert.equal(detectEmbeddedLanguage({
    yamlPath: ['cards', '0', 'secondary'],
    scalarStyle: 'folded',
    text: "secondary: >\n  {{ states('sensor.kitchen_▮",
  }).laneId, 'jinja2');

  assert.equal(detectEmbeddedLanguage({
    yamlPath: ['cards', '0', 'card_mod', 'style'],
    scalarStyle: 'literal',
    text: 'style: |\n  ha-card {\n    border-radius: 18▮px;\n  }',
  }).laneId, 'css');

  assert.equal(detectEmbeddedLanguage({
    yamlPath: ['cards', '0', 'label'],
    scalarStyle: 'literal',
    text: "label: |\n  [[[ return entity.state ▮",
  }).laneId, 'javascript');

  assert.equal(detectEmbeddedLanguage({
    yamlPath: ['actions', '0', 'data'],
    scalarStyle: 'plain',
    text: 'data: {"title": "Kitchen", "content": {▮}}',
  }).laneId, 'json');
});

