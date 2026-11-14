import test from 'node:test';
import assert from 'node:assert/strict';

import { enclosingBlockKey, lovelaceContextProvider } from '../../src/providers/lovelaceContextProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// The provider used to look for block openers (triggers:, conditions:, actions:, cards:,
// browser_mod:) anywhere in the 2400 characters before the cursor and let them outrank the
// cursor's own YAML path. Any automation with a triggers: block above therefore served trigger
// keys at every action and condition step, and any stack with a conditional card or a
// browser_mod popup above served condition or popup keys inside the following cards. Only the
// block that encloses the cursor line by indentation counts now; it decides the automation
// lanes, and the path's own segments decide the rest.
function rowsAt(doc) {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
  const provider = lovelaceContextProvider({ getDoc: () => doc, getPos: () => doc.length });
  assert.equal(provider.canHandle(ctx), true, 'key/blank/list-key positions are the provider lane');
  return provider.provide(ctx).map(row => row?.label ?? String(row));
}

const TRIGGER_ONLY = ['platform:', 'at:', 'event_type:'];
const CONDITION_ONLY = ['above:', 'below:', 'weekday:'];
const ACTION_STEP = ['wait_for_trigger:', 'choose:', 'response_variable:'];
const CARD_KEYS = ['type:', 'entity:', 'title:', 'card_mod:'];

function assertHas(labels, keys, where) {
  for (const key of keys) assert.ok(labels.includes(key), `${key} expected ${where}, got ${JSON.stringify(labels)}`);
}

function assertLacks(labels, keys, where) {
  for (const key of keys) assert.ok(!labels.includes(key), `${key} must not be offered ${where}, got ${JSON.stringify(labels)}`);
}

const TRIGGERS_ABOVE = 'triggers:\n  - trigger: state\n    entity_id: binary_sensor.motion\n    to: "on"\n';

test('automation: action steps below a triggers block get action-step keys', () => {
  for (const doc of [
    `${TRIGGERS_ABOVE}actions:\n  - action: light.turn_on\n    `,
    `${TRIGGERS_ABOVE}actions:\n  - `,
    `${TRIGGERS_ABOVE}actions:\n  - if:\n      - condition: state\n    then:\n      - `,
    `${TRIGGERS_ABOVE}# lights\nactions:\n  - action: light.turn_on\n    `,
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, ACTION_STEP, 'at an action step');
    assertLacks(labels, TRIGGER_ONLY, 'at an action step');
  }
});

test('automation: condition steps below a triggers block get condition keys', () => {
  for (const doc of [
    `${TRIGGERS_ABOVE}conditions:\n  - condition: state\n    `,
    `${TRIGGERS_ABOVE}conditions:\n  - `,
    `${TRIGGERS_ABOVE}actions:\n  - choose:\n      - conditions:\n          - `,
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, CONDITION_ONLY, 'at a condition step');
    assertLacks(labels, TRIGGER_ONLY, 'at a condition step');
  }
});

test('automation: a root key line after the blocks gets root keys, not the first block above', () => {
  const labels = rowsAt(`${TRIGGERS_ABOVE}actions:\n  - action: light.turn_on\n`);
  assertHas(labels, ['mode:', 'conditions:', 'description:'], 'at a root key line');
  assertLacks(labels, TRIGGER_ONLY, 'at a root key line');
});

const CONDITIONAL_CARD = '  - type: conditional\n    conditions:\n      - condition: state\n        entity: light.a\n        state: "on"\n    card:\n      type: tile\n      entity: light.a\n';

test('stack: cards after a conditional card get card keys', () => {
  for (const doc of [
    `type: vertical-stack\ncards:\n${CONDITIONAL_CARD}  - type: entities\n    `,
    `type: vertical-stack\ncards:\n${CONDITIONAL_CARD}  - type: entities\n    ti`,
    `type: vertical-stack\ncards:\n${CONDITIONAL_CARD}  - `,
  ]) {
    const labels = rowsAt(doc);
    assertLacks(labels, CONDITION_ONLY, 'in a card after a conditional card');
    if (!doc.endsWith('ti')) assertHas(labels, CARD_KEYS, 'in a card after a conditional card');
    else assert.ok(labels.includes('title:'), `title: expected for a typed prefix, got ${JSON.stringify(labels)}`);
  }
});

test('conditional card: the nested card gets card keys', () => {
  for (const doc of [
    'type: vertical-stack\ncards:\n  - type: conditional\n    conditions:\n      - condition: state\n        entity: light.a\n        state: "on"\n    card:\n      ',
    'type: conditional\nconditions:\n  - condition: state\n    entity: light.a\n    state: "on"\ncard:\n  ',
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, CARD_KEYS, 'in the nested card');
    assertLacks(labels, CONDITION_ONLY, 'in the nested card');
  }
  const root = rowsAt('type: conditional\nconditions:\n  - condition: state\n    entity: light.a\n    state: "on"\n');
  assertHas(root, ['card:'], 'at the conditional card root');
  assertLacks(root, CONDITION_ONLY, 'at the conditional card root');
});

test('stack: a card after a browser_mod popup action gets card keys', () => {
  const doc = 'type: vertical-stack\ncards:\n  - type: button\n    tap_action:\n      action: fire-dom-event\n      browser_mod:\n        service: browser_mod.popup\n        data:\n          title: x\n  - type: tile\n    ';
  const labels = rowsAt(doc);
  assertHas(labels, CARD_KEYS, 'after a browser_mod card');
  assertLacks(labels, ['dismissable:', 'content:'], 'after a browser_mod card');
});

test('compact sequences: the enclosing block still names the lane', () => {
  const action = rowsAt('triggers:\n- trigger: state\nactions:\n- action: light.turn_on\n  ');
  assertHas(action, ACTION_STEP, 'at a compact action step');
  assertLacks(action, TRIGGER_ONLY, 'at a compact action step');

  const card = rowsAt('type: vertical-stack\ncards:\n- type: conditional\n  conditions:\n  - condition: state\n    entity: light.a\n  card:\n    type: tile\n- type: entities\n  ');
  assertHas(card, CARD_KEYS, 'in a compact stack card');
  assertLacks(card, CONDITION_ONLY, 'in a compact stack card');

  const condition = rowsAt('triggers:\n- trigger: state\nconditions:\n- condition: state\n  ');
  assertHas(condition, CONDITION_ONLY, 'at a compact condition step');
  assertLacks(condition, TRIGGER_ONLY, 'at a compact condition step');

  // A blank column-0 line after a compact list is a root key position.
  const root = rowsAt('triggers:\n- trigger: state\n  entity_id: binary_sensor.motion\n');
  assertHas(root, ['conditions:', 'actions:'], 'at a column-0 line after a compact list');
  assertLacks(root, TRIGGER_ONLY, 'at a column-0 line after a compact list');
});

// ---- keep-green pins: lanes that already routed correctly ----

test('keep-green: trigger lanes, compact and indented', () => {
  for (const doc of ['triggers:\n  - trigger: state\n    ', 'triggers:\n  ', 'triggers:\n', 'triggers:\n- ', 'triggers:\n- trigger: state\n  ']) {
    assertHas(rowsAt(doc), TRIGGER_ONLY, `in a trigger block (${JSON.stringify(doc)})`);
  }
  assertHas(rowsAt(`${TRIGGERS_ABOVE}actions:\n  - wait_for_trigger:\n      - `), TRIGGER_ONLY, 'inside wait_for_trigger');
});

test('keep-green: stack cards and nested condition lists', () => {
  assertHas(rowsAt('type: vertical-stack\ncards:\n  - type: entities\n    '), CARD_KEYS, 'in a stack card');
  assertHas(rowsAt('type: vertical-stack\ncards:\n  - '), CARD_KEYS, 'at a new stack item');
  assertHas(rowsAt('type: vertical-stack\ncards:\n  - type: conditional\n    conditions:\n      - '), CONDITION_ONLY, 'in a conditional card conditions list');
  assertHas(rowsAt('conditions:\n  - condition: or\n    conditions:\n      - '), CONDITION_ONLY, 'in a nested or block');
  assertHas(rowsAt('type: tile\nentity: light.a\nvisibility:\n  - '), CONDITION_ONLY, 'in a visibility list');
  assertHas(rowsAt('type: vertical-stack\ncards:\n  - type: custom:button-card\n    entity: light.a\n  - type: tile\n    '), CARD_KEYS, 'in a card after a button-card');
});

// ---- review cases: the path names the wrong block, or no block ----

const CSS_ONLY = ['background:', 'padding:', 'border-radius:'];
const ROOT_ONLY = ['triggers:', 'mode:', 'sequence:'];

test('dashboard: a new list item gets card keys, not CSS properties', () => {
  for (const doc of [
    'views:\n  - title: Home\n    cards:\n      - type: tile\n        entity: light.a\n  - ',
    'views:\n  - title: Home\n    cards:\n      - type: tile\n        entity: light.a\n    badges:\n      - ',
    'views:\n  - type: sections\n    sections:\n      - type: grid\n        cards:\n          - type: tile\n      - ',
    'type: vertical-stack\ncards:\n- type: tile\n  entity: light.a\n  features:\n  - ',
    'views:\n- title: Home\n  cards:\n  - type: tile\n- ',
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, ['type:', 'title:'], `at a new item (${JSON.stringify(doc.slice(-30))})`);
    assertLacks(labels, CSS_ONLY, `at a new item (${JSON.stringify(doc.slice(-30))})`);
  }
});

test('dashboard: key positions without a lane do not offer automation root keys', () => {
  for (const doc of [
    'views:\n  - title: Home\n    cards:\n      - type: tile\n        entity: light.a\n    badges:\n      - type: entity\n        ent',
    'views:\n  - type: sections\n    sections:\n      - type: grid\n        ',
    'views:\n  - title: Home\n    cards:\n      - type: tile\n        entity: light.a\n    ',
    'type: vertical-stack\ncards:\n  - type: tile\n    entity: light.a\n',
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, ['type:'], `at a dashboard key position (${JSON.stringify(doc.slice(-30))})`);
    assertLacks(labels, ROOT_ONLY, `at a dashboard key position (${JSON.stringify(doc.slice(-30))})`);
  }
});

test('compact scripts: then and else steps get action-step keys', () => {
  const ifBlock = 'alias: x\nsequence:\n- if:\n  - condition: state\n    entity_id: binary_sensor.m\n    state: "on"\n';
  for (const doc of [
    `${ifBlock}  then:\n  - action: light.turn_on\n    `,
    `${ifBlock}  then:\n  - action: light.turn_on\n    ta`,
    `${ifBlock}  then:\n  - action: light.turn_on\n  else:\n  - action: light.turn_off\n    `,
    'sequence:\n- if:\n  - condition: state\n  then:\n  - action: x\n  - ',
    `triggers:\n- trigger: state\nactions:\n- if:\n  - condition: state\n  then:\n  - action: light.turn_on\n    `,
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, ACTION_STEP, `in a then/else step (${JSON.stringify(doc.slice(-30))})`);
    assertLacks(labels, ['cards:', 'background:', ...TRIGGER_ONLY], `in a then/else step (${JSON.stringify(doc.slice(-30))})`);
  }
});

test('choose: a step in an option sequence after its conditions gets action-step keys', () => {
  const option = `${TRIGGERS_ABOVE}actions:\n  - choose:\n      - conditions:\n          - condition: state\n            entity_id: x\n            state: "on"\n        sequence:\n`;
  for (const doc of [
    `${option}          - action: light.turn_on\n            `,
    `${option}          - `,
    'choose:\n  - conditions:\n      - condition: state\n    sequence:\n      - action: x\n        ',
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, ACTION_STEP, `in a choose option step (${JSON.stringify(doc.slice(-30))})`);
    assertLacks(labels, [...CONDITION_ONLY, ...TRIGGER_ONLY], `in a choose option step (${JSON.stringify(doc.slice(-30))})`);
  }
});

test('if, until and while lists get condition keys; the step around them keeps action keys', () => {
  for (const doc of [
    'actions:\n  - if:\n      - ',
    'actions:\n  - repeat:\n      until:\n        - ',
    'actions:\n  - repeat:\n      while:\n        - ',
    'actions:\n- if:\n  - ',
  ]) {
    assertHas(rowsAt(doc), ['condition:', ...CONDITION_ONLY], `in a condition list (${JSON.stringify(doc.slice(-24))})`);
  }
  const sibling = rowsAt('actions:\n  - if:\n      - condition: state\n    ');
  assertHas(sibling, ['then:', 'else:'], 'next to if:');
  const afterWait = rowsAt('actions:\n  - wait_for_trigger:\n      - trigger: state\n        entity_id: x\n    timeout: "00:01:00"\n    ');
  assertHas(afterWait, ACTION_STEP, 'next to wait_for_trigger:');
  assertLacks(afterWait, TRIGGER_ONLY, 'next to wait_for_trigger:');
});

test('dashboard: styles and visibility inside cards of a view keep their rows', () => {
  const card = 'views:\n  - title: Home\n    cards:\n      - type: custom:button-card\n';
  assertHas(rowsAt(`${card}        styles:\n          card:\n            - `), CSS_ONLY, 'in a styles.card list of a card in a view');
  assertHas(rowsAt(`${card}        visibility:\n          - `), CONDITION_ONLY, 'in a visibility list of a card in a view');
  assertLacks(rowsAt('type: vertical-stack\ncards:\n  - type: custom:button-card\n    triggers_update:\n      - '), TRIGGER_ONLY, 'in triggers_update');
});

test('block scalar text is not read as YAML structure', () => {
  const notify = `${TRIGGERS_ABOVE}actions:\n  - action: notify.phone\n    data:\n      message: |\n        Triggers:\n          `;
  assertLacks(rowsAt(notify), TRIGGER_ONLY, 'inside a notify message');
  assertLacks(rowsAt('type: markdown\ncontent: |\n  triggers:\n    '), TRIGGER_ONLY, 'inside markdown content');
  assert.equal(enclosingBlockKey('actions:\n  - action: n\n    data:\n      message: |\n        triggers:\n          '), '');
});

test('compact openers with an anchor, a tag or a quoted key still name the block', () => {
  for (const opener of ['actions: &a', 'actions: !!seq', '"actions":', "'actions': # steps"]) {
    const labels = rowsAt(`triggers:\n- trigger: state\n${opener}\n- action: light.turn_on\n  `);
    assertHas(labels, ACTION_STEP, `under ${opener}`);
    assertLacks(labels, TRIGGER_ONLY, `under ${opener}`);
  }
  assert.equal(enclosingBlockKey('cards: &inner\n- type: tile\n  '), 'cards');
  assert.equal(enclosingBlockKey('card: !include x.yaml\n  '), '');
});

test('the enclosing block is found more than 2400 characters above, and a cut first line is not column 0', () => {
  const steps = Array.from({ length: 60 }, (_, i) => `- action: light.turn_on\n  target:\n    entity_id: light.l${i}\n`).join('');
  const labels = rowsAt(`triggers:\n- trigger: state\n  entity_id: binary_sensor.m\nactions:\n${steps}- action: light.turn_on\n  `);
  assertHas(labels, ACTION_STEP, 'deep in a long compact action list');
  assertLacks(labels, TRIGGER_ONLY, 'deep in a long compact action list');
  assert.equal(enclosingBlockKey('actions:\n- if:\n  - '), 'if');
});

// ---- second review: condition steps, card roots, block scalars, entity rows ----

function rowsAtPos(doc, pos) {
  const ctx = detectRuntimeContext(doc, pos, { triggerKind: 'explicit' });
  const provider = lovelaceContextProvider({ getDoc: () => doc, getPos: () => pos });
  return provider.canHandle(ctx) ? provider.provide(ctx).map(row => row?.label ?? String(row)) : [];
}

const BUTTON_ONLY = ['show_state:', 'triggers_update:', 'custom_fields:'];
const ENTITY_ROW = ['secondary_info:', 'entity:', 'name:'];

test('a condition step inside an action list gets condition keys', () => {
  for (const doc of [
    'sequence:\n  - condition: state\n    ',
    'sequence:\n  - condition: state\n    ent',
    'sequence:\n- condition: state\n  ',
    'sequence:\n  - condition: state\n    entity_id: light.a\n    ',
    'sequence:\n  - if:\n      - condition: state\n    then:\n      - condition: state\n        ',
    'sequence:\n  - choose:\n      - conditions:\n          - condition: state\n        sequence:\n          - action: x\n    default:\n      - condition: state\n        ',
    'sequence:\n  - parallel:\n      - condition: state\n        ',
    `${TRIGGERS_ABOVE}actions:\n  - condition: state\n    entity_id: light.a\n    `,
    'sequence:\n  - alias: gate\n    condition: state\n    ',
    'sequence:\n  - condition: and\n    conditions: ',
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, CONDITION_ONLY, `in a condition step (${JSON.stringify(doc.slice(-34))})`);
    assertLacks(labels, ['delay:', 'response_variable:', ...TRIGGER_ONLY], `in a condition step (${JSON.stringify(doc.slice(-34))})`);
  }
  // An action step next to them keeps action keys.
  assertHas(rowsAt('sequence:\n  - condition: state\n  - action: light.turn_on\n    '), ACTION_STEP, 'in the action step after a condition step');
});

test('stack, grid and dashboard roots after a nested button-card get card keys', () => {
  for (const doc of [
    'type: vertical-stack\ncards:\n  - type: custom:button-card\n    entity: x\n',
    'type: grid\ncolumns: 2\ncards:\n  - type: custom:button-card\n    entity: light.a\n',
    'views:\n  - title: A\n    cards:\n      - type: custom:button-card\n        entity: light.a\n',
  ]) {
    const labels = rowsAt(doc);
    assertHas(labels, ['type:', 'title:'], `at the root (${JSON.stringify(doc.slice(-24))})`);
    assertLacks(labels, BUTTON_ONLY, `at the root (${JSON.stringify(doc.slice(-24))})`);
  }
  assertHas(rowsAt('type: custom:button-card\nentity: x\n'), BUTTON_ONLY, 'at a standalone button-card root');
});

test('button-card style lists get CSS properties in compact form and with a typed prefix', () => {
  assertHas(rowsAt('type: custom:button-card\nstyles:\n  card:\n  - color: red\n  - '), CSS_ONLY, 'in a compact styles.card list');
  assertHas(rowsAt('type: custom:button-card\nstyles:\n  card:\n  - color: red\n  - back'), CSS_ONLY, 'at a typed compact styles.card item');
  assertHas(rowsAt('type: custom:button-card\nstyles:\n  img_cell:\n    - jus'), CSS_ONLY, 'in a styles.img_cell list');
});

test('a card whose first key is visibility: or styles: keeps card keys at its other keys', () => {
  const visibilityFirst = rowsAt('type: vertical-stack\ncards:\n  - visibility:\n      - condition: state\n        entity: light.a\n    type: tile\n    ');
  assertHas(visibilityFirst, CARD_KEYS, 'next to a leading visibility:');
  assertLacks(visibilityFirst, CONDITION_ONLY, 'next to a leading visibility:');
  const stylesFirst = rowsAt('type: vertical-stack\ncards:\n  - styles:\n      card:\n        - color: red\n    type: custom:button-card\n    ');
  assertHas(stylesFirst, ['entity:', 'show_state:'], 'next to a leading styles: in a button-card');
  // A new item under a leading visibility: still gets condition keys.
  assertHas(rowsAt('type: vertical-stack\ncards:\n  - visibility:\n      - '), CONDITION_ONLY, 'in a leading visibility list');
});

test('a key typed on the cursor line names the block the next row goes into', () => {
  assertHas(rowsAt('views:\n  - title: A\n    cards:\n      - type: tile\n  - type: sections\n    header:\n      card: '), CARD_KEYS, 'after card:');
  assertHas(rowsAt('sequence:\n  - choose:\n      - conditions:\n          - condition: state\n        sequence: '), ACTION_STEP, 'after a choose option sequence:');
  const doc = 'type: vertical-stack\ncards:\n  - type: tile\ntitle: Lights';
  assertHas(rowsAtPos(doc, doc.indexOf('tle: Lights')), ['title:', 'type:'], 'inside an existing root key of a stack');
});

test('block scalar text gets no key rows; the keys after it do', () => {
  for (const doc of [
    `${TRIGGERS_ABOVE}actions:\n  - action: notify.phone\n    data:\n      message: |\n        Motion at {{ now() }}\n        `,
    'type: markdown\ncontent: |\n  Some text\n  ',
    'type: markdown\ncontent: &md |\n  triggers:\n    ',
    'alias: x\ndescription: |\n  Turns lights on\n  ',
  ]) {
    assert.deepEqual(rowsAt(doc), [], `inside block scalar text (${JSON.stringify(doc.slice(-30))})`);
  }
  const dataSibling = rowsAt(`${TRIGGERS_ABOVE}actions:\n  - action: notify.x\n    data:\n      message: >\n        {{ states("sensor.x") }}\n      `);
  assertHas(dataSibling, ['message:', 'title:'], 'at a data key after a folded message');
  assertLacks(dataSibling, ACTION_STEP, 'at a data key after a folded message');
  for (const doc of [
    'sequence:\n- wait_template: >-\n    {{ is_state(\'light.a\', \'on\') }}\n  timeout: "00:01:00"\n  ',
    'sequence:\n- if: >-\n    {{ is_state(\'sun.sun\', \'below_horizon\') }}\n  then:\n  - action: light.turn_on\n    ',
    'sequence:\n- delay: >-\n    {{ states(\'input_number.d\') | int }}\n  enabled: true\n  ',
  ]) {
    assertHas(rowsAt(doc), ACTION_STEP, `next to a block-scalar step key (${JSON.stringify(doc.slice(-30))})`);
  }
  const foldedConditions = `${TRIGGERS_ABOVE}actions:\n  - choose:\n      - conditions: >-\n          {{ trigger.to_state.state == 'on' }}\n        sequence:\n          - action: light.turn_on\n            `;
  assertHas(rowsAt(foldedConditions), ACTION_STEP, 'in a sequence after a folded conditions: template');
});

test('entities card rows and conditional row blocks get entity-row keys', () => {
  assertHas(rowsAt('type: entities\nentities:\n  - entity: light.a\n    '), ENTITY_ROW, 'in an entity row');
  assertHas(rowsAt('type: entities\nentities:\n  - type: conditional\n    conditions:\n      - entity: light.a\n        state: "on"\n    row:\n      entity: light.a\n      '), ENTITY_ROW, 'in a conditional row block');
});

test('words that are automation blocks elsewhere do not pick automation lanes', () => {
  assertLacks(rowsAt('alias: x\nfields:\n  light:\n    selector:\n      target: {}\n    default:\n      entity_id: light.a\n      '), ACTION_STEP, 'in a script field default');
  assertLacks(rowsAt('decluttering_templates:\n  my_button:\n    default:\n      - icon: fire\n      - '), ACTION_STEP, 'in a decluttering template default list');
  assertLacks(rowsAt('type: custom:auto-entities\ncard:\n  type: entities\nfilter:\n  include:\n    - or:\n        - '), CONDITION_ONLY, 'in an auto-entities or filter');
  const popup = rowsAt('alias: Show popup\nsequence:\n  - action: browser_mod.popup\n    data:\n      content:\n        type: vertical-stack\n        cards:\n          - type: tile\n            entity: light.a\n');
  assertHas(popup, ['mode:', 'description:'], 'at a script root after a popup with cards');
});

test('choose option: the line right after sequence: at its own column opens the sequence', () => {
  const labels = rowsAt(`${TRIGGERS_ABOVE}actions:\n  - choose:\n      - conditions:\n          - condition: state\n        sequence:\n        `);
  assertHas(labels, ACTION_STEP, 'right after sequence:');
  assertLacks(labels, CONDITION_ONLY, 'right after sequence:');
});

test('openers with a tag before an anchor still name the block', () => {
  const labels = rowsAt('triggers:\n- trigger: state\n  entity_id: binary_sensor.m\nactions: !!seq &a\n- action: light.turn_on\n  ');
  assertHas(labels, ACTION_STEP, 'under actions: !!seq &a');
});

// ---- third review: fragments, button-cards under card:, tap action columns, legacy roots ----

test('a column-0 default: of a choose step fragment gets action-step keys', () => {
  const fragment = 'choose:\n  - conditions:\n      - condition: state\n        entity_id: light.a\n        state: "on"\n    sequence:\n      - action: light.turn_off\n';
  for (const doc of [`${fragment}default:\n  - action: light.turn_on\n    `, `${fragment}default:\n  - `, `${fragment}default:\n- action: light.turn_on\n  `]) {
    assertHas(rowsAt(doc), ACTION_STEP, `in the default list (${JSON.stringify(doc.slice(-30))})`);
  }
});

test('a button-card gets button-card keys under card:, in custom_fields and as a stack item', () => {
  for (const doc of [
    'decluttering_templates:\n  light_button:\n    card:\n      type: custom:button-card\n      entity: "[[entity]]"\n      show_',
    'decluttering_templates:\n  light_button:\n    card:\n      type: custom:button-card\n      entity: "[[entity]]"\n      ',
    'type: custom:config-template-card\nentities:\n  - light.a\ncard:\n  type: custom:button-card\n  entity: light.a\n  ',
    'type: custom:button-card\nentity: light.a\ncustom_fields:\n  btn:\n    card:\n      type: custom:button-card\n      entity: light.b\n      ',
    'type: vertical-stack\ncards:\n  - type: custom:button-card\n    entity: light.a\n    ',
    'type: vertical-stack\ncards:\n- type: custom:button-card\n  entity: light.a\n  ',
  ]) {
    assertHas(rowsAt(doc), ['show_state:', 'show_name:'], `in a button-card (${JSON.stringify(doc.slice(-30))})`);
  }
  const sensor = rowsAt('type: custom:button-card\nentity: light.a\ncustom_fields:\n  graph:\n    card:\n      type: sensor\n      entity: sensor.t\n      ');
  assertHas(sensor, ['name:', 'icon:'], 'in a sensor card under custom_fields');
  assertLacks(sensor, ['show_state:'], 'in a sensor card under custom_fields');
});

test('a key at the column of a finished tap_action gets card keys; a data block inside it gets data keys', () => {
  const tile = rowsAt('type: tile\nentity: light.a\ntap_action:\n  action: toggle\n');
  assertHas(tile, ['hold_action:', 'name:', 'icon:'], 'after a tap_action block');
  const stack = rowsAt('type: vertical-stack\ncards:\n  - type: tile\n    entity: light.a\n    tap_action:\n      action: toggle\n    ');
  assertHas(stack, ['hold_action:', 'name:'], 'at a stack card key after its tap_action block');
  const data = rowsAt('type: button\ntap_action:\n  action: perform-action\n  perform_action: notify.phone\n  data:\n    ');
  assertHas(data, ['message:', 'title:'], 'inside a tap_action data block');
});

test('legacy singular automation roots: steps under action: get action-step keys', () => {
  const labels = rowsAt('alias: Old\ntrigger:\n  - platform: state\n    entity_id: light.a\ncondition: []\naction:\n  - service: light.turn_on\n    ');
  assertHas(labels, ACTION_STEP, 'under a legacy action: list');
  assertHas(rowsAt('alias: Old\ntrigger:\n  - platform: state\n    '), TRIGGER_ONLY, 'under a legacy trigger: list');
});

test('a long view keeps card keys when its cards: line is far above', () => {
  const tiles = Array.from({ length: 700 }, (_, i) => `      - type: tile\n        entity: light.lamp_${String(i).padStart(4, '0')}\n`).join('');
  const doc = `views:\n  - title: Home\n    cards:\n${tiles}      - type: vertical-stack\n        cards:\n          - type: custom:button-card\n            entity: light.a\n      - type: tile\n        `;
  const labels = rowsAt(doc);
  assertHas(labels, ['type:', 'name:'], 'deep in a long view');
  assertLacks(labels, [...BUTTON_ONLY, ...ROOT_ONLY], 'deep in a long view');
});

test('typed text at the column of an empty if: or wait_for_trigger: is a sibling key, not its content', () => {
  assertHas(rowsAt('alias: x\nsequence:\n  - alias: check\n    if:\n    th'), ['then:', 'else:'], 'next to an empty if:');
  assertLacks(rowsAt('alias: x\nsequence:\n  - wait_for_trigger:\n    tim'), TRIGGER_ONLY, 'next to an empty wait_for_trigger:');
});

test('a comment that ends in "key: |" does not start a block scalar', () => {
  assertHas(rowsAt('alias: x\nsequence:\n  - action: notify.phone\n    data:  # message: |\n      '), ['message:', 'title:'], 'under data: with such a comment');
});

test('text of a key-less "- >-" item scalar gets no key rows', () => {
  assert.deepEqual(rowsAt("conditions:\n  - >-\n    {{ is_state('sun.sun', 'below_horizon')\n       and is_state('light.a', 'off') }}\n    "), []);
});

test('a conditional card root after its nested button-card gets card keys', () => {
  const labels = rowsAt('type: conditional\nconditions:\n  - condition: state\n    entity: light.a\n    state: "on"\ncard:\n  type: custom:button-card\n  entity: light.a\n');
  assertHas(labels, ['card:', 'type:'], 'at the conditional card root');
  assertLacks(labels, BUTTON_ONLY, 'at the conditional card root');
});

test('an existing key right below an empty container opener, with the cursor inside it, is a key of its own mapping', () => {
  const doc = 'alias: x\nsequence:\n  - action: light.turn_on\n    target:\n    data:\n      brightness_pct: 50\n';
  const pos = doc.indexOf('ta:\n      brightness');
  assertHas(rowsAtPos(doc, pos), ACTION_STEP, 'inside data: below an empty target:');
});

test('the second key of a compact button-card styles.card item gets CSS properties', () => {
  assertHas(rowsAt('type: custom:button-card\nstyles:\n  card:\n  - color: red\n    '), CSS_ONLY, 'in a compact styles.card item');
});

test('the block-scalar check stays linear on long lines', () => {
  const started = Date.now();
  enclosingBlockKey(`x: ${'&a: '.repeat(5000)}\n  `);
  enclosingBlockKey(`actions:\n- k: ${'x: | #'.repeat(3500)} y\n    `);
  assert.ok(Date.now() - started < 500, `took ${Date.now() - started} ms`);
});

test('the root of a one-step fragment is named by its own keys', () => {
  const choose = 'choose:\n  - conditions:\n      - condition: state\n        entity_id: light.a\n        state: "on"\n    sequence:\n      - action: light.turn_off\n';
  for (const doc of [choose, `${choose}def`, 'repeat:\n  count: 3\n  sequence:\n    - action: light.toggle\n', `${choose}default:\n`]) {
    assertHas(rowsAt(doc), ['alias:', 'enabled:', 'continue_on_error:'], `at an action fragment root (${JSON.stringify(doc.slice(-24))})`);
  }
  assertHas(rowsAt('condition: and\nconditions:\n  - condition: state\n    entity_id: light.a\n    state: "on"\n'), ['condition:', 'value_template:'], 'at a condition fragment root');
  // Whole documents keep their root keys.
  assertHas(rowsAt('alias: x\nsequence:\n  - action: light.turn_on\n'), ['mode:', 'description:'], 'at a script root');
  assertHas(rowsAt(`${TRIGGERS_ABOVE}actions:\n  - action: light.turn_on\n`), ['mode:', 'description:'], 'at an automation root');
  assertHas(rowsAt('alias: Old\ntrigger:\n  - platform: state\naction:\n  - service: light.turn_on\n'), ['mode:'], 'at a legacy automation root');
});