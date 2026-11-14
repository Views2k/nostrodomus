// uninstall-teardown.spec — promotes boot-cost's style-node diagnostic to a hard teardown assertion.
// The contract uninstall() actually guarantees (per the public-API teardown unit tests + the A4 "uninstall
// sticks" fix): opening an editor injects companion/editor style nodes; uninstall() tears the bulk of them
// down; and — the key user guarantee — NOTHING re-injects when HA later mutates the DOM (observers/listeners
// are truly disconnected). A small inert residual (e.g. a document-level syntax/base node uninstall does not
// target) is reported, not failed on — the meaningful properties are "editor styling removed" and "no
// re-injection". Consolidates Tier1 / Tier A / 0.1.258 teardown, unit-only until now. Owner-run.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';

// Deep-walk every shadow root for Nostrodomus-owned <style> node ids (same predicate boot-cost uses).
const nostrodomusStyleNodeIds = (page) =>
  page.evaluate(() => {
    const ids = [];
    const seen = new Set();
    const walk = (root, depth) => {
      if (!root || depth > 25) return;
      try {
        for (const s of root.querySelectorAll?.('style') || []) {
          const id = String(s.id || '');
          if (id.includes('nostrodomus') || s.dataset?.nostrodomusPurpose || s.dataset?.nostrodomus) ids.push(id || '(no-id)');
        }
      } catch { /* closed root */ }
      try {
        for (const el of root.querySelectorAll?.('*') || []) {
          if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, depth + 1); }
        }
      } catch { /* closed root */ }
    };
    try { walk(document, 0); } catch { /* detached */ }
    return ids;
  });

test('uninstall teardown: uninstall() tears down the editor styling and nothing re-injects afterwards', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  const baseline = await nostrodomusStyleNodeIds(page); // editor-less footprint
  await openSeededCardCodeEditor(page, stamp);

  // Opening a styled editor injects companion/editor style nodes beyond the editor-less baseline.
  await expect
    .poll(async () => (await nostrodomusStyleNodeIds(page)).length, { timeout: 10000, message: 'expected editor style nodes after opening an editor (runtime not active?)' })
    .toBeGreaterThan(baseline.length);
  const peak = await nostrodomusStyleNodeIds(page);

  // uninstall() tears the injected styling down (the bulk of what opening the editor added).
  await page.evaluate(() => window.__nostrodomus?.uninstall?.());
  await expect
    .poll(async () => (await nostrodomusStyleNodeIds(page)).length, { timeout: 10000, message: 'uninstall() removed no style nodes at all' })
    .toBeLessThan(peak.length);
  const residual = await nostrodomusStyleNodeIds(page);

  // Nothing re-injects when the DOM mutates afterwards — a live observer/listener would re-add a node.
  await page.evaluate(() => {
    document.body.classList.add('e2e-uninstall-poke');
    document.body.classList.remove('e2e-uninstall-poke');
  });
  await page.waitForTimeout(1500); // > the companion settle-ladder window
  const afterPoke = await nostrodomusStyleNodeIds(page);

  await testInfo.attach('teardown-style-nodes.json', {
    body: JSON.stringify({ baseline, peak, residual, afterPoke }, null, 2),
    contentType: 'application/json',
  });

  // The key guarantee: uninstall is stable — the residual does not grow when HA mutates the DOM.
  expect(
    afterPoke.length,
    `a style node re-injected after uninstall — a live observer/listener survived. residual ${JSON.stringify(residual)} -> afterPoke ${JSON.stringify(afterPoke)}`,
  ).toBeLessThanOrEqual(residual.length);
});
