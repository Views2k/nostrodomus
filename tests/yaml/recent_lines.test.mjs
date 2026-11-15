// One context detection splits the text before the cursor into lines once, and the text of a
// CodeMirror document object is built once; the helpers share one remembered line window per text
// and cursor.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lineNumberAt, recentLinesBeforeCursor } from '../../src/yaml/recentLines.js';
import { detectRuntimeContext, lineInfo } from '../../src/yaml/runtimeContextAdapter.js';
import { blockScalarContextAt, currentYamlPath } from '../../src/yaml/yamlCompletionContext.js';
import { getDoc } from '../../src/editor/codeMirrorBridge.js';
import { lovelaceContextRows } from '../../src/providers/lovelaceContextProvider.js';
import { SECURITY_LIMITS } from '../../src/core/runtimeConstants.js';

function longCard(lines = 700) {
  const out = ['type: vertical-stack', 'cards:'];
  for (let i = 0; i < lines; i += 1) {
    out.push('  - type: entities', `    title: Row ${i}`, '    entities:', `      - entity: light.lamp_${i}`);
  }
  out.push('  - type: button', '    tap_action:', '      action: call-service', '      ');
  return out.join('\n');
}

const reference = (text, pos) => text.slice(Math.max(0, pos - SECURITY_LIMITS.maxDocScanChars), pos).split('\n').slice(-SECURITY_LIMITS.maxYamlPathLines);

test('the line window matches a plain split and is kept for the same text and cursor', () => {
  const text = longCard();
  for (const pos of [0, 1, 57, 2400, 24001, text.length - 9, text.length]) {
    assert.deepEqual([...recentLinesBeforeCursor(text, pos)], reference(text, pos), `pos ${pos}`);
  }
  const first = recentLinesBeforeCursor(text, text.length);
  assert.equal(recentLinesBeforeCursor(text, text.length), first, 'same text and cursor: the same array');
  assert.notEqual(recentLinesBeforeCursor(text, text.length - 1), first, 'another cursor: another window');
  assert.notEqual(recentLinesBeforeCursor(`${text} `, text.length), first, 'another text: another window');
  assert.ok(Object.isFrozen(first));
});

test('the line number matches the count of a plain split', () => {
  const text = 'a\nbb\n\nccc\n';
  for (let pos = 0; pos <= text.length; pos += 1) {
    assert.equal(lineNumberAt(text, pos), text.slice(0, pos).split('\n').length, `pos ${pos}`);
    assert.equal(lineInfo(text, pos).lineNumber, text.slice(0, pos).split('\n').length);
  }
  assert.equal(lineNumberAt('', 0), 1);
});

test('one context detection splits the text into lines once', () => {
  const text = longCard();
  // Warm nothing: a new text object, as after a keystroke.
  const fresh = `${text}a`;
  const split = String.prototype.split;
  let bigSplits = 0;
  String.prototype.split = function counted(separator, ...rest) {
    if (separator === '\n' && this.length > 2000) bigSplits += 1;
    return split.call(this, separator, ...rest);
  };
  let ctx;
  try {
    ctx = detectRuntimeContext(fresh, fresh.length, {});
  } finally {
    String.prototype.split = split;
  }
  assert.equal(ctx.lang, 'yaml');
  assert.ok(bigSplits <= 1, `expected one split of the text before the cursor, counted ${bigSplits}`);
});

test('a repeated path or block scalar question returns an equal, separate answer', () => {
  const text = 'card_mod:\n  style: |\n    ha-card {\n      color: red;\n';
  const first = currentYamlPath(text, text.length);
  first.push('changed by a caller');
  assert.deepEqual(currentYamlPath(text, text.length), ['card_mod', 'style']);
  const block = blockScalarContextAt(text, text.length);
  block.path.push('changed by a caller');
  assert.deepEqual(blockScalarContextAt(text, text.length).path, ['card_mod', 'style']);
  assert.equal(blockScalarContextAt('type: button\n', 13), null);
  assert.equal(blockScalarContextAt('type: button\n', 13), null);
});

test('the text of a document object is built once', () => {
  let calls = 0;
  const doc = { toString() { calls += 1; return 'type: button\n'; } };
  const runtimeState = { view: { state: { doc } } };
  assert.equal(getDoc(runtimeState), 'type: button\n');
  assert.equal(getDoc(runtimeState), 'type: button\n');
  assert.equal(calls, 1);
  // The next edit is a new document object.
  runtimeState.view.state.doc = { toString() { calls += 1; return 'type: tile\n'; } };
  assert.equal(getDoc(runtimeState), 'type: tile\n');
  assert.equal(calls, 2);
  assert.equal(getDoc({}), '');
  assert.equal(getDoc({ view: { state: { doc: 'plain string' } } }), 'plain string');
});

test('a context that carries a null branch state is not scanned for one again', () => {
  const doc = 'type: entities\n';
  let scans = 0;
  const ctx = { lang: 'yaml', yamlRole: 'key', yamlPath: [], beforeCursor: '', afterCursor: '', prefix: '', branchState: null };
  lovelaceContextRows(ctx, { getDoc: () => doc, getPos: () => doc.length, yamlBranchState: () => { scans += 1; return null; } });
  assert.equal(scans, 0);
  const without = { ...ctx };
  delete without.branchState;
  lovelaceContextRows(without, { getDoc: () => doc, getPos: () => doc.length, yamlBranchState: () => { scans += 1; return null; } });
  assert.equal(scans, 1, 'a context without the field still asks');
});
