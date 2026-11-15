// Codebox bottom geometry: the gap under the editor and the vertical scrollbar clearance.
//
// Pinned layout: the .cm-editor and .cm-scroller end about 14px above the ha-code-editor host bottom
// (simple 164 vs 150, tabbed 413 vs 399; 14px either way, whatever the viewport), so the horizontal
// scrollbar along the scroller bottom is close to flush with no wide frosted strip under it, while
// its ends and the vertical down arrow stay clear of the host ::before radius-22 rounded corners. A
// gap of 0 leaks at the corners (the deliberate CONTENT_FIT square clip pokes the bar ends past the corner
// arc). At 14px the frame's corner inset is ~1.5px, so any arc overlap is sub-pixel.
// Rounding the content back would re-clip the down-arrow that CONTENT_FIT squares on purpose.

import { test, expect, readStamp } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';

function measureFlushGap() {
  const deepAll = (sel, root = document, out = []) => {
    try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
    try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
    return out;
  };
  const host = deepAll('ha-code-editor').find((h) => h.getBoundingClientRect().height > 50) || null;
  const sr = host && host.shadowRoot;
  const cm = sr ? sr.querySelector('.cm-editor') : null;
  const scroller = sr ? sr.querySelector('.cm-scroller') : null;
  const r = (e) => (e ? e.getBoundingClientRect() : null);
  const hostRect = r(host); const cmRect = r(cm); const scrollerRect = r(scroller);
  return {
    hasAll: !!(host && cm && scroller),
    hostBottom: hostRect ? Math.round(hostRect.bottom) : null,
    cmBottom: cmRect ? Math.round(cmRect.bottom) : null,
    scrollerBottom: scrollerRect ? Math.round(scrollerRect.bottom) : null,
    gap: hostRect && scrollerRect ? Math.round(hostRect.bottom - scrollerRect.bottom) : null,
    topAligned: hostRect && cmRect ? Math.abs(Math.round(cmRect.top - hostRect.top)) : null,
    // Whether the scroller actually overflows horizontally (a real horizontal scrollbar is present) — makes
    // the corner-clearance meaningful rather than vacuous.
    hOverflow: scroller ? (scroller.scrollWidth > scroller.clientWidth + 2) : null,
  };
}

test('flush gap: the scrollbar rides ~14px above the host bottom (near-flush, corners clear)', async ({ page }, testInfo) => {
  await page.addInitScript(() => { try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ } });
  const stamp = readStamp();

  await openSeededCardCodeEditor(page, stamp, { skipEditorClick: true });
  await page.waitForTimeout(1200); // enlarge + settle

  // Force a horizontal scrollbar so the corner clearance is actually exercised (the seeded YAML is short).
  // Best-effort: geometry is the gate, this only makes the attached screenshot show a real bar at the corner.
  try {
    const content = page.locator('.cm-content').first();
    await content.click({ timeout: 5000 });
    await page.keyboard.press('End');
    await page.keyboard.type(`  # ${'x'.repeat(180)}`, { delay: 0 });
    await page.waitForTimeout(500);
  } catch { /* horizontal overflow is a nice-to-have for the screenshot, not required */ }

  const m = await page.evaluate(measureFlushGap);
  await testInfo.attach('flush-gap.json', { body: JSON.stringify(m, null, 2), contentType: 'application/json' });
  try { await testInfo.attach('codebox-corner.png', { body: await page.screenshot(), contentType: 'image/png' }); } catch { /* screenshot best-effort */ }

  expect(m.hasAll, 'host + .cm-editor + .cm-scroller all present').toBe(true);
  // The editor is top-aligned with the host (no toolbar row above it inside the host).
  expect(m.topAligned, `.cm-editor top-aligned with the host (offset ${m.topAligned}px)`).toBeLessThanOrEqual(2);
  // Near flush: the scroller bottom is about 14px above the host bottom.
  expect(m.gap, `scroller bottom must ride near-flush (~14px above host), got ${m.gap}`).toBeLessThanOrEqual(20);
  // Corner clearance: not at gap≈0, where the bar ends leak past the corners. 14px keeps the bar ends and the
  // down-arrow clear of the radius-22 frame corners. gap ≥ 8 is the corner-safety floor.
  expect(m.gap, `scroller must keep ≥8px corner clearance (at 0 the bar ends leak past the corners), got ${m.gap}`).toBeGreaterThanOrEqual(8);
});
