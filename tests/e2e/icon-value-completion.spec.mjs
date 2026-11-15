// icon-value-completion.spec: icon values complete with the icons of an icon set registered the
// way icon packs such as Material Symbols register for Home Assistant's icon picker
// (window.customIcons with getIcon and getIconList), in single quotes and in a template string,
// and each row shows the icon through Home Assistant's ha-icon. Drives the real editor.
//
// The set is registered after the page has loaded, as a pack that finishes loading late would be.
// The values go under keys the entities card ignores, so the preview does not change while typing.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  popup,
  popupRowTexts,
  typeInYaml,
} from './editor-helpers.mjs';
import { NOSTRODOMUS_POPUP_ROW } from './selectors.mjs';

async function registerIconSet(page) {
  await page.evaluate(() => {
    window.customIcons = window.customIcons || {};
    window.customIcons.e2eset = {
      getIcon: async () => ({ path: 'M3 3h18v18H3z' }),
      getIconList: async () => [{ name: 'garden-light' }, { name: 'zz-marker' }, { name: 'home' }],
    };
  });
}

async function rowsInclude(page, label) {
  await expect
    .poll(async () => (await popupRowTexts(page)).some((text) => text.includes(label)), {
      timeout: 5000,
      message: `the list never offered ${label}`,
    })
    .toBe(true);
}

test('icon-value: a quoted icon value completes with the icons of a registered icon set', async ({ page }) => {
  const stamp = await openDashboard(page);
  const { yaml } = await openSeededCardCodeEditor(page, stamp);
  await registerIconSet(page);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await typeInYaml(page, "e2e_icon: 'e2eset:zz");
  await expectDialogAlive(page, 'after typing a quoted icon value');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'icon-value: no list for a quoted icon value');
  await rowsInclude(page, 'e2eset:zz-marker');

  const preview = popup(page).locator(`${NOSTRODOMUS_POPUP_ROW} ha-icon[icon="e2eset:zz-marker"]`);
  await expect(preview, 'the icon row shows the icon through ha-icon').toHaveCount(1);

  await page.keyboard.press('Enter');
  await expectDialogAlive(page, 'after accepting the icon');
  await expect
    .poll(async () => yaml.evaluate((el) => el.textContent || ''), { timeout: 5000 })
    .toContain("e2e_icon: 'e2eset:zz-marker");
  const text = await yaml.evaluate((el) => el.textContent || '');
  expect(text.includes("zz-marker''"), `no doubled quote after the accept: ${text}`).toBe(false);
});

test('icon-value: the name without its prefix finds the icon, and an icon name in a template string completes', async ({ page }) => {
  const stamp = await openDashboard(page);
  const { yaml } = await openSeededCardCodeEditor(page, stamp);
  await registerIconSet(page);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await typeInYaml(page, 'e2e_icon: garden');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'icon-value: no list for an icon name without its prefix');
  await rowsInclude(page, 'e2eset:garden-light');
  await page.keyboard.press('Escape');

  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await typeInYaml(page, "e2e_template: \"{{ 'e2eset:gar");
  await expectDialogAlive(page, 'after typing an icon name in a template string');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'icon-value: no list for an icon name in a template string');
  await rowsInclude(page, 'e2eset:garden-light');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => yaml.evaluate((el) => el.textContent || ''), { timeout: 5000 })
    .toContain("{{ 'e2eset:garden-light");
});
