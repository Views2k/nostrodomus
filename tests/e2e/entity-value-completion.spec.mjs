// entity-value-completion.spec — the 0.1.257 adapter/classifier "split-brain" fix: an entity-shaped
// VALUE completes to real entity ids even under an ARBITRARY/unknown key (and in an entities: list),
// a path that was owner-probe-only until now. Drives the real editor + real hass entities.
//
// CRASH-SAFETY (see launch-gates.spec): the card dialog live-renders its preview and HA throws on an
// undefined config.type, so we APPEND to the seeded card's valid `type: entities` config (type stays
// defined; the entities card ignores the extra key) rather than clearing to a typeless doc.
//
// Uses the seeded input_boolean.* entities (seed.mjs creates input_boolean.e2e_demo_one / _two), so the
// assertion is stable regardless of what else the instance exposes. Authored on-branch; RUN BY THE OWNER.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  popupRowTexts,
  typeInYaml,
} from './editor-helpers.mjs';

// The seeded helper domain — its entities (input_boolean.e2e_demo_one / _two) always exist on the
// e2e container, so an "entity ids appear" assertion is deterministic.
const SEEDED_ENTITY_RX = /\binput_boolean\.[a-z0-9_]+\b/;

test('entity-value: an entity-shaped value under an UNKNOWN key completes to real entity ids', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp); // cursor parked at end of the valid entities config

  // Append an unknown key carrying an entity-shaped value. `some_unknown_key` is not in any card
  // schema — the 0.1.257 fix is exactly that the entity VALUE lane fires here, driven by the value
  // shape, not the key. Type stays `entities` so the preview never crashes.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home'); // drop CM's copied indent -> write at column 0
  await typeInYaml(page, 'some_unknown_key: input_boolean.');
  await expectDialogAlive(page, 'after typing an entity-shaped value under an unknown key');
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, 'entity-value: unknown-key value + Ctrl+Space produced no completion popup');
  const rows = await popupRowTexts(page);
  expect(
    rows.some((t) => SEEDED_ENTITY_RX.test(t)),
    `entity-value: expected real input_boolean.* entity ids under the unknown key, got ${JSON.stringify(rows)}`,
  ).toBe(true);
});

test('entity-value: a late-alphabet entity is reachable past the 750 per-query cap (prefix-first sourcing)', async ({ page }) => {
  // 0.1.179: the seed creates 800 bulk_filler_* input_booleans + a late-alphabet input_boolean.zzz_marker.
  // A flat alphabetical top-750 would drop zzz_marker behind the fillers; the prefix-first fix reaches it
  // by filtering on the typed prefix BEFORE the cap. Requires the expanded seed (npm run e2e:up).
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await typeInYaml(page, 'some_unknown_key: input_boolean.zzz'); // the late-alphabet prefix
  await expectDialogAlive(page, 'after typing a late-alphabet entity prefix');
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, 'entity-value (cap): input_boolean.zzz + Ctrl+Space produced no completion popup');
  const rows = await popupRowTexts(page);
  expect(
    rows.some((t) => /\binput_boolean\.zzz_marker\b/.test(t)),
    `entity-value (cap): expected the late-alphabet input_boolean.zzz_marker (only reachable with prefix-first sourcing past the 750 cap), got ${JSON.stringify(rows)}`,
  ).toBe(true);
});

test('entity-value: a "- " item in an entities: list completes to real entity ids', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  // Append a fresh entities: block with a dash item whose value is an entity prefix. This is the
  // list-item half of the 0.1.257 fix (a typed value in an entities list). A second entities: key on
  // the card is harmless to the preview (type stays defined); the completion is text/path driven.
  for (const line of ['some_unknown_list:', '  - input_boolean.']) {
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Home');
    await typeInYaml(page, line);
  }
  await expectDialogAlive(page, 'after typing a dash-item entity value');
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, 'entity-value: entities-list dash item + Ctrl+Space produced no completion popup');
  const rows = await popupRowTexts(page);
  expect(
    rows.some((t) => SEEDED_ENTITY_RX.test(t)),
    `entity-value: expected real input_boolean.* entity ids in the list item, got ${JSON.stringify(rows)}`,
  ).toBe(true);
});
