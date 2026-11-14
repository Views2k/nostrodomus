import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HACS_PROVIDER_CATALOG_STAGE,
  HACS_PROVIDER_CATALOG_VERSION,
  MAIN_PROVIDER_SURFACE_IDS,
  MAIN_PROVIDER_SURFACES,
  getProviderSurface,
  hacsProviderCatalogStatus,
  providerSurfacesForFamily,
  providerSurfacesForLane,
} from '../../src/providers/hacsProviderCatalog.js';

test('main provider catalog pins high-value Home Assistant and HACS surfaces without runtime wiring', () => {
  assert.equal(HACS_PROVIDER_CATALOG_VERSION, 1);
  assert.equal(HACS_PROVIDER_CATALOG_STAGE, 'priority10-provider-contract-v2-main-provider-catalog');

  for (const id of [
    'home-assistant-core',
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
    assert.ok(MAIN_PROVIDER_SURFACE_IDS.includes(id), `missing ${id}`);
    assert.ok(getProviderSurface(id), `lookup failed for ${id}`);
  }

  const status = hacsProviderCatalogStatus();
  assert.equal(status.ok, true);
  assert.equal(status.requiredSurfacesPresent, true);
  assert.equal(status.registersProviders, false);
  assert.equal(status.drivesAutocomplete, false);
  assert.equal(status.opensPopup, false);
  assert.equal(status.insertsText, false);
});

test('catalog lookups support lanes, families, aliases, and expected surface hints', () => {
  assert.equal(getProviderSurface('card_mod').id, 'card-mod');
  assert.equal(getProviderSurface('apex').id, 'apexcharts-card');
  assert.equal(getProviderSurface('mini graph').id, 'mini-graph-card');

  const yamlIds = providerSurfacesForLane('yaml').map((surface) => surface.id);
  assert.ok(yamlIds.includes('apexcharts-card'));
  assert.ok(yamlIds.includes('mini-graph-card'));
  assert.ok(yamlIds.includes('browser-mod'));

  const cssIds = providerSurfacesForLane('css').map((surface) => surface.id);
  assert.ok(cssIds.includes('card-mod'));
  assert.ok(cssIds.includes('button-card'));

  const chartIds = providerSurfacesForFamily('chart-card').map((surface) => surface.id);
  assert.ok(chartIds.includes('apexcharts-card'));
  assert.ok(chartIds.includes('mini-graph-card'));

  const calendarIds = providerSurfacesForFamily('calendar-card').map((surface) => surface.id);
  assert.deepEqual(calendarIds, ['atomic-calendar-revive']);

  const tableIds = providerSurfacesForFamily('table-card').map((surface) => surface.id);
  assert.deepEqual(tableIds, ['flex-table-card']);

  const mini = getProviderSurface('mini-graph-card');
  assert.ok(mini.cardTypes.includes('custom:mini-graph-card'));
  assert.ok(mini.yamlKeys.includes('hours_to_show'));

  const apex = getProviderSurface('apexcharts-card');
  assert.ok(apex.yamlKeys.includes('series'));
  assert.ok(apex.nestedKeys.includes('group_by'));

  const cardMod = getProviderSurface('card-mod');
  assert.ok(cardMod.lanes.includes('css'));
  assert.ok(cardMod.valueHints.includes('ha-card { }'));

  const verticalStack = getProviderSurface('custom:vertical-stack-in-card');
  assert.equal(verticalStack.id, 'vertical-stack-in-card');
  assert.ok(verticalStack.yamlKeys.includes('horizontal'));

  const clockWeather = getProviderSurface('clock-weather');
  assert.equal(clockWeather.id, 'clock-weather-card');
  assert.ok(clockWeather.yamlKeys.includes('forecast_rows'));

  const kiosk = getProviderSurface('kiosk mode');
  assert.equal(kiosk.id, 'kiosk-mode');
  assert.ok(kiosk.yamlKeys.includes('hide_sidebar'));
});

test('catalog entries stay frozen pure-data records', () => {
  const surface = MAIN_PROVIDER_SURFACES[0];
  assert.equal(Object.isFrozen(MAIN_PROVIDER_SURFACES), true);
  assert.equal(Object.isFrozen(surface), true);
  assert.equal(Object.isFrozen(surface.yamlKeys), true);
  assert.equal(typeof surface.priority, 'number');
  assert.ok(surface.priority > 0);
});


test('catalog surfaces carry schema-grade seed data and freshness metadata', () => {
  assert.equal(MAIN_PROVIDER_SURFACES.length, 38);
  for (const surface of MAIN_PROVIDER_SURFACES) {
    assert.ok(surface.id, 'surface id is required');
    assert.ok(surface.label, `${surface.id} label is required`);
    assert.ok(surface.lanes.length > 0, `${surface.id} lanes are required`);
    assert.ok(surface.providerFamilies.length > 0, `${surface.id} provider families are required`);
    assert.ok(surface.yamlKeys.length > 0, `${surface.id} yaml keys are required`);
    assert.ok(surface.detectionHints.length > 0, `${surface.id} detection hints are required`);
  }

  for (const id of MAIN_PROVIDER_SURFACE_IDS) {
    const surface = getProviderSurface(id);
    assert.ok(surface, `${id} should be in the catalog`);
    assert.match(surface.verifiedAt, /^\d{4}-\d{2}-\d{2}$/, `${id} should carry a verifiedAt date`);
    assert.ok(surface.upstreamVersion, `${id} should have upstreamVersion/freshness metadata`);
  }
});
