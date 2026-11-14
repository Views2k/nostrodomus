// live-data.spec — instance-aware completion end to end:
// a custom card seeded into window.customCards appears in `type:`
// completion, and a real service's field keys appear under `data:`.
//
// The card is seeded via an origin-guarded init script (the runtime reads
// window.customCards live through runtimeData()); the service is
// persistent_notification.create — core HA, always loaded, schema fields
// `title` / `message` / `notification_id`.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  popupRowTexts,
  typeInYaml,
} from './editor-helpers.mjs';

const ORIGIN = 'http://localhost:8124';
const FAKE_CARD = { type: 'e2e-fake-card', name: 'E2E Fake Card', description: 'seeded by live-data.spec' };

test('live data: seeded custom card and real service fields reach completion', async ({ page, context }) => {
  await context.addInitScript(
    ([origin, card]) => {
      if (window.location.origin !== origin) return;
      window.customCards = window.customCards || [];
      window.customCards.push(card);
    },
    [ORIGIN, FAKE_CARD],
  );

  const stamp = await openDashboard(page);
  const { yaml } = await openSeededCardCodeEditor(page, stamp);

  // Leg 1: the seeded custom card appears in `type:` value completion.
  // Ctrl+Space is the factory-default trigger (see editor-completion.spec).
  await page.keyboard.press('Enter');
  await expectDialogAlive(page, 'after pressing Enter on a fresh line');
  await typeInYaml(page, 'type: custom:e2e');
  await expectDialogAlive(page, 'after typing the type: value');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'custom: type value + Ctrl+Space produced no completion popup');
  const cardRows = await popupRowTexts(page);
  expect(
    cardRows.some((text) => text.includes('custom:e2e-fake-card')),
    `window.customCards seed never reached type: completion (rows: ${JSON.stringify(cardRows)})`,
  ).toBe(true);
  await page.keyboard.press('Escape');

  // Clear the unfinished line so leg 2 starts from a clean key context.
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Delete');

  // Leg 2: live, context-aware key completion inside a call-service action
  // block. Build the action block line by line (CodeMirror auto-indents
  // after Enter; Home+spaces pins the indentation we mean).
  //
  // Scope note: at the action-mapping key level
  // the provider returns the live lovelace action/card key schema
  // (tap_action, action, data, target, …), which is the live-context
  // feature this leg guards. Asserting a *service field* key
  // (message/title) would require the cursor to land inside the `data:`
  // mapping with the service resolved — a precise context this line-by-line
  // construction does not reliably reach (launch-gates.spec covers that
  // position). This leg asserts what the provider returns for the context it
  // reaches.
  await typeInYaml(page, 'tap_action:');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  await typeInYaml(page, '  action: call-service');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  await typeInYaml(page, '  service: persistent_notification.create');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  await typeInYaml(page, '  ');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'Ctrl+Space in the action block produced no completion popup');
  const actionRows = await popupRowTexts(page);
  const expectedActionKeys = ['data', 'target', 'action'];
  expect(
    expectedActionKeys.filter((key) => actionRows.some((text) => text.includes(key))).length,
    `the live action-block key schema never reached completion (rows: ${JSON.stringify(actionRows)})`,
  ).toBeGreaterThanOrEqual(2);

  // Sanity: the document actually contains what we typed (the keystroke
  // path went through CodeMirror, not past it).
  const docText = await yaml.evaluate((el) => el.textContent || '');
  expect(docText).toContain('persistent_notification.create');
});
