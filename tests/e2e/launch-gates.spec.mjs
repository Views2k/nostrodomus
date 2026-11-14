// launch-gates.spec — release gates for completion at the auto-indent column (after an opener
// and Enter, including the empty-scalar sibling), the target lane, the embedded-vs-main enlarge
// scope, and the warning badge. Each gate is keyboard-driven Playwright.
//
// METHOD (realistic-position testing): every completion gate drives the REAL CodeMirror
// with real keys — keyboard.type + keyboard.press('Enter'), ACCEPTING CM6's own auto-indent at
// the tested opener->newline. It never uses setValue and never pre-types the indent of the line
// where the popup is tested. CM6's editor here auto-indents to the PREVIOUS line's own column
// (it copies the leading whitespace, it does not deepen) — which is the position these gates test.
// SETUP lines are typed at their absolute indent, with the copied auto-indent neutralized
// (Shift+Home + overwrite), so the parent structure is deterministic; only the TESTED position is
// left as the raw auto-indent CM6 produces.
//
// CRASH-SAFETY: a card edit dialog live-renders its preview on
// every edit and throws inside HA's own frontend when config.type is undefined/null. So the
// completion gates NEVER clear the editor to a typeless state — they APPEND a root-level block to
// the seeded card's valid `type: entities` config (type stays defined throughout, no HA crash),
// and G5 replaces only the type VALUE (keeping `type: ` so it is never undefined). The completion
// engine is text-driven, so an appended `tap_action:` block resolves the dashboard service-data /
// target lanes regardless of the card it rides on (serviceIdFromContext reads
// perform_action -> light.turn_on -> brightness_pct).
//
// `.spec.mjs` files are not walked by `npm test`; these run under `npm run e2e`.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  popupRowTexts,
  popup,
  typeInYaml,
} from './editor-helpers.mjs';
import {
  CM_CONTENT,
  HA_CODE_EDITOR,
  HUI_DIALOG_EDIT_CARD,
  HUI_MARKDOWN_CARD,
  NOSTRODOMUS_SETTINGS_BUTTON,
  NOSTRODOMUS_SETTINGS_PANEL,
} from './selectors.mjs';

// Badge style ids — MIRROR the exported constants in src/companion/scrollbarStyleRuntime.js
// (WARNING_BADGE_HOST_STYLE_ID / WARNING_BADGE_SHADOW_STYLE_ID). Hard-coded here (as the sibling
// companion-warning-toggle spec does with its ids) so the browser-side spec never imports src.
const WARNING_BADGE_HOST_STYLE_ID = 'nostrodomus-editor-warning-badge-host';
const WARNING_BADGE_SHADOW_STYLE_ID = 'nostrodomus-editor-warning-badge-shadow';
const BADGE_ACCENT_VAR = '--nostrodomus-badge-accent';
const HIDE_WARNINGS_TOGGLE = 'input[data-style-toggle="style.hideEditorWarnings"]';

// ---------------------------------------------------------------------------
// keystroke helpers
// ---------------------------------------------------------------------------

/**
 * APPEND a fresh block of lines below the editor's existing (valid) config. The cursor starts at
 * end of document. For each line a real Enter is pressed, CM6's copied auto-indent is selected
 * (Shift+Home) and overwritten by the line's literal text, so the appended structure is
 * deterministic. The LAST entry is the opener (e.g. `  data:`); the caller then presses Enter to
 * reach the tested auto-indent position. The existing `type: entities` config is left intact so
 * the live preview never sees an undefined type (no HA-frontend crash).
 */
async function appendBlock(page, lines) {
  for (const line of lines) {
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Home'); // select CM6's copied leading whitespace…
    await page.keyboard.type(line, { delay: 25 }); // …and overwrite it with the absolute line
  }
}

/** Read the current document text out of the focused CodeMirror (for failure diagnosis). */
async function docText(page) {
  try {
    return await page.locator(`${HA_CODE_EDITOR} ${CM_CONTENT}`).first().evaluate((el) => el.textContent || '');
  } catch {
    return '(could not read editor text)';
  }
}

/** The label of each popup row (rows render as "Key\n<label>\nKey" / "Sn\n<desc>\nSnippet"). */
function rowLabels(texts) {
  return texts.map((t) => {
    const parts = t.split('\n').map((s) => s.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[1] : parts[0] || '';
  });
}

/**
 * Assert the popup's KEY labels contain every `must` substring and that none of the `mustNot`
 * KEYS hijack the lane. A hijack means a completion KEY whose label is exactly `<key>:` — never a
 * snippet whose DESCRIPTION merely contains the word ("action: choose by
 * trigger id" is a snippet description, not the `choose:` key).
 */
function expectRows(texts, { must = [], mustNot = [] }, label) {
  const labels = rowLabels(texts);
  for (const needle of must) {
    expect(labels.some((l) => l.includes(needle)), `${label}: expected "${needle}" among ${JSON.stringify(labels)}`).toBe(true);
  }
  for (const key of mustNot) {
    expect(labels.some((l) => l === `${key}:` || l === key), `${label}: key "${key}:" must not hijack the lane, labels ${JSON.stringify(labels)}`).toBe(false);
  }
}

// ---------------------------------------------------------------------------
// G1 — the auto-indent hole. data: -> Enter -> bri -> service fields, not action-step keys.
// ---------------------------------------------------------------------------
test('G1 (auto-indent): after data:+Enter, typing bri suggests brightness_pct, not wait_for_trigger', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp); // cursor parked at end of the valid entities config

  // Append a dashboard action block resolving light.turn_on; `data:` is a child of tap_action at
  // column 2. Typed at absolute indent; the tested position is the next (auto-indented) line.
  await appendBlock(page, ['tap_action:', '  action: perform-action', '  perform_action: light.turn_on', '  data:']);
  await page.keyboard.press('Enter'); // ACCEPT CM6's auto-indent — lands at data:'s own column (the auto-indent hole)
  await expectDialogAlive(page, 'after appending the data: block and pressing Enter');
  await typeInYaml(page, 'bri');
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, `G1: "data:" + Enter + "bri" produced no popup. doc:\n${await docText(page)}`);
  const texts = await popupRowTexts(page);
  expectRows(texts, { must: ['brightness_pct'], mustNot: ['wait_for_trigger', 'choose'] }, 'G1');
});

// ---------------------------------------------------------------------------
// G2 — scalar pop: an EMPTY scalar sibling (transition:) must not kill the data lane.
// ---------------------------------------------------------------------------
test('G2 (scalar-pop): an empty transition: sibling still leaves service fields for bri', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  // …/data:/transition: — transition left empty (col 4). Pressing Enter lands at transition:'s own
  // column; the user is adding a SIBLING field, not descending into a scalar. The context pops
  // the empty scalar (only block containers descend), so the data field lane must still serve.
  await appendBlock(page, ['tap_action:', '  action: perform-action', '  perform_action: light.turn_on', '  data:', '    transition:']);
  await page.keyboard.press('Enter'); // ACCEPT the auto-indent at the empty-scalar sibling position
  await expectDialogAlive(page, 'after the empty transition: sibling + Enter');
  await typeInYaml(page, 'bri');
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, `G2: empty transition: sibling killed the popup. doc:\n${await docText(page)}`);
  const texts = await popupRowTexts(page);
  expect(
    rowLabels(texts).some((l) => l.includes('brightness_pct') || l.includes('rgb_color')),
    `G2: expected a light.turn_on service field to survive the empty scalar, got ${JSON.stringify(rowLabels(texts))}`,
  ).toBe(true);
  expectRows(texts, { mustNot: ['wait_for_trigger', 'choose'] }, 'G2');
});

// ---------------------------------------------------------------------------
// G3 — target lane: target: -> Enter -> Ctrl+Space -> target keys, zero trigger keys.
// ---------------------------------------------------------------------------
test('G3 (target lane): target:+Enter+Ctrl+Space suggests entity_id/device_id/area_id, no trigger keys', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  await appendBlock(page, ['tap_action:', '  action: perform-action', '  target:']);
  await page.keyboard.press('Enter'); // ACCEPT the auto-indent at target:'s own column
  await expectDialogAlive(page, 'after appending the target: block and pressing Enter');
  await page.keyboard.press('Control+Space'); // no prefix — open on the blank target child line

  await expectPopupWithSuggestions(page, `G3: "target:" + Enter + Ctrl+Space produced no popup. doc:\n${await docText(page)}`);
  const texts = await popupRowTexts(page);
  expectRows(texts, { must: ['entity_id', 'device_id', 'area_id'], mustNot: ['wait_for_trigger', 'platform'] }, 'G3');
});

// ---------------------------------------------------------------------------
// G6 — dedupe (0.1.262) + ranking order (0.1.261 focused lane), in the data: block.
// The blank data: line, Ctrl+Space with NO prefix, shows the full service-field set — the place a
// duplicate row or a mis-ranked lane would show. (The scoring layer dedups/ranks on top of the raw
// provider pool, so this is only observable through the real popup, not offline.)
// ---------------------------------------------------------------------------
test('G6 (dedupe + ranking): service-data popup has no duplicate field rows and a service field leads the card keys', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  await appendBlock(page, ['tap_action:', '  action: perform-action', '  perform_action: light.turn_on', '  data:']);
  await page.keyboard.press('Enter'); // ACCEPT the auto-indent — cursor inside the data: block (the auto-indent column)
  await expectDialogAlive(page, 'after appending the data: block');
  await page.keyboard.press('Control+Space'); // NO prefix — the full light.turn_on service-field set

  await expectPopupWithSuggestions(page, `G6: data: block Ctrl+Space produced no popup. doc:\n${await docText(page)}`);
  const labels = rowLabels(await popupRowTexts(page));

  // The light-specific keys are not in the static data block, so each service
  // field appears at most once — no duplicate brightness_pct:/transition: rows.
  const count = (needle) => labels.filter((l) => l === needle).length;
  expect(count('brightness_pct:'), `G6: duplicate brightness_pct: rows (dedupe regressed): ${JSON.stringify(labels)}`).toBeLessThanOrEqual(1);
  expect(count('transition:'), `G6: duplicate transition: rows (dedupe regressed): ${JSON.stringify(labels)}`).toBeLessThanOrEqual(1);

  // a light.turn_on service field is actually offered here…
  const svcIdx = labels.findIndex((l) => l === 'brightness_pct:' || l === 'transition:');
  expect(svcIdx, `G6: no light.turn_on service field offered in the data: block: ${JSON.stringify(labels)}`).toBeGreaterThanOrEqual(0);

  // …and (0.1.261 focused lane) it ranks above any generic card key that appears (the lane owns
  // its block; a card key outranking a service field here is the ranking regression 0.1.261 fixed).
  const cardIdx = labels.findIndex((l) => ['type:', 'entity:', 'entities:', 'icon:', 'card_mod:'].includes(l));
  if (cardIdx >= 0) {
    expect(svcIdx, `G6: service field (idx ${svcIdx}) must rank above the generic card key at idx ${cardIdx}: ${JSON.stringify(labels)}`).toBeLessThan(cardIdx);
  }
});

// ---------------------------------------------------------------------------
// G7 — automation lane (0.1.260): the automation-shaped `actions: - action: … / data:` path resolves
// service fields at the CM auto-indent column, driven crash-safely in the CARD dialog. G1 covers the
// DASHBOARD tap_action path; this covers the AUTOMATION action-block path (branchState kind='action-block').
// The completion is text/path-driven, so this exercises the same code the standalone
// automation panel would — which can't be typed into directly (HA's _yamlChanged crashes on partial YAML).
// ---------------------------------------------------------------------------
test('G7 (automation lane): actions: -> action -> data:+Enter+bri suggests brightness_pct, no hijack', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  // Append an automation action block. `actions:` is an unknown key to the entities card (ignored; type
  // stays defined, no preview crash), but the text-driven engine resolves the automation action-step lane.
  await appendBlock(page, ['actions:', '  - action: light.turn_on', '    data:']);
  await page.keyboard.press('Enter'); // ACCEPT CM6's auto-indent at data:'s own column (the auto-indent position)
  await expectDialogAlive(page, 'after appending the automation action data block');
  await typeInYaml(page, 'bri');
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, `G7: automation actions data: + Enter + bri produced no popup. doc:\n${await docText(page)}`);
  const texts = await popupRowTexts(page);
  expectRows(texts, { must: ['brightness_pct'], mustNot: ['wait_for_trigger', 'choose'] }, 'G7');
});

// ---------------------------------------------------------------------------
// G4 — enlarge scope: an embedded (form-nested) code editor stays small; the main codebox enlarges.
// ---------------------------------------------------------------------------
test('G4 (enlarge scope): the embedded template editor stays small, the main codebox is larger', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  // Markdown card, VISUAL editor: its content template field is a ha-code-editor nested in
  // ha-selector-template / ha-form — the "embedded" case. It must NOT get the dialog-scale height.
  const { dialog } = await openSeededCardCodeEditor(page, stamp, {
    cardSelector: HUI_MARKDOWN_CARD,
    cardText: 'Nostrodomus E2E',
    visualOnly: true,
  });
  const embeddedEditor = dialog.locator(HA_CODE_EDITOR).first();
  await embeddedEditor.waitFor({ state: 'visible', timeout: 15000 });

  // Give the settle ladder a window to (wrongly) enlarge it, then measure the rendered height.
  await page.waitForTimeout(3000);
  const embeddedHeight = await embeddedEditor.evaluate((el) => Math.round(el.getBoundingClientRect().height));

  // Switch to the code editor: the dialog's MAIN codebox (ha-yaml-editor / not form-nested), which
  // IS enlarged to dialog scale.
  await dialog.getByRole('button', { name: /code editor/i }).first().click();
  const mainEditor = dialog.locator(HA_CODE_EDITOR).first();
  await dialog.locator(`${HA_CODE_EDITOR} ${CM_CONTENT}`).first().waitFor({ state: 'visible', timeout: 15000 });
  await expect
    .poll(() => mainEditor.evaluate((el) => el.getAttribute('data-nostrodomus-codebox-frame-host') === '1'), {
      timeout: 15000,
      message: 'G4: the main codebox was never styled by Nostrodomus (frame-host tag absent) — cannot measure the enlarge',
    })
    .toBe(true);
  const mainHeight = await mainEditor.evaluate((el) => Math.round(el.getBoundingClientRect().height));

  const measured = { embeddedHeight, mainHeight, vh: await page.evaluate(() => window.innerHeight) };
  await testInfo.attach('g4-heights.json', { body: JSON.stringify(measured, null, 2), contentType: 'application/json' });

  // The discriminator (not exact px): the embedded editor is left near its natural size…
  expect(embeddedHeight, `G4: embedded template editor height ${embeddedHeight}px was force-sized to dialog scale (the embedded/main discriminator broke): ${JSON.stringify(measured)}`).toBeLessThan(400);
  // …while the main codebox is enlarged well past it.
  expect(mainHeight, `G4: main codebox height ${mainHeight}px is not larger than the embedded ${embeddedHeight}px: ${JSON.stringify(measured)}`).toBeGreaterThan(embeddedHeight);
});

// ---------------------------------------------------------------------------
// G5 — warning badge: a dialog with a real ha-alert gets the badge sheets + accent var.
// ---------------------------------------------------------------------------

// Deep-search a dialog's composed shadow tree for a style node by id (the badge sheets live in a
// NESTED editor shadow root). Mirrors the sibling companion-warning-toggle spec's walker.
function countStyleNodeById(dialogHandle, id) {
  return dialogHandle.evaluate((dialog, styleId) => {
    let found = 0;
    const seen = new Set();
    const walk = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      try { if (root.querySelector(`#${styleId}`)) found += 1; } catch { /* closed */ }
      let all = [];
      try { all = Array.from(root.querySelectorAll('*')); } catch { all = []; }
      for (const el of all) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(dialog.shadowRoot);
    return found;
  }, id);
}

// Deep-walk the dialog for an ha-alert and report presence + the inline badge-accent var on it.
function alertBadgeState(dialogHandle, accentVar) {
  return dialogHandle.evaluate((dialog, varName) => {
    const seen = new Set();
    let alertCount = 0;
    let accent = '';
    const walk = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      let alerts = [];
      try { alerts = Array.from(root.querySelectorAll('ha-alert')); } catch { alerts = []; }
      for (const a of alerts) {
        alertCount += 1;
        const v = (a.style && a.style.getPropertyValue(varName)) || '';
        if (v && !accent) accent = v.trim();
      }
      let all = [];
      try { all = Array.from(root.querySelectorAll('*')); } catch { all = []; }
      for (const el of all) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(dialog.shadowRoot);
    return { alertCount, accent };
  }, accentVar);
}

// Open Nostrodomus settings from the popup gear (mirrors companion-warning-toggle).
async function openSettings(page) {
  await page.locator(`${HUI_DIALOG_EDIT_CARD} ${HA_CODE_EDITOR} ${CM_CONTENT}`).first().click();
  const box = popup(page);
  const gear = box.locator(NOSTRODOMUS_SETTINGS_BUTTON);
  await expect(async () => {
    if (!(await box.isVisible())) await page.keyboard.press('Control+Space');
    await expect(gear).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000, intervals: [250, 500, 1000] });
  await gear.click();
  const panel = page.locator(NOSTRODOMUS_SETTINGS_PANEL);
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  return panel;
}

async function setHideWarnings(panel, on) {
  await panel.locator(HIDE_WARNINGS_TOGGLE).first().evaluate((el, checked) => {
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, on);
}

test('G5 (badge): a dialog with a real ha-alert receives the badge host/shadow sheets and accent var', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
  });
  const stamp = await openDashboard(page);
  await page.evaluate(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* ignore */ }
  });

  const { dialog } = await openSeededCardCodeEditor(page, stamp);

  // Turn the card into an unknown custom card — HA renders the real "Visual editor is not supported"
  // ha-alert and forces the YAML editor, WITHOUT crashing (a defined
  // custom: type is safe; live-data.spec proves it). Replace only the type VALUE so `type: ` is
  // never undefined mid-edit: cursor to end of line 1 (`type: entities`), select the value word,
  // overwrite it. HA emits `type` first, so line 1 is the type line.
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Shift+ArrowLeft'); // select the `entities` value word
  await typeInYaml(page, 'custom:nostrodomus-nope');
  await expectDialogAlive(page, 'after switching the card to an unknown custom type');

  // Precondition (observe-then-assert): the alert must actually mount, else the gate would pass
  // vacuously.
  await expect
    .poll(async () => (await alertBadgeState(dialog, BADGE_ACCENT_VAR)).alertCount, {
      timeout: 10000,
      message: 'G5: no ha-alert appeared for the unknown custom card — HA did not surface the "visual editor not supported" notice (adjust the alert-production step if HA behavior differs)',
    })
    .toBeGreaterThan(0);

  // Deterministically reconcile the warning surface: flipping Hide-warnings ON then OFF drives the
  // real applyEditorWarningHide(activeEditorWarningSurface()) both ways. Landing OFF
  // with the companion active + an alert present injects the BADGE (the same reconcile the
  // warning-toggle spec drives).
  const panel = await openSettings(page);
  await setHideWarnings(panel, true);
  await setHideWarnings(panel, false);

  await expect
    .poll(() => countStyleNodeById(dialog, WARNING_BADGE_HOST_STYLE_ID), { timeout: 10000, message: 'G5: badge HOST sheet never injected on the alert container (surface resolution / reconcile did not reach it)' })
    .toBeGreaterThan(0);
  await expect
    .poll(() => countStyleNodeById(dialog, WARNING_BADGE_SHADOW_STYLE_ID), { timeout: 10000, message: 'G5: badge SHADOW sheet never injected on the alert shadow root' })
    .toBeGreaterThan(0);

  // …and the live accent var (derived from the codebox frame-border color) is published on the alert.
  const finalState = await alertBadgeState(dialog, BADGE_ACCENT_VAR);
  await testInfo.attach('g5-badge.json', { body: JSON.stringify(finalState, null, 2), contentType: 'application/json' });
  expect(finalState.accent, `G5: ${BADGE_ACCENT_VAR} was not set on the ha-alert (badge accent absent): ${JSON.stringify(finalState)}`).not.toBe('');
});
