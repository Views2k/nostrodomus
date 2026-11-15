import test from 'node:test';
import assert from 'node:assert/strict';

import { NOSTRODOMUS_SNIPPET_CATALOG } from '../../src/snippets/catalog.js';
import { lovelaceContextRows } from '../../src/providers/lovelaceContextProvider.js';

// Since Home Assistant 2026.6 a /lovelace/ path opens the built-in Overview (docs/COMPAT.md), so
// the default navigation path of a snippet points at a dashboard the user created.

test('no snippet defaults navigation_path to a /lovelace/ path', () => {
  const navigating = NOSTRODOMUS_SNIPPET_CATALOG.filter(snippet => snippet.insert.includes('navigation_path:'));
  assert.equal(navigating.length, 3, navigating.map(snippet => snippet.id).join(', '));
  for (const snippet of navigating) {
    assert.doesNotMatch(snippet.insert, /navigation_path: \$\{\d+:\/lovelace\//, snippet.id);
    assert.match(snippet.insert, /navigation_path: \$\{\d+:\/my-dashboard\/home\}/, snippet.id);
  }
});

test('the navigate action block offered under tap_action defaults to a dashboard path', () => {
  const rows = lovelaceContextRows({ lang: 'yaml', yamlRole: 'key', yamlPath: ['tap_action'], yamlKey: '', beforeCursor: 'tap_action:\n  ' });
  const row = rows.find(item => item.id === 'ctx.action.navigate_snippet');
  assert.ok(row, rows.map(item => item.id).join(', '));
  assert.doesNotMatch(row.insert, /navigation_path: \$\{\d+:\/lovelace\//);
  assert.match(row.insert, /navigation_path: \$\{1:\/my-dashboard\/home\}/);
});
