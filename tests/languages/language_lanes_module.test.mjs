import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LANGUAGE_ENGINE_DESIGN_VERSION,
  LANGUAGE_ENGINE_STAGE,
  LANGUAGE_LANES,
  LANGUAGE_LANE_IDS,
  getLanguageLane,
  isKnownLanguageLane,
  languageLaneRegistryStatus,
  normalizeLanguageLaneId,
} from '../../src/languages/languageLanes.js';

test('language lane registry exposes the six language lanes without runtime behavior', () => {
  assert.equal(LANGUAGE_ENGINE_DESIGN_VERSION, 1);
  assert.equal(LANGUAGE_ENGINE_STAGE, 'language-lanes');
  assert.deepEqual(LANGUAGE_LANE_IDS, ['yaml', 'jinja2', 'css', 'javascript', 'json', 'markdown-html']);
  assert.equal(LANGUAGE_LANES.length, 6);
  assert.equal(LANGUAGE_LANES[0].role, 'host');
  assert.equal(LANGUAGE_LANES[0].embedded, false);
  assert.equal(LANGUAGE_LANES.slice(1).every((lane) => lane.embedded === true), true);
});

test('language lane helpers normalize ids and avoid fallback guessing', () => {
  assert.equal(normalizeLanguageLaneId(' CSS '), 'css');
  assert.equal(getLanguageLane('JINJA2')?.fixtureGroup, 'jinja-template');
  assert.equal(getLanguageLane('markdown-html')?.label, 'Markdown / HTML');
  assert.equal(isKnownLanguageLane('yaml'), true);
  assert.equal(isKnownLanguageLane('unknown'), false);
  assert.equal(getLanguageLane('unknown'), null);
});

test('language lane registry status is explicit about observe-only behavior', () => {
  const status = languageLaneRegistryStatus();
  assert.equal(status.ok, true);
  assert.equal(status.stage, 'language-lanes');
  assert.equal(status.laneCount, 6);
  assert.deepEqual(status.laneIds, LANGUAGE_LANE_IDS);
  assert.equal(status.runtimeBehavior, 'unchanged');
  assert.equal(status.registersProviders, false);
  assert.equal(status.drivesAutocomplete, false);
  assert.equal(status.opensPopup, false);
  assert.equal(status.insertsText, false);
});
