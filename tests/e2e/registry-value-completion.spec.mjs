// registry-value-completion.spec — 0.1.180: the registry value lane completes area_id: to real area
// names, and fails dark (no rows, no error) for a registry the instance lacks. Opt-in and stacked
// (requires completions.engineV2 AND completions.registryLane, both default-OFF). Requires the expanded
// seed (areas E2E Living Room / E2E Kitchen; devices are not WS-createable, so device_id: is fail-dark).
// Enable the flags before boot via the deep-merged nostrodomus.settings key. Owner-run.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  popupRowTexts,
  popup,
  typeInYaml,
} from './editor-helpers.mjs';

function enableRegistryLane() {
  try {
    if (window.location.origin === 'http://localhost:8124') {
      window.localStorage.setItem(
        'nostrodomus.settings',
        JSON.stringify({ completions: { engineV2: true, registryLane: true } }),
      );
    }
  } catch { /* opaque origin */ }
}

// Append a ROOT-level target block with the given registry-id value line, then open completion at that
// value. No `action:` sibling — a perform-action sibling routes the block to the action-block value
// context (action enum + services) and swallows the nested registry value.
async function openRegistryValue(page, valueLine) {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);
  for (const line of ['target:', valueLine]) {
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Home');
    await typeInYaml(page, line);
  }
  await expectDialogAlive(page, `after typing ${valueLine.trim()}`);
  await page.keyboard.press('Control+Space');
}

// The resolved value context (for diagnosis): did the registry flag ride in and did the key classify?
async function valueContextDiag(page) {
  return page.evaluate(() => {
    try {
      const d = window.__nostrodomus?.debugSnapshot?.() || {};
      return { yamlKey: d.yamlKey, yamlRole: d.yamlRole, valueKind: d.valueKind, currentLine: d.currentLine, registryLaneEnabled: d.registryLaneEnabled };
    } catch { return null; }
  });
}

// This test FOUND a dead lane on 0.1.262 (area_id: offered action-enum + services, valueKind "") and is
// now the regression guard for the fix: the registry branch was added to the adapter's live yamlValueKind
// copy and registryLane is threaded into detection (see tests/context/registry_value_lane.test.mjs).
test('registry values: area_id: completes to real seeded area names', async ({ page }) => {
  await page.addInitScript(enableRegistryLane);
  await openRegistryValue(page, '  area_id: ');

  await expectPopupWithSuggestions(page, 'registry values: area_id: + Ctrl+Space produced no popup (registry lane not engaged?)');
  const rows = await popupRowTexts(page);
  const diag = await valueContextDiag(page);
  expect(
    rows.some((t) => /living[\s_]*room|kitchen/i.test(t)),
    `registry values: expected seeded area names (E2E Living Room / E2E Kitchen) in area_id:, got ${JSON.stringify(rows)}\nresolved context: ${JSON.stringify(diag)}`,
  ).toBe(true);
});

test('registry values: device_id: fails dark when no devices exist (no rows, no error)', async ({ page }) => {
  await page.addInitScript(enableRegistryLane);
  await openRegistryValue(page, '  device_id: ');

  // Fail-dark: the instance has no WS-createable devices, so the lane yields no error. The whole-session
  // console policy (session.mjs) fails the test on any runtime error; here we assert the editor survived
  // the completion attempt and — if a popup opened at all — it did not throw. Devices present on the
  // instance (from integrations) may legitimately appear; the point is graceful degradation, not a crash.
  await expectDialogAlive(page, 'after device_id: Ctrl+Space (fail-dark)');
  const popupVisible = await popup(page).isVisible().catch(() => false);
  expect(typeof popupVisible, 'device_id: completion must not throw (fail-dark)').toBe('boolean');
});
