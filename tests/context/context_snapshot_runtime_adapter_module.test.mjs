import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_STAGE,
  collectContextSnapshotDryRun,
  contextAdapterClampPosition,
  contextAdapterLineInfo,
  contextAdapterYamlRole,
  createContextSnapshotContract,
  normalizeContextSnapshot,
} from '../../src/context/contextSnapshotRuntimeAdapter.js';

test('ContextSnapshot runtime adapter keeps the dry-run contract shape', () => {
  const contract = createContextSnapshotContract();
  assert.equal(contract.version, 1);
  assert.equal(contract.language, '');
  assert.deepEqual(contract.runtime, {
    entitiesAvailable: false,
    servicesAvailable: false,
    devicesAvailable: false,
    areasAvailable: false,
  });
  assert.deepEqual(contract.suggestion, {
    triggerKind: '',
    prefix: '',
    from: 0,
    to: 0,
    shouldSuggest: false,
    suppressPopup: false,
    idleReason: '',
  });
});

test('ContextSnapshot runtime adapter clamps positions using the legacy numeric contract', () => {
  assert.equal(contextAdapterClampPosition('abcdef', -10), 0);
  assert.equal(contextAdapterClampPosition('abcdef', 3), 3);
  assert.equal(contextAdapterClampPosition('abcdef', 999), 6);
  assert.equal(contextAdapterClampPosition('abcdef', Number.NaN), 6);
  assert.equal(contextAdapterClampPosition('abcdef', '3'), 6);
});

test('ContextSnapshot runtime adapter preserves legacy line role detection', () => {
  assert.equal(contextAdapterYamlRole(contextAdapterLineInfo('type: custom:button-card', 1)), 'key');
  assert.equal(contextAdapterYamlRole(contextAdapterLineInfo('type: custom:button-card', 8)), 'value');
  assert.equal(contextAdapterYamlRole(contextAdapterLineInfo('  - ', 4)), 'list-key');
  assert.equal(contextAdapterYamlRole(contextAdapterLineInfo('  # comment', 5)), 'comment');
  assert.equal(contextAdapterYamlRole(contextAdapterLineInfo('   ', 2)), 'blank');
});

test('collectContextSnapshotDryRun is local-only and diagnostics-safe', () => {
  const doc = 'type: custom:button-card\nentity: light.kitchen\n';
  const pos = doc.indexOf('custom');
  const result = collectContextSnapshotDryRun({ doc, pos, scope: 'test-scope', path: ['cards', '0'] });

  assert.equal(result.ok, true);
  assert.equal(result.dryRunOnly, true);
  assert.equal(result.stage, NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_STAGE);
  assert.deepEqual(result.warnings, []);

  assert.equal(result.snapshot.language, 'yaml');
  assert.equal(result.snapshot.scope, 'test-scope');
  assert.equal(result.snapshot.confidence, 0.25);
  assert.equal(result.snapshot.yaml.key, 'type');
  assert.deepEqual(result.snapshot.yaml.path, ['cards', '0']);
  assert.equal(result.snapshot.yaml.role, 'value');
  assert.equal(result.snapshot.suggestion.shouldSuggest, false);
  assert.equal(result.snapshot.suggestion.suppressPopup, false);
  assert.equal(result.snapshot.suggestion.idleReason, 'runtime-adapter-dry-run-only');
  assert.deepEqual(result.snapshot.runtime, {
    entitiesAvailable: false,
    servicesAvailable: false,
    devicesAvailable: false,
    areasAvailable: false,
  });
});

test('collectContextSnapshotDryRun suppresses comments and suggests blank/key/list-key roles only', () => {
  const comment = collectContextSnapshotDryRun({ doc: '# sensor.test', pos: '# sensor.test'.length });
  assert.equal(comment.snapshot.yaml.role, 'comment');
  assert.equal(comment.snapshot.yaml.isComment, true);
  assert.equal(comment.snapshot.suggestion.shouldSuggest, false);
  assert.equal(comment.snapshot.suggestion.suppressPopup, true);

  const key = collectContextSnapshotDryRun({ doc: 'ent', pos: 3 });
  assert.equal(key.snapshot.yaml.role, 'key');
  assert.equal(key.snapshot.suggestion.shouldSuggest, true);
  assert.equal(key.snapshot.suggestion.prefix, 'ent');

  const listKey = collectContextSnapshotDryRun({ doc: '  - ', pos: 4 });
  assert.equal(listKey.snapshot.yaml.role, 'list-key');
  assert.equal(listKey.snapshot.suggestion.shouldSuggest, true);
});

test('normalizeContextSnapshot only merges one object layer like the legacy helper', () => {
  const normalized = normalizeContextSnapshot({ yaml: { role: 'key', key: 'entity' } }, {
    yaml: { key: 'type' },
    language: 'yaml',
  });
  assert.equal(normalized.language, 'yaml');
  assert.equal(normalized.yaml.role, 'key');
  assert.equal(normalized.yaml.key, 'type');
});

test('ContextSnapshot runtime adapter module remains pure browser-free source', () => {
  const text = readFileSync('src/context/contextSnapshotRuntimeAdapter.js', 'utf8');
  assert.doesNotMatch(text, /\bwindow\b|\bdocument\b|localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|new\s+MutationObserver|requestAnimationFrame|setTimeout|setInterval/);
});

test('dry-run snapshot locates the cursor in a doc longer than the 20000-char scan window', () => {
  // The doc is tail-sliced to the scan window; the cursor pos is in ORIGINAL-doc coordinates and must
  // be shifted by the dropped-prefix length. Put the cursor on a distinctive line that is inside the
  // window but NOT at the very end, so a missing offset (old bug: clamp to window end) is visible.
  const head = 'x: 1\n'.repeat(4200); // ~21000 chars, past the 20000 window
  const marker = 'marker: findme';
  const tail = '\nafter: 1\n'.repeat(50);
  const doc = head + marker + tail;
  const pos = head.length + marker.length; // end of the marker line, mid-window
  const { snapshot } = collectContextSnapshotDryRun({ doc, pos });
  assert.equal(snapshot.cursor.line, marker, 'cursor is on the marker line, not the doc tail');
  assert.equal(snapshot.yaml.key, 'marker');
});
