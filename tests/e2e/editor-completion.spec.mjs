// editor-completion.spec (HARNESS P2.2) — the product's core promise
// against the real CodeMirror for the first time: open the real card edit
// dialog, type in the YAML editor, see Nostrodomus suggestions; Ctrl+Space
// toggles, Escape closes, accepting inserts text into the document.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  typeInYaml,
} from './editor-helpers.mjs';

// Factory-default trigger is Ctrl+Space (the install banner logs
// `trigger: Ctrl+Space`; plain typing only auto-opens once a setting like
// keepOpen/autoOpenOnFocus is on — the owner's tuned real instance). This
// spec exercises the honest fresh-install path: type a prefix, Ctrl+Space to
// open, suggestions appear, accept inserts.
test('editor completion: prefix + Ctrl+Space suggests, Escape closes, reopen, accept inserts', async ({ page }) => {
  const stamp = await openDashboard(page);
  const { yaml } = await openSeededCardCodeEditor(page, stamp);

  // Type a fresh key prefix on its own line, then Ctrl+Space to open. 'the'
  // should surface the entities-card 'theme' key suggestion. Each input step
  // asserts the dialog survived it (2026.6 vanish investigation).
  await page.keyboard.press('Enter');
  await expectDialogAlive(page, 'after pressing Enter on a fresh line');
  await typeInYaml(page, 'the');
  await expectDialogAlive(page, 'after typing "the"');
  await page.keyboard.press('Control+Space');
  const box = await expectPopupWithSuggestions(page, 'prefix "the" + Ctrl+Space produced no completion popup');

  // Escape closes…
  await page.keyboard.press('Escape');
  await expect(box, 'Escape did not close the completion popup').toBeHidden({ timeout: 5000 });

  // …and Ctrl+Space explicitly reopens at the same spot (the toggle).
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'Ctrl+Space did not reopen the completion popup');

  // Accepting inserts the suggestion text into the CodeMirror document. The
  // product's true behavior is INSERTION; the popup may stay open afterwards
  // (it re-computes value/next-key suggestions for the accepted key — e.g.
  // `theme:` then offers theme values), so we assert the document content,
  // not an instant hide.
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await yaml.evaluate((el) => el.textContent || '')).includes('theme'), {
      timeout: 5000,
      message: 'the accepted suggestion never landed in the document',
    })
    .toBe(true);

  // The dialog is deliberately not saved or closed: the context is disposed
  // with the test and the seed re-saves the dashboard config on every e2e:up.
});
