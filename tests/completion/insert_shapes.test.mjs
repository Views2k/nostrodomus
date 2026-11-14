import test from 'node:test';
import assert from 'node:assert/strict';
import {
  insertItem,
  parseSnippetTemplate,
  prepareInsertText,
} from '../../src/completion/insertion.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';

// Runs the real context detection for a document with the caret marked as `|`, prepares the
// row the way insertItem does, and returns the document after the accept.
function acceptAt(docWithCaret, item, triggerKind = 'explicit') {
  const pos = docWithCaret.indexOf('|');
  const doc = docWithCaret.replace('|', '');
  const ctx = detectRuntimeContext(doc, pos, { triggerKind, runtimeData: { entities: ['light.kitchen', 'switch.kitchen_plug'] } });
  let insert = prepareInsertText(item.insert, ctx, item);
  if (item.type === 'snippet') insert = parseSnippetTemplate(insert).text;
  return doc.slice(0, ctx.from) + insert + doc.slice(ctx.wordTo);
}

// [A]
test('a value accepted after "key: " keeps a single space and stays on the key line', () => {
  const entity = { type: 'entity', insert: 'light.kitchen' };
  const icon = { type: 'icon', insert: 'mdi:lightbulb' };
  assert.equal(acceptAt('entity: |', entity), 'entity: light.kitchen');
  assert.equal(acceptAt('entity:|', entity), 'entity: light.kitchen');
  assert.equal(acceptAt('type: button\nicon: |', icon), 'type: button\nicon: mdi:lightbulb');
  assert.equal(acceptAt('type: button\nicon: mdi:|', icon), 'type: button\nicon: mdi:lightbulb');
  assert.equal(acceptAt('type: button\nicon: mdi:li|', icon), 'type: button\nicon: mdi:lightbulb');
});

// [B]
test('a multi-line snippet accepted after a typed filter prefix follows the line indentation', () => {
  const block = { type: 'snippet', insert: 'action: perform-action\nperform_action: ${1:light.turn_on}\ntarget:\n  entity_id: ${2:light.example}' };
  const expected = 'type: button\ntap_action:\n  action: perform-action\n  perform_action: light.turn_on\n  target:\n    entity_id: light.example';
  assert.equal(acceptAt('type: button\ntap_action:\n  |', block), expected, 'blank line (already worked)');
  assert.equal(acceptAt('type: button\ntap_action:\n  per|', block, 'typing'), expected, 'typed prefix');
});

test('a snippet accepted on a list item keeps the dash and lines up under the first key', () => {
  const trigger = { type: 'snippet', insert: '- trigger: state\n  entity_id: ${1:binary_sensor.example}\n  to: ${2:on}' };
  const expected = 'triggers:\n  - trigger: state\n    entity_id: binary_sensor.example\n    to: on';
  for (const doc of ['triggers:\n  |', 'triggers:\n  - |', 'triggers:\n  -|', 'triggers:\n  - sta|', 'triggers:\n  sta|']) {
    assert.equal(acceptAt(doc, trigger), expected, JSON.stringify(doc));
  }
  const step = { type: 'snippet', insert: 'action: ${1:light.turn_on}\ntarget:\n  entity_id: ${2:light.example}' };
  assert.equal(
    acceptAt('actions:\n  - |', step),
    'actions:\n  - action: light.turn_on\n    target:\n      entity_id: light.example',
  );
});

test('a row accepted right after a bare list dash keeps the dash', () => {
  assert.equal(acceptAt('entities:\n  -|', { type: 'entity', insert: 'light.kitchen' }), 'entities:\n  - light.kitchen');
});

// [G]
test('a list-item entity is replaced up to the end of the entity id', () => {
  const entity = { type: 'entity', insert: 'switch.kitchen_plug' };
  assert.equal(acceptAt('entities:\n  - sw|.kitchen', entity, 'typing'), 'entities:\n  - switch.kitchen_plug');
  assert.equal(acceptAt('entities:\n  - light.ki|', entity, 'typing'), 'entities:\n  - switch.kitchen_plug');
});

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

function insertAt(docWithCaret, item, extraState = {}) {
  const pos = docWithCaret.indexOf('|');
  const doc = docWithCaret.replace('|', '');
  const view = editableView(doc);
  const runtimeState = {
    enabled: true,
    settings: { acceptMode: 'replace' },
    view,
    context: detectRuntimeContext(doc, pos, { triggerKind: 'typing' }),
    items: [],
    ...extraState,
  };
  if (runtimeState.snippetSession) runtimeState.snippetSession.view = view;
  const ok = insertItem(runtimeState, item, { closeCompletion: () => {}, scheduleFrame: () => {}, now: () => 1 });
  return { ok, view, runtimeState };
}

// [E]
test('a key row accepted on a line that already has its colon does not leave a second colon', () => {
  const withSpace = insertAt('type: entities\nentit|y: light.kitchen', { type: 'key', label: 'entity:', insert: 'entity: ' });
  assert.equal(withSpace.view.text, 'type: entities\nentity: light.kitchen');
  assert.equal(withSpace.view.dispatches[0].selection.anchor, 'type: entities\nentity: '.length, 'caret lands in front of the value');

  const bare = insertAt('type: entities\nentit|: light.kitchen', { type: 'key', label: 'entities:', insert: 'entities:' });
  assert.equal(bare.view.text, 'type: entities\nentities: light.kitchen');

  const fresh = insertAt('type: entities\nentit|', { type: 'key', label: 'entity:', insert: 'entity: ' });
  assert.equal(fresh.view.text, 'type: entities\nentity: ', 'a key without a colon is unchanged');
});

// [C]
test('a value accepted inside the active snippet placeholder keeps the snippet session', () => {
  // `action: ${1:light.turn_on}` was inserted at 0, the user typed `sw` over stop 1.
  const session = () => ({
    from: 0,
    index: 0,
    placeholders: [{ index: 1, start: 8, end: 10 }, { index: 2, start: 32, end: 45 }],
    allPlaceholders: [{ index: 1, start: 8, end: 10 }, { index: 2, start: 32, end: 45 }],
    finalCursor: null,
    choices: [],
  });
  const inside = insertAt('action: sw|\ntarget:\n  entity_id: light.example', { type: 'service', label: 'switch.turn_on', insert: 'switch.turn_on' }, { snippetSession: session() });
  assert.equal(inside.view.text, 'action: switch.turn_on\ntarget:\n  entity_id: light.example');
  assert.ok(inside.runtimeState.snippetSession, 'the session survives the accept, so Tab still reaches stop 2');

  const outside = insertAt('action: sw\ntarget:\n  entity_id: light.example\nna|', { type: 'key', label: 'name:', insert: 'name: ' }, { snippetSession: session() });
  assert.equal(outside.runtimeState.snippetSession, null, 'an accept elsewhere still ends the session');
});


test('a list-item snippet accepted right after a sequence key keeps its dash', () => {
  const trigger = { type: 'snippet', insert: '- trigger: state\n  entity_id: ${1:binary_sensor.example}\n  to: ${2:on}' };
  const expected = 'triggers:\n  - trigger: state\n    entity_id: binary_sensor.example\n    to: on';
  assert.equal(acceptAt('triggers:|', trigger), expected);
  assert.equal(acceptAt('triggers: |', trigger), expected.replace('triggers:', 'triggers: '), 'the typed space stays; the YAML is the same');
  const action = { type: 'snippet', insert: '- action: ${1:light.turn_on}\n  target:\n    entity_id: ${2:light.example}' };
  assert.equal(acceptAt('actions:|', action), 'actions:\n  - action: light.turn_on\n    target:\n      entity_id: light.example');
});