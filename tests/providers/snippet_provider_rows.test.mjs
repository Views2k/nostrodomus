import test from 'node:test';
import assert from 'node:assert/strict';
import { legacySnippetRow, yamlPathHas } from '../../src/providers/snippetProvider.js';

test('snippet rows keep the runtime meta defaults with an injected normalizer', () => {
  const calls = [];
  const item = legacySnippetRow(
    'demo-snippet',
    'Demo snippet',
    'type: demo',
    ['demo', 'sample'],
    { family: 'dashboard-card', contextKind: 'dashboard-root', priority: 91, reason: 'legacy-test' },
    {
      providerId: 'snippet-templates',
      normalizeItem(row, source) {
        calls.push({ row, source });
        return {
          id: row[0],
          lang: row[1],
          type: row[2],
          label: row[3],
          insert: row[4],
          aliases: row[5],
          source,
          meta: { existing: true },
        };
      },
    },
  );

  assert.deepEqual(calls, [{
    row: ['demo-snippet', 'yaml', 'snippet', 'Demo snippet', 'type: demo', ['demo', 'sample']],
    source: 'snippet-templates',
  }]);
  assert.equal(item.id, 'demo-snippet');
  assert.equal(item.source, 'snippet-templates');
  assert.equal(item.meta.existing, true);
  assert.equal(item.meta.family, 'dashboard-card');
  assert.equal(item.meta.contextKind, 'dashboard-root');
  assert.equal(item.meta.sourceDetail, 'Nostrodomus snippet');
  assert.equal(item.meta.documentation, 'Context-aware Home Assistant YAML template.');
  assert.equal(item.meta.quickSnippet, true);
  assert.equal(item.meta.visualKind, 'snippet');
  assert.equal(item.meta.priority, 91);
  assert.equal(item.meta.reason, 'legacy-test');
});

test('yamlPathHas matches path parts case-insensitively', () => {
  assert.equal(yamlPathHas({ yamlPath: ['Cards', 'Tap_Action', 'Service'] }, 'tap_action'), true);
  assert.equal(yamlPathHas({ yamlPath: ['cards', 'target'] }, 'entity_id', 'target'), true);
  assert.equal(yamlPathHas({ yamlPath: ['cards', 'styles'] }, 'tap_action'), false);
  assert.equal(yamlPathHas(null, 'tap_action'), false);
});
