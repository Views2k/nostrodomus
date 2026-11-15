import test from 'node:test';
import assert from 'node:assert/strict';
import snippetCatalogData from '../../data/snippets.json' with { type: 'json' };
import { snippetRowsForContext } from '../../src/providers/snippetProvider.js';

const yamlBase = {
  lang: 'yaml',
  shouldSuggest: true,
  yamlRole: 'key',
  yamlKey: '',
  yamlPath: [],
  pathText: '',
  focusKind: '',
  valueKind: '',
};

function idsFor(ctx) {
  return snippetRowsForContext({ ...yamlBase, ...ctx }).map(row => row.id);
}

test('snippet expansion grows the validated catalog with unique ids', () => {
  assert.equal(snippetCatalogData.length, 91);
  const ids = new Set(snippetCatalogData.map(item => item.id));
  assert.equal(ids.size, snippetCatalogData.length);
  for (const id of [
    'snip.dashboard.card.button_card',
    'snip.trigger.sun',
    'snip.condition.time',
    'snip.sequence.repeat_count',
    'snip.target.device',
    'snip.card_mod.css.variables',
    'snip.dashboard.card.atomic_calendar_revive',
    'snip.dashboard.card.clock_weather',
    'snip.dashboard.card.flex_table',
    'snip.dashboard.card.kiosk_mode',

    'snip.dashboard.card.mushroom_entity',
    'snip.dashboard.card.mushroom_template',
    'snip.dashboard.card.button_card_state',
    'snip.dashboard.card.button_card_custom_field',
    'snip.dashboard.card.mini_graph_temperature',
    'snip.dashboard.card.apexcharts_line',
    'snip.dashboard.card.bubble_popup',
    'snip.dashboard.card.auto_entities_battery',
    'snip.dashboard.action.browser_mod_popup',
    'snip.card_mod.glass_card',
    'snip.sequence.choose_by_trigger',
    'snip.dashboard.card.flex_table_modify',
    'snip.dashboard.card.xiaomi_vacuum_map_rooms',
    'snip.dashboard.kiosk_mode_global',
    'snip.dashboard.card.better_thermostat_full',
  ]) {
    assert.ok(ids.has(id), `${id} should be present`);
  }
});

test('dashboard-root contexts expose expanded card snippets', () => {
  const ids = idsFor({ yamlRole: 'blank', yamlPath: [], pathText: '' });
  assert.ok(ids.includes('snip.dashboard.card.button_card'));
  assert.ok(ids.includes('snip.dashboard.card.mushroom_chips'));
  assert.ok(ids.includes('snip.dashboard.card.vertical_stack'));
  assert.ok(ids.includes('snip.dashboard.card.vertical_stack_in_card'));
  assert.ok(ids.includes('snip.dashboard.card.atomic_calendar_revive'));
  assert.ok(ids.includes('snip.dashboard.card.clock_weather'));
  assert.ok(ids.includes('snip.dashboard.card.uptime'));
  assert.ok(ids.includes('snip.dashboard.card.flex_table'));
  assert.ok(ids.includes('snip.dashboard.card.xiaomi_vacuum_map'));
  assert.ok(ids.includes('snip.dashboard.card.kiosk_mode'));
  assert.ok(ids.includes('snip.dashboard.card.better_thermostat_ui'));
  assert.ok(ids.includes('snip.dashboard.card.mushroom_entity'));
  assert.ok(ids.includes('snip.dashboard.card.button_card_state'));
  assert.ok(ids.includes('snip.dashboard.card.apexcharts_line'));
  assert.ok(ids.includes('snip.dashboard.card.bubble_popup'));
  assert.ok(ids.includes('snip.dashboard.card.auto_entities_battery'));
  assert.ok(ids.includes('snip.dashboard.card.flex_table_modify'));
  assert.ok(ids.includes('snip.dashboard.card.xiaomi_vacuum_map_rooms'));
  assert.ok(ids.includes('snip.dashboard.kiosk_mode_global'));
  assert.ok(ids.includes('snip.dashboard.card.better_thermostat_full'));
});

test('trigger and condition contexts expose expanded automation snippets', () => {
  const triggerIds = idsFor({ yamlPath: ['triggers'], pathText: 'triggers', focusKind: 'trigger-block' });
  assert.ok(triggerIds.includes('snip.trigger.sun'));
  assert.ok(triggerIds.includes('snip.trigger.webhook'));
  assert.ok(triggerIds.includes('snip.trigger.homeassistant_start'));

  const conditionIds = idsFor({ yamlPath: ['conditions'], pathText: 'conditions', focusKind: 'condition-block' });
  assert.ok(conditionIds.includes('snip.condition.time'));
  assert.ok(conditionIds.includes('snip.condition.sun'));
  assert.ok(conditionIds.includes('snip.condition.or'));
});

test('automation action contexts expose expanded sequence snippets', () => {
  const ids = idsFor({ yamlPath: ['actions'], pathText: 'actions', focusKind: 'automation-action' });
  assert.ok(ids.includes('snip.sequence.notification_mobile'));
  assert.ok(ids.includes('snip.sequence.scene_turn_on'));
  assert.ok(ids.includes('snip.sequence.repeat_count'));
  assert.ok(ids.includes('snip.sequence.parallel'));
  assert.ok(ids.includes('snip.sequence.variables'));
  assert.ok(ids.includes('snip.sequence.stop'));
  assert.ok(ids.includes('snip.sequence.choose_by_trigger'));
  assert.ok(ids.includes('snip.sequence.wait_template_timeout'));
});

test('target id-key snippets insert the bare key (no placeholder value) so live completion fills it', () => {
  // With an example value (entity_id: light.example, area_id: living_room), the alias-exact match
  // at a key position auto-accepts on Ctrl+Space and pastes the fake value on top of what was typed
  // (e.g. "area_id: living_room:"). These snippets insert "<key>: $1", so the cursor lands in the
  // value, where the live entity and registry completion takes over.
  const byId = new Map(snippetCatalogData.map(s => [s.id, s]));
  for (const id of ['snip.target.entity', 'snip.target.area', 'snip.target.device', 'snip.target.label']) {
    const insert = byId.get(id)?.insert || '';
    assert.match(insert, /^[a-z_]+_id: \$1$/, `${id} inserts the bare key + cursor, no placeholder value`);
    assert.equal(/living_room|light\.example|device_id_here|label_id_here/.test(insert), false, `${id} carries no placeholder value`);
  }
});

test('target and style contexts expose expanded target/style snippets', () => {
  const targetIds = idsFor({ yamlPath: ['target'], pathText: 'target', focusKind: 'target-block' });
  assert.ok(targetIds.includes('snip.target.device'));
  assert.ok(targetIds.includes('snip.target.label'));

  // Each style snippet is offered where its text is valid: YAML for a style block at the key
  // positions of the block, CSS rules in the CSS text, a whole card_mod: block at a card key.
  const styleIds = idsFor({ yamlPath: ['card_mod', 'style'], pathText: 'card_mod.style', focusKind: 'style-block' });
  assert.ok(styleIds.includes('snip.button_card.state_styles'));
  assert.ok(!styleIds.includes('snip.card_mod.css.variables') && !styleIds.includes('snip.card_mod.glass_card'));

  const cssIds = idsFor({ lang: 'css', scope: 'card-mod-css', yamlRole: 'code', yamlPath: ['card_mod', 'style'] });
  assert.ok(cssIds.includes('snip.card_mod.css.variables'));

  const cardIds = idsFor({ yamlRole: 'key', prefix: 'card-m' });
  assert.ok(cardIds.includes('snip.card_mod.glass_card'));
  assert.ok(cardIds.includes('snip.card_mod.mushroom_chip_row'));
});


test('dashboard action contexts expose browser_mod popup snippet', () => {
  const ids = idsFor({
    yamlPath: ['cards', '0', 'tap_action'],
    pathText: 'cards.0.tap_action',
    yamlKey: 'tap_action',
    focusKind: 'action-block',
  });
  assert.ok(ids.includes('snip.dashboard.action.browser_mod_popup'));
});
