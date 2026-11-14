// devtools-template-jinja.spec — the 0.1.178 Jinja lane: inside states('…') in Developer Tools > Template,
// completion offers live entity ids (and does not list helper function names as entities). Owner-validated
// live only until now.
//
// This lane is OPT-IN and stacked: it requires completions.engineV2 AND completions.jinjaLane (both
// default-OFF), and the runtime must resolve the surface as 'devtools-template' (src/yaml/
// runtimeContextRuntime.js:76 + runtimeContextAdapter.js:424). We enable both flags before boot via the
// deep-merged nostrodomus.settings key, then SPA-navigate to the panel.
//
// HIGHEST-RISK spec of the backfill: it depends on the surface classifier + the Dev Tools panel DOM +
// the jinja arg detector all lining up. It self-diagnoses (the completion-gate diagnosis dumps the
// resolved context) so a first-run miss names its own cause. Authored on-branch; owner-run.

import { test, expect, openDashboard } from './session.mjs';
import { expectPopupWithSuggestions, popupRowTexts, typeInYaml } from './editor-helpers.mjs';
import { HA_CODE_EDITOR, CM_CONTENT } from './selectors.mjs';

// Enable engineV2 + jinjaLane before the runtime boots (loadSettings deep-merges this onto defaults).
function enableJinjaLane() {
  try {
    if (window.location.origin === 'http://localhost:8124') {
      window.localStorage.setItem(
        'nostrodomus.settings',
        JSON.stringify({ completions: { engineV2: true, jinjaLane: true } }),
      );
    }
  } catch { /* opaque origin */ }
}

test("devtools jinja: states('…') completes live entity ids in the Dev Tools Template editor", async ({ page }) => {
  await page.addInitScript(enableJinjaLane);
  await openDashboard(page); // boots the runtime with the jinja flags pre-seeded; guards the resource

  // SPA-navigate to Developer Tools > Template (pushState + location-changed, like the panel editors).
  await page.evaluate(() => {
    window.history.pushState(null, '', '/developer-tools/template');
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  });

  // The template INPUT editor (a jinja ha-code-editor). Wait for it, then drive it.
  const editor = page.locator(`${HA_CODE_EDITOR} ${CM_CONTENT}`).first();
  await editor.waitFor({ state: 'visible', timeout: 20000 });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await typeInYaml(page, "{{ states('");
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, "devtools jinja: states(' + Ctrl+Space produced no completion popup (jinja lane not engaged?)");
  const rows = await popupRowTexts(page);
  const labels = rows.map((t) => { const p = t.split('\n').map((s) => s.trim()).filter(Boolean); return p.length >= 2 ? p[1] : p[0] || ''; });

  // Live entity ids appear inside the states() argument — real domain.object_id rows (no prefix was
  // typed, so the popup shows the top entities of whatever the instance exposes; assert the SHAPE, not a
  // specific domain, since the seeded input_boolean.* may sit past the visible window).
  const entityRows = labels.filter((l) => /^[a-z_]+\.[a-z0-9_]+$/.test(l));
  expect(
    entityRows.length,
    `devtools jinja: expected real entity ids inside states('), got ${JSON.stringify(labels)}`,
  ).toBeGreaterThan(0);

  // Helper function names must not be offered AS entity rows (0.1.178 filtering).
  expect(
    labels.some((l) => l === 'states' || l === 'state_attr' || l === 'is_state'),
    `devtools jinja: helper function names leaked into the entity rows: ${JSON.stringify(labels)}`,
  ).toBe(false);
});
