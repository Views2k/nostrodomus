import test from 'node:test';
import assert from 'node:assert/strict';

import { insertItem } from '../../src/completion/insertion.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// Accepts a row through the real context detection and the real insertItem. The document is
// written with the caret as `|`; the result is the document after the accept, with the caret
// marked the same way.
function editableView(initial) {
  const view = {
    text: initial,
    dispatches: [],
    state: { doc: { get length() { return view.text.length; } }, selection: { main: { anchor: 0, head: 0 } } },
    dispatch(payload) {
      view.dispatches.push(payload);
      const change = payload.changes;
      if (change) view.text = view.text.slice(0, change.from) + change.insert + view.text.slice(change.to);
      if (payload.selection) view.state.selection = { main: { anchor: payload.selection.anchor, head: payload.selection.head ?? payload.selection.anchor } };
    },
  };
  return view;
}

function accept(docWithCaret, item, triggerKind = 'typing') {
  const pos = docWithCaret.indexOf('|');
  const doc = docWithCaret.replace('|', '');
  const view = editableView(doc);
  const runtimeState = {
    enabled: true,
    settings: { acceptMode: 'replace' },
    view,
    context: detectRuntimeContext(doc, pos, { triggerKind }),
    items: [],
  };
  const ok = insertItem(runtimeState, item, { closeCompletion: () => {}, scheduleFrame: () => {}, now: () => 1 });
  assert.equal(ok, true, 'the row is inserted');
  const { anchor, head } = view.state.selection.main;
  if (anchor === head) return view.text.slice(0, head) + '|' + view.text.slice(head);
  // A selected snippet placeholder is shown as <<text>>.
  return view.text.slice(0, anchor) + '<<' + view.text.slice(anchor, head) + '>>' + view.text.slice(head);
}

const key = (name, insert = `${name}: `) => ({ type: 'key', label: `${name}:`, insert });
const value = (text) => ({ type: 'value', label: text, insert: text });

test('a block opened by a key of a list item is indented under the key, not under the dash', () => {
  // Already correct: a key that is not a list item.
  assert.equal(accept('type: button\ntap|', key('tap_action', 'tap_action:')), 'type: button\ntap_action:\n  |');
  assert.equal(accept('cards:\n  - type: button\n    tap|', key('tap_action', 'tap_action:')), 'cards:\n  - type: button\n    tap_action:\n      |');
  // The key sits two columns right of the dash; its block is two columns further.
  assert.equal(accept('cards:\n  - tap|', key('tap_action', 'tap_action:')), 'cards:\n  - tap_action:\n      |');
  assert.equal(accept('- tap|', key('tap_action', 'tap_action:')), '- tap_action:\n    |');
});

test('the line after an accepted action value lines up with the keys of the list item', () => {
  assert.equal(
    accept('tap_action:\n  action: call|', value('call-service')),
    'tap_action:\n  action: call-service\n  |',
    'outside a list (already correct)',
  );
  assert.equal(
    accept('actions:\n  - action: call|', value('call-service')),
    'actions:\n  - action: call-service\n    |',
  );
});

test('a row accepted right after the colon of a list-item key goes into that key\'s block', () => {
  assert.equal(accept('tap_action:|', key('action'), 'explicit'), 'tap_action:\n  action: |', 'outside a list (already correct)');
  assert.equal(
    accept('cards:\n  - type: button\n    tap_action:|', key('action'), 'explicit'),
    'cards:\n  - type: button\n    tap_action:\n      action: |',
    'a later key of a list item (already correct)',
  );
  assert.equal(accept('cards:\n  - tap_action:|', key('action'), 'explicit'), 'cards:\n  - tap_action:\n      action: |');
});

test('a key row accepted over a key that already has its colon renames the key', () => {
  // Already correct: rows that end at their colon.
  assert.equal(accept('type: entities\nentit|y: light.kitchen', key('entity')), 'type: entities\nentity: |light.kitchen');
  assert.equal(accept('type: entities\nentit|: light.kitchen', key('entities', 'entities:')), 'type: entities\nentities:| light.kitchen');
  assert.equal(accept('type: entities\nentit|', key('entity')), 'type: entities\nentity: |');
  // Already correct: a row that carries a value, on a line without a colon.
  assert.equal(accept('browser_mod:\n  siz|', key('size', 'size: normal')), 'browser_mod:\n  size: normal|');
  assert.equal(accept('type: button\nico|', key('icon', 'icon: mdi:')), 'type: button\nicon: mdi:|');

  // The line has a value: the key is renamed and the value stays.
  assert.equal(accept('browser_mod:\n  siz|e: wide', key('size', 'size: normal')), 'browser_mod:\n  size: |wide');
  assert.equal(accept('browser_mod:\n  siz|: wide', key('size', 'size: normal')), 'browser_mod:\n  size: |wide');
  assert.equal(accept('type: button\nico|n: mdi:home', key('icon', 'icon: mdi:')), 'type: button\nicon: |mdi:home');
  assert.equal(accept('cards:\n  - ico|n: mdi:home', key('icon', 'icon: mdi:')), 'cards:\n  - icon: |mdi:home');
  // The line has only the colon: the row's value fills it in.
  assert.equal(accept('browser_mod:\n  siz|e:', key('size', 'size: normal')), 'browser_mod:\n  size: normal|');
  assert.equal(accept('browser_mod:\n  siz|:  \n  title: x', key('size', 'size: normal')), 'browser_mod:\n  size: normal|\n  title: x');
});

test('a row accepted right after the colon of a list-valued key becomes the first list item', () => {
  // Already correct: the value of these keys is a mapping.
  assert.equal(accept('tap_action:|', key('action'), 'explicit'), 'tap_action:\n  action: |');
  assert.equal(accept('styles:|', key('card', 'card:'), 'explicit'), 'styles:\n  card:|');

  assert.equal(accept('type: vertical-stack\ncards:|', key('type'), 'explicit'), 'type: vertical-stack\ncards:\n  - type: |');
  assert.equal(accept('type: vertical-stack\ncards: |', key('type'), 'explicit'), 'type: vertical-stack\ncards: \n  - type: |');
  assert.equal(accept('actions:|', key('action'), 'explicit'), 'actions:\n  - action: |');
  assert.equal(accept('triggers:|', key('trigger'), 'explicit'), 'triggers:\n  - trigger: |');
  assert.equal(
    accept('cards:|\n  - type: button', key('type'), 'explicit'),
    'cards:\n  - type: |\n  - type: button',
    'in front of the items that are already there',
  );
  // A row that brings its own dash keeps it.
  assert.equal(accept('cards:|', { type: 'key', label: 'type:', insert: '- type: ' }, 'explicit'), 'cards:\n  - type: |');
  // Inside a list item, and a key that opens a block of its own.
  assert.equal(accept('cards:\n  - cards:|', key('type'), 'explicit'), 'cards:\n  - cards:\n      - type: |');
  assert.equal(accept('cards:|', key('tap_action', 'tap_action:'), 'explicit'), 'cards:\n  - tap_action:\n      |');
});

test('else under a catalog card stays a mapping; else in a script is a list of steps', () => {
  const autoEntities = 'type: custom:auto-entities\ncard:\n  type: entities\nfilter:\n  include: []\nelse:|';
  assert.equal(accept(autoEntities, key('type'), 'explicit'), autoEntities.replace('else:|', 'else:\n  type: |'));
  assert.equal(
    accept('sequence:\n  - if:\n      - condition: state\n    then:\n      - action: light.turn_on\n    else:|', key('action'), 'explicit'),
    'sequence:\n  - if:\n      - condition: state\n    then:\n      - action: light.turn_on\n    else:\n      - action: |',
  );
});

test('a snippet accepted right after the colon of a list-valued key is a list item', () => {
  const dashed = { type: 'snippet', label: 'state trigger', insert: '- trigger: state\n  entity_id: ${1:binary_sensor.example}' };
  assert.equal(
    accept('triggers:|', dashed, 'explicit'),
    'triggers:\n  - trigger: state\n    entity_id: <<binary_sensor.example>>',
    'a snippet with its own dash (already correct)',
  );
  const plain = { type: 'snippet', label: 'action step', insert: 'action: ${1:light.turn_on}\ntarget:\n  entity_id: ${2:light.example}' };
  assert.equal(
    accept('actions:|', plain, 'explicit'),
    'actions:\n  - action: <<light.turn_on>>\n    target:\n      entity_id: light.example',
  );
  assert.equal(
    accept('tap_action:|', plain, 'explicit'),
    'tap_action:\n  action: <<light.turn_on>>\n  target:\n    entity_id: light.example',
    'under a mapping key (already correct)',
  );
});

test('a key that opens a block, accepted as the first line of another block, is indented from its own line', () => {
  assert.equal(accept('browser_mod:|', key('data', 'data:'), 'explicit'), 'browser_mod:\n  data:\n    |');
  assert.equal(accept('cards:\n  - browser_mod:|', key('data', 'data:'), 'explicit'), 'cards:\n  - browser_mod:\n      data:\n        |');
});
