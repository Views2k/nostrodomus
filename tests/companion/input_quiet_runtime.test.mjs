// ABSORB P4 — input-quiet runtime + suppression-gap guard unit tests.
// (The CodeMirror predicate truth table is also frozen in quiet_window_semantics.)

import test from 'node:test';
import assert from 'node:assert/strict';

import { createInputQuietRuntime, isCodeMirrorEvent } from '../../src/companion/inputQuietRuntime.js';

function harness({ dormant = false } = {}) {
  const clock = { t: 0 };
  let queue = [];
  let seq = 1;
  const setTimeout = (fn, ms) => { const id = seq++; queue.push({ id, fn, due: clock.t + (Number(ms) || 0) }); return id; };
  const clearTimeout = (id) => { queue = queue.filter((x) => x.id !== id); };
  const advance = (ms) => {
    clock.t += Number(ms) || 0;
    for (;;) {
      const due = queue.filter((x) => x.due <= clock.t).sort((a, b) => a.due - b.due);
      if (!due.length) break;
      const next = due[0];
      queue = queue.filter((x) => x.id !== next.id);
      next.fn();
    }
  };
  const storage = { getItem: (k) => (dormant && k === 'nostrodomusCompanion' ? 'dormant' : null) };
  const rt = createInputQuietRuntime({ globalRef: {}, storage, now: () => clock.t, setTimeout, clearTimeout });
  return { rt, advance, pending: () => queue.length };
}

const evt = (path) => ({ composedPath: () => path });

test('DORMANT guard is a strict no-op: deferDuringTyping returns false and runs work now even mid-quiet', () => {
  const { rt, pending } = harness({ dormant: true });
  rt.markEditorInputQuiet('typing'); // window is open...
  assert.equal(rt.editorInputQuietActive(), true, 'window is open');
  let ran = 0;
  const deferred = rt.deferDuringTyping('diagnostics', () => { ran += 1; });
  assert.equal(deferred, false, 'dormant -> never defers (behaves exactly as today)');
  assert.equal(ran, 0, 'the guard never executes the work itself; a false return means the caller runs it');
  assert.equal(pending(), 0, 'no flush timer scheduled while dormant');
  assert.equal(rt.sharedState.editorInputQuietSuppressions, 0, 'no suppression counted while dormant');
});

test('ACTIVE + quiet: defers the should-be work, flushes it once after the window', () => {
  const { rt, advance, pending } = harness({ dormant: false });
  rt.markEditorInputQuiet('typing');
  let ran = 0;
  assert.equal(rt.deferDuringTyping('diagnostics', () => { ran += 1; }), true, 'defers while active+quiet');
  assert.equal(ran, 0, 'not run synchronously');
  assert.ok(pending() >= 1, 'flush timer armed');
  advance(2000);
  assert.equal(ran, 1, 'flushed once after quiet');
  assert.equal(rt.sharedState.editorInputQuietFlushes, 1);
});

test('cleanup cancels a pending flush so deferred work never fires after teardown (audit QW8)', () => {
  const { rt, advance, pending } = harness({ dormant: false });
  rt.markEditorInputQuiet('typing');
  let ran = 0;
  assert.equal(rt.deferDuringTyping('diagnostics', () => { ran += 1; }), true, 'defers while active+quiet');
  assert.ok(pending() >= 1, 'flush timer armed');
  rt.cleanup();
  assert.equal(pending(), 0, 'cleanup cleared the pending flush timer');
  advance(5000);
  assert.equal(ran, 0, 'deferred work must not fire after cleanup');
  assert.equal(rt.editorInputQuietActive(), false, 'cleanup closes the quiet window');
});

test('ACTIVE but not quiet: deferDuringTyping runs now (returns false)', () => {
  const { rt, pending } = harness({ dormant: false });
  let ran = 0;
  assert.equal(rt.deferDuringTyping('diagnostics', () => { ran += 1; }), false, 'no quiet window -> run now');
  assert.equal(ran, 0, 'run-now means the caller runs the work after the false return');
  assert.equal(pending(), 0);
});

test('multiple defers during one quiet window collapse to a single trailing flush that runs every client (bug hunt 3)', () => {
  const { rt, advance } = harness({ dormant: false });
  rt.markEditorInputQuiet('typing');
  // Three DISTINCT clients (distinct reasons) each defer their own work in one window.
  let a = 0; let b = 0; let c = 0;
  rt.deferDuringTyping('picker-fix', () => { a += 1; });
  rt.deferDuringTyping('diagnostics-refresh', () => { b += 1; });
  rt.deferDuringTyping('scroll-sync', () => { c += 1; });
  advance(2000);
  // Coalescing is preserved: ONE flush event (not one per defer)...
  assert.equal(rt.snapshot().flushes, 1, 'still a single coalesced trailing flush, not one per defer');
  // ...but that flush runs EVERY client's work — no client's defer cancels another's.
  assert.deepEqual([a, b, c], [1, 1, 1], 'each distinct client runs exactly once');
});

test('repeated defers of the SAME reason coalesce to one run', () => {
  const { rt, advance } = harness({ dormant: false });
  rt.markEditorInputQuiet('typing');
  let ran = 0;
  rt.deferDuringTyping('same', () => { ran += 1; });
  rt.deferDuringTyping('same', () => { ran += 1; });
  advance(2000);
  assert.equal(ran, 1, 'same-reason work replaces (coalesces), it does not stack');
});

test('skipCodeEditorHotpath marks quiet for CodeMirror events only', () => {
  const { rt } = harness({ dormant: false });
  assert.equal(rt.skipCodeEditorHotpath(evt([{ localName: 'div' }]), 'r'), false);
  assert.equal(rt.editorInputQuietActive(), false);
  assert.equal(rt.skipCodeEditorHotpath(evt([{ localName: 'ha-code-editor' }]), 'r'), true);
  assert.equal(rt.editorInputQuietActive(), true, 'CM event opened the quiet window');
});

test('exported isCodeMirrorEvent predicate matches the frozen truth table', () => {
  assert.equal(isCodeMirrorEvent(evt([{ localName: 'ha-code-editor' }])), true);
  assert.equal(isCodeMirrorEvent(evt([{ className: 'x cm-scroller y' }])), true);
  assert.equal(isCodeMirrorEvent(evt([{ className: { baseVal: 'cm-line' } }])), true);
  assert.equal(isCodeMirrorEvent(evt([{ className: 'cm-content-wrapper' }])), false);
  assert.equal(isCodeMirrorEvent(evt([{ localName: 'div', className: 'foo' }])), false);
  assert.equal(isCodeMirrorEvent(evt([])), false);
});
