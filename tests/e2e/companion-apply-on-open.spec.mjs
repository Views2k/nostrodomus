// Apply on open: the companion layer must apply when the editor DIALOG settles, not only
// after the user clicks inside the codebox.
//
// On a real 2026.6 wa-dialog the codebox
// stayed unstyled until ANY click on the page. Root cause: the wa-dialog opens 0-sized and
// async-settles; at open the editor failed the ≥200×80 visible-candidate gate (mis-classed
// as no-editor), and the no-editor re-probe loop's "opening" window expired mid-settle
// (activeEditDialog() is null while the surface is 0-sized), so nothing re-ran discovery
// until the next click (onPointer → scheduleCodeboxStyleReapply re-discovered the
// now-settled editor). editorLikelyOpeningWithoutMountedCodebox() therefore also stays true
// while an edit-card dialog candidate is present (settling), keeping the loop alive so the
// companion converges on settle.
//
// This spec opens the editor and NEVER clicks the codebox (skipEditorClick), then asserts:
//   (1) the companion stylesheet node reaches the editor's CodeMirror root on its own, and
//   (2) that node carries the horizontal-scrollbar suppression rule
//       (`::-webkit-scrollbar:horizontal { height: 0 }`). NOTE: the frozen sheet hides the
//       horizontal bar via that webkit pseudo, NOT via overflow-x — the scroller's computed
//       overflow-x stays "auto", and getComputedStyle cannot read a ::-webkit-scrollbar
//       pseudo, so whether a bar is VISUALLY gone is not asserted here.
//
// NOTE: the Edit / "code editor" chrome clicks during open are unavoidable and DO fire the
// outside-pointer reapply — but while the editor is still 0-sized, so they don't converge.
// This proves apply-on-settle without a CODEBOX interaction.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { CM_SCROLLER, HA_CODE_EDITOR, HUI_BUTTON_CARD } from './selectors.mjs';

const COMPANION_CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';

test('companion apply-on-open: a button-card editor receives the companion on dialog settle WITHOUT a codebox click (apply-on-open regression)', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  // Open the SIMPLE button card's code editor — but DO NOT click into the codebox.
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
        message: `companion stylesheet #${COMPANION_CODEBOX_STYLE_ID} never reached the button-card editor WITHOUT a codebox click — the layer is still applying only on interaction, not on dialog settle (apply-on-open regression)`,
      },
    )
    .toBe(true);

  // (2) Codebox behaves like a normal code editor: the no-wrap override sheet is applied,
  //     the scroller is overflow-x:auto (long lines extend + scroll, NOT wrap), and on this
  //     SHORT button-card content there is no spurious horizontal overflow (a bar only appears
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
  console.log('[apply-on-open]', JSON.stringify(styleInfo));
  await testInfo.attach('apply-on-open.json', { body: JSON.stringify(styleInfo, null, 2), contentType: 'application/json' });
  expect(styleInfo.noWrapNode, 'the no-wrap override sheet did not reach the editor').toBe(true);
  expect(styleInfo.overflowX, `scroller overflow-x is "${styleInfo.overflowX}" — long lines must extend + scroll (expected "auto", not "hidden"/wrap)`).toBe('auto');
  expect(styleInfo.overflowY, 'scroller overflow-y must stay "auto" (vertical scroll preserved)').toBe('auto');
  expect(styleInfo.contentWhiteSpace, `.cm-content white-space is "${styleInfo.contentWhiteSpace}" — must be "pre" (no wrap)`).toBe('pre');
  expect(styleInfo.scrollW - styleInfo.clientW, `scroller has ${styleInfo.scrollW - styleInfo.clientW}px of horizontal overflow on SHORT content — the spurious bar is back`).toBeLessThanOrEqual(2);
});
