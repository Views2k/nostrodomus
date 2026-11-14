// panel-editor.spec — e2e coverage of the non-card-dialog panel editors
// (`/config/script/edit`, `/config/automation/edit`), a surface class the card-dialog-only
// suite does not reach. Assertions are runtime console probes promoted to executable specs:
// [px] geometry, [clip] corner-clearance, [frame] frame layers, and the white-token cascade.
//
// Each test names the version it guards against (see the map at the bottom).
//
// Nostrodomus loads on the bare panel (banner present), but a panel editor reached by a HARD
// page.goto is not styled: the detection ladder arms on an SPA route change (`location-changed`),
// and a hard page load does not fire that event. openPanelYamlEditor therefore SPA-navigates
// (pushState + location-changed, replicating HA's navigate()). The editor is tagged frame-host=1
// after the in-app navigation and before any click, so the geometry + corner specs assert at
// waitForStyled with NO click. The "styled at mount" test covers the v0.1.157 sync-on-mount
// detection: the sentinel observes the panel editor wrappers and fires CM-gated detection
// synchronously from the observer (a pre-paint microtask), so frame-host is set before first paint
// and the mount→styled gap collapses to ~0. The token white-out spec is test.fixme(): its bug is
// closed (v0.1.155), but Ctrl+Space in the harness does not reproduce the kind-class drop, so the
// spec cannot fail on a build that has the bug (see its FIXME note).

import { test, expect, openDashboard, readStamp } from './session.mjs';
import { HA_CODE_EDITOR, CM_CONTENT, CM_SCROLLER } from './selectors.mjs';

const PANELS = [
  { kind: 'script', pathKey: 'scriptEditPath', host: 'ha-script-editor' },
  { kind: 'automation', pathKey: 'automationEditPath', host: 'ha-automation-editor' },
];

/**
 * Open a panel editor in YAML mode. Nostrodomus loads as a Lovelace MODULE resource, so it is only
 * active for the frontend session AFTER a dashboard has loaded it — visit the seeded dashboard
 * first (which also runs the stale-resource guard), THEN navigate to the panel. The panel opens
 * in the VISUAL editor; 2026.6 exposes the full YAML CodeMirror editor via the toolbar overflow
 * menu (a `wa-dropdown`) → "Edit in YAML". Returns the panel's ha-code-editor locator.
 */
async function openPanelYamlEditor(page, editPath) {
  await openDashboard(page); // loads + guards the Nostrodomus resource for the session (the app root)
  // SPA-navigate to the panel — NOT page.goto. A hard page load does NOT fire HA's `location-changed`
  // event, so Nostrodomus's detection ladder never arms and the editor is never styled. (On a real
  // SPA-navigated panel ha-code-editor is tagged frame-host=1 BEFORE any click; the SPA route-change
  // event is the trigger, not the click.) Replicate HA's navigate():
  // pushState + the `location-changed` event both the router AND Nostrodomus's sentinel listen for.
  await page.evaluate((path) => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }, editPath);
  // wait for the panel host to render from the SPA route change before driving its toolbar
  await page.locator('ha-script-editor, ha-automation-editor').first().waitFor({ state: 'attached', timeout: 20000 });

  const yamlItem = page.getByRole('menuitem', { name: /edit in yaml/i });
  if ((await yamlItem.count()) === 0) {
    // Open the toolbar overflow menu first. 2026.6 uses a wa-dropdown trigger; try the known
    // shapes, newest-first, then an accessible-name fallback.
    const triggerCandidates = [
      page.locator('[id^="wa-dropdown-trigger"]'),
      page.locator('ha-icon-button[label*="menu" i]'),
      page.getByRole('button', { name: /more|overflow|menu/i }),
    ];
    // The panel HOST attaches (waited above) before its toolbar overflow trigger renders, so a
    // one-shot count() can race ahead of the button and find nothing — an intermittent "trigger
    // not found". Wait for a candidate to actually exist before clicking; this also keeps the
    // failure below meaningful (trigger genuinely never rendered vs. checked-too-early).
    await expect
      .poll(
        async () => {
          for (const candidate of triggerCandidates) {
            if ((await candidate.count()) > 0) return true;
          }
          return false;
        },
        {
          timeout: 15000,
          message: `panel overflow menu trigger never rendered at ${editPath} — the 2026.6 wa-dropdown selector needs updating in openPanelYamlEditor (tried [id^="wa-dropdown-trigger"], ha-icon-button[label*="menu"], button[name~=more/overflow/menu]).`,
        },
      )
      .toBe(true);
    let opened = false;
    for (const candidate of triggerCandidates) {
      if ((await candidate.count()) > 0) {
        await candidate.first().click();
        opened = true;
        break;
      }
    }
    if (!opened) {
      throw new Error(
        `panel overflow menu trigger not found at ${editPath} — the 2026.6 wa-dropdown selector needs updating in openPanelYamlEditor (tried [id^="wa-dropdown-trigger"], ha-icon-button[label*="menu"], button[name~=more/overflow/menu]).`,
      );
    }
  }
  try {
    await yamlItem.first().click({ timeout: 10000 });
  } catch (error) {
    throw new Error(
      `"Edit in YAML" menu item not found/clickable at ${editPath} after opening the overflow menu — selector/label needs updating for 2026.6.`,
      { cause: error },
    );
  }

  const editor = page.locator(HA_CODE_EDITOR).first();
  await editor.waitFor({ state: 'attached', timeout: 30000 });
  await page.locator(`${HA_CODE_EDITOR} ${CM_CONTENT}`).first().waitFor({ state: 'visible', timeout: 15000 });
  return editor;
}

/** Wait until Nostrodomus has styled the host (the frame-host tag is the styling signal). */
async function waitForStyled(editor) {
  await expect
    .poll(() => editor.evaluate((el) => el.getAttribute('data-nostrodomus-codebox-frame-host') === '1'), {
      timeout: 15000,
      message: 'panel ha-code-editor was never tagged data-nostrodomus-codebox-frame-host="1" (Nostrodomus never styled this panel editor)',
    })
    .toBe(true);
}

/**
 * Focus the editor so keyboard input lands in it. This is NOT the styling trigger — the SPA route
 * change in openPanelYamlEditor arms Nostrodomus's detection ladder, which styles the editor without any
 * click (frame-host=1 BEFORE any click). The token spec calls this AFTER
 * waitForStyled, purely to focus the CodeMirror content for its Ctrl+End / Ctrl+Space keystrokes.
 */
async function clickIntoEditor(page) {
  await page.locator(`${HA_CODE_EDITOR} ${CM_CONTENT}`).first().click();
}

/**
 * Assert an inline calc() property tolerantly. The CSSOM normalizes calc() term order when it
 * serializes a style attribute: `calc(100vh - 160px)` comes back as `calc(-160px + 100vh)` (px sorts
 * before vh). A leading percentage happens to keep its place (`calc(100% - 112px)` stays), but that is
 * incidental — do NOT rely on substring order. So match "the prop IS a calc() and contains every
 * expected term", order-independent, instead of an exact string that a future browser could reorder.
 * `inline` = the element's literal style attribute; `prop` = the CSS property; `terms` = the calc terms.
 */
function expectCalc(inline, prop, terms, label) {
  const match = new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+)`).exec(inline);
  expect(match, `${label}: ${prop} missing from inline style (got: ${inline})`).not.toBeNull();
  const value = match[1].trim();
  expect(value, `${label}: ${prop} is not a calc() (got: "${value}")`).toContain('calc(');
  for (const term of terms) {
    expect(value, `${label}: ${prop} calc() missing term "${term}" (got: "${value}")`).toContain(term);
  }
}

for (const panel of PANELS) {
  test.describe(`panel editor: ${panel.kind} (/config/${panel.kind}/edit, YAML mode)`, () => {
    // GUARD FOR: v0.1.141–142 (universal reach + the 54vw squish). On a pre-universal build the
    // panel editor is the card-dialog geometry (or unstyled) — inPanel/SURFACE asserts go red.
    test('SURFACE is a panel (not a card dialog) and the panel frame geometry is applied', async ({ page }, testInfo) => {
      const stamp = readStamp();
      const editPath = stamp[panel.pathKey];
      expect(editPath, `${panel.pathKey} missing from resource-stamp.json — re-run \`npm run e2e:up\` after this seed change`).toBeTruthy();
      const editor = await openPanelYamlEditor(page, editPath);
      await waitForStyled(editor); // SPA nav (in openPanelYamlEditor) arms the detection ladder → styled without any click

      const geo = await editor.evaluate((hce) => {
        const up = (node, sel) => {
          let x = node;
          while (x) {
            try { if (x.matches && x.matches(sel)) return x; } catch { /* detached */ }
            x = x.parentElement || (x.getRootNode && x.getRootNode().host);
          }
          return null;
        };
        const cs = getComputedStyle(hce);
        const inline = hce.getAttribute('style') || '';
        const parent = hce.parentElement || (hce.getRootNode && hce.getRootNode().host);
        const r = hce.getBoundingClientRect();
        const pr = parent && parent.getBoundingClientRect ? parent.getBoundingClientRect() : null;
        return {
          inDialog: !!up(hce, 'hui-dialog-edit-card'),
          inPanel: !!up(hce, 'ha-automation-editor, ha-script-editor, hui-editor, developer-tools-template'),
          inline,
          display: cs.display,
          insetRight: pr ? Math.round(pr.right - r.right) : null,
          insetLeft: pr ? Math.round(r.left - pr.left) : null,
        };
      });
      await testInfo.attach('panel-geometry.json', { body: JSON.stringify(geo, null, 2), contentType: 'application/json' });

      // SURFACE = panel.
      expect(geo.inDialog, 'panel editor unexpectedly has a hui-dialog-edit-card ancestor').toBe(false);
      expect(geo.inPanel, 'panel editor is not inside a recognized panel host').toBe(true);

      // Panel frame geometry — codeboxEnlargeRuntime's inline panel sizing (v0.1.148/149/150). The
      // runtime writes these as literal calc()/px inline, so assert the inline string (computed style
      // would be resolved to px). calc() props are matched order-tolerantly (expectCalc) because the
      // CSSOM normalizes calc term order on serialization (e.g. calc(100vh - 160px) → calc(-160px + 100vh)).
      expectCalc(geo.inline, 'max-width', ['100%', '112px'], 'panel max-width inset');
      expect(geo.inline, 'panel left margin (56px) missing').toContain('margin-left: 56px');
      expect(geo.inline, 'panel right margin (56px) missing').toContain('margin-right: 56px');
      expect(geo.inline, 'panel top margin (52px) missing').toContain('margin-top: 52px');
      expectCalc(geo.inline, 'max-height', ['100vh', '160px'], 'panel max-height cap');

      // Glow room: the host is inset from its container on both sides (so the ::before halo has room).
      expect(geo.insetRight, `no right-side glow room (insetRight=${geo.insetRight})`).toBeGreaterThan(20);
      expect(geo.insetLeft, `no left-side glow room (insetLeft=${geo.insetLeft})`).toBeGreaterThan(20);
    });

    // GUARD FOR: v0.1.149 (bottom-corner clip) + v0.1.150 (scrollbar right-gap). On v0.1.148 the
    // scroller has no inner padding / right gap → the assertions below go red.
    test('bottom-corner clearance: scroller carries the card-editor padding + 18px right gap', async ({ page }, testInfo) => {
      const stamp = readStamp();
      const editor = await openPanelYamlEditor(page, stamp[panel.pathKey]);
      await waitForStyled(editor); // SPA nav (in openPanelYamlEditor) arms the detection ladder → styled without any click

      const clip = await editor.evaluate((hce, sel) => {
        const root = hce.shadowRoot || hce.getRootNode();
        const scroller = root && root.querySelector ? root.querySelector(sel) : null;
        const be = getComputedStyle(hce, '::before');
        return {
          scrollerInline: scroller ? scroller.getAttribute('style') || '' : '(no scroller)',
          frameRadius: be.borderTopRightRadius,
          scrollH: scroller ? scroller.scrollHeight : 0,
          clientH: scroller ? scroller.clientHeight : 0,
        };
      }, CM_SCROLLER);
      await testInfo.attach('panel-clip.json', { body: JSON.stringify(clip, null, 2), contentType: 'application/json' });

      // The seeded script/automation is long enough to actually scroll (so clip matters).
      expect(clip.scrollH, 'seeded content did not overflow — the long script/automation seed is too short to test scroll/clip').toBeGreaterThan(clip.clientH);
      // Inner clearance from the 22px rounded corners (v0.1.149) + scrollbar right gap (v0.1.150).
      expect(clip.scrollerInline, 'scroller corner-clearance padding (16px 18px 30px 14px) missing').toContain('padding: 16px 18px 30px 14px');
      expectCalc(clip.scrollerInline, 'max-width', ['100%', '18px'], 'scroller right-gap max-width');
    });

    // FIXME: guards the white-token regression fixed by the v0.1.155 yaml-token-color floor. Ctrl+Space
    // in the harness does not reproduce the kind-class drop the bug needs, so this passes with and
    // without the fix. To finish: provoke the real class-dropping re-render in the harness, then
    // promote back to `test()`. The assertion itself is sound (it samples the RENDERED
    // -webkit-text-fill-color against the live base fg).
    test.fixme('syntax tokens stay colored (not base-white) through a Ctrl+Space re-render', async ({ page }, testInfo) => {
      const stamp = readStamp();
      const editor = await openPanelYamlEditor(page, stamp[panel.pathKey]);
      await waitForStyled(editor); // SPA nav (in openPanelYamlEditor) arms the detection ladder → styled without any click
      await clickIntoEditor(page); // NOT the styling trigger — only to focus the editor for the keystrokes below

      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.press('ControlOrMeta+Space'); // the re-render that dropped the kind class
      await page.waitForTimeout(700);

      const sample = await editor.evaluate((hce) => {
        const root = hce.shadowRoot || hce.getRootNode();
        const container = root && root.querySelector ? root.querySelector('.cm-content') : null;
        // The editor's base foreground = the .cm-content fill (Nostrodomus sets -webkit-text-fill-color: <fg>
        // here, and it INHERITS onto un-floored token spans). A token whose RENDERED fill equals this has
        // lost its syntax color — the white-out — whatever the exact value, so we compare dynamically
        // rather than trusting one hard-coded number.
        const baseFill = container ? getComputedStyle(container).getPropertyValue('-webkit-text-fill-color') : '';
        const spans = root && root.querySelectorAll
          ? Array.from(root.querySelectorAll('.cm-content .cm-line span.yaml-string, .cm-content .cm-line span.yaml-number')).slice(0, 25)
          : [];
        const tokens = spans.map((s) => {
          const cs = getComputedStyle(s);
          return {
            text: (s.textContent || '').slice(0, 16),
            cls: s.className,
            color: cs.color,
            // The RENDERED fill is what the user actually sees: -webkit-text-fill-color OVERRIDES `color`,
            // and getComputedStyle resolves its `currentcolor` default back to the `color` value when no
            // fill rule applies — so this single read is the effective on-screen color.
            fill: cs.getPropertyValue('-webkit-text-fill-color') || cs.color,
          };
        });
        return { baseFill, tokens };
      });
      const { baseFill, tokens } = sample;
      await testInfo.attach('panel-tokens.json', { body: JSON.stringify(sample, null, 2), contentType: 'application/json' });

      // The white-out = a yaml-string/yaml-number span losing its semantic color and falling back to a flat
      // base color. The bug lives in -webkit-text-fill-color (it OVERRIDES `color`), so we assert on the
      // RENDERED FILL — NOT `color`. Sampling `color` does not show the bug: the CM-native class keeps
      // `color` a syntax color while the inherited fill is white. A token is white-bugged if its fill
      // equals (a) the editor's base foreground `baseFill` read above — i.e. it fell to the container fill
      // that inherits onto un-floored spans (sourceClassCssBuilder.js), or (b) HA's generic editor text
      // rgba(255, 255, 255, 0.67) (in case HA overrides the span fill
      // directly and bypasses inheritance). The v0.1.155 floor sets the fill to the string/number/kind color
      // (never the base fg) → green; pre-floor (≤ v0.1.154) the fill inherits the base fg → red.
      const HA_GENERIC_WHITE = 'rgba(255, 255, 255, 0.67)';
      expect(tokens.length, 'no yaml-string/yaml-number tokens found to check (seed/selectors?)').toBeGreaterThan(0);
      expect(baseFill, 'could not read the editor base foreground fill (.cm-content not found?)').toBeTruthy();
      const whited = tokens.filter((t) => t.fill === baseFill || t.fill === HA_GENERIC_WHITE);
      expect(
        whited,
        `yaml-string/yaml-number tokens fell back to the base foreground fill (${baseFill}) / generic white after Ctrl+Space (the white-out): ${JSON.stringify(whited)} — full sample: ${JSON.stringify(sample)}`,
      ).toHaveLength(0);
    });

    // GUARD FOR: the open-flash / on-mount gap (v0.1.157 sync-on-mount detection). With polled detection
    // the editor was styled a few frames AFTER mount (tens of ms) — the visible flash.
    // The sentinel observes the panel editor wrappers (panel host → ha-yaml-editor shadow → ha-code-editor shadow)
    // and fires the same CM-gated detection synchronously from the observer (a pre-paint microtask) so
    // frame-host is set before first paint → the mount→styled gap collapses to ~0. This test measures that
    // gap and asserts it is within ~1 frame. Fails on v0.1.156 (polled ladder), passes on v0.1.157+.
    test('styled at mount: no unstyled-paint flash on panel open', async ({ page }, testInfo) => {
      const stamp = readStamp();
      // Record, before navigation, the gap between each ha-code-editor's mount and its first styled
      // frame. Polled detection => tens of ms; a same-frame sync fix => ~0.
      await page.addInitScript(() => {
        if (window.__nostrodomusFlashRec) return;
        const rec = { editors: [] };
        window.__nostrodomusFlashRec = rec;
        const styled = (hce) => {
          try { return hce.getAttribute && hce.getAttribute('data-nostrodomus-codebox-frame-host') === '1'; } catch { return false; }
        };
        const hostOf = (cm) => {
          let n = cm;
          while (n) { if (n.localName === 'ha-code-editor') return n; n = n.parentElement || (n.getRootNode && n.getRootNode().host); }
          return null;
        };
        const seen = new WeakSet();
        const scan = () => {
          const walk = (root, depth) => {
            if (!root || depth > 30) return;
            const list = root.querySelectorAll ? root.querySelectorAll('.cm-editor') : [];
            for (const cm of list) {
              if (seen.has(cm)) continue;
              seen.add(cm);
              const hce = hostOf(cm);
              const entry = { mountedAt: performance.now(), styledAt: null, host: hce };
              rec.editors.push(entry);
              const poll = () => {
                if (styled(hce)) { entry.styledAt = performance.now(); return; }
                if (performance.now() - entry.mountedAt < 8000) requestAnimationFrame(poll);
              };
              poll();
            }
            for (const el of root.querySelectorAll ? root.querySelectorAll('*') : []) if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
          };
          walk(document, 0);
          requestAnimationFrame(scan);
        };
        scan();
      });

      await openPanelYamlEditor(page, stamp[panel.pathKey]);
      await page.waitForTimeout(2500);
      const gaps = await page.evaluate(() =>
        (window.__nostrodomusFlashRec?.editors || [])
          .filter((e) => e.styledAt != null)
          .map((e) => Math.round(e.styledAt - e.mountedAt)),
      );
      await testInfo.attach('panel-flash-gaps.json', { body: JSON.stringify(gaps, null, 2), contentType: 'application/json' });
      expect(gaps.length, 'no editor styling ever observed for the flash measurement').toBeGreaterThan(0);
      // "Styled at mount" = the gap is within ~1 frame. On polled detection this is tens of ms → red.
      expect(Math.min(...gaps), `panel editor unstyled for ${Math.min(...gaps)}ms after mount (the open-flash)`).toBeLessThanOrEqual(16);
    });
  });
}

// NOTE: automation-lane completion (0.1.260, `actions: - action: … / data:` at the auto-indent
// column) is covered crash-safely by launch-gates G7 in the CARD dialog. It is NOT driven in the live
// automation panel here: HA's own automation editor (_yamlChanged) live-parses on every keystroke and
// throws `'trigger' in <string>` on transient partial YAML (16 pageerrors during typing), so typing a
// rebuilt automation into the real panel is not viable. The completion context is text/path-driven, so
// the card-dialog G7 exercises the same branchState `kind: 'action-block'` code path.

// Versions each test fails on:
//   SURFACE + frame geometry        → v0.1.140 and earlier (before the universal reach of v0.1.141–142)
//   bottom-corner clearance         → v0.1.148 (before v0.1.149 corner-clearance + v0.1.150 right-gap)
//   tokens not base-white           → test.fixme (fixed in v0.1.155; Ctrl+Space in the harness does not
//                                      reproduce the kind-class drop)
//   styled at mount                 → v0.1.156 (polled ladder = the open-flash); passes on v0.1.157+
//                                      (sync-on-mount detection from the panel-wrapper observers)
