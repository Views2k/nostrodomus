// ABSORB P0d — companion-parity e2e (CLASS B: authored on-branch, RUN BY THE OWNER
// at RUN CHECKPOINT A, never claimed green without that run).
//
// The spec FORCE-ACTIVATES the absorbed companion layer on the test instance via the
// D-KILL-SWITCH escape hatch (localStorage nostrodomusCompanion="active"), injected
// before any document runs — so a plain `npm run e2e` exercises the ACTIVE layer with
// no manual flip and no rebuild (the shipped dist already carries the companion code
// behind this hatch). PRECONDITION still in force: NO external legacy
// nostrodomus_editor_v17_2 / nostrodomus-picker-safe resources are loaded (the e2e seed
// registers only nostrodomus.js, so this holds on the harness).
//
// PARITY MODEL (corrected — see ABSORB P2 reconciliation). v17's scrollbar CSS sets
//   scrollbar-color: var(--nostrodomus-codebox-scrollbar-thumb, <fallback>) var(--…-track, <fallback>)
// and the absorbed module reproduces it BYTE-IDENTICALLY (proven by the frozen
// scrollbar_css_byte_identity unit baseline — that is the CSS-string parity proof, and
// it is never relaxed). The <fallback> literal is DEAD in the integrated product: the
// main extension (src/ui/codeboxStyle.js) always defines --nostrodomus-codebox-scrollbar-thumb
// from the user's scrollbar settings, and a Nostrodomus theme may override it
// (D-THEME-BOUNDARY — the var names are kept precisely so it can). The earlier spec
// asserted that dead fallback literal AND never activated the layer; both were defects.
// This spec asserts the live truth instead:
//   (1) the companion's OWN stylesheet node is present in the CodeMirror shadow root
//       (that id is the companion's alone — proves the layer is active and injecting
//        into the root where its .cm-* rules actually take effect),
//   (2) the scroller's computed scrollbar-color thumb RESOLVES TO the cascaded
//       --nostrodomus-codebox-scrollbar-thumb (proves the var deference works end-to-end,
//        rather than hardcoding a color) — both sides resolved through the browser so
//        an hsla() var and an rgba() scrollbar-color compare cleanly,
// plus no-flash, scrollHeight stability, and diagnostics companion-layer="internal".

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { CM_SCROLLER, HA_CODE_EDITOR } from './selectors.mjs';

// The companion codebox stylesheet id (src/companion/scrollbarStyleRuntime.js
// CODEBOX_STYLE_ID; also a frozen coexistence id in
// coordinatorRuntime.EXTERNAL_COMPANION_STYLE_IDS — it does not drift).
const COMPANION_CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';

// Parse the first rgb/rgba triplet ("r, g, b") from a computed color string.
function rgbTriplet(value) {
  const m = String(value || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return m ? `${m[1]}, ${m[2]}, ${m[3]}` : null;
}

// Canonicalize a calc() length to an order-independent, sign-tagged term set.
// Blink reserializes the inline value: it reorders operands and rewrites
// "A - B" as "-B + A" (e.g. the source "calc(94vh - 150px)" reads back as
// "calc(-150px + 94vh)"). An exact string match would miss the correct value,
// so reduce both sides to a sorted set of signed terms before comparing.
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

// ABSORB P3 enlarge inline-height value sets (src/companion/codeboxEnlargeRuntime.js):
// [SIMPLE (no option-tab row → taller), tabbed]. The seeded editor may be either; the
// owner's manual feel-check covers the simple-specific visual. Compared via
// normalizeCalc() so Blink's calc() reserialization (operand reorder / sign flip)
// does not cause a false miss.
const ENLARGE_WRAPPER_HEIGHTS = ['calc(94vh - 150px)', 'calc(94vh - 340px)'];
const ENLARGE_CM_HEIGHTS = ['calc(94vh - 164px)', 'calc(94vh - 354px)'];
const ENLARGE_SCROLLER_HEIGHTS = ['calc(94vh - 164px)', 'calc(94vh - 354px)'];
// The enlarge layer writes a measured px height once the editor is laid out (fit to the dialog
// footer); the viewport formulas are only the value used before layout is measurable.
const isEnlargeHeight = (value, formulas) => /^\d+px$/.test(String(value || '').trim())
  || formulas.map(normalizeCalc).includes(normalizeCalc(value));

test('companion-parity: layer active — scrollbar stylesheet + var cascade, codebox-enlarge inline heights, no flash, stable, diagnostics=internal', async ({ page }, testInfo) => {
  // Force the absorbed layer ACTIVE before any HA document runs. Set UNCONDITIONALLY
  // (try/catch swallows opaque-origin about:blank) so activation never depends on a
  // hardcoded origin matching the harness — RUN CHECKPOINT A diagnosis flagged origin
  // as a candidate, so this removes it as a variable entirely.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });

  const stamp = await openDashboard(page);

  // Belt-and-suspenders: re-assert the flag in the loaded HA page context (origin
  // guaranteed correct here). companionLayerActive is read lazily by applyForEditor at
  // editor-detection time — which is after this line — so this is in time.
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  const { dialog } = await openSeededCardCodeEditor(page, stamp);

  const scroller = dialog.locator(`${HA_CODE_EDITOR} ${CM_SCROLLER}`).first();

  // The companion injects on the editor SETTLE cycle (the sentinel re-attempts it on the
  // 60/180/420ms stable-hit probes, idempotently), riding the same cadence as the main
  // extension's style reapply. So WAIT for its node to appear rather than checking one
  // instant after open — the instant check is itself a race (RUN CHECKPOINT A's warm
  // in-suite run lost it). Mirrors the stale-resource expect.poll pattern in session.mjs.
  await expect
    .poll(
      () => scroller.evaluate(
        (el, styleId) => Boolean(el.getRootNode().querySelector && el.getRootNode().querySelector(`#${styleId}`)),
        COMPANION_CODEBOX_STYLE_ID,
      ),
      {
        timeout: 8000,
        message: `companion stylesheet #${COMPANION_CODEBOX_STYLE_ID} never appeared in the CodeMirror shadow root after editor settle`,
      },
    )
    .toBe(true);

  // --- Active + cascade proof, read from the live scroller in one pass:
  //  • the companion stylesheet node lives in THIS shadow root (the root where its
  //    .cm-* rules must sit to take effect) — proves the layer is active,
  //  • the computed scrollbar-color, and the cascaded --…-thumb var resolved to rgb
  //    via a throwaway probe (so an hsla() var and an rgba() scrollbar-color match). ---
  const probe = await scroller.evaluate((el, styleId) => {
    const root = el.getRootNode();
    const cs = getComputedStyle(el);
    const scrollbarColor = cs.scrollbarColor || cs.getPropertyValue('scrollbar-color');
    const thumbVarRaw = cs.getPropertyValue('--nostrodomus-codebox-scrollbar-thumb').trim();
    let resolvedThumb = '';
    if (thumbVarRaw) {
      const span = document.createElement('span');
      span.style.color = thumbVarRaw;
      el.appendChild(span);
      resolvedThumb = getComputedStyle(span).color;
      span.remove();
    }
    // Diagnostics so a failure pinpoints the broken link without a re-run: was the
    // force-active flag set, and what style nodes actually live in the CodeMirror root?
    let lsCompanion = null;
    try { lsCompanion = window.localStorage.getItem('nostrodomusCompanion'); } catch { lsCompanion = 'ERR'; }
    const rootStyleIds = Array.from((root.querySelectorAll && root.querySelectorAll('style')) || []).map((s) => s.id || '(no-id)');
    return {
      hasCompanionNode: Boolean(root.querySelector && root.querySelector(`#${styleId}`)),
      scrollbarColor,
      thumbVarRaw,
      resolvedThumb,
      lsCompanion,
      rootStyleIds,
    };
  }, COMPANION_CODEBOX_STYLE_ID);

  await testInfo.attach('scrollbar-parity.json', {
    body: JSON.stringify(probe, null, 2),
    contentType: 'application/json',
  });

  // Decisive activation diagnostic (RUN CHECKPOINT A decision tree): is the force-active
  // flag landing, is a real external companion registered in the coordinator (which
  // would CORRECTLY keep the layer dormant by coexistence design — Checkpoint E
  // scenario, not force-activatable), and what does the diagnostics row read? Logged
  // so the terminal shows it whether the test passes or fails.
  const diag = await page.evaluate(() => {
    const out = {};
    try { out.flag = window.localStorage.getItem('nostrodomusCompanion'); } catch (e) { out.flag = `ERR:${e.message}`; }
    try {
      const rts = window.__nostrodomusRuntimeCoordinatorV1?.snapshot?.()?.runtimes;
      out.coordinatorRuntimes = Array.isArray(rts) ? rts.map((r) => ({ id: r?.id, role: r?.role })) : null;
    } catch (e) { out.coordinatorRuntimes = `ERR:${e.message}`; }
    try { out.companionLayer = window.__nostrodomus?.exportDiagnostics?.()?.companionLayer ?? null; } catch (e) { out.companionLayer = `ERR:${e.message}`; }
    return out;
  });
  console.log('[companion-diag]', JSON.stringify({ ...diag, hasCompanionNode: probe.hasCompanionNode, rootStyleIds: probe.rootStyleIds }));
  await testInfo.attach('companion-diag.json', { body: JSON.stringify(diag, null, 2), contentType: 'application/json' });

  // (1) the companion layer is active and injecting its own stylesheet into the
  //     CodeMirror shadow root (where .cm-scroller lives).
  expect(
    probe.hasCompanionNode,
    `companion stylesheet #${COMPANION_CODEBOX_STYLE_ID} not found in the CodeMirror shadow root — the absorbed layer is not active (or injected into the wrong root). ` +
      `force-active flag (localStorage nostrodomusCompanion)=${JSON.stringify(probe.lsCompanion)}; ` +
      `style nodes present in this root=[${probe.rootStyleIds.join(', ')}]`,
  ).toBe(true);

  // (2) the scroller's scrollbar-color is set (not the host default 'auto') and its
  //     thumb RESOLVES TO the cascaded --nostrodomus-codebox-scrollbar-thumb — i.e. the
  //     companion CSS defers to the shared var (D-THEME-BOUNDARY); it does not hardcode.
  expect(probe.scrollbarColor, 'scroller scrollbar-color is unset/auto — companion scrollbar rule not applied').toMatch(/rgba?\(/);
  expect(probe.thumbVarRaw, '--nostrodomus-codebox-scrollbar-thumb is not defined on the scroller').not.toBe('');
  const scrollbarThumbTriplet = rgbTriplet(probe.scrollbarColor);
  const varThumbTriplet = rgbTriplet(probe.resolvedThumb);
  expect(scrollbarThumbTriplet, `could not parse a thumb rgb triplet from scrollbar-color "${probe.scrollbarColor}"`).not.toBeNull();
  expect(
    scrollbarThumbTriplet,
    `scrollbar-color thumb (${scrollbarThumbTriplet}) does not resolve to the cascaded --nostrodomus-codebox-scrollbar-thumb (${varThumbTriplet})`,
  ).toBe(varThumbTriplet);

  // --- (3) ABSORB P3 enlarge layer (RUN CHECKPOINT B): the companion writes INLINE
  // heights to the ha-code-editor WRAPPER (host) + .cm-editor + .cm-scroller. The wrapper
  // height landing on the HOST (not on the .cm-editor we were handed) is the Checkpoint B
  // wrapper-target fix. Poll for it (settle cadence), then assert the inline values are
  // the enlarge module's set — SIMPLE (taller) or tabbed. ---
  const codeEditorHost = dialog.locator(HA_CODE_EDITOR).first();
  await expect
    .poll(() => codeEditorHost.evaluate((el) => (el.style && el.style.height ? el.style.height : '').trim()), {
      timeout: 8000,
      message: 'ha-code-editor wrapper never received an inline height from the enlarge layer (Checkpoint B wrapper-target fix)',
    })
    .not.toBe('');
  const enlarge = await codeEditorHost.evaluate((el) => {
    const root = el.shadowRoot;
    const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
    return {
      wrapper: norm(el.style && el.style.height),
      cm: norm(root && root.querySelector('.cm-editor') && root.querySelector('.cm-editor').style.height),
      scroller: norm(root && root.querySelector('.cm-scroller') && root.querySelector('.cm-scroller').style.height),
    };
  });
  await testInfo.attach('enlarge-heights.json', { body: JSON.stringify(enlarge, null, 2), contentType: 'application/json' });
  console.log('[enlarge-diag]', JSON.stringify(enlarge));
  expect(isEnlargeHeight(enlarge.wrapper, ENLARGE_WRAPPER_HEIGHTS), `ha-code-editor wrapper inline height "${enlarge.wrapper}" is not an enlarge-layer value`).toBe(true);
  expect(isEnlargeHeight(enlarge.cm, ENLARGE_CM_HEIGHTS), `.cm-editor inline height "${enlarge.cm}" is not an enlarge-layer value`).toBe(true);
  expect(isEnlargeHeight(enlarge.scroller, ENLARGE_SCROLLER_HEIGHTS), `.cm-scroller inline height "${enlarge.scroller}" is not an enlarge-layer value`).toBe(true);

  // --- No-flash assertion: opacity of the preview reaches 1 and never bounces
  // back down. Sample rapidly for ~1.2s after open. ---
  const preview = dialog.locator('.element-preview').first();
  const opacitySamples = [];
  for (let i = 0; i < 24; i += 1) {
    const op = await preview.evaluate((el) => Number(getComputedStyle(el).opacity)).catch(() => null);
    if (op != null) opacitySamples.push(op);
    await page.waitForTimeout(50);
  }
  await testInfo.attach('preview-opacity-samples.json', {
    body: JSON.stringify(opacitySamples, null, 2),
    contentType: 'application/json',
  });
  // Once opacity reaches 1 it must stay there (no visible->hidden->visible bounce).
  const firstFull = opacitySamples.findIndex((v) => v >= 0.99);
  expect(firstFull, 'preview opacity never reached 1 (mask never revealed)').toBeGreaterThanOrEqual(0);
  const afterFull = opacitySamples.slice(firstFull);
  expect(Math.min(...afterFull), `preview flashed back down after reveal: [${opacitySamples.join(', ')}]`).toBeGreaterThanOrEqual(0.99);

  // --- scrollHeight stability over 3s idle (editor-styling.spec pattern). ---
  const samples = [];
  for (let i = 0; i < 7; i += 1) {
    samples.push(await scroller.evaluate((el) => el.scrollHeight));
    if (i < 6) await page.waitForTimeout(500);
  }
  expect(new Set(samples).size, `scrollHeight moved during 3s idle: [${samples.join(', ')}]`).toBe(1);

  // --- Diagnostics: companion layer reports internal. ---
  // CONTRACT (P1 detection hook): exportDiagnostics().companionLayer is one of
  // 'internal' | 'external' | 'dormant(forced)'. With the absorbed layer active
  // and no external files, it reads 'internal'.
  const companionLayer = await page.evaluate(() => {
    const api = window.__nostrodomus;
    const diag = api?.exportDiagnostics?.();
    return diag?.companionLayer ?? null;
  });
  expect(companionLayer, 'diagnostics companion-layer row is not "internal"').toBe('internal');
});
