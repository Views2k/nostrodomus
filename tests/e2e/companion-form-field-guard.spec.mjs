// ABSORB v17-persistence regression — a CodeMirror nested in a visual-editor FORM FIELD must
// NOT be treated as the codebox.
//
// The persistence engine (companionSettleRuntime) now re-applies on open to editors a click
// never reached, which widened discovery's blast radius. The owner hit this on a markdown
// card's VISUAL editor: its content template field is a ha-code-editor inside
// ha-selector-template / ha-form, and the companion force-sized it to calc(94vh - …),
// overflowing the card and covering the "Show code editor" toggle. The fix guards
// visibleStyleEditorCandidate to reject ANY ha-form / ha-selector-nested CodeMirror (general,
// not markdown-specific — it must hold for condition/action editors and other form fields too).
//
// This spec opens the markdown card's VISUAL editor (never switches to YAML) and asserts the
// template field's CodeMirror is NOT styled as the codebox: no companion stylesheet node, and
// no enlarge inline height. Authored on-branch; RUN BY THE OWNER.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { HA_CODE_EDITOR, HUI_MARKDOWN_CARD } from './selectors.mjs';

const COMPANION_CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';

test('form-field guard: a markdown visual-editor template CodeMirror is NOT treated as the codebox (no companion node, no enlarge height)', async ({ page }, testInfo) => {
  // Force the companion layer ACTIVE so a missing guard WOULD style the field (else the test
  // would pass vacuously).
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  // Open the markdown card in its VISUAL editor (do NOT switch to YAML).
  const { dialog } = await openSeededCardCodeEditor(page, stamp, {
    cardSelector: HUI_MARKDOWN_CARD,
    cardText: 'Nostrodomus E2E',
    visualOnly: true,
  });

  // The template field's ha-code-editor (the only CodeMirror on the visual tab).
  const codeEditorHost = dialog.locator(HA_CODE_EDITOR).first();
  await codeEditorHost.waitFor({ state: 'visible', timeout: 15000 });

  // Give the settle ladder a window to (wrongly) apply, so a regression would be caught: poll
  // for ~3s that the companion never reaches this field.
  const probe = async () => codeEditorHost.evaluate((host, styleId) => {
    const root = host.shadowRoot;
    const cm = root && root.querySelector('.cm-editor');
    return {
      companionNode: !!(root && root.querySelector(`#${styleId}`)),
      hostHeight: host.style && host.style.height || '',
      cmHeight: (cm && cm.style && cm.style.height) || '',
    };
  }, COMPANION_CODEBOX_STYLE_ID);

  // Settle for a beat (the 2800ms ladder), then assert no companion treatment landed.
  await expect.poll(async () => (await probe()).companionNode, { timeout: 4000, intervals: [250, 500, 750, 1000] }).toBe(false);
  const final = await probe();
  console.log('[form-field-guard]', JSON.stringify(final));
  await testInfo.attach('form-field-guard.json', { body: JSON.stringify(final, null, 2), contentType: 'application/json' });

  expect(final.companionNode, 'companion stylesheet node must NOT reach a form-field CodeMirror').toBe(false);
  expect(final.hostHeight, `ha-code-editor host height "${final.hostHeight}" — the enlarge must NOT force-size a form-field editor`).not.toMatch(/94vh/);
  expect(final.cmHeight, `.cm-editor height "${final.cmHeight}" — the enlarge must NOT force-size a form-field editor`).not.toMatch(/94vh/);
});
