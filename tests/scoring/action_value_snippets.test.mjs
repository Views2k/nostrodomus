import test from 'node:test';
import assert from 'node:assert/strict';

import { itemMatchesYamlValueKind, scoreItems } from '../../src/completion/scoring.js';
import { snippetProvider } from '../../src/providers/snippetProvider.js';
import { haRuntimeValueProvider } from '../../src/providers/haRuntimeProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { prepareInsertText } from '../../src/completion/insertion.js';
import { parseSnippetTemplate } from '../../src/completion/snippets.js';

// The snippet provider has three rows for the value of a dashboard `action:` (perform-action,
// navigate and url, each with its sibling keys). The value-kind filter of the scorer let only
// rows of type "action" through, so these rows never reached the list.

const VALUE_SNIPPETS = ['snip.dashboard.action.value.perform_action', 'snip.dashboard.action.value.navigate', 'snip.dashboard.action.value.url'];
const data = { entities: [], entityNames: {}, services: ['light.turn_on'], serviceFields: {}, actions: ['more-info', 'toggle', 'perform-action', 'navigate', 'url', 'none'] };
const SETTINGS = { enabledLangs: { yaml: true }, maxItems: 20 };

function shownAt(doc, triggerKind = 'typing') {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind });
  const providers = [snippetProvider(), haRuntimeValueProvider({ runtimeData: () => data })];
  const shown = scoreItems(ctx, {
    settings: SETTINGS,
    providerCandidates: () => providers.flatMap(provider => (provider.canHandle(ctx) ? provider.provide(ctx) : [])),
  });
  return { ctx, shown, ids: shown.map(row => row.id) };
}

test('right after a dashboard action: the value snippets are in the list', () => {
  for (const doc of [
    'type: tile\nentity: light.kitchen\ntap_action:\n  action: ',
    'type: tile\nentity: light.kitchen\nhold_action:\n  action:',
    'type: vertical-stack\ncards:\n  - type: button\n    double_tap_action:\n      action: ',
  ]) {
    const { ctx, shown, ids } = shownAt(doc);
    assert.equal(ctx.valueKind, 'action');
    for (const id of VALUE_SNIPPETS) assert.ok(ids.includes(id), `${id} missing at ${JSON.stringify(doc)}`);
    // The plain action values are still there and still lead.
    assert.equal(shown[0].type, 'action');
    for (const label of ['more-info', 'toggle', 'perform-action', 'navigate']) assert.ok(shown.some(row => row.type === 'action' && row.label === label), label);
    assert.ok(shown.every(row => row.type === 'action' || VALUE_SNIPPETS.includes(row.id)), 'nothing else joins the value list');
  }
});

test('an accepted value snippet puts its other lines next to the action key', () => {
  const doc = 'type: tile\nentity: light.kitchen\ntap_action:\n  action: ';
  const { ctx, shown } = shownAt(doc);
  const row = shown.find(item => item.id === 'snip.dashboard.action.value.navigate');
  const text = doc.slice(0, ctx.from) + parseSnippetTemplate(prepareInsertText(row.insert, ctx, row)).text;
  assert.equal(text, 'type: tile\nentity: light.kitchen\ntap_action:\n  action: navigate\n  navigation_path: /lovelace/default');
});

test('once a prefix is typed only the plain action values are offered', () => {
  // The insertion step lines the other lines of a value snippet up only when the value is still
  // empty. With a typed prefix they would land at column 0, so the snippets stay out.
  const { ctx, ids, shown } = shownAt('type: tile\nentity: light.kitchen\ntap_action:\n  action: na');
  assert.equal(ctx.afterKeyColon, false);
  assert.deepEqual(ids.filter(id => VALUE_SNIPPETS.includes(id)), []);
  assert.ok(shown.some(row => row.type === 'action' && row.label === 'navigate'));
});

test('other snippets and other value kinds are filtered as before', () => {
  const valueCtx = { lang: 'yaml', valueKind: 'action', afterKeyColon: true };
  const valueSnippet = { type: 'snippet', source: 'snippet-templates', meta: { contextKind: 'lovelace-action-value' } };
  assert.equal(itemMatchesYamlValueKind(valueSnippet, valueCtx), true);
  assert.equal(itemMatchesYamlValueKind(valueSnippet, { ...valueCtx, afterKeyColon: false }), false);
  assert.equal(itemMatchesYamlValueKind({ type: 'action' }, { ...valueCtx, afterKeyColon: false }), true);
  assert.equal(itemMatchesYamlValueKind({ type: 'snippet', meta: { contextKind: 'lovelace-action-block' } }, valueCtx), false);
  assert.equal(itemMatchesYamlValueKind({ type: 'snippet', meta: { contextKind: 'dashboard-root' } }, valueCtx), false);
  assert.equal(itemMatchesYamlValueKind({ type: 'key' }, valueCtx), false);
  for (const valueKind of ['entity', 'service', 'card-type', 'icon', 'theme', 'boolean']) {
    assert.equal(itemMatchesYamlValueKind(valueSnippet, { lang: 'yaml', valueKind, afterKeyColon: true }), false, valueKind);
  }
});

test('an automation action value stays a service list', () => {
  const { ctx, ids, shown } = shownAt('actions:\n  - action: ');
  assert.equal(ctx.valueKind, 'service');
  assert.deepEqual(ids.filter(id => VALUE_SNIPPETS.includes(id)), []);
  assert.ok(shown.length > 0 && shown.every(row => row.type === 'service'));
});
