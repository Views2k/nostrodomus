import test from 'node:test';
import assert from 'node:assert/strict';

import { createProviderRuntime } from '../../src/providers/providerRuntime.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { isServiceDataFieldKeyContext, scoreItems } from '../../src/completion/scoring.js';
import { cloneDefaultSettings } from '../../src/core/settings.js';
import { makeHassFixture } from '../fixtures/hassFixture.mjs';

// Ranking contract for the headline lanes, asserted through the REAL pipeline
// (context detection + all six providers + scoring) with the SHIPPED default
// settings. Assertions state INTENDED behavior (user-usefulness), never recorded
// output: expectedTop / mustRankAbove / mustIncludeTopN by label — no full-order
// pins, and alias-fuzzy incidentals are deliberately not encoded.
//
// Contract: when the cursor is in a lane one provider exists to serve (a service
// data: field key), that provider's rows lead the lane at the same match tier;
// generic rows are reordered below, never removed. At root, the generic card-key
// lane IS the context lane and keeps winning.
const ENGINE_VARIANTS = [
  ['default', {}],
  // The between-provider contract is identical with the engine on: dpFuzzy sorts
  // after providerRank, so the lane lead cannot depend on the flag.
  ['engine-on', { engineV2: true, dpRanking: true }],
];

function buildPipeline(hass, completions) {
  const settings = cloneDefaultSettings();
  Object.assign(settings.completions ||= {}, completions);
  const state = { settings };
  const runtime = createProviderRuntime({
    state,
    window: { hass, localStorage: { getItem: () => null } },
    now: () => 1_000,
  });
  return { runtime, settings };
}

let salt = 0;
async function scoredLabels(pipeline, doc, triggerKind = 'typing') {
  await pipeline.runtime.loadLibrary();
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind, settings: pipeline.settings });
  const rows = scoreItems(ctx, {
    providerCandidates: c => pipeline.runtime.providerCandidates(c),
    settings: pipeline.settings,
    cacheSalt: `contract-${salt += 1}`,
  });
  return { rows, labels: rows.map(row => row?.label ?? String(row)) };
}

function expectedTop(labels, label, why) {
  assert.equal(labels[0], label, `${why} (top was ${JSON.stringify(labels.slice(0, 5))})`);
}

function mustRankAbove(labels, above, below, why) {
  const a = labels.indexOf(above);
  const b = labels.indexOf(below);
  assert.ok(a >= 0, `${above} must be offered (${why})`);
  if (b >= 0) assert.ok(a < b, `${above} must rank above ${below} (${why}); got ${a} vs ${b}`);
}

function mustIncludeTopN(labels, label, n, why) {
  const index = labels.indexOf(label);
  assert.ok(index >= 0 && index < n, `${label} must sit inside the top ${n} (${why}); got index ${index}`);
}

test('the lane predicate mirrors the provider gate: key/blank roles under a data leaf, never value positions', () => {
  const base = { lang: 'yaml', yamlRole: 'key', valueKind: '', yamlPath: ['tap_action', 'data'] };
  assert.equal(isServiceDataFieldKeyContext(base), true);
  assert.equal(isServiceDataFieldKeyContext({ ...base, yamlRole: 'blank' }), true);
  assert.equal(isServiceDataFieldKeyContext({ ...base, yamlPath: ['service_data'] }), true);
  // Defensive guards, unreachable through the live adapter but part of the contract:
  // a kind-bearing ctx is a VALUE position and must never take the key lane.
  assert.equal(isServiceDataFieldKeyContext({ ...base, valueKind: 'entity' }), false);
  assert.equal(isServiceDataFieldKeyContext({ ...base, yamlRole: 'value' }), false);
  assert.equal(isServiceDataFieldKeyContext({ ...base, lang: 'jinja' }), false);
  assert.equal(isServiceDataFieldKeyContext({ ...base, yamlPath: ['data', 'rgb_color'] }), false);
});

const AUTOMATION_TR = 'actions:\n  - action: light.turn_on\n    data:\n      brightness_pct: 50\n      tr';
const CARD_TR = 'type: custom:button-card\ntap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    brightness_pct: 50\n    tr';
const AUTOMATION_BLANK = 'actions:\n  - action: light.turn_on\n    data:\n      ';
const CARD_BLANK = 'type: custom:button-card\ntap_action:\n  action: call-service\n  service: light.turn_on\n  data:\n    ';
const LIGHT_FIELDS = ['transition:', 'brightness_pct:', 'rgb_color:', 'effect:'];
const AUTOMATION_TARGET_AR = 'actions:\n  - action: light.turn_on\n    target:\n      entity_id: light.kitchen\n      ar';
const AUTOMATION_TARGET_BLANK = 'actions:\n  - action: light.turn_on\n    target:\n      ';
const CARD_TARGET_AR = 'type: custom:button-card\ntap_action:\n  action: perform-action\n  perform_action: light.turn_on\n  target:\n    entity_id: light.kitchen\n    ar';
const CARD_TARGET_BLANK = 'type: custom:button-card\ntap_action:\n  action: perform-action\n  perform_action: light.turn_on\n  target:\n    ';
const TARGET_KEYS = ['entity_id:', 'device_id:', 'area_id:'];

for (const [variant, completions] of ENGINE_VARIANTS) {
  test(`[${variant}] data-field lane: the typed second field leads over generic keys`, async () => {
    const pipeline = buildPipeline(makeHassFixture(), completions);
    const automation = await scoredLabels(pipeline, AUTOMATION_TR);
    expectedTop(automation.labels, 'transition:', 'the service field is the context row in its own data block');
    mustRankAbove(automation.labels, 'transition:', 'wait_for_trigger:', 'wrong-lane keys rank below whenever a provider still serves them');

    const card = await scoredLabels(pipeline, CARD_TR);
    expectedTop(card.labels, 'transition:', 'catalog card keys must not outrank the service field');
    mustRankAbove(card.labels, 'transition:', 'triggers_update:', 'catalog priority yields inside the field lane');
  });

  test(`[${variant}] data-field lane: a blank first field surfaces the whole field set`, async () => {
    const pipeline = buildPipeline(makeHassFixture(), completions);
    const topN = pipeline.settings.maxItems;
    for (const doc of [AUTOMATION_BLANK, CARD_BLANK]) {
      const { labels } = await scoredLabels(pipeline, doc, 'explicit');
      for (const field of LIGHT_FIELDS) {
        mustIncludeTopN(labels, field, topN, 'the popup must show the service fields on open');
      }
    }
  });

  test(`[${variant}] data-field lane: required fields lead the surfaced lane`, async () => {
    const hass = makeHassFixture({
      services: {
        vacuum: {
          send_command: {
            fields: {
              aaa_params: { selector: { object: {} } },
              zzz_command: { required: true, selector: { text: {} } },
            },
          },
        },
      },
    });
    const pipeline = buildPipeline(hass, completions);
    const doc = 'actions:\n  - action: vacuum.send_command\n    data:\n      ';
    const { labels } = await scoredLabels(pipeline, doc, 'explicit');
    mustIncludeTopN(labels, 'zzz_command:', pipeline.settings.maxItems, 'the required field must be visible on open');
    mustRankAbove(labels, 'zzz_command:', 'aaa_params:', 'required-first ordering inside the lane');
  });

  test(`[${variant}] target lane: the typed second key leads its own block`, async () => {
    const pipeline = buildPipeline(makeHassFixture(), completions);
    for (const doc of [AUTOMATION_TARGET_AR, CARD_TARGET_AR]) {
      const { labels } = await scoredLabels(pipeline, doc);
      expectedTop(labels, 'area_id:', 'the target key matching the typed prefix leads the target block');
      for (const key of TARGET_KEYS) {
        mustIncludeTopN(labels, key, pipeline.settings.maxItems, 'all three target keys stay visible while typing');
      }
      mustRankAbove(labels, 'area_id:', 'wait_for_trigger:', 'automation step keys must not outrank target keys inside target:');
      mustRankAbove(labels, 'area_id:', 'navigation_path:', 'dashboard action keys must not outrank target keys inside target:');
    }
  });

  test(`[${variant}] target lane: a blank target block surfaces all three target keys`, async () => {
    const pipeline = buildPipeline(makeHassFixture(), completions);
    const topN = pipeline.settings.maxItems;
    for (const doc of [AUTOMATION_TARGET_BLANK, CARD_TARGET_BLANK]) {
      const { labels } = await scoredLabels(pipeline, doc, 'explicit');
      for (const key of TARGET_KEYS) {
        mustIncludeTopN(labels, key, topN, 'the popup must offer entity/device/area targeting on open');
      }
    }
  });

  test(`[${variant}] data-field lane: each service field label appears exactly once`, async () => {
    // The runtime provider serves transition:/brightness_pct: for the resolved service;
    // the static lovelace dataBlock must not also serve them, or the popup wastes slots
    // on duplicate labels.
    const pipeline = buildPipeline(makeHassFixture(), completions);
    const { labels } = await scoredLabels(pipeline, AUTOMATION_BLANK, 'explicit');
    for (const field of ['transition:', 'brightness_pct:']) {
      const count = labels.filter(l => l === field).length;
      assert.equal(count, 1, `${field} must appear exactly once, got ${count} in ${JSON.stringify(labels)}`);
    }
  });

  test(`[${variant}] entity-value lane: live entity ids lead`, async () => {
    const pipeline = buildPipeline(makeHassFixture(), completions);
    const { rows, labels } = await scoredLabels(pipeline, 'entity: sensor.');
    assert.ok(labels.length >= 4, 'entity rows must serve');
    for (const row of rows.slice(0, 4)) {
      assert.match(String(row.label), /^sensor\./, `live sensor ids must lead, got ${JSON.stringify(labels.slice(0, 6))}`);
      assert.equal(row.source, 'ha-runtime-values', 'the runtime provider owns the entity value lane');
    }
  });

  test(`[${variant}] root lane pin: card keys keep winning at root`, async () => {
    const pipeline = buildPipeline(makeHassFixture(), completions);
    const { labels } = await scoredLabels(pipeline, 'ty');
    expectedTop(labels, 'type:', 'at root the generic card-key lane IS the context lane');
  });
}
