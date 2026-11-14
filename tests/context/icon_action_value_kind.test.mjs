import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext, yamlValueKind as adapterValueKind } from '../../src/yaml/runtimeContextAdapter.js';
import { yamlValueKind as classifierValueKind } from '../../src/yaml/yamlContextClassifier.js';
import { haRuntimeValueProvider } from '../../src/providers/haRuntimeProvider.js';

// A tile card has icon_tap_action, icon_hold_action and icon_double_tap_action next to the usual
// tap actions. Their `action:` takes a dashboard action (more-info, toggle, navigate), not a
// service id.

const data = {
  entities: ['light.kitchen'],
  entityNames: {},
  services: ['light.turn_on', 'light.toggle'],
  serviceFields: {},
  actions: ['more-info', 'toggle', 'perform-action', 'navigate', 'none'],
};

function at(doc) {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'explicit' });
  const provider = haRuntimeValueProvider({ runtimeData: () => data });
  const rows = provider.canHandle(ctx) ? provider.provide(ctx) : [];
  return { ctx, types: [...new Set(rows.map(row => row.type))], labels: rows.map(row => row.label) };
}

for (const key of ['icon_tap_action', 'icon_hold_action', 'icon_double_tap_action']) {
  test(`${key}: the action value is a dashboard action`, () => {
    for (const doc of [
      `type: tile\nentity: light.kitchen\n${key}:\n  action: `,
      `type: tile\nentity: light.kitchen\n${key}:\n  action: tog`,
      `type: vertical-stack\ncards:\n  - type: tile\n    entity: light.kitchen\n    ${key}:\n      action: `,
    ]) {
      const { ctx, types, labels } = at(doc);
      assert.equal(ctx.valueKind, 'action', JSON.stringify(doc));
      assert.equal(classifierValueKind(ctx), 'action', 'the provider-side copy agrees');
      assert.deepEqual(types, ['action']);
      assert.ok(labels.includes('toggle') && !labels.includes('light.toggle'), JSON.stringify(labels));
    }
  });
}

test('the usual tap actions keep the dashboard action lane', () => {
  for (const key of ['tap_action', 'hold_action', 'double_tap_action']) {
    const { ctx, types } = at(`type: tile\nentity: light.kitchen\n${key}:\n  action: `);
    assert.equal(ctx.valueKind, 'action', key);
    assert.deepEqual(types, ['action'], key);
  }
});

test('automation and script steps keep the service lane', () => {
  for (const doc of [
    'actions:\n  - action: ',
    'sequence:\n  - action: light.t',
    'action: light.tu',
    'actions:\n  - if:\n      - condition: state\n    then:\n      - action: ',
  ]) {
    const { ctx, types, labels } = at(doc);
    assert.equal(ctx.valueKind, 'service', JSON.stringify(doc));
    assert.deepEqual(types, ['service'], JSON.stringify(doc));
    assert.ok(labels.length > 0 && labels.every(label => label.startsWith('light.')), JSON.stringify(labels));
  }
});

test('both copies of the classifier agree on the icon action keys', () => {
  for (const yamlKey of ['action', 'service', 'perform_action', 'entity', 'icon', 'name']) {
    for (const yamlPath of [['icon_tap_action'], ['icon_tap_action', 'action'], ['cards', 'type', 'icon_hold_action'], ['icon_double_tap_action', 'target'], ['icon'], ['tap_action']]) {
      for (const yamlRole of ['value', 'key', 'list-key']) {
        const ctx = { yamlKey, yamlPath, yamlRole, lang: 'yaml' };
        assert.equal(adapterValueKind(ctx), classifierValueKind(ctx), JSON.stringify(ctx));
      }
    }
  }
});
