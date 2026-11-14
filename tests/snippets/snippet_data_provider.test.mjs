import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import snippetCatalogData from '../../data/snippets.json' with { type: 'json' };
import {
  NOSTRODOMUS_SNIPPET_CATALOG,
  NOSTRODOMUS_SNIPPET_FAMILIES,
  NOSTRODOMUS_SNIPPET_CONTEXT_KIND_SET,
  snippetCatalog,
} from '../../src/snippets/catalog.js';
import {
  activeSnippetContextKinds,
  buildSnippetProviderIndex,
  snippetProvider,
  snippetRow,
  snippetRowsForContext,
} from '../../src/providers/snippetProvider.js';

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

test('snippet catalog is loaded from validated JSON data', () => {
  assert.equal(snippetCatalogData.length, 91);
  assert.equal(snippetCatalog().length, snippetCatalogData.length);
  assert.equal(NOSTRODOMUS_SNIPPET_CATALOG[0].id, 'snip.dashboard.action.value.perform_action');
  assert.ok(NOSTRODOMUS_SNIPPET_FAMILIES.includes('dashboard-action'));
  assert.ok(NOSTRODOMUS_SNIPPET_CONTEXT_KIND_SET.includes('lovelace-action-block'));
});

test('snippet validator accepts the catalog used by the provider', () => {
  const result = spawnSync('python3', ['tools/validate_snippets.py'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SNIPPET VALIDATION OK \(91 snippets\)/);
});

test('snippet rows preserve provider row contract metadata', () => {
  const row = snippetRow(NOSTRODOMUS_SNIPPET_CATALOG.find(item => item.id === 'snip.sequence.service'));
  assert.equal(row.id, 'snip.sequence.service');
  assert.equal(row.lang, 'yaml');
  assert.equal(row.type, 'snippet');
  assert.equal(row.source, 'snippet-templates');
  assert.equal(row.meta.quickSnippet, true);
  assert.equal(row.meta.family, 'automation-action');
  assert.equal(row.meta.contextKind, 'automation-action');
  assert.deepEqual(row.meta.triggers, ['automation.action.service']);
});

test('dashboard action contexts return action snippets from data', () => {
  const ctx = {
    ...yamlBase,
    yamlKey: 'tap_action',
    yamlPath: ['cards', 'tap_action'],
    pathText: 'cards.tap_action',
    focusKind: 'action-block',
  };
  assert.deepEqual(activeSnippetContextKinds(ctx), ['lovelace-action-block']);
  const rows = snippetRowsForContext(ctx);
  assert.equal(rows[0].id, 'snip.dashboard.action.perform_action');
  assert.ok(rows.some(row => row.id === 'snip.dashboard.action.more_info'));
});

test('action value context returns value snippets instead of full action blocks', () => {
  const ctx = {
    ...yamlBase,
    yamlRole: 'value',
    yamlKey: 'action',
    yamlPath: ['cards', 'tap_action', 'action'],
    pathText: 'cards.tap_action.action',
    focusKind: 'action-block',
    valueKind: 'action',
  };
  assert.deepEqual(activeSnippetContextKinds(ctx), ['lovelace-action-value']);
  const ids = snippetRowsForContext(ctx).map(row => row.id);
  assert.deepEqual(ids, [
    'snip.dashboard.action.value.perform_action',
    'snip.dashboard.action.value.navigate',
    'snip.dashboard.action.value.url',
  ]);
});

test('automation, condition, target, style, and root contexts route to their data buckets', () => {
  const cases = [
    [{ ...yamlBase, yamlPath: ['actions'], pathText: 'actions', focusKind: 'automation-action' }, 'automation-action', 'snip.sequence.service'],
    [{ ...yamlBase, yamlPath: ['triggers'], pathText: 'triggers', focusKind: 'trigger-block' }, 'trigger-block', 'snip.trigger.state'],
    [{ ...yamlBase, yamlPath: ['conditions'], pathText: 'conditions', focusKind: 'condition-block' }, 'condition-block', 'snip.condition.state'],
    [{ ...yamlBase, yamlPath: ['target'], pathText: 'target', focusKind: 'target-block' }, 'target-block', 'snip.target.entity'],
    // A YAML key position in a style block gets the YAML style snippets; the CSS rule snippets
    // belong to the CSS text of the block (tests/snippets/style_snippet_lanes.test.mjs).
    [{ ...yamlBase, yamlPath: ['card_mod', 'style'], pathText: 'card_mod.style', focusKind: 'style-block' }, 'style-block', 'snip.button_card.styles_card'],
    [{ lang: 'css', scope: 'card-mod-css', shouldSuggest: true, yamlRole: 'code', yamlPath: ['card_mod', 'style'] }, 'style-block', 'snip.card_mod.ha_card'],
    [{ ...yamlBase, yamlRole: 'blank', yamlPath: [], pathText: '' }, 'dashboard-root', 'snip.card.entities'],
  ];

  for (const [ctx, kind, expectedId] of cases) {
    assert.ok(activeSnippetContextKinds(ctx).includes(kind), `${expectedId} should activate ${kind}`);
    assert.ok(snippetRowsForContext(ctx).some(row => row.id === expectedId), `${expectedId} should be returned`);
  }
});



test('snippet provider index reuses frozen rows for hot dashboard contexts', () => {
  const index = buildSnippetProviderIndex();
  const ctx = { ...yamlBase, yamlRole: 'blank', yamlPath: [], pathText: '' };
  const first = snippetRowsForContext(ctx, index);
  const second = snippetRowsForContext(ctx, index);
  assert.notEqual(first, second, 'snippet provider should return a fresh row array');
  assert.equal(first[0], second[0], 'snippet rows should come from the prebuilt index');
  assert.throws(() => { first[0].label = 'mutated'; }, TypeError);
});

test('snippet provider respects canHandle and scalar suppression gates', () => {
  const provider = snippetProvider();
  assert.equal(provider.canHandle({ ...yamlBase, shouldSuggest: true }), true);
  assert.equal(provider.canHandle({ ...yamlBase, shouldSuggest: false }), false);
  assert.deepEqual(provider.provide({ ...yamlBase, yamlRole: 'value', valueKind: 'entity', yamlKey: 'entity' }), []);
  assert.deepEqual(provider.provide({ ...yamlBase, lang: 'js' }), []);
});
