import test from 'node:test';
import assert from 'node:assert/strict';

import { collectContextSnapshotDryRun } from '../../src/context/contextSnapshotRuntimeAdapter.js';

// The dry-run readout scans at most 20,000 characters. It kept the last 20,000 of the text, so
// with the cursor further up the readout described the first line of that tail instead of the
// line the cursor is on.

const LINE = 'filler: 1\n';
const MARKER = '    entity: light.kitchen';

function longDoc(linesBefore, linesAfter) {
  return { head: LINE.repeat(linesBefore), tail: `\n${LINE.repeat(linesAfter)}` };
}

test('the cursor before the last 20,000 characters is read on its own line', () => {
  const { head, tail } = longDoc(300, 4000);          // 40,000 characters after the marker
  const doc = head + MARKER + tail;
  assert.ok(doc.length - (head.length + MARKER.length) > 20000);
  const pos = head.length + '    entity: li'.length;
  const { snapshot } = collectContextSnapshotDryRun({ doc, pos });
  assert.equal(snapshot.cursor.line, MARKER);
  assert.equal(snapshot.cursor.col, '    entity: li'.length);
  assert.equal(snapshot.cursor.beforeCursor, '    entity: li');
  assert.equal(snapshot.cursor.afterCursor, 'ght.kitchen');
  assert.equal(snapshot.yaml.key, 'entity');
  assert.equal(snapshot.yaml.role, 'value');
  assert.equal(snapshot.yaml.indent, 4);
  assert.equal(snapshot.suggestion.prefix, 'li');
});

test('the cursor at the very start of a long text is read on the first line', () => {
  const doc = `type: entities\n${LINE.repeat(5000)}`;
  for (const pos of [0, 4, -5]) {
    const { snapshot } = collectContextSnapshotDryRun({ doc, pos });
    assert.equal(snapshot.cursor.line, 'type: entities', `pos ${pos}`);
    assert.equal(snapshot.yaml.key, 'type');
  }
  assert.equal(collectContextSnapshotDryRun({ doc, pos: 4 }).snapshot.cursor.beforeCursor, 'type');
});

test('the cursor deep in a long text, far from both ends', () => {
  const { head, tail } = longDoc(3000, 3000);          // 30,000 characters on each side
  const doc = head + MARKER + tail;
  const { snapshot } = collectContextSnapshotDryRun({ doc, pos: head.length + MARKER.length });
  assert.equal(snapshot.cursor.line, MARKER);
  assert.equal(snapshot.cursor.afterCursor, '');
  assert.equal(snapshot.yaml.key, 'entity');
});

test('the cursor inside the last 20,000 characters gives the readout it gave before', () => {
  const { head, tail } = longDoc(4200, 50);
  const doc = head + MARKER + tail;
  const pos = head.length + MARKER.length;
  const { snapshot } = collectContextSnapshotDryRun({ doc, pos });
  assert.equal(snapshot.cursor.line, MARKER);
  // Positions in the readout are counted from the start of the scanned tail, as before.
  assert.equal(snapshot.cursor.pos, pos - (doc.length - 20000));
  assert.equal(snapshot.suggestion.from, snapshot.cursor.pos);

  const atEnd = collectContextSnapshotDryRun({ doc }).snapshot;
  assert.equal(atEnd.cursor.pos, 20000);
  assert.equal(atEnd.cursor.line, '');
});

test('a short text is read as it is', () => {
  const doc = 'type: entities\nentities:\n  - light.kitchen\n';
  const { snapshot } = collectContextSnapshotDryRun({ doc, pos: 4 });
  assert.equal(snapshot.cursor.line, 'type: entities');
  assert.equal(snapshot.cursor.pos, 4);
  assert.equal(snapshot.yaml.role, 'key');
});
