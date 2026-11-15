// Glass editor dialog (style.glassDialog, on by default).
//
// With the default settings the surface of the card editor dialog is translucent and blurs
// what is behind it, and the preview pane has no background of its own. The companion layer does
// this with one sheet in the dialog's shadow root: two custom properties on ha-dialog that Home
// Assistant's own dialog styles read, and a transparent background on .element-preview.
//
// Measured here on the real surface, wa-dialog's `dialog[part=dialog]`, and on the preview pane:
//   (a) default: surface background with alpha below 1, a backdrop filter with a blur, the
//       preview pane transparent;
//   (b) after the "Glass editor dialog" checkbox in Settings, Style is switched off: the surface
//       is opaque again, has no backdrop filter, and the preview pane has the theme background
//       Home Assistant gives it.
//
// The pure sheet builder, the theme rules and the placement are unit-tested in
// tests/companion/glass_dialog.test.mjs.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor, popup } from './editor-helpers.mjs';
import {
  CM_CONTENT,
  HA_CODE_EDITOR,
  HUI_DIALOG_EDIT_CARD,
  NOSTRODOMUS_SETTINGS_BUTTON,
  NOSTRODOMUS_SETTINGS_PANEL,
} from './selectors.mjs';

const GLASS_DIALOG_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-glass-dialog';
const GLASS_DIALOG_TOGGLE = 'input[data-style-toggle="style.glassDialog"]';

// Runs in the page. Computed colors come back as `rgb(...)`, `rgba(...)` or, for a color-mix
// result, `color(srgb r g b / a)`; the alpha is taken from whichever form it is.
function measureGlass(styleId) {
  const alphaOf = (color) => {
    const text = String(color || '').trim();
    if (!text || text === 'transparent') return 0;
    const modern = /\/\s*([\d.]+)(%?)\s*\)$/.exec(text);
    if (modern) return modern[2] ? parseFloat(modern[1]) / 100 : parseFloat(modern[1]);
    const legacy = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(text);
    return legacy ? parseFloat(legacy[1]) : 1;
  };
  const dialog = document.querySelector('home-assistant')?.shadowRoot?.querySelector('hui-dialog-edit-card')
    || (function find(root) {
      const direct = root.querySelector('hui-dialog-edit-card');
      if (direct) return direct;
      for (const el of root.querySelectorAll('*')) {
        const found = el.shadowRoot ? find(el.shadowRoot) : null;
        if (found) return found;
      }
      return null;
    }(document));
  const dialogRoot = dialog?.shadowRoot || null;
  const surface = dialogRoot?.querySelector('ha-dialog')?.shadowRoot?.querySelector('wa-dialog')?.shadowRoot?.querySelector('dialog[part~="dialog"]') || null;
  const preview = dialogRoot?.querySelector('.element-preview') || null;
  if (!surface || !preview) return { found: false, hasSurface: !!surface, hasPreview: !!preview };

  // The color Home Assistant's own rule gives the preview pane, resolved in the same place.
  const probe = document.createElement('div');
  probe.style.backgroundColor = 'var(--primary-background-color)';
  preview.parentNode.appendChild(probe);
  const themePreviewBackground = getComputedStyle(probe).backgroundColor;
  probe.remove();

  const surfaceStyle = getComputedStyle(surface);
  const previewBackground = getComputedStyle(preview).backgroundColor;
  return {
    found: true,
    sheet: !!dialogRoot.querySelector(`#${styleId}`),
    surfaceBackground: surfaceStyle.backgroundColor,
    surfaceAlpha: alphaOf(surfaceStyle.backgroundColor),
    surfaceBackdropFilter: surfaceStyle.backdropFilter || surfaceStyle.webkitBackdropFilter || '',
    previewBackground,
    previewAlpha: alphaOf(previewBackground),
    themePreviewBackground,
  };
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

// Change the checkbox through its real change handler. The Style tab is built with the panel,
// so the control exists whichever tab is shown.
async function setGlassDialog(panel, on) {
  await panel.locator(GLASS_DIALOG_TOGGLE).first().evaluate((el, checked) => {
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, on);
}

test('glass editor dialog: translucent blurred surface and transparent preview by default; the Style checkbox turns it off', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  // (a) Default settings: wait for the companion layer to put the sheet in the dialog.
  await expect
    .poll(async () => (await page.evaluate(measureGlass, GLASS_DIALOG_STYLE_ID)).sheet === true, {
      timeout: 10000,
      message: 'the glass sheet never reached the shadow root of hui-dialog-edit-card',
    })
    .toBe(true);
  await expect
    .poll(async () => (await page.evaluate(measureGlass, GLASS_DIALOG_STYLE_ID)).surfaceAlpha ?? 1, {
      timeout: 5000,
      message: 'the dialog surface never became translucent',
    })
    .toBeLessThan(1);

  const on = await page.evaluate(measureGlass, GLASS_DIALOG_STYLE_ID);
  await testInfo.attach('glass-dialog-on.json', { body: JSON.stringify(on, null, 2), contentType: 'application/json' });
  expect(on.found, 'dialog surface or preview pane not found').toBe(true);
  expect(on.surfaceAlpha, `surface background ${on.surfaceBackground} is opaque`).toBeLessThan(1);
  expect(on.surfaceAlpha, `surface background ${on.surfaceBackground} is fully transparent`).toBeGreaterThan(0);
  expect(on.surfaceBackdropFilter, `surface backdrop filter is "${on.surfaceBackdropFilter}"`).toContain('blur(');
  expect(on.previewAlpha, `preview background ${on.previewBackground} is not transparent`).toBe(0);

  // (b) Switch the setting off in Settings, Style.
  const panel = await openSettings(page);
  await expect(panel.locator(GLASS_DIALOG_TOGGLE).first()).toBeChecked();
  await setGlassDialog(panel, false);

  await expect
    .poll(async () => (await page.evaluate(measureGlass, GLASS_DIALOG_STYLE_ID)).sheet, {
      timeout: 10000,
      message: 'the glass sheet was not removed after the setting was switched off',
    })
    .toBe(false);

  const off = await page.evaluate(measureGlass, GLASS_DIALOG_STYLE_ID);
  await testInfo.attach('glass-dialog-off.json', { body: JSON.stringify(off, null, 2), contentType: 'application/json' });
  expect(off.found, 'dialog surface or preview pane not found').toBe(true);
  expect(off.surfaceAlpha, `surface background ${off.surfaceBackground} is still translucent`).toBe(1);
  expect(off.surfaceBackdropFilter, `surface backdrop filter is still "${off.surfaceBackdropFilter}"`).not.toContain('blur(');
  expect(off.previewAlpha, `preview background ${off.previewBackground} is still transparent`).toBe(1);
  expect(off.previewBackground, 'the preview pane has the theme background again').toBe(off.themePreviewBackground);

  // The choice is stored with the other settings.
  const stored = await page.evaluate(() => {
    try { return JSON.parse(window.localStorage.getItem('nostrodomus.settings') || '{}')?.style?.glassDialog; } catch { return 'unreadable'; }
  });
  expect(stored, 'style.glassDialog was not saved as false').toBe(false);
});
