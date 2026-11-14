// ABSORB preview-fill + warning-toggle (v0.1.139) — the "Hide editor warnings" opt-in.
// Updated for the v0.1.163 badge redesign: by DEFAULT (toggle off) the warning is now a small
// corner badge (a separate style id), not the full-width banner; the toggle still fully hides it.
//
// CONTEXT: HA renders the editor warning/alert family (the "Visual editor is not supported"
// notice AND real config-validation errors, e.g. "Expected … received …") INSIDE the nested
// card-editor shadow root — beyond the frozen dialog-root rule's reach (live `[alert-map]` proof
// from the owner's 2026.6 instance: both showed display:inline/flex with the frozen rule active).
// The companion's surface-wide reconcile owns them: gated by `style.hideEditorWarnings`, DEFAULT
// OFF — off = the corner badge (info preserved on hover), on = display:none (fully hidden).
//
// This spec asserts ONLY the HIDE sheet's lifecycle (its id), which is the toggle's observable
// signal regardless of whether the seeded card emits a real ha-alert; the badge's default-on look
// is a visual judgment left to the owner feel-check (and unit-pinned in
// tests/companion/editor_warning_hide.test.mjs).
//
// This spec drives the REAL wiring on a seeded editor:
//   (a) DEFAULT OFF — with the companion active, NO `#…warning-hide` node is injected into
//       the editor roots (warnings/validation errors are NOT suppressed by default).
//   (b) Toggle ON  — flipping `style.hideEditorWarnings` (the real change handler →
//       scheduleCodeboxStyleReapply) injects the warning-hide sheet into the nested
//       hui-card-element-editor shadow root.
//   (c) Toggle OFF — flipping it back reconciles the sheet away (no reload).
//
// NOT asserted here (needs fixtures the harness lacks / are visual judgments — owner feel-check):
//   - a Sections-layout card preview filling its pane (no sections-view seed in the harness;
//     the preview-fill rule covering hui-section + hui-grid-section is unit-proven in
//     tests/companion/scrollbar_placement.test.mjs);
//   - that a REAL warning banner visually stops overlapping the bottom-left "Show visual/code
//     editor" buttons when hidden (needs a card that emits one; visual).
//
// Authored on-branch; RUN BY OWNER (the gate excludes tests/e2e).

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
// lives in a NESTED editor shadow root, so a single getRootNode().querySelector won't see it).
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

test('companion warning toggle: OFF by default keeps warnings visible; ON injects the nested hide; OFF removes it', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  const { dialog } = await openSeededCardCodeEditor(page, stamp);

  // The companion must have applied first (so its absence below is meaningful, not just "not yet").
  await expect
    .poll(() => countStyleNodeById(dialog, COMPANION_CODEBOX_STYLE_ID), { timeout: 10000 })
    .toBeGreaterThan(0);

  // (a) DEFAULT OFF — no warning-hide sheet anywhere in the editor: warnings are NOT suppressed.
  expect(await countStyleNodeById(dialog, WARNING_HIDE_STYLE_ID)).toBe(0);

  const panel = await openSettings(page);

  // (b) Toggle ON — the nested warning-hide sheet appears.
  await setHideWarnings(panel, true);
  await expect
    .poll(() => countStyleNodeById(dialog, WARNING_HIDE_STYLE_ID), { timeout: 10000 })
    .toBeGreaterThan(0);

  // (c) Toggle OFF — it reconciles away (no reload).
  await setHideWarnings(panel, false);
  await expect
    .poll(() => countStyleNodeById(dialog, WARNING_HIDE_STYLE_ID), { timeout: 10000 })
    .toBe(0);
});
