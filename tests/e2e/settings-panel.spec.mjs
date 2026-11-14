// settings-panel.spec — open settings via its real entry
// point (the popup's gear button), switch a tab, drag the panel 50px, change
// one value, close, reopen, assert persistence.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor, expectDialogAlive, popup } from './editor-helpers.mjs';
import {
  CM_CONTENT,
  HA_CODE_EDITOR,
  HUI_DIALOG_EDIT_CARD,
  NOSTRODOMUS_SETTINGS_BUTTON,
  NOSTRODOMUS_SETTINGS_CLOSE,
  NOSTRODOMUS_SETTINGS_DRAG_HANDLE,
  NOSTRODOMUS_SETTINGS_PANEL,
} from './selectors.mjs';

async function openSettingsViaPopup(page) {
  // The real entry point: the gear in the completion popup header (present
  // whenever the popup shows, even on an idle-pane explicit open with zero
  // rows). On the REOPEN path focus
  // has left the editor after the prior close, so a lone Ctrl+Space mounts the
  // popup but it polls hidden (the flake). Refocus the editor first, then wait
  // for the gear to be visible, re-pressing Ctrl+Space ONLY while the popup is
  // hidden — re-pressing while it is open would toggle it closed.
  await page.locator(`${HUI_DIALOG_EDIT_CARD} ${HA_CODE_EDITOR} ${CM_CONTENT}`).first().click();
  const box = popup(page);
  const gear = box.locator(NOSTRODOMUS_SETTINGS_BUTTON);
  await expect(async () => {
    if (!(await box.isVisible())) await page.keyboard.press('Control+Space');
    // Inner assertion names the failure (gear never visible) if this never passes.
    await expect(gear).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000, intervals: [250, 500, 1000] });
  await gear.click();
  const panel = page.locator(NOSTRODOMUS_SETTINGS_PANEL);
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  return panel;
}

test('settings panel: tab switch, drag, value change, persistence across reopen', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);
  const panel = await openSettingsViaPopup(page);
  await expectDialogAlive(page, 'after opening the settings panel via the popup gear');

  // Switch to the second tab and remember which one it is.
  // Switch to a non-default tab that actually hosts toggles.
  // The tabs are General / Context / Diagnostics / Style / Help,
  // and only General and Style carry checkboxes — `nth(1)`
  // (Context) has none, so a value-change step there has no control to toggle.
  // Style is the natural choice (its toggles are core editor styling).
  const tabs = panel.locator('[role="tab"]');
  expect(await tabs.count(), 'settings panel rendered fewer than two tabs').toBeGreaterThan(1);
  const styleTab = panel.getByRole('tab', { name: 'Style' });
  const tabName = (await styleTab.innerText()).trim();
  await styleTab.click();
  await expect(styleTab, `tab "${tabName}" did not become selected`).toHaveAttribute('aria-selected', 'true');

  // Drag the panel 50px right/down by its drag handle (real mouse choreography).
  const handle = panel.locator(NOSTRODOMUS_SETTINGS_DRAG_HANDLE).first();
  const before = await panel.boundingBox();
  const handleBox = await handle.boundingBox();
  expect(handleBox, 'settings drag handle has no bounding box').not.toBeNull();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 50, handleBox.y + handleBox.height / 2 + 50, { steps: 10 });
  await page.mouse.up();
  const after = await panel.boundingBox();
  expect(
    Math.round(after.x - before.x),
    `drag moved the panel ${after.x - before.x}px horizontally, expected ~50`,
  ).toBeGreaterThan(40);
  expect(Math.round(after.y - before.y), 'drag moved the panel less than 40px vertically').toBeGreaterThan(40);
  await expectDialogAlive(page, 'after dragging the settings panel');

  // Change one value: a checkbox on the ACTIVE tab. Every
  // tab panel's inputs stay in the DOM, but inactive panels are display:none,
  // so an unscoped `.first()` grabs a hidden checkbox on tab 0 after the
  // switch to tab 1. The `:visible` filter targets the visible control on
  // the active tab.
  const checkbox = panel.locator('input[type="checkbox"][aria-label]:visible').first();
  await checkbox.waitFor({ state: 'visible', timeout: 5000 });
  const label = await checkbox.getAttribute('aria-label');
  const wasChecked = await checkbox.isChecked();
  await checkbox.click();
  await expect(checkbox, `toggling "${label}" did not change its state`).toBeChecked({ checked: !wasChecked });

  // Close, reopen via the same real entry point: tab and value persisted.
  await panel.locator(NOSTRODOMUS_SETTINGS_CLOSE).first().click();
  await expect(panel, 'settings panel did not close').toBeHidden({ timeout: 5000 });

  const reopened = await openSettingsViaPopup(page);
  const activeTab = reopened.locator('[role="tab"][aria-selected="true"]').first();
  expect((await activeTab.innerText()).trim(), 'active tab did not persist across reopen').toBe(tabName);
  const sameCheckbox = reopened.locator(`input[type="checkbox"][aria-label="${label}"]:visible`).first();
  await expect(sameCheckbox, `"${label}" did not persist across reopen`).toBeChecked({ checked: !wasChecked });

  // Restore the toggled value so the suite leaves settings as it found them.
  await sameCheckbox.click();
  await expect(sameCheckbox).toBeChecked({ checked: wasChecked });
});

// 0.1.253: the syntax theme set (color-named, count floor >=16, ~37) is selectable and switching a theme
// REPAINTS the editor tokens — no collapse to base-white / a single color. The color-name coherence itself
// is an offline/visual judgment; the behavioral repaint is what this pins.
test('theme repaint: the syntax theme set is selectable and switching one repaints the editor tokens', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);
  const panel = await openSettingsViaPopup(page);
  await panel.getByRole('tab', { name: 'Style' }).click();

  const options = panel.locator('.nostrodomus-syntax-theme-option');
  await expect.poll(() => options.count(), { timeout: 10000, message: 'syntax theme options never rendered' }).toBeGreaterThanOrEqual(16);

  // Sample the editor's rendered token colors, switch to a non-active theme, and assert they change.
  const sampleColors = () =>
    page.locator(`${HUI_DIALOG_EDIT_CARD} ${HA_CODE_EDITOR} ${CM_CONTENT} .cm-line span`)
      .evaluateAll((els) => els.slice(0, 14).map((e) => getComputedStyle(e).color).join('|'));
  const before = await sampleColors();
  // The theme picker is a <details> dropdown — expand it (click the summary) before its options are visible.
  await panel.locator('.nostrodomus-syntax-theme-summary').first().click();
  const target = panel.locator('.nostrodomus-syntax-theme-option[aria-selected="false"]').first();
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await expect
    .poll(async () => await sampleColors(), { timeout: 8000, message: 'switching the theme did not repaint the editor tokens' })
    .not.toBe(before);

  // No white-collapse: the repainted tokens are not all one color.
  const colors = (await sampleColors()).split('|').filter(Boolean);
  expect(new Set(colors).size, `tokens collapsed to a single color (white-collapse?): ${JSON.stringify(colors)}`).toBeGreaterThan(1);
});

// No-touch contract items: a header click WITHOUT a drag must not move the saved position, and Escape must
// close the Nostrodomus panel before HA's edit dialog.
test('settings edge behaviors: a no-drag header click keeps position; Escape closes Nostrodomus before the HA dialog', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);
  const panel = await openSettingsViaPopup(page);

  // mousedown + mouseup on the header with NO movement in between — a click, not a drag — must not shift it.
  const handle = panel.locator(NOSTRODOMUS_SETTINGS_DRAG_HANDLE).first();
  const before = await panel.boundingBox();
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const after = await panel.boundingBox();
  expect(Math.abs(after.x - before.x), `a no-drag header click shifted the panel horizontally (${after.x - before.x}px)`).toBeLessThan(6);
  expect(Math.abs(after.y - before.y), `a no-drag header click shifted the panel vertically (${after.y - before.y}px)`).toBeLessThan(6);

  // Escape closes the Nostrodomus panel while the HA edit dialog stays open (Nostrodomus first).
  await page.keyboard.press('Escape');
  await expect(panel, 'Escape did not close the Nostrodomus settings panel').toBeHidden({ timeout: 5000 });
  expect(await page.locator(HUI_DIALOG_EDIT_CARD).count(), 'Escape also closed the HA edit dialog (should close Nostrodomus first)').toBeGreaterThan(0);
});

// The Diagnostics tab is built when it is first shown (building it with the panel made every
// open pay for an editor search, two performance snapshots and a WebGL probe). Its buttons and
// its one setting are wired at that moment, so both are exercised here.
test('settings panel: the Diagnostics tab is built on first show and its controls are wired', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);
  const panel = await openSettingsViaPopup(page);
  const section = panel.locator('[data-section="diagnostics"]');
  expect(
    await section.evaluate((el) => el.childElementCount),
    'the Diagnostics tab was built while another tab was in front',
  ).toBe(0);

  await panel.getByRole('tab', { name: 'Diagnostics' }).click();
  const refresh = section.locator('[data-diag-refresh]');
  await expect(refresh, 'the Diagnostics tab stayed empty after it was selected').toBeVisible();
  await refresh.click();
  await expect(refresh, 'the Refresh button of the Diagnostics tab is not wired').toHaveText('Refreshed');

  const debug = section.locator('input[data-k="debugMode"]');
  const readDebug = () => page.evaluate(() => {
    try { return JSON.parse(window.localStorage.getItem('nostrodomus.settings') || '{}').debugMode === true; } catch { return null; }
  });
  await debug.check();
  await expect.poll(readDebug, { timeout: 5000, message: 'the setting on the Diagnostics tab was not saved' }).toBe(true);
  await debug.uncheck();
  await expect.poll(readDebug, { timeout: 5000 }).toBe(false);
  await expectDialogAlive(page, 'after using the Diagnostics tab');
});
