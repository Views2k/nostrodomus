import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDER_CONTRACT_V2_LANES,
  PROVIDER_CONTRACT_V2_REQUIRED_SURFACES,
  PROVIDER_CONTRACT_V2_STAGE,
  PROVIDER_CONTRACT_V2_VERSION,
  getProviderContractV2Lane,
  providerContractV2Readiness,
  providerContractV2SurfacesForLane,
} from '../../src/languages/providerContractV2.js';

test('Provider Contract v2 is a read-only lane-aware contract with all language lanes', () => {
  assert.equal(PROVIDER_CONTRACT_V2_VERSION, 1);
  assert.equal(PROVIDER_CONTRACT_V2_STAGE, 'provider-contract-v2');
  assert.deepEqual(PROVIDER_CONTRACT_V2_LANES.map((lane) => lane.laneId), ['yaml', 'jinja2', 'css', 'javascript', 'json', 'markdown-html']);

  const status = providerContractV2Readiness();
  assert.equal(status.ok, true);
  assert.equal(status.requiredSurfacesPresent, true);
  assert.equal(status.requiredSurfaceIds.length, 20);
  assert.equal(status.laneFixtureCoverage, true);
  assert.equal(status.registersProviders, false);
  assert.equal(status.drivesAutocomplete, false);
  assert.equal(status.opensPopup, false);
  assert.equal(status.insertsText, false);
  assert.equal(status.mutatesScoring, false);
});

test('Provider Contract v2 includes the main HACS and custom card surfaces', () => {
  for (const id of [
    'card-mod',
    'mushroom',
    'button-card',
    'mini-graph-card',
    'apexcharts-card',
    'bubble-card',
    'browser-mod',
    'auto-entities',
    'layout-card',
    'stack-in-card',
    'swipe-card',
    'vertical-stack-in-card',
    'atomic-calendar-revive',
    'clock-weather-card',
    'uptime-card',
    'flex-table-card',
    'xiaomi-vacuum-map-card',
    'kiosk-mode',
    'better-thermostat-ui-card',
  ]) {
    assert.ok(PROVIDER_CONTRACT_V2_REQUIRED_SURFACES.includes(id), `missing ${id}`);
  }

  const yamlSurfaces = providerContractV2SurfacesForLane('yaml').map((surface) => surface.id);
  assert.ok(yamlSurfaces.includes('mini-graph-card'));
  assert.ok(yamlSurfaces.includes('apexcharts-card'));
  assert.ok(yamlSurfaces.includes('browser-mod'));
  assert.ok(yamlSurfaces.includes('atomic-calendar-revive'));
  assert.ok(yamlSurfaces.includes('clock-weather-card'));
  assert.ok(yamlSurfaces.includes('better-thermostat-ui-card'));

  const cssSurfaces = providerContractV2SurfacesForLane('css').map((surface) => surface.id);
  assert.ok(cssSurfaces.includes('card-mod'));
  assert.ok(cssSurfaces.includes('vertical-stack-in-card'));
  assert.ok(cssSurfaces.includes('better-thermostat-ui-card'));

  const javascriptSurfaces = providerContractV2SurfacesForLane('javascript').map((surface) => surface.id);
  assert.ok(javascriptSurfaces.includes('button-card'));
  assert.ok(javascriptSurfaces.includes('flex-table-card'));
});

test('lane contracts define capabilities, ranking signals, and anti-bleed boundaries', () => {
  const yaml = getProviderContractV2Lane('yaml');
  assert.ok(yaml.providerFamilies.includes('hacs-card'));
  assert.ok(yaml.requiredCapabilities.includes('custom-card-type-suggestions'));
  assert.ok(yaml.rankingSignals.includes('detectedCardType'));
  assert.ok(yaml.mustNotSurface.includes('javascript-return-keywords-outside-js-template'));

  const css = getProviderContractV2Lane('css');
  assert.ok(css.providerFamilies.includes('card-mod'));
  assert.ok(css.requiredCapabilities.includes('ha-css-variable-suggestions'));
  assert.ok(css.mustNotSurface.includes('service-names-inside-css'));

  const js = getProviderContractV2Lane('javascript');
  assert.ok(js.providerFamilies.includes('ha-frontend'));
  assert.ok(js.requiredCapabilities.includes('button-card-template-symbols'));
});
