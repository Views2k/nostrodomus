// native-autocomplete-suppression.spec — 0.1.182: while the Nostrodomus completion popup is open, HA's
// native CodeMirror autocomplete tooltip (.cm-tooltip-autocomplete) must not show behind/over it (the
// "gray native pane pops up too" bug). Owner-probe-only until now.
//
// Append-to-valid-config setup (no typeless HA crash). Authored on-branch; owner-run.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectPopupWithSuggestions,
  typeInYaml,
} from './editor-helpers.mjs';

test('native autocomplete: HA native .cm-tooltip-autocomplete stays hidden while the Nostrodomus popup is open', async ({ page }) => {
  const stamp = await openDashboard(page);
  const { dialog } = await openSeededCardCodeEditor(page, stamp);

  // Open the Nostrodomus popup on a fresh key prefix (the->theme, proven by editor-completion).
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await typeInYaml(page, 'the');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'native autocomplete: the Nostrodomus popup did not open');

  // HA's native CodeMirror autocomplete tooltip must NOT be present/visible in the dialog while ours is up.
  const nativeCount = await dialog.locator('.cm-tooltip-autocomplete').count();
  if (nativeCount > 0) {
    const anyVisible = await dialog.locator('.cm-tooltip-autocomplete').first().isVisible().catch(() => false);
    expect(anyVisible, 'HA native .cm-tooltip-autocomplete is visible while the Nostrodomus popup is open (native pane not suppressed)').toBe(false);
  } else {
    expect(nativeCount, 'native tooltip absent (suppressed) — expected').toBe(0);
  }
});
