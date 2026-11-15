// The card editor dialog and the codebox at the window sizes people use: laptops, desktop
// monitors up to 4K and ultrawide, portrait monitors, tablets and phones, and three device pixel
// ratios. At every size the dialog stays inside the window, the row with Save and Cancel is in
// view, and the codebox is inside the dialog, above that row and wide enough to work in.
//
// Home Assistant puts the editor and the preview side by side from 1000px of width and stacks
// them below that; the stacked layout scrolls, so there the codebox has to end above the preview.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';

const WIDE = [
  [1024, 768], [1280, 560], [1280, 600], [1600, 640], [1280, 720], [1280, 800], [1366, 768], [1440, 900], [1536, 864],
  [1600, 900], [1680, 1050], [1920, 720], [1920, 1080], [1920, 1200], [2560, 1080], [2560, 1440],
  [3440, 1440], [3840, 2160], [5120, 1440],
  // portrait monitors
  [1080, 1920], [1440, 2560],
];
const STACKED = [
  [900, 800], [820, 1180], [768, 1024], [600, 960], [412, 915], [390, 844], [360, 640], [320, 568],
];
const SCALED = [
  // device pixel ratio, CSS width, CSS height
  [1.25, 1536, 864], [1.5, 1280, 720], [1.5, 1707, 960], [2, 1440, 900], [2, 1920, 1080],
];

// The dashboard's edit controls are laid out for a desktop window. Below this width the dialog is
// opened in a desktop-sized window and the window is then resized, which is also what rotating a
// tablet or snapping a browser window does.
const OPEN_DIRECTLY_FROM_WIDTH = 760;
const OPEN_SIZE = { width: 1024, height: 768 };

function measure() {
  const deepAll = (sel, root = document, out = []) => {
    try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
    try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
    return out;
  };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const host = deepAll('hui-dialog-edit-card')[0] || null;
  const root = host && host.shadowRoot;
  const editor = root ? deepAll('ha-code-editor', root).find((e) => e.getBoundingClientRect().height > 50) || null : null;
  return {
    viewport: [window.innerWidth, window.innerHeight],
    ratio: window.devicePixelRatio,
    stacked: window.matchMedia('(max-width: 999px)').matches,
    pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    dialog: box(root ? deepAll('dialog', root)[0] : null),
    footer: box(root ? deepAll('ha-dialog-footer', root).find((f) => f.getBoundingClientRect().height > 0) : null),
    codebox: box(editor),
    code: box(editor && editor.shadowRoot ? editor.shadowRoot.querySelector('.cm-scroller') : null),
    editorPane: box(root ? deepAll('.element-editor', root)[0] : null),
    preview: box(root ? deepAll('.element-preview', root)[0] : null),
    inlineHeight: editor ? editor.style.height : '',
  };
}

async function openAt(page, width, height) {
  const direct = width >= OPEN_DIRECTLY_FROM_WIDTH;
  await page.setViewportSize(direct ? { width, height } : OPEN_SIZE);
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp, { skipEditorClick: true });
  if (!direct) await page.setViewportSize({ width, height });
  // The fit follows a ResizeObserver; wait until the Save row is inside the window.
  await expect
    .poll(async () => (await page.evaluate(measure)).footer?.bottom ?? 99999, {
      timeout: 10000,
      message: `${width}x${height}: the row with Save and Cancel never came inside the window`,
    })
    .toBeLessThanOrEqual(height + 1);
  await page.waitForTimeout(600);
  return page.evaluate(measure);
}

function expectFit(m, width, height) {
  const label = `${width}x${height}${m.ratio !== 1 ? ` at ratio ${m.ratio}` : ''}`;
  const where = `${label}: ${JSON.stringify(m)}`;
  expect(m.dialog, `${label}: dialog present`).not.toBeNull();
  expect(m.footer, `${label}: Save row present`).not.toBeNull();
  expect(m.codebox, `${label}: codebox present`).not.toBeNull();

  expect(m.pageScrollsSideways, `the page scrolls sideways. ${where}`).toBe(false);
  expect(m.dialog.left, `the dialog starts left of the window. ${where}`).toBeGreaterThanOrEqual(-1);
  expect(m.dialog.right, `the dialog ends right of the window. ${where}`).toBeLessThanOrEqual(width + 1);
  expect(m.dialog.bottom, `the dialog ends below the window. ${where}`).toBeLessThanOrEqual(height + 1);
  expect(m.footer.top, `the Save row is above the window. ${where}`).toBeGreaterThanOrEqual(0);
  expect(m.footer.bottom, `the Save row is below the window. ${where}`).toBeLessThanOrEqual(height + 1);

  expect(m.inlineHeight, `the codebox has no measured height ("${m.inlineHeight}"). ${where}`).toMatch(/^\d+px$/);
  expect(m.codebox.left, `the codebox starts left of the dialog. ${where}`).toBeGreaterThanOrEqual(m.dialog.left - 1);
  expect(m.codebox.right, `the codebox ends right of the dialog. ${where}`).toBeLessThanOrEqual(m.dialog.right + 1);
  expect(m.codebox.top, `the codebox starts above the dialog. ${where}`).toBeGreaterThanOrEqual(m.dialog.top - 1);
  // In the stacked layout the dialog body scrolls under the Save row, so this holds side by side only.
  if (!m.stacked) expect(m.codebox.bottom, `the codebox runs under the Save row. ${where}`).toBeLessThanOrEqual(m.footer.top + 1);
  // The code area fills the codebox, not about half of it.
  expect(m.code.w, `the code area is ${m.code.w}px in a ${m.codebox.w}px codebox. ${where}`).toBeGreaterThan(m.codebox.w * 0.9);

  if (m.stacked) {
    expect(m.codebox.w, `the codebox is narrower than the stacked dialog. ${where}`).toBeGreaterThan(m.dialog.w * 0.85);
    expect(m.editorPane.w, `the editor pane does not span the stacked dialog. ${where}`).toBeGreaterThan(m.dialog.w * 0.9);
    expect(m.preview.w, `the preview pane does not span the stacked dialog. ${where}`).toBeGreaterThan(m.dialog.w * 0.9);
    expect(m.codebox.bottom, `the codebox covers the preview. ${where}`).toBeLessThanOrEqual(m.preview.top + 1);
    // 200px is the smallest editor the plugin recognizes as a codebox.
    expect(m.codebox.w, `the codebox is too narrow to be recognized. ${where}`).toBeGreaterThanOrEqual(200);
    expect(m.codebox.h, `the codebox is too short to work in. ${where}`).toBeGreaterThanOrEqual(120);
  } else {
    expect(m.codebox.w, `the codebox is too narrow. ${where}`).toBeGreaterThanOrEqual(400);
    expect(m.codebox.h, `the codebox is too short to work in. ${where}`).toBeGreaterThanOrEqual(height >= 700 ? 300 : 160);
    expect(m.preview.left, `the preview is not beside the editor. ${where}`).toBeGreaterThanOrEqual(m.editorPane.right - 1);
    expect(m.preview.right, `the preview ends right of the dialog. ${where}`).toBeLessThanOrEqual(m.dialog.right + 1);
  }
}

for (const [width, height] of [...WIDE, ...STACKED]) {
  test(`codebox fit at ${width}x${height}`, async ({ page }, testInfo) => {
    const m = await openAt(page, width, height);
    await testInfo.attach('fit.json', { body: JSON.stringify(m, null, 2), contentType: 'application/json' });
    expectFit(m, width, height);
  });
}

for (const [ratio, width, height] of SCALED) {
  test.describe(`device pixel ratio ${ratio}`, () => {
    test.use({ deviceScaleFactor: ratio });
    test(`codebox fit at ${width}x${height}, ratio ${ratio}`, async ({ page }, testInfo) => {
      const m = await openAt(page, width, height);
      await testInfo.attach('fit.json', { body: JSON.stringify(m, null, 2), contentType: 'application/json' });
      expect(m.ratio, 'the device pixel ratio is the one under test').toBe(ratio);
      expectFit(m, width, height);
    });
  });
}
