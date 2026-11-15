// The "Hide editor warnings" opt-in. By default (toggle off) the warning is a small
// corner badge (a separate style id), not the full-width banner; the toggle fully hides it.
//
// Home Assistant renders the editor warning/alert family (the "Visual editor is not supported"
// notice and real config-validation errors, e.g. "Expected … received …") inside the nested
// card-editor shadow root — beyond the frozen dialog-root rule's reach (on HA 2026.6 both
// showed display:inline/flex with the frozen rule active).
// The companion's surface-wide reconcile owns them: gated by `style.hideEditorWarnings`, default
// off — off = the corner badge (info preserved on hover), on = display:none (fully hidden).
//
// This spec asserts only the hide sheet's lifecycle (its id), which is the toggle's observable
// signal regardless of whether the seeded card emits a real ha-alert; the badge's default-on look
// is a visual judgment (and unit-pinned in
// tests/companion/editor_warning_hide.test.mjs).
//
// This spec drives the real wiring on a seeded editor:
//   (a) Default off — with the companion active, no `#…warning-hide` node is injected into
//       the editor roots (warnings/validation errors are not suppressed by default).
//   (b) Toggle on  — flipping `style.hideEditorWarnings` (the real change handler →
//       scheduleCodeboxStyleReapply) injects the warning-hide sheet into the nested
//       hui-card-element-editor shadow root.
//   (c) Toggle off — flipping it back reconciles the sheet away (no reload).
//
// Not asserted here (needs fixtures the harness lacks / are visual judgments):
//   - a Sections-layout card preview filling its pane (no sections-view seed in the harness;
//     the preview-fill rule covering hui-section + hui-grid-section is unit-proven in
//     tests/companion/scrollbar_placement.test.mjs);
//   - that a real warning banner visually stops overlapping the bottom-left "Show visual/code
//     editor" buttons when hidden (needs a card that emits one; visual).

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor, popup } from './editor-helpers.mjs';
import {
  CM_CONTENT,
  HA_CODE_EDITOR,
  HUI_DIALOG_EDIT_CARD,
  NOSTRODOMUS_SETTINGS_BUTTON,
  NOSTRODOMUS_SETTINGS_PANEL,
} from './selectors.mjs';

const WARNING_HIDE_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-warning-hide';
const COMPANION_CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';
const HIDE_WARNINGS_TOGGLE = 'input[data-style-toggle="style.hideEditorWarnings"]';

// Deep-search a dialog's composed shadow tree for a style node by id (the warning-hide sheet
// lives in a nested editor shadow root, so a single getRootNode().querySelector won't see it).
function countStyleNodeById(dialogHandle, id) {
  return dialogHandle.evaluate((dialog, styleId) => {
    let found = 0;
    const seen = new Set();
    const walk = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      try { if (root.querySelector(`#${styleId}`)) found += 1; } catch { /* closed */ }
      let all = [];
      try { all = Array.from(root.querySelectorAll('*')); } catch { all = []; }
      for (const el of all) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(dialog.shadowRoot);
    return found;
  }, id);
}

async function openSettings(page) {
  await page.locator(`${HUI_DIALOG_EDIT_CARD} ${HA_CODE_EDITOR} ${CM_CONTENT}`).first().click();
  const box = popup(page);
  const gear = box.locator(NOSTRODOMUS_SETTINGS_BUTTON);
  await expect(async () => {
    if (!(await box.isVisible())) await page.keyboard.press('Control+Space');
    await expect(gear).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000, intervals: [250, 500, 1000] });
  await gear.click();
  const panel = page.locator(NOSTRODOMUS_SETTINGS_PANEL);
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  return panel;
}

// Flip the style toggle via its real change handler (works regardless of the active tab's
// visibility — the panel renders every section, tabs just toggle CSS visibility).
async function setHideWarnings(panel, on) {
  await panel.locator(HIDE_WARNINGS_TOGGLE).first().evaluate((el, checked) => {
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, on);
}

test('companion warning toggle: off by default keeps warnings visible, on injects the nested hide, off again removes it', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  const { dialog } = await openSeededCardCodeEditor(page, stamp);

  // The companion must have applied first (so its absence below is meaningful, not just "not yet").
  await expect
    .poll(() => countStyleNodeById(dialog, COMPANION_CODEBOX_STYLE_ID), { timeout: 10000 })
    .toBeGreaterThan(0);

  // (a) Default off — no warning-hide sheet anywhere in the editor: warnings are not suppressed.
  expect(await countStyleNodeById(dialog, WARNING_HIDE_STYLE_ID)).toBe(0);

  const panel = await openSettings(page);

  // (b) Toggle on — the nested warning-hide sheet appears.
  await setHideWarnings(panel, true);
  await expect
    .poll(() => countStyleNodeById(dialog, WARNING_HIDE_STYLE_ID), { timeout: 10000 })
    .toBeGreaterThan(0);

  // (c) Toggle off — it reconciles away (no reload).
  await setHideWarnings(panel, false);
  await expect
    .poll(() => countStyleNodeById(dialog, WARNING_HIDE_STYLE_ID), { timeout: 10000 })
    .toBe(0);
});
