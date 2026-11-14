// keyboard-accept.spec — accessibility: the completion popup is drivable by keyboard alone — ArrowDown
// moves the active item and Enter accepts it into the document (no mouse).
// Append-to-valid-config setup (no typeless HA crash).

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  typeInYaml,
} from './editor-helpers.mjs';

test('keyboard accept: ArrowDown then Enter accepts a completion by keyboard alone', async ({ page }) => {
  const stamp = await openDashboard(page);
  const { yaml } = await openSeededCardCodeEditor(page, stamp);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await typeInYaml(page, 'th'); // matches multiple keys (theme:, ...) so ArrowDown has somewhere to move
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'keyboard accept: popup did not open');

  const before = (await yaml.evaluate((el) => el.textContent || '')).length;
  await page.keyboard.press('ArrowDown'); // move the active item with the keyboard
  await page.keyboard.press('Enter'); // accept it — no mouse
  await expectDialogAlive(page, 'after keyboard accept');

  await expect
    .poll(async () => (await yaml.evaluate((el) => el.textContent || '')).length, {
      timeout: 5000,
      message: 'keyboard accept (ArrowDown + Enter) inserted nothing into the document',
    })
    .toBeGreaterThan(before);
});
