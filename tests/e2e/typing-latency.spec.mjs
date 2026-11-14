// ABSORB P4 — RUN CHECKPOINT C: typing-latency / suppression-gap probe.
//
// What this proves on the REAL 2026.6 editor (the part unit tests cannot):
//   (1) MARK-SIDE REACH — fast typing in a real CodeMirror editor actually marks
//       the coordinator 'editor-input' quiet channel. This is the convergence-gap
//       proof for P4: unlike the A/B per-editor CSS injection (which was wired only
//       to the sentinel and silently missed editors found by other paths), the mark
//       side rides the document-level capture keydown listener →
//       isScopedEditorEvent(ev.composedPath) → rememberView → hookDispatch →
//       view.dispatch → noteEditorDispatchRepeatPressure → markRuntimeQuiet. That is
//       the SAME path completion itself uses, so it reaches any editor regardless of
//       discovery path. We assert it landed via a PERSISTENT signal
//       (coordinator counters.quietMarks, which only grows) so there is no race on
//       the ~420ms window.
//   (2) NO REGRESSION — 60 fast chars produce no dropped input (the bound CM doc
//       grew), no compute error (debugSnapshot.lastError stays empty), and completion
//       still fires afterwards ('the' + Ctrl+Space → suggestions). Console-policy
//       violations fail the test automatically via the session fixture.
//
// What this DELIBERATELY does NOT hard-assert: the consult-side suppression counter
// (companionInputQuiet.suppressions). During *rapid* typing editorDispatch skips its
// own per-keystroke scheduleDiagnosticsRefresh, and the flush path is gated on the
// diagnostics Context panel being open — so suppressions is LEGITIMATELY 0 with the
// panel closed. Asserting it blind would be an A/B-style false signal. The guard
// LOGIC is unit-proven (input_quiet_runtime.test.mjs: defer → single trailing flush);
// the live consult-side observation belongs in the owner feel-check with the Context
// tab open. We still READ companionInputQuiet here and ATTACH it as evidence.
//
// Authored on-branch; the layer ships DORMANT by default and is force-activated here
// via the D-KILL-SWITCH escape hatch (localStorage). RUN BY THE OWNER (no browser/HA
// in the build container). boot-cost-unchanged is covered by boot-cost.spec.mjs.

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

test('typing-latency: fast typing marks the real editor quiet window and never stalls completion (CHECKPOINT C)', async ({ page }, testInfo) => {
  // Force the absorbed companion layer ACTIVE before any HA document runs (and re-assert
  // in the loaded context), the same escape hatch the A/B specs use.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  // Entities card: a proven completion fixture ('the' → 'theme'). The mark side rides
  // the universal keydown path, so the editor choice is irrelevant to (1); the button
  // card's small/simple visual is the owner's manual feel-check.
  await openSeededCardCodeEditor(page, stamp);

  // Precondition: the layer must really be active, else the whole probe is meaningless
  // (observe-then-assert — never let a misconfigured force-flag pass silently).
  const before = await readQuietState(page);
  expect(before.companionLayer, `companion layer is "${before.companionLayer}", expected "internal" — the force-active escape hatch did not take; the rest of this probe would be vacuous`).toBe('internal');
  expect(before.companionInputQuiet?.dormant, 'companionInputQuiet.dormant is true under force-active — the input-quiet runtime still reads dormant').toBe(false);

  // Type the burst on a fresh line so existing keys stay intact for the completion check.
  await page.keyboard.press('Enter');
  await expectDialogAlive(page, 'after pressing Enter for the typing burst');
  await page.keyboard.type(BURST, { delay: FAST_DELAY_MS });
  await expectDialogAlive(page, 'after the 60-char fast typing burst');

  const after = await readQuietState(page);
  console.log('[typing-latency]', JSON.stringify({ before, after }));
  await testInfo.attach('typing-latency.json', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });

  // (1a) MARK REACH — persistent proof: quietMarks only grows, so a higher value after
  // the burst means rapid typing in the real editor reached markRuntimeQuiet.
  expect(typeof after.quietMarks === 'number', `coordinator quietMarks unreadable (${JSON.stringify(after)})`).toBe(true);
  expect(after.quietMarks, `quietMarks did not increase (before=${before.quietMarks} after=${after.quietMarks}) — fast typing in the real editor never marked any quiet channel; the mark-side event chain did not reach this editor`).toBeGreaterThan(before.quietMarks ?? 0);

  // (1b) CHANNEL SPECIFICITY — the 'editor-input' channel exists and was marked by the
  // real typing dispatch path (reason from editorDispatchRuntime, not some other source).
  expect(after.editorInputWindow, "coordinator has no 'editor-input' quiet window after fast typing — the editor-input channel was never marked").toBeTruthy();
  // The editor-dispatch repeat-pressure path marks a DEDICATED channel that ONLY it
  // writes. The shared 'editor-input' channel is also marked by the companion input-quiet
  // runtime on every input event, so its final reason is legitimately the companion's
  // (asserting on it raced HA's input-event timing). The dedicated channel — absent before
  // the burst, active after — is unclobberable proof the editor-dispatch path actually ran.
  expect(after.editorDispatchWindow, "coordinator has no 'editor-dispatch-repeat-pressure' quiet window after fast typing — the editor-dispatch repeat-pressure path never ran (the shared 'editor-input' channel alone is not proof, since the companion layer also marks it)").toBeTruthy();
  expect(String(after.editorDispatchWindow?.reason || ''), `dedicated channel reason "${after.editorDispatchWindow?.reason}" is not the editor-dispatch repeat-pressure mark`).toContain('editor-dispatch');

  // (2a) NO DROPPED INPUT — the bound CM doc grew by most of the 60 chars (a wedged
  // typing path would show ~0 growth). Tolerant of timing loss / auto-indent.
  expect(typeof after.docLength === 'number' && typeof before.docLength === 'number', `doc length unreadable (before=${before.docLength} after=${after.docLength})`).toBe(true);
  expect(after.docLength - before.docLength, `document grew by only ${after.docLength - before.docLength} chars after a 60-char burst — input was dropped / the typing path wedged`).toBeGreaterThanOrEqual(55);

  // (2b) NO COMPUTE ERROR during the burst.
  expect(after.lastError ?? null, `a completion-compute error surfaced during fast typing: ${JSON.stringify(after.lastError)}`).toBeFalsy();

  // (2c) NO SUGGESTION STALL — completion still fires after the burst. Fresh line, a
  // known prefix, Ctrl+Space → suggestions (the proven entities-card 'the' → 'theme').
  await page.keyboard.press('Enter');
  await expectDialogAlive(page, 'after Enter for the post-burst completion check');
  await page.keyboard.type('the', { delay: FAST_DELAY_MS });
  await expectDialogAlive(page, 'after typing "the" post-burst');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'post-burst: prefix "the" + Ctrl+Space produced no completion popup — fast typing stalled the suggestion engine');

  // The dialog is intentionally left unsaved; the seed re-saves on every e2e:up.
});
