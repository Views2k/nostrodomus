// editor-styling.spec — with the real editor open, the
// host-owned codebox chrome is applied per STYLE_OWNERSHIP_CONTRACT.md
// (`ha-code-editor`/`:host` owns the layers: ::before border/glow, ::after
// frosted surface, isolation: isolate; CodeMirror panes stay transparent),
// and scrollHeight is stable across 3 seconds of idle (a scroll jiggle or a
// clobbered style fails this).

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { CM_SCROLLER, HA_CODE_EDITOR } from './selectors.mjs';

test('editor styling: host-owned chrome applied, scrollHeight stable for 3s idle', async ({ page }, testInfo) => {
  const stamp = await openDashboard(page);
  const { dialog } = await openSeededCardCodeEditor(page, stamp);
  const host = dialog.locator(HA_CODE_EDITOR).first();

  // Host-owned layer model (computed, not implementation-coupled).
  const computed = await host.evaluate((el) => {
    const style = getComputedStyle(el);
    const before = getComputedStyle(el, '::before');
    const after = getComputedStyle(el, '::after');
    const editor = el.shadowRoot?.querySelector('.cm-editor') || el.querySelector('.cm-editor');
    return {
      isolation: style.isolation,
      beforeContent: before.content,
      afterContent: after.content,
      cmEditorBackground: editor ? getComputedStyle(editor).backgroundColor : null,
    };
  });
  await testInfo.attach('computed-chrome.json', {
    body: JSON.stringify(computed, null, 2),
    contentType: 'application/json',
  });
  expect(computed.isolation, 'codebox host is not isolation: isolate').toBe('isolate');
  expect(computed.beforeContent, 'the ::before border/glow layer is absent').not.toBe('none');
  expect(computed.afterContent, 'the ::after frosted-surface layer is absent').not.toBe('none');
  expect(
    computed.cmEditorBackground,
    `.cm-editor pane is not transparent (${computed.cmEditorBackground}) — a pane took over chrome ownership`,
  ).toBe('rgba(0, 0, 0, 0)');

  // Scroll stability: scrollHeight sampled every 500ms for 3s must not move
  // (the reapply-jitter detector — a settle loop fighting itself shows up
  // here as oscillation).
  const scroller = dialog.locator(`${HA_CODE_EDITOR} ${CM_SCROLLER}`).first();
  const samples = [];
  for (let i = 0; i < 7; i += 1) {
    samples.push(await scroller.evaluate((el) => el.scrollHeight));
    if (i < 6) await page.waitForTimeout(500);
  }
  expect(
    new Set(samples).size,
    `scrollHeight moved during 3s of idle: [${samples.join(', ')}]`,
  ).toBe(1);
});
