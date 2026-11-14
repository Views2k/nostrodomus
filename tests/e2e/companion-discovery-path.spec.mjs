// ABSORB CHECKPOINT A+B reopen regression — the canonical FAILING case that
// companion-parity (entities card only) never covered: a SIMPLE button card
// (type: button, no option-tab row). The CHECKPOINT B feel-check failed here because
// the absorbed companion layer was wired ONLY to the editor sentinel, and this editor
// was discovered through a NON-sentinel convergence path (initialSyntaxPaintGate), so
// the sentinel never fired (editorSentinelStats.detections == 0) and neither companion
// (scrollbar OR enlarge) applied — while main's styling, which rides multiple paths,
// did. The fix drives the companion from rememberActiveCodeboxEditor (the convergence
// point every discovery path funnels through), so it reaches the editor regardless of
// which path won.
//
// This spec asserts, ON THE BUTTON CARD:
//   (1) the scrollbar companion stylesheet node reaches the editor's CodeMirror root
//       (CHECKPOINT A reach — the part that was silently dead in the field), and
//   (2) the enlarge module lands an inline height set on the ha-code-editor wrapper +
//       .cm-editor / .cm-scroller (CHECKPOINT B — was (none) before the fix).
// detections may legitimately be 0: the point is the companion now applies via the
// cache convergence, NOT that the sentinel fires. The SIMPLE-vs-tabbed visual is the
// owner's manual feel-check; this spec accepts either height set (like companion-parity)
// so harness tab-state never false-reds it. Authored on-branch; RUN BY THE OWNER.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { CM_SCROLLER, HA_CODE_EDITOR, HUI_BUTTON_CARD } from './selectors.mjs';

// The companion scrollbar stylesheet id (src/companion/scrollbarStyleRuntime.js).
const COMPANION_CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';

// Enlarge inline-height value sets [SIMPLE (no tabs → taller), tabbed]
// (src/companion/codeboxEnlargeRuntime.js). A button card is simple, but accept either
// so HA tab-state never false-reds; the [discovery-diag] line reveals which landed.
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

test('companion discovery-path: a SIMPLE button card receives the companion layer regardless of discovery path (CHECKPOINT A+B reopen)', async ({ page }, testInfo) => {
  // Force the absorbed layer ACTIVE before any HA document runs (D-KILL-SWITCH escape
  // hatch), and re-assert in the loaded page context — same as companion-parity.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  // Open the SIMPLE button card's code editor — NOT the entities card.
  const { dialog } = await openSeededCardCodeEditor(page, stamp, {
    cardSelector: HUI_BUTTON_CARD,
    cardText: 'E2E Button',
  });

  const scroller = dialog.locator(`${HA_CODE_EDITOR} ${CM_SCROLLER}`).first();

  // (1) CHECKPOINT A reach: the companion's own stylesheet node must appear in this
  //     editor's CodeMirror shadow root. Before the fix this NEVER appeared on a
  //     button card (sentinel missed it). Poll the settle cadence.
  await expect
    .poll(
      () => scroller.evaluate(
        (el, styleId) => Boolean(el.getRootNode().querySelector && el.getRootNode().querySelector(`#${styleId}`)),
        COMPANION_CODEBOX_STYLE_ID,
      ),
      {
        timeout: 8000,
        message: `companion stylesheet #${COMPANION_CODEBOX_STYLE_ID} never reached the button-card editor — the companion layer is still gated behind a discovery path this editor did not take (CHECKPOINT A+B reopen regression)`,
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

  // Diagnostics for the morning evidence: detections MAY be 0 (the companion now rides
  // the cache convergence, not the sentinel); companionLayer should read "internal".
  const diag = await page.evaluate(() => {
    const out = {};
    try { out.detections = window.__nostrodomus?.state?.editorSentinelStats?.detections ?? null; } catch (e) { out.detections = `ERR:${e.message}`; }
    try { out.companionLayer = window.__nostrodomus?.exportDiagnostics?.()?.companionLayer ?? null; } catch (e) { out.companionLayer = `ERR:${e.message}`; }
    return out;
  });
  console.log('[discovery-diag]', JSON.stringify({ ...diag, enlarge }));
  await testInfo.attach('discovery-enlarge.json', { body: JSON.stringify({ diag, enlarge }, null, 2), contentType: 'application/json' });

  // (2) CHECKPOINT B: the enlarge module landed an inline height set on all three
  //     targets (was "(none)" before the fix). Accept SIMPLE or tabbed (compared
  //     through normalizeCalc); the SIMPLE-specific taller visual is the feel-check.
  expect(isEnlargeHeight(enlarge.wrapper, ENLARGE_WRAPPER_HEIGHTS), `ha-code-editor wrapper height "${enlarge.wrapper}" is not an enlarge-layer value — the enlarge module did not apply to the button card`).toBe(true);
  expect(isEnlargeHeight(enlarge.cm, ENLARGE_CM_HEIGHTS), `.cm-editor height "${enlarge.cm}" is not an enlarge-layer value`).toBe(true);
  expect(isEnlargeHeight(enlarge.scroller, ENLARGE_SCROLLER_HEIGHTS), `.cm-scroller height "${enlarge.scroller}" is not an enlarge-layer value`).toBe(true);
});
