// active-line-default.spec — 0.1.151/2/3: CodeMirror's active-line (current-row) highlight — the blue
// focus wash / "90-degree line" — is hidden BY DEFAULT (style.hideActiveLineHighlight defaults true, and
// v2 migration drops an old stored false). Assert the .cm-activeLine background renders transparent out of
// the box. Owner-probe-only until now. Requires the companion codebox style (localStorage active).

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';

const isTransparent = (bg) => bg === 'transparent' || /,\s*0\)\s*$/.test(String(bg || '')); // rgba(…, 0)

test('active-line default: the active-line highlight is transparent by default (no blue focus wash)', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });
  const { dialog, yaml } = await openSeededCardCodeEditor(page, stamp);
  await yaml.click(); // focus a line so CodeMirror renders .cm-activeLine

  const activeLine = dialog.locator('.cm-activeLine').first();
  await activeLine.waitFor({ state: 'attached', timeout: 10000 });
  const bg = await activeLine.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(isTransparent(bg), `active-line default: expected a transparent active-line background (hidden by default), got "${bg}"`).toBe(true);
});
