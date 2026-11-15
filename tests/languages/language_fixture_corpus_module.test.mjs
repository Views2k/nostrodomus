import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURSOR_MARKER,
  LANGUAGE_FIXTURE_CORPUS_STAGE,
  LANGUAGE_FIXTURE_CORPUS_VERSION,
  LANGUAGE_FIXTURES,
  getLanguageFixture,
  fixturesForLanguageLane,
  languageFixtureCorpusStatus,
  languageFixtureCursorOffset,
  languageFixtureTextWithoutCursor,
} from '../../src/languages/languageFixtures.js';

const LANE_IDS = ['yaml', 'jinja2', 'css', 'javascript', 'json', 'markdown-html'];

test('language fixture corpus covers every language lane with positive and guardrail examples', () => {
  assert.equal(LANGUAGE_FIXTURE_CORPUS_VERSION, 1);
  assert.equal(LANGUAGE_FIXTURE_CORPUS_STAGE, 'fixture-detector-contract');
  assert.equal(LANGUAGE_FIXTURES.length, 18);

  for (const lane of LANE_IDS) {
    const fixtures = fixturesForLanguageLane(lane);
    assert.ok(fixtures.length >= 2, `${lane} has fixture coverage`);
  }

  const expectations = new Set(LANGUAGE_FIXTURES.map((fixture) => fixture.expectation));
  assert.ok(expectations.has('positive'));
  assert.ok(expectations.has('negative'));
  assert.ok(expectations.has('ambiguous'));
});

test('fixtures carry exactly one cursor marker and stable lookup helpers', () => {
  const seen = new Set();
  for (const fixture of LANGUAGE_FIXTURES) {
    assert.equal(typeof fixture.id, 'string');
    assert.equal(seen.has(fixture.id), false, `duplicate fixture id ${fixture.id}`);
    seen.add(fixture.id);
    assert.equal((fixture.text.match(new RegExp(CURSOR_MARKER, 'g')) || []).length, 1, fixture.id);
    assert.ok(languageFixtureCursorOffset(fixture) >= 0, fixture.id);
    assert.equal(languageFixtureTextWithoutCursor(fixture).includes(CURSOR_MARKER), false, fixture.id);
    assert.ok(Object.isFrozen(fixture.yamlPath), fixture.id);
    assert.ok(Object.isFrozen(fixture.tags), fixture.id);
  }

  assert.equal(getLanguageFixture('css-card-mod-style-positive')?.laneId, 'css');
  assert.equal(getLanguageFixture('missing-fixture'), null);
});

test('fixture corpus status is read-only and explicit about unchanged runtime behavior', () => {
  const status = languageFixtureCorpusStatus();
  assert.equal(status.ok, true);
  assert.equal(status.stage, 'fixture-detector-contract');
  assert.equal(status.fixtureCount, 18);
  assert.equal(status.byLane.yaml, 7);
  assert.equal(status.byLane.jinja2, 2);
  assert.equal(status.byLane.css, 2);
  assert.equal(status.byLane.javascript, 2);
  assert.equal(status.byLane.json, 2);
  assert.equal(status.byLane['markdown-html'], 3);
  assert.equal(status.runtimeBehavior, 'unchanged');
  assert.equal(status.drivesAutocomplete, false);
});
