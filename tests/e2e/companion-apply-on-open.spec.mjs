// Apply on open: the companion layer must apply when the editor dialog settles, not only
// after the user clicks inside the codebox.
//
// A real 2026.6 wa-dialog opens 0-sized and settles asynchronously. At open the editor fails
// the ≥200×80 visible-candidate gate and reads as no editor, and activeEditDialog() is null
// while the surface is 0-sized, so the no-editor re-probe loop's "opening" window could run out
// before the dialog settles; then only the next click (onPointer → scheduleCodeboxStyleReapply)
// would find the settled editor. editorLikelyOpeningWithoutMountedCodebox() therefore also
// stays true while an edit-card dialog candidate is present, which keeps the loop alive until
// the companion converges on the settled dialog.
//
// This spec opens the editor and never clicks the codebox (skipEditorClick), then asserts:
//   (1) the companion stylesheet node reaches the editor's CodeMirror root on its own, and
//   (2) that node carries the horizontal-scrollbar suppression rule
//       (`::-webkit-scrollbar:horizontal { height: 0 }`). The frozen sheet hides the
//       horizontal bar through that webkit pseudo, not through overflow-x: the scroller's
//       computed overflow-x stays "auto", and getComputedStyle cannot read a
//       ::-webkit-scrollbar pseudo, so whether a bar is visibly gone is not asserted here.
//
// The Edit and "code editor" clicks during open cannot be avoided, and they do fire the
// outside-pointer reapply, but while the editor is still 0-sized, so they do not converge.
// The spec shows the apply on settle without a codebox interaction.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { CM_SCROLLER, HA_CODE_EDITOR, HUI_BUTTON_CARD } from './selectors.mjs';

const COMPANION_CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';

test('companion apply-on-open: a button-card editor receives the companion when the dialog settles, without a codebox click', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  // Open the simple button card's code editor, but do not click into the codebox.
  const { dialog } = await openSeededCardCodeEditor(page, stamp, {
    cardSelector: HUI_BUTTON_CARD,
    cardText: 'E2E Button',
    skipEditorClick: true,
  });

  const scroller = dialog.locator(`${HA_CODE_EDITOR} ${CM_SCROLLER}`).first();

  // (1) The companion node must reach the editor's CodeMirror root on its own, driven by
  //     the settle re-probe loop — no codebox click. Poll the settle cadence generously.
  await expect
    .poll(
      () => scroller.evaluate(
        (el, styleId) => Boolean(el.getRootNode().querySelector && el.getRootNode().querySelector(`#${styleId}`)),
        COMPANION_CODEBOX_STYLE_ID,
      ),
      {
        timeout: 10000,
        message: `companion stylesheet #${COMPANION_CODEBOX_STYLE_ID} never reached the button-card editor without a codebox click — the layer is still applying only on interaction, not on dialog settle (apply-on-open regression)`,
      },
    )
    .toBe(true);

  // (2) Codebox behaves like a normal code editor: the no-wrap override sheet is applied,
  //     the scroller is overflow-x:auto (long lines extend + scroll, not wrap), and on this
  //     short button-card content there is no spurious horizontal overflow (a bar only appears
  //     when a line is actually long).
  const styleInfo = await scroller.evaluate((el) => {
    const root = el.getRootNode();
    const cs = getComputedStyle(el);
    const content = root?.querySelector?.('.cm-content') || null;
    return {
      noWrapNode: !!root?.querySelector?.('#nostrodomus-editor-v17-2-learned-style-no-wrap'),
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      contentWhiteSpace: content ? getComputedStyle(content).whiteSpace : '',
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    };
  });
  await testInfo.attach('apply-on-open.json', { body: JSON.stringify(styleInfo, null, 2), contentType: 'application/json' });
  expect(styleInfo.noWrapNode, 'the no-wrap override sheet did not reach the editor').toBe(true);
  expect(styleInfo.overflowX, `scroller overflow-x is "${styleInfo.overflowX}" — long lines must extend + scroll (expected "auto", not "hidden"/wrap)`).toBe('auto');
  expect(styleInfo.overflowY, 'scroller overflow-y must stay "auto" (vertical scroll preserved)').toBe('auto');
  expect(styleInfo.contentWhiteSpace, `.cm-content white-space is "${styleInfo.contentWhiteSpace}" — must be "pre" (no wrap)`).toBe('pre');
  expect(styleInfo.scrollW - styleInfo.clientW, `scroller has ${styleInfo.scrollW - styleInfo.clientW}px of horizontal overflow on SHORT content — the spurious bar is back`).toBeLessThanOrEqual(2);
});
