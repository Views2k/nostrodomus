// Quiet-window semantics golden baseline.
//
// src/companion/inputQuietRuntime.js reproduces picker-safe's typing-session quiet window. This
// test pins that window under a controlled clock: how long it stays active after a mark, the
// defer-then-flush sequence, and the CodeMirror hot-path truth table. The functions under test are
// a verbatim copy of the source, and one test checks that the copy has not drifted.
// input_quiet_runtime.test.mjs has the detailed timing tests of the module. If this test fails,
// fix the module, not this file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  __resetQuietFixture,
  __advanceClock,
  __pendingTimerCount,
  __setPickerApply,
  __nostrodomusPickerSafeSharedState,
  __nostrodomusMarkEditorInputQuiet,
  __nostrodomusEditorInputQuietActive,
  __nostrodomusDeferPickerWorkDuringEditorInput,
  __nostrodomusSkipCodeEditorHotpath,
  __nostrodomusIsCodeMirrorEvent,
} from './_fixtures/quietWindow.fixture.mjs';
import {
  readCompanion,
  PICKER_PATH,
  extractFunctionSource,
  companionModuleExists,
  companionModuleUrl,
} from './_fixtures/companionSource.mjs';

const QUIET_MS = 1000; // editorInputQuietMs default in source

const evt = (path) => ({ composedPath: () => path });

test('mark opens a quiet window of exactly editorInputQuietMs', () => {
  __resetQuietFixture();
  assert.equal(__nostrodomusEditorInputQuietActive(), false, 'inactive before any mark');
  __nostrodomusMarkEditorInputQuiet('typing');
  assert.equal(__nostrodomusPickerSafeSharedState.editorInputQuietUntil, QUIET_MS);
  assert.equal(__nostrodomusEditorInputQuietActive(), true, 'active immediately after mark');
  __advanceClock(QUIET_MS - 1);
  assert.equal(__nostrodomusEditorInputQuietActive(), true, 'active 1ms before window end');
  __advanceClock(2);
  assert.equal(__nostrodomusEditorInputQuietActive(), false, 'inactive past window end');
});

test('defer suppresses picker work during quiet, then flushes it exactly once after quiet', () => {
  __resetQuietFixture();
  __nostrodomusMarkEditorInputQuiet('typing');

  let ran = 0;
  const deferred = __nostrodomusDeferPickerWorkDuringEditorInput('picker-work', () => { ran += 1; });
  assert.equal(deferred, true, 'returns true while quiet');
  assert.equal(__nostrodomusPickerSafeSharedState.editorInputQuietSuppressions, 1);
  assert.equal(ran, 0, 'work must not run synchronously while quiet');
  assert.ok(__pendingTimerCount() >= 1, 'a flush timer must be armed');

  __advanceClock(QUIET_MS + 500);
  assert.equal(ran, 1, 'deferred work runs once after the window closes');
  assert.equal(__nostrodomusPickerSafeSharedState.editorInputQuietFlushes, 1);
});

test('defer is a pass-through (returns false, runs nothing) when not quiet', () => {
  __resetQuietFixture();
  let ran = 0;
  const deferred = __nostrodomusDeferPickerWorkDuringEditorInput('picker-work', () => { ran += 1; });
  assert.equal(deferred, false, 'returns false when no quiet window is open');
  assert.equal(__nostrodomusPickerSafeSharedState.editorInputQuietSuppressions, 0);
  assert.equal(__pendingTimerCount(), 0, 'no flush timer when not quiet');
  assert.equal(ran, 0);
});

test('defer falls back to window.NostrodomusPickerSafe.apply when no applyFn is given', () => {
  __resetQuietFixture();
  let ran = 0;
  __setPickerApply(() => { ran += 1; });
  __nostrodomusMarkEditorInputQuiet('typing');
  __nostrodomusDeferPickerWorkDuringEditorInput('picker-work'); // no applyFn -> global fallback
  __advanceClock(QUIET_MS + 500);
  assert.equal(ran, 1, 'flush uses the global apply fallback');
});

test('CodeMirror hotpath predicate truth table', () => {
  // ha-code-editor by localName
  assert.equal(__nostrodomusIsCodeMirrorEvent(evt([{ localName: 'ha-code-editor' }])), true);
  // each cm-* class (space-padded match in source)
  for (const cls of ['cm-editor', 'cm-content', 'cm-scroller', 'cm-line']) {
    assert.equal(__nostrodomusIsCodeMirrorEvent(evt([{ className: `x ${cls} y` }])), true, `${cls} matches`);
  }
  // SVG-style className (baseVal) is read by __nostrodomusClassText
  assert.equal(__nostrodomusIsCodeMirrorEvent(evt([{ className: { baseVal: 'cm-line' } }])), true);
  // partial class name must not match (relies on space padding)
  assert.equal(__nostrodomusIsCodeMirrorEvent(evt([{ className: 'cm-content-wrapper' }])), false);
  // unrelated node, and empty path
  assert.equal(__nostrodomusIsCodeMirrorEvent(evt([{ localName: 'div', className: 'foo' }])), false);
  assert.equal(__nostrodomusIsCodeMirrorEvent(evt([])), false);
});

test('skipCodeEditorHotpath marks quiet and counts only for CodeMirror events', () => {
  __resetQuietFixture();
  // non-cm event: no skip, no mark, no count
  assert.equal(__nostrodomusSkipCodeEditorHotpath(evt([{ localName: 'div' }]), 'r'), false);
  assert.equal(__nostrodomusPickerSafeSharedState.skippedCodeEditorEvents, 0);
  assert.equal(__nostrodomusEditorInputQuietActive(), false);
  // cm event: skip true, mark opens window, count increments
  assert.equal(__nostrodomusSkipCodeEditorHotpath(evt([{ localName: 'ha-code-editor' }]), 'r'), true);
  assert.equal(__nostrodomusPickerSafeSharedState.skippedCodeEditorEvents, 1);
  assert.equal(__nostrodomusEditorInputQuietActive(), true);
});

test('quiet-window functions are byte-identical to the frozen picker-safe source', () => {
  const src = readCompanion(PICKER_PATH);
  const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '_fixtures', 'quietWindow.fixture.mjs');
  const fixtureText = readFileSync(fixturePath, 'utf8');
  const decls = [
    'function __nostrodomusNowMs() {',
    'function __nostrodomusMarkEditorInputQuiet(reason = "code-editor-input") {',
    'function __nostrodomusEditorInputQuietActive() {',
    'function __nostrodomusDeferPickerWorkDuringEditorInput(reason = "picker-work", applyFn = null) {',
    'function __nostrodomusSkipCodeEditorHotpath(event, reason = "code-editor-event") {',
    'function __nostrodomusSetPickerTargetPresence(value) {',
    'function __nostrodomusClassText(node) {',
    'function __nostrodomusIsCodeMirrorEvent(event) {',
  ];
  for (const decl of decls) {
    assert.equal(extractFunctionSource(fixtureText, decl), extractFunctionSource(src, decl), `${decl} drifted from source`);
  }
});

// --- Built-in module predicate parity ---
// src/companion/inputQuietRuntime.js must export the pure `isCodeMirrorEvent(event)` predicate
// with the same truth table.
const QUIET_MODULE = 'inputQuietRuntime.js';
test('the built-in quiet module keeps the CodeMirror predicate truth table', async () => {
  assert.ok(companionModuleExists(QUIET_MODULE), `src/companion/${QUIET_MODULE} is missing`);
  const mod = await import(companionModuleUrl(QUIET_MODULE));
  assert.equal(typeof mod.isCodeMirrorEvent, 'function', 'module must export isCodeMirrorEvent()');
  assert.equal(mod.isCodeMirrorEvent(evt([{ localName: 'ha-code-editor' }])), true);
  assert.equal(mod.isCodeMirrorEvent(evt([{ className: 'x cm-scroller y' }])), true);
  assert.equal(mod.isCodeMirrorEvent(evt([{ className: 'cm-content-wrapper' }])), false);
  assert.equal(mod.isCodeMirrorEvent(evt([{ localName: 'div', className: 'foo' }])), false);
});
