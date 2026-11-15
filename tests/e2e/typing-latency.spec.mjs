// Typing latency and the input-quiet window in the real 2026.6 editor.
//
// What this spec checks, which unit tests cannot:
//   (1) Mark side: fast typing in a real CodeMirror editor marks the coordinator's
//       'editor-input' quiet channel. The mark rides the document-level capture keydown
//       listener: isScopedEditorEvent(ev.composedPath) → rememberView → hookDispatch →
//       view.dispatch → noteEditorDispatchRepeatPressure → markRuntimeQuiet. Completion uses
//       the same path, so it reaches any editor whatever path found it (a per-editor CSS
//       injection wired only to the sentinel would miss editors found by other paths). The
//       spec reads a counter that only grows (coordinator counters.quietMarks), so it does not
//       race the ~420ms window.
//   (2) Nothing breaks: 60 fast characters drop no input (the bound CodeMirror document
//       grew), cause no compute error (debugSnapshot.lastError stays empty), and completion
//       still works afterwards ('the' + Ctrl+Space shows suggestions). Console-policy
//       violations fail the test through the session fixture.
//
// The consult-side suppression counter (companionInputQuiet.suppressions) is not asserted.
// During rapid typing editorDispatch skips its own per-keystroke scheduleDiagnosticsRefresh,
// and the flush path runs only while the diagnostics Context panel is open, so the counter is
// 0 with the panel closed. The guard logic has unit tests (input_quiet_runtime.test.mjs: defer,
// then one trailing flush). This spec still reads companionInputQuiet and attaches it.
//
// The layer is turned on here with the nostrodomusCompanion localStorage key.
// Boot cost is covered by boot-cost.spec.mjs.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
} from './editor-helpers.mjs';

// 60 plain-letter chars: enough sustained rapid input to cross the repeat-pressure
// threshold (EDITOR_DISPATCH_REPEAT_THRESHOLD_MS = 90ms between doc changes) many
// times; letters only, so no YAML structure is corrupted and no popup key is consumed.
const BURST = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghij';
// Per-keystroke delay well under the 90ms rapid threshold so each char is a rapid mark.
const FAST_DELAY_MS = 25;

// Read everything we need about the input-quiet wiring in one page hop.
async function readQuietState(page) {
  return page.evaluate(() => {
    const out = {};
    try {
      const coord = window.__nostrodomusRuntimeCoordinatorV1;
      const snap = coord?.snapshot?.() || null;
      out.quietMarks = snap?.counters?.quietMarks ?? null;
      out.editorInputWindow = snap?.quietWindows?.['editor-input'] ?? null;
      out.editorDispatchWindow = snap?.quietWindows?.['editor-dispatch-repeat-pressure'] ?? null;
    } catch (e) { out.coordError = String(e); }
    try {
      const diag = window.__nostrodomus?.exportDiagnostics?.() || null;
      out.companionLayer = diag?.companionLayer ?? null;
      out.companionInputQuiet = diag?.companionInputQuiet ?? null;
    } catch (e) { out.diagError = String(e); }
    try {
      const dbg = window.__nostrodomus?.debugSnapshot?.() || null;
      out.lastError = dbg?.lastError ?? null;
    } catch (e) { out.dbgError = String(e); }
    try {
      out.docLength = window.__nostrodomus?.state?.view?.state?.doc?.length ?? null;
    } catch (e) { out.docError = String(e); }
    return out;
  });
}

test('typing-latency: fast typing marks the real editor quiet window and never stalls completion', async ({ page }, testInfo) => {
  // Turn the built-in companion layer on before any HA document runs (and again in the loaded
  // page), with the same localStorage switch the companion specs use.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  // Entities card: a known completion fixture ('the' → 'theme'). The mark side rides
  // the universal keydown path, so the editor choice is irrelevant to (1).
  await openSeededCardCodeEditor(page, stamp);

  // Precondition: the layer must be active, or the rest of the spec checks nothing
  // (observe, then assert, so a key that did not take effect cannot pass silently).
  const before = await readQuietState(page);
  expect(before.companionLayer, `companion layer is "${before.companionLayer}", expected "internal" — the nostrodomusCompanion=active key did not take effect, so the rest of this spec would check nothing`).toBe('internal');
  expect(before.companionInputQuiet?.dormant, 'companionInputQuiet.dormant is true under force-active — the input-quiet runtime still reads dormant').toBe(false);

  // Type the burst on a fresh line so existing keys stay intact for the completion check.
  await page.keyboard.press('Enter');
  await expectDialogAlive(page, 'after pressing Enter for the typing burst');
  await page.keyboard.type(BURST, { delay: FAST_DELAY_MS });
  await expectDialogAlive(page, 'after the 60-char fast typing burst');

  const after = await readQuietState(page);
  await testInfo.attach('typing-latency.json', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });

  // (1a) mark reach — persistent proof: quietMarks only grows, so a higher value after
  // the burst means rapid typing in the real editor reached markRuntimeQuiet.
  expect(typeof after.quietMarks === 'number', `coordinator quietMarks unreadable (${JSON.stringify(after)})`).toBe(true);
  expect(after.quietMarks, `quietMarks did not increase (before=${before.quietMarks} after=${after.quietMarks}) — fast typing in the real editor never marked any quiet channel; the mark-side event chain did not reach this editor`).toBeGreaterThan(before.quietMarks ?? 0);

  // (1b) channel specificity — the 'editor-input' channel exists and was marked by the
  // real typing dispatch path (reason from editorDispatchRuntime, not some other source).
  expect(after.editorInputWindow, "coordinator has no 'editor-input' quiet window after fast typing — the editor-input channel was never marked").toBeTruthy();
  // The editor-dispatch repeat-pressure path marks a dedicated channel that only it
  // writes. The shared 'editor-input' channel is also marked by the companion input-quiet
  // runtime on every input event, so its final reason is legitimately the companion's
  // (asserting on it raced HA's input-event timing). The dedicated channel — absent before
  // the burst, active after — is unclobberable proof the editor-dispatch path actually ran.
  expect(after.editorDispatchWindow, "coordinator has no 'editor-dispatch-repeat-pressure' quiet window after fast typing — the editor-dispatch repeat-pressure path never ran (the shared 'editor-input' channel alone is not proof, since the companion layer also marks it)").toBeTruthy();
  expect(String(after.editorDispatchWindow?.reason || ''), `dedicated channel reason "${after.editorDispatchWindow?.reason}" is not the editor-dispatch repeat-pressure mark`).toContain('editor-dispatch');

  // (2a) no dropped input — the bound CM doc grew by most of the 60 chars (a wedged
  // typing path would show ~0 growth). Tolerant of timing loss / auto-indent.
  expect(typeof after.docLength === 'number' && typeof before.docLength === 'number', `doc length unreadable (before=${before.docLength} after=${after.docLength})`).toBe(true);
  expect(after.docLength - before.docLength, `document grew by only ${after.docLength - before.docLength} chars after a 60-char burst — input was dropped / the typing path wedged`).toBeGreaterThanOrEqual(55);

  // (2b) no compute error during the burst.
  expect(after.lastError ?? null, `a completion-compute error surfaced during fast typing: ${JSON.stringify(after.lastError)}`).toBeFalsy();

  // (2c) no suggestion stall — completion still fires after the burst. Fresh line, a
  // known prefix, Ctrl+Space → suggestions (the entities-card 'the' → 'theme').
  await page.keyboard.press('Enter');
  await expectDialogAlive(page, 'after Enter for the post-burst completion check');
  await page.keyboard.type('the', { delay: FAST_DELAY_MS });
  await expectDialogAlive(page, 'after typing "the" post-burst');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'post-burst: prefix "the" + Ctrl+Space produced no completion popup — fast typing stalled the suggestion engine');

  // The dialog is intentionally left unsaved; the seed re-saves on every e2e:up.
});
