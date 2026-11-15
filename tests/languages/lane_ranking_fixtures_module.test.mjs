import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LANE_RANKING_FIXTURE_STAGE,
  LANE_RANKING_FIXTURE_VERSION,
  LANE_RANKING_FIXTURES,
  laneRankingFixtureStatus,
  rankingFixturesForLane,
  rankingFixturesForSurface,
} from '../../src/languages/laneRankingFixtures.js';

test('lane ranking fixtures cover the main HACS surfaces without live behavior', () => {
  assert.equal(LANE_RANKING_FIXTURE_VERSION, 1);
  assert.equal(LANE_RANKING_FIXTURE_STAGE, 'lane-ranking-fixtures');
  assert.ok(LANE_RANKING_FIXTURES.length >= 8);

  const status = laneRankingFixtureStatus();
  assert.equal(status.ok, true);
  assert.equal(status.includesMainHacsSurfaces, true);
  assert.equal(status.drivesAutocomplete, false);
  assert.equal(status.registersProviders, false);
  assert.equal(status.opensPopup, false);
  assert.equal(status.insertsText, false);
});

test('ranking fixtures explicitly pin card-mod, mini-graph, apex, button-card, Mushroom, and browser_mod expectations', () => {
  assert.ok(rankingFixturesForSurface('card-mod').some((fixture) => fixture.id === 'css-card-mod-style-block'));
  assert.ok(rankingFixturesForSurface('mini-graph-card').some((fixture) => fixture.id === 'yaml-mini-graph-card-keys'));
  assert.ok(rankingFixturesForSurface('apexcharts-card').some((fixture) => fixture.id === 'yaml-apexcharts-card-series'));
  assert.ok(rankingFixturesForSurface('button-card').some((fixture) => fixture.id === 'javascript-button-card-template'));
  assert.ok(rankingFixturesForSurface('mushroom').some((fixture) => fixture.id === 'yaml-mushroom-template-card'));
  assert.ok(rankingFixturesForSurface('browser-mod').some((fixture) => fixture.id === 'yaml-browser-mod-service-call'));

  const yaml = rankingFixturesForLane('yaml');
  assert.ok(yaml.some((fixture) => fixture.expectedTopLabels.includes('custom:apexcharts-card')));
  assert.ok(yaml.some((fixture) => fixture.expectedTopLabels.includes('custom:mini-graph-card')));

  const css = rankingFixturesForLane('css');
  assert.ok(css.some((fixture) => fixture.expectedTopLabels.includes('ha-card { }')));

  const javascript = rankingFixturesForLane('javascript');
  assert.ok(javascript.some((fixture) => fixture.expectedTopLabels.includes('return')));
});

test('ranking fixtures include negative boundaries so lanes do not bleed into each other', () => {
  for (const fixture of LANE_RANKING_FIXTURES) {
    assert.ok(fixture.expectedTopLabels.length > 0, `${fixture.id} missing expected top labels`);
    assert.ok(fixture.forbiddenTopLabels.length > 0, `${fixture.id} missing forbidden labels`);
    assert.equal(Object.isFrozen(fixture.expectedTopLabels), true);
    assert.equal(Object.isFrozen(fixture.forbiddenTopLabels), true);
  }
});
