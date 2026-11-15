// snippet-insertion.spec: accepting a snippet row expands its tabstops and defaults (no literal
// "${...}" is left in the document) instead of pasting the raw placeholder text.
// (The sibling case — a non-snippet value containing $N inserting verbatim, e.g. mqtt/$0/state
// — needs a value row that carries a literal $ and is not covered here.)
//
// Uses the data: block with a fuzzy prefix, a context that offers snippet rows (as in launch-gates G1).
// Append-to-valid-config setup (no typeless HA crash).

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  popup,
  typeInYaml,
} from './editor-helpers.mjs';
import { NOSTRODOMUS_POPUP_ROW } from './selectors.mjs';

const docText = (page) => page.locator('.cm-content').first().evaluate((el) => el.textContent || '');

test('snippet insertion: accepting a snippet expands it, leaving no literal ${...} tabstop in the document', async ({ page }) => {
  const stamp = await openDashboard(page);
  const { yaml } = await openSeededCardCodeEditor(page, stamp);

  // In a resolved service data: block a fuzzy prefix brings snippet rows next to the service fields.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await typeInYaml(page, 'tap_action:');
  for (const line of ['  action: perform-action', '  perform_action: light.turn_on', '  data:']) {
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Home');
    await typeInYaml(page, line);
  }
  await page.keyboard.press('Enter'); // accept the auto-indent inside data:
  await typeInYaml(page, 'bri');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'snippet insertion: data: + "bri" produced no popup');

  // Find a row explicitly marked as a Snippet and accept it by clicking.
  const snippetRow = popup(page).locator(NOSTRODOMUS_POPUP_ROW).filter({ hasText: 'Snippet' }).first();
  await expect(snippetRow, 'snippet insertion: no Snippet row appeared to accept').toBeVisible({ timeout: 5000 });
  const before = (await docText(page)).length;
  await snippetRow.click();
  await expectDialogAlive(page, 'after accepting a snippet');

  // The snippet expanded into the document (grew) with its tabstops resolved to defaults — never the raw
  // "${1:...}" placeholder text.
  const after = await docText(page);
  expect(after.length, `snippet insertion: accepting the snippet inserted nothing (before ${before}, after ${after.length})`).toBeGreaterThan(before);
  expect(after.includes('${'), `snippet insertion: a raw tabstop placeholder survived (snippet did not expand): ${JSON.stringify(after.slice(-160))}`).toBe(false);
  expect(yaml).toBeTruthy();
});
