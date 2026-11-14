// ON-FLASH FIX (class lifecycle) — restoreDroppedSmartSyntaxClass guard.
// During a Ctrl+Space repaint, CodeMirror resets a .cm-line / token span className, DROPPING our
// nostrodomus-syntax-line-* / nostrodomus-syntax-kind-* class to bare for a frame; the bracket/punctuation then
// washes out to the native CM color. The class-preservation observer restores the dropped class
// synchronously from the MutationObserver oldValue. This pins the pure restore logic deterministically
// (no browser): a full dropout is restored; a legitimate kind-REPLACEMENT and non-editor elements are not.

import test from 'node:test';
import assert from 'node:assert/strict';

import { restoreDroppedSmartSyntaxClass } from '../../src/syntax/smartSyntaxStyles.js';

// Minimal fake element backed by a Set; className getter reflects it (as the real DOM does).
function fakeEl({ className = '', localName = 'div', isLine = false }) {
  const set = new Set(String(className).split(/\s+/).filter(Boolean));
  return {
    localName,
    matches: (sel) => (sel === '.cm-line' ? isLine : false),
    classList: {
      contains: (c) => set.has(c),
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
    },
    get className() { return [...set].join(' '); },
  };
}

test('restores a fully-dropped line class (bracket line "[[[" never passes through bare cm-line)', () => {
  const line = fakeEl({ className: 'cm-line cm-indent-markers', localName: 'div', isLine: true });
  const restored = restoreDroppedSmartSyntaxClass(line, 'cm-line cm-indent-markers nostrodomus-syntax-line-punct');
  assert.equal(restored, true);
  assert.ok(line.className.includes('nostrodomus-syntax-line-punct'), 'the dropped line-punct class is restored');
});

test('restores a fully-dropped kind class (punct span never passes through bare span.ͼa)', () => {
  const span = fakeEl({ className: 'ͼa', localName: 'span' });
  const restored = restoreDroppedSmartSyntaxClass(span, 'ͼa nostrodomus-syntax-kind-punct');
  assert.equal(restored, true);
  assert.ok(span.className.includes('nostrodomus-syntax-kind-punct'), 'the dropped kind-punct class is restored');
});

test('does NOT touch a legitimate kind REPLACEMENT (old kind -> new kind is not a dropout)', () => {
  const line = fakeEl({ className: 'cm-line nostrodomus-syntax-line-string', localName: 'div', isLine: true });
  const restored = restoreDroppedSmartSyntaxClass(line, 'cm-line nostrodomus-syntax-line-punct');
  assert.equal(restored, false, 'a class of the family is still present — the painter replaced the kind');
  assert.ok(!line.className.includes('nostrodomus-syntax-line-punct'), 'the old kind is not re-added over the new one');
  assert.ok(line.className.includes('nostrodomus-syntax-line-string'), 'the new kind stays');
});

test('no-op when the previous className had no nostrodomus class (ordinary class toggle)', () => {
  const line = fakeEl({ className: 'cm-line cm-activeLine', localName: 'div', isLine: true });
  assert.equal(restoreDroppedSmartSyntaxClass(line, 'cm-line'), false);
});

test('no-op on elements that are neither a .cm-line nor a span', () => {
  const div = fakeEl({ className: 'foo', localName: 'div', isLine: false });
  assert.equal(restoreDroppedSmartSyntaxClass(div, 'foo nostrodomus-syntax-line-punct'), false);
});

test('restore is idempotent — a restore mutation (old=bare) does not re-fire', () => {
  // Models the observer seeing its OWN classList.add: oldValue is the bare state (no nostrodomus class),
  // so nothing is dropped and nothing is restored (prevents a feedback loop).
  const line = fakeEl({ className: 'cm-line nostrodomus-syntax-line-punct', localName: 'div', isLine: true });
  assert.equal(restoreDroppedSmartSyntaxClass(line, 'cm-line cm-indent-markers'), false);
});
