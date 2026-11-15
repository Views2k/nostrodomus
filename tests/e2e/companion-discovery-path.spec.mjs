// The companion layer on a simple button card (type: button, no option-tab row), a case
// companion-parity (entities card only) does not cover. This editor is discovered
// through a non-sentinel convergence path (initialSyntaxPaintGate), so the sentinel
// never fires (editorSentinelStats.detections == 0). A companion wired only to the editor
// sentinel would apply neither module (scrollbar or enlarge) here, while main's styling,
// which rides multiple paths, would. The companion is driven from
// rememberActiveCodeboxEditor (the convergence point every discovery path funnels
// through), so it reaches the editor regardless of which path won.
//
// This spec asserts, on the button card:
//   (1) the scrollbar companion stylesheet node reaches the editor's CodeMirror root, and
//   (2) the enlarge module lands an inline height set on the ha-code-editor wrapper +
//       .cm-editor / .cm-scroller.
// detections may legitimately be 0: the point is the companion applies via the
// cache convergence, not that the sentinel fires. This spec accepts either height set
// (simple or tabbed, like companion-parity) so the tab state of the instance does not
// fail it.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { CM_SCROLLER, HA_CODE_EDITOR, HUI_BUTTON_CARD } from './selectors.mjs';

// The companion scrollbar stylesheet id (src/companion/companionStyleRuntime.js).
const COMPANION_CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';

// Enlarge inline-height value sets [simple (no tabs → taller), tabbed]
// (src/companion/codeboxEnlargeRuntime.js). A button card is simple, but accept either
// so HA tab-state never fails the spec; the discovery-enlarge.json attachment shows which landed.
const ENLARGE_WRAPPER_HEIGHTS = ['calc(94vh - 150px)', 'calc(94vh - 340px)'];
const ENLARGE_CM_HEIGHTS = ['calc(94vh - 164px)', 'calc(94vh - 354px)'];
const ENLARGE_SCROLLER_HEIGHTS = ['calc(94vh - 164px)', 'calc(94vh - 354px)'];
// The enlarge layer writes a measured px height once the editor is laid out (fit to the dialog
// footer); the viewport formulas are only the value used before layout is measurable.
const isEnlargeHeight = (value, formulas) => /^\d+px$/.test(String(value || '').trim())
  || formulas.map(normalizeCalc).includes(normalizeCalc(value));

// Blink reserializes calc() (operand reorder / "A - B" → "-B + A"), so compare
// semantically: reduce to a sorted set of signed terms. (Same helper as companion-parity.)
function normalizeCalc(value) {
  return String(value || '')
    .trim()
    .replace(/^calc\(/i, '')
    .replace(/\)\s*$/, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+-')
    .split('+')
    .filter(Boolean)
    .sort()
    .join('+');
}

test('companion discovery-path: a simple button card receives the companion layer regardless of discovery path', async ({ page }, testInfo) => {
  // Turn the built-in layer on before any HA document runs (localStorage switch) and again in
  // the loaded page, as in companion-parity.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  // Open the simple button card's code editor, not the entities card.
  const { dialog } = await openSeededCardCodeEditor(page, stamp, {
    cardSelector: HUI_BUTTON_CARD,
    cardText: 'E2E Button',
  });

  const scroller = dialog.locator(`${HA_CODE_EDITOR} ${CM_SCROLLER}`).first();

  // (1) Reach: the companion's own stylesheet node must appear in this
  //     editor's CodeMirror shadow root (a sentinel-only wiring misses a button
  //     card). Poll the settle cadence.
  await expect
    .poll(
      () => scroller.evaluate(
        (el, styleId) => Boolean(el.getRootNode().querySelector && el.getRootNode().querySelector(`#${styleId}`)),
        COMPANION_CODEBOX_STYLE_ID,
      ),
      {
        timeout: 8000,
        message: `companion stylesheet #${COMPANION_CODEBOX_STYLE_ID} never reached the button-card editor — the companion layer is still gated behind a discovery path this editor did not take`,
      },
    )
    .toBe(true);

  // Read the enlarge inline heights from the ha-code-editor wrapper + cm internals.
  const codeEditorHost = dialog.locator(HA_CODE_EDITOR).first();
  const enlarge = await codeEditorHost.evaluate((el) => {
    const root = el.shadowRoot;
    const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
    return {
      wrapper: norm(el.style && el.style.height),
      cm: norm(root && root.querySelector('.cm-editor') && root.querySelector('.cm-editor').style.height),
      scroller: norm(root && root.querySelector('.cm-scroller') && root.querySelector('.cm-scroller').style.height),
    };
  });

  // Diagnostics for the report: detections may be 0 (the companion rides the cache
  // convergence, not the sentinel); companionLayer should read "internal".
  const diag = await page.evaluate(() => {
    const out = {};
    try { out.detections = window.__nostrodomus?.state?.editorSentinelStats?.detections ?? null; } catch (e) { out.detections = `ERR:${e.message}`; }
    try { out.companionLayer = window.__nostrodomus?.exportDiagnostics?.()?.companionLayer ?? null; } catch (e) { out.companionLayer = `ERR:${e.message}`; }
    return out;
  });
  await testInfo.attach('discovery-enlarge.json', { body: JSON.stringify({ diag, enlarge }, null, 2), contentType: 'application/json' });

  // (2) The enlarge module landed an inline height set on all three
  //     targets. Accept simple or tabbed (compared through normalizeCalc).
  expect(isEnlargeHeight(enlarge.wrapper, ENLARGE_WRAPPER_HEIGHTS), `ha-code-editor wrapper height "${enlarge.wrapper}" is not an enlarge-layer value — the enlarge module did not apply to the button card`).toBe(true);
  expect(isEnlargeHeight(enlarge.cm, ENLARGE_CM_HEIGHTS), `.cm-editor height "${enlarge.cm}" is not an enlarge-layer value`).toBe(true);
  expect(isEnlargeHeight(enlarge.scroller, ENLARGE_SCROLLER_HEIGHTS), `.cm-scroller height "${enlarge.scroller}" is not an enlarge-layer value`).toBe(true);
});
