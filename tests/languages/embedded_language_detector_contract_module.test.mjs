import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMBEDDED_LANGUAGE_DETECTOR_CONTRACT_VERSION,
  EMBEDDED_LANGUAGE_DETECTOR_STAGE,
  EMBEDDED_LANGUAGE_EVIDENCE_ORDER,
  classifyEmbeddedLanguageSnapshot,
  classifyLanguageFixture,
  embeddedLanguageDetectorContractStatus,
} from '../../src/languages/embeddedLanguageDetectorContract.js';
import { LANGUAGE_FIXTURES, getLanguageFixture } from '../../src/languages/languageFixtures.js';

test('embedded language detector contract classifies the fixture corpus without live runtime wiring', () => {
  assert.equal(EMBEDDED_LANGUAGE_DETECTOR_CONTRACT_VERSION, 1);
  assert.equal(EMBEDDED_LANGUAGE_DETECTOR_STAGE, 'priority10-fixture-detector-contract');
  assert.ok(EMBEDDED_LANGUAGE_EVIDENCE_ORDER.includes('weak-evidence-stays-yaml'));

  const status = embeddedLanguageDetectorContractStatus();
  assert.equal(status.ok, true);
  assert.equal(status.fixtureCount, LANGUAGE_FIXTURES.length);
  assert.equal(status.passing, LANGUAGE_FIXTURES.length);
  assert.equal(status.failing, 0);
  assert.equal(status.registersProviders, false);
  assert.equal(status.drivesAutocomplete, false);
  assert.equal(status.opensPopup, false);
  assert.equal(status.insertsText, false);
});

test('detector contract uses evidence order and avoids weak guessing', () => {
  assert.equal(classifyLanguageFixture(getLanguageFixture('jinja-template-expression-positive')).laneId, 'jinja2');
  assert.equal(classifyLanguageFixture(getLanguageFixture('css-card-mod-style-positive')).laneId, 'css');
  assert.equal(classifyLanguageFixture(getLanguageFixture('javascript-button-card-template-positive')).laneId, 'javascript');
  assert.equal(classifyLanguageFixture(getLanguageFixture('json-service-data-positive')).laneId, 'json');
  assert.equal(classifyLanguageFixture(getLanguageFixture('markdown-content-positive')).laneId, 'markdown-html');
  assert.equal(classifyLanguageFixture(getLanguageFixture('yaml-ambiguous-plain-scalar')).laneId, 'yaml');
  assert.equal(classifyLanguageFixture(getLanguageFixture('jinja-negative-double-brace-text')).laneId, 'yaml');
});

test('snapshot classifier is pure data-in/data-out and has conservative fallback', () => {
  const css = classifyEmbeddedLanguageSnapshot({
    yamlPath: ['card_mod', 'style'],
    scalarStyle: 'literal',
    text: 'ha-card { color: var(--primary-text-color); }',
  });
  assert.equal(css.laneId, 'css');
  assert.equal(css.source, 'priority10-contract-only');
  assert.equal(css.drivesAutocomplete, false);

  const weak = classifyEmbeddedLanguageSnapshot({
    yamlPath: ['cards', '0', 'name'],
    scalarStyle: 'plain',
    text: 'Kitchen [not enough evidence',
  });
  assert.equal(weak.laneId, 'yaml');
  assert.equal(weak.evidence, 'weak-evidence-stays-yaml');
});
