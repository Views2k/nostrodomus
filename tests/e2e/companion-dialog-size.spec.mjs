// Dialog sizing on the HA 2026.6 wa-dialog.
//
// The frozen v17 DIALOG_ROOT_CSS sizes the editor dialog via `:host` / `ha-dialog` /
// `--mdc-dialog-*`, which reach nothing on 2026.6's real modal — a `wa-dialog`
// (WebAwesome) nested in ha-dialog's shadow whose surface is `::part(dialog)` (a native
// top-layer <dialog>). Without a sizing rule that reaches it, wa-dialog stays 726×0, the
// editor/preview panes stack vertically, and the codebox covers the dashboard. The companion
// injects an additive sheet into ha-dialog's shadow root sizing `wa-dialog::part(dialog)` to
// 98vw×94vh. This spec checks that the dialog is about full screen and that the
// .element-editor / .element-preview panes sit side by side.
//
// Runs on the entities-card path (the companion-parity choreography). The
// layer is force-active. The "panes side-by-side" assertion needs a real browser,
// so it lives in this spec.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';

// Deep-pierce shadow roots to measure the real modal surface + the two panes. Returns
// the wa-dialog ::part(dialog) box, the editor/preview boxes, and the viewport, so a
// failure reports the actual geometry.
function measureDialogGeometry() {
  const dq = (sel, root = document, out = []) => {
    root.querySelectorAll(sel).forEach((e) => out.push(e));
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) dq(sel, e.shadowRoot, out); });
    return out;
  };
  const wa = dq('wa-dialog')[0] || null;
  const part = wa?.shadowRoot?.querySelector('[part~="dialog"], dialog') || null;
  const editor = dq('.element-editor')[0] || null;
  const preview = dq('.element-preview')[0] || null;
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    hasWaDialog: !!wa,
    partDialog: box(part),
    editor: box(editor),
    preview: box(preview),
  };
}

test('companion dialog-size: the 2026.6 wa-dialog editor dialog is sized ~98vw×94vh with editor/preview side-by-side', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  await openSeededCardCodeEditor(page, stamp);

  // Wait for the wa-dialog surface to be sized by the injected sheet (settle cadence).
  await expect
    .poll(
      async () => {
        const g = await page.evaluate(measureDialogGeometry);
        return g.partDialog ? g.partDialog.h : 0;
      },
      {
        timeout: 8000,
        message: 'wa-dialog ::part(dialog) never reached a near-full-viewport height — the dialog sizing sheet did not reach ha-dialog\'s shadow root (HA 2026.6 wa-dialog regression)',
      },
    )
    .toBeGreaterThan(0);

  const g = await page.evaluate(measureDialogGeometry);
  await testInfo.attach('dialog-size.json', { body: JSON.stringify(g, null, 2), contentType: 'application/json' });

  // The modal surface fills most of the viewport (98vw × 94vh, with tolerance for
  // scrollbars / rounding / UA chrome).
  expect(g.partDialog, 'wa-dialog ::part(dialog) not found').not.toBeNull();
  expect(g.partDialog.w, `dialog width ${g.partDialog.w} is not ~98vw of ${g.vw}`).toBeGreaterThan(g.vw * 0.9);
  expect(g.partDialog.h, `dialog height ${g.partDialog.h} is not ~94vh of ${g.vh}`).toBeGreaterThan(g.vh * 0.85);

  // The editor and preview panes sit side by side, not stacked: the preview starts clearly
  // to the right of the editor, and they overlap vertically.
  expect(g.editor, 'element-editor not found').not.toBeNull();
  expect(g.preview, 'element-preview not found').not.toBeNull();
  expect(
    g.preview.x,
    `panes are not side-by-side: preview.x=${g.preview.x} should be right of editor mid (${g.editor.x}+${g.editor.w}/2)`,
  ).toBeGreaterThan(g.editor.x + g.editor.w * 0.4);
  const vOverlap = Math.min(g.editor.y + g.editor.h, g.preview.y + g.preview.h) - Math.max(g.editor.y, g.preview.y);
  expect(vOverlap, `panes do not overlap vertically (stacked?): overlap=${vOverlap}`).toBeGreaterThan(100);
});

// Below 1000px Home Assistant stacks the preview under the editor. In a 900x800 window the dialog
// body must scroll instead of growing to the height of both panes, which would push the row with
// Save and Cancel to y=792 (8px inside the window), and the codebox must not cover the preview.
function measureStackedGeometry() {
  const dq = (sel, root = document, out = []) => {
    root.querySelectorAll(sel).forEach((e) => out.push(e));
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) dq(sel, e.shadowRoot, out); });
    return out;
  };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) };
  };
  return {
    vh: window.innerHeight,
    footer: box(dq('ha-dialog-footer')[0]),
    preview: box(dq('.element-preview')[0]),
    editorPane: box(dq('.element-editor')[0]),
    codebox: box(dq('ha-code-editor')[0]),
    scroller: box(dq('.cm-scroller')[0]),
  };
}

test('companion dialog-size: in a 900px window the Save row stays in view and the preview can be scrolled to', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  await expect
    .poll(async () => (await page.evaluate(measureStackedGeometry)).footer?.bottom ?? 9999, {
      timeout: 8000,
      message: 'the row with Save and Cancel never came inside the window',
    })
    .toBeLessThanOrEqual(800);

  const before = await page.evaluate(measureStackedGeometry);
  await testInfo.attach('stacked-before-scroll.json', { body: JSON.stringify(before, null, 2), contentType: 'application/json' });
  expect(before.footer.h, 'footer not laid out').toBeGreaterThan(0);
  expect(before.codebox.bottom, `the codebox (bottom ${before.codebox.bottom}) covers the preview (top ${before.preview.top})`).toBeLessThanOrEqual(before.preview.top);
  expect(before.preview.top, 'the preview is expected under the editor in this layout').toBeGreaterThan(before.codebox.top);
  // Both panes span the dialog instead of keeping their side-by-side widths (486px and 352px of an
  // 882px dialog).
  expect(before.editorPane.w, `the editor pane is ${before.editorPane.w}px of a ${before.footer.w}px dialog`).toBeGreaterThan(before.footer.w * 0.9);
  expect(before.preview.w, `the preview pane is ${before.preview.w}px of a ${before.footer.w}px dialog`).toBeGreaterThan(before.footer.w * 0.9);
  expect(before.codebox.w, `the codebox is ${before.codebox.w}px of a ${before.footer.w}px dialog`).toBeGreaterThan(before.footer.w * 0.85);
  // The code area fills the codebox too, instead of stopping at 54vw - 18px, about half the box.
  expect(before.scroller.w, `the code area is ${before.scroller.w}px in a ${before.codebox.w}px codebox`).toBeGreaterThan(before.codebox.w * 0.9);

  // Scroll the dialog with the wheel, away from the codebox (which scrolls its own text).
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(async () => (await page.evaluate(measureStackedGeometry)).preview.top, {
      timeout: 4000,
      message: 'the preview did not move up when the dialog was scrolled',
    })
    .toBeLessThan(before.footer.top - 200);

  const after = await page.evaluate(measureStackedGeometry);
  await testInfo.attach('stacked-after-scroll.json', { body: JSON.stringify(after, null, 2), contentType: 'application/json' });
  expect(after.footer.top, 'the Save row moved while the body scrolled').toBe(before.footer.top);
  expect(after.codebox.h, 'the codebox changed height while the body scrolled').toBe(before.codebox.h);
});
