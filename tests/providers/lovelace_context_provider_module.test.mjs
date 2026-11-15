import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contextRow,
  looksLikeButtonCardContext,
  lovelaceContextProvider,
  lovelaceContextRows,
  recentYamlText,
  rowSet,
  yamlPathText,
} from '../../src/providers/lovelaceContextProvider.js';

test('Lovelace context helpers create provider rows without browser globals', () => {
  const row = contextRow('ctx.test', 'key', 'entity:', 'entity: ', ['entity'], {
    documentation: 'Entity row test.',
    contextKind: 'entity-row',
  });

  assert.equal(row.id, 'ctx.test');
  assert.equal(row.lang, 'yaml');
  assert.equal(row.type, 'key');
  assert.equal(row.label, 'entity:');
  assert.equal(row.insert, 'entity: ');
  assert.equal(row.source, 'lovelace-context');
  assert.equal(row.meta.sourceDetail, 'Lovelace context');
  assert.equal(row.meta.documentation, 'Entity row test.');
  assert.equal(row.meta.contextKind, 'entity-row');

  const rows = rowSet([
    ['ctx.a', 'key', 'name:', 'name: ', ['name']],
    ['ctx.b', 'key', 'icon:', 'icon: mdi:', ['icon']],
  ]);
  assert.deepEqual(rows.map(item => item.id), ['ctx.a', 'ctx.b']);
});

test('Lovelace context path/recent helpers use injected document dependencies', () => {
  const ctx = { yamlPath: ['cards', '0', 'styles'], lang: 'yaml' };
  assert.equal(yamlPathText(ctx), 'cards.0.styles');

  const doc = 'type: custom:button-card\nstyles:\n  card:';
  assert.equal(recentYamlText(ctx, { getDoc: () => doc, getPos: () => doc.length }).includes('custom:button-card'), true);
  assert.equal(looksLikeButtonCardContext(ctx, { getDoc: () => doc, getPos: () => doc.length }), true);
});

test('Lovelace context rows offer action keys under tap_action and style keys under styles', () => {
  const actionRows = lovelaceContextRows({
    lang: 'yaml',
    yamlRole: 'key',
    yamlPath: ['tap_action'],
    yamlKey: '',
    beforeCursor: 'tap_action:\n  ',
  });
  assert.equal(actionRows.some(row => row.label === 'action:'), true);
  assert.equal(actionRows.some(row => row.label === 'target:'), true);

  const styleRows = lovelaceContextRows({
    lang: 'yaml',
    yamlRole: 'key',
    yamlPath: ['styles'],
    yamlKey: '',
    beforeCursor: 'styles:\n',
  });
  assert.equal(styleRows.some(row => row.label === 'card:'), true);
  assert.equal(styleRows.some(row => row.label === 'icon:'), true);
});

test('Lovelace context rows use injected branch-state summaries for action blocks', () => {
  let called = 0;
  const rows = lovelaceContextRows({
    lang: 'yaml',
    yamlRole: 'key',
    yamlPath: ['tap_action'],
    yamlKey: '',
    beforeCursor: 'tap_action:\n  action: perform-action\n  ',
  }, {
    getDoc: () => 'tap_action:\n  action: perform-action\n  ',
    getPos: () => 38,
    yamlBranchState: () => {
      called += 1;
      return {
        kind: 'action-block',
        actionValue: 'perform-action',
        siblings: { action: 'perform-action' },
        missingKeys: ['perform_action', 'target', 'data'],
      };
    },
  });

  assert.equal(called, 1);
  assert.equal(rows.some(row => row.label === 'perform_action:'), true);
  assert.equal(rows.some(row => row.label === 'action:'), false);
});

test('Lovelace context provider delegates canHandle/provide through module rows', () => {
  const provider = lovelaceContextProvider();
  assert.equal(provider.id, 'lovelace-context');
  assert.equal(provider.canHandle({ lang: 'yaml', yamlRole: 'key' }), true);
  assert.equal(provider.canHandle({ lang: 'css', yamlRole: 'key' }), false);

  const rows = provider.provide({
    lang: 'yaml',
    yamlRole: 'key',
    yamlPath: ['cards'],
    yamlKey: '',
    beforeCursor: 'cards:\n  - ',
  });
  assert.equal(rows.some(row => row.label === 'type:'), true);
});
