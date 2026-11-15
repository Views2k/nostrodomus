// observer-pruning.spec: the sentinel and style observer Maps prune detached roots, so opening and
// closing the edit dialog again and again does not grow the observer count without bound.
// Cycles happen in one page session (no navigation) so a leak would actually accumulate.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { HUI_DIALOG_EDIT_CARD } from './selectors.mjs';

const CYCLES = 5;

const readObserverCount = (page) =>
  page.evaluate(() => {
    const s = window.__nostrodomus?.state;
    const size = (m) => (m && typeof m.size === 'number' ? m.size : 0);
    return size(s?.editorSentinelObservers) + size(s?.styleRootObservers) + size(s?.initialSyntaxGateObservers);
  });

test('observer pruning: repeated dialog open/close keeps the sentinel observer count bounded', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp); // opens the dialog once (edit mode is now active)
  const baseline = await readObserverCount(page);

  for (let i = 0; i < CYCLES; i++) {
    // Close the dialog. Home Assistant keeps the dialog element in the page after it closed, so
    // "closed" means its Cancel button is gone from view. On Home Assistant 2026.6 Escape is taken
    // by the code editor and the dialog stays open; the Cancel button closes it there.
    const cancel = page.locator(HUI_DIALOG_EDIT_CARD).first().getByRole('button', { name: 'Cancel', exact: true });
    await page.keyboard.press('Escape');
    const closedByEscape = await cancel.waitFor({ state: 'hidden', timeout: 3000 }).then(() => true, () => false);
    if (!closedByEscape) {
      await cancel.click();
      await cancel.waitFor({ state: 'hidden', timeout: 8000 });
    }
    // Reopen via a card Edit button — same page session, so a leak would accumulate across cycles.
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.locator(HUI_DIALOG_EDIT_CARD).first().waitFor({ state: 'attached', timeout: 15000 });
  }

  const after = await readObserverCount(page);
  // Pruning drops detached roots; the count must not scale with the 5 cycles (a leak would add ~1/cycle).
  expect(
    after,
    `observer count grew across ${CYCLES} open/close cycles (baseline ${baseline} -> after ${after}); detached roots not pruned`,
  ).toBeLessThanOrEqual(baseline + 3);
});
