// card-mod-lane.spec — the 0.1.255/256 fix that BOUNDS the card_mod `style: |` CSS lane: CSS completes
// INSIDE an open style block, but normal YAML completion resumes for a sibling key below/beside a closed
// one (the bug killed the whole rest of the document to CSS). card_mod is ubiquitous, so this fired
// constantly.
//
// CRASH-SAFETY (see launch-gates.spec): append to the seeded card's valid `type: entities` config so the
// preview never sees an undefined type. card_mod is an unknown key to the entities card (ignored); the
// completion is text-driven, so card_mod need not be installed on the instance.

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  popupRowTexts,
  typeInYaml,
} from './editor-helpers.mjs';

function labels(rows) {
  return rows.map((t) => {
    const parts = t.split('\n').map((s) => s.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[1] : parts[0] || '';
  });
}

// Type a fresh block of absolute-indent lines below the current content (CM's copied auto-indent
// neutralized with Shift+Home so each line lands where written).
async function appendLines(page, lines) {
  for (const line of lines) {
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Home');
    await typeInYaml(page, line);
  }
}

const CSS_PROP_RX = /^(display|color|position|background|border|margin|padding):/;
const YAML_CARD_KEY_RX = /^(type|entity|entities|name|icon):$/;

test('card_mod lane: YAML completion resumes for a key below a closed style: | block', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  // A card_mod block with a closed CSS scalar, then a fresh ROOT key below it. The lane must end with
  // the block: `the` must offer the YAML `theme:` key (editor-completion proves the->theme on this card),
  // and no CSS property may leak out.
  await appendLines(page, ['card_mod:', '  style: |', '    ha-card { color: red; }']);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home'); // column 0 — a root sibling below the closed block
  await typeInYaml(page, 'the');
  await expectDialogAlive(page, 'after a sibling key below the closed style block');
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, 'card_mod lane: a key below style: | produced no popup');
  const ls = labels(await popupRowTexts(page));
  expect(ls.some((l) => l === 'theme:'), `card_mod lane: expected the YAML theme: key below the style block, got ${JSON.stringify(ls)}`).toBe(true);
  expect(ls.some((l) => CSS_PROP_RX.test(l)), `card_mod lane: CSS leaked below the closed style block: ${JSON.stringify(ls)}`).toBe(false);
});

test('card_mod lane: CSS completion inside an open style: | block', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  // Cursor inside an OPEN CSS rule — property completion, not YAML card keys.
  await appendLines(page, ['card_mod:', '  style: |', '    ha-card {']);
  await page.keyboard.press('Enter'); // accept CM indent — inside the open rule
  await typeInYaml(page, 'disp');
  await expectDialogAlive(page, 'inside the open style block');
  await page.keyboard.press('Control+Space');

  await expectPopupWithSuggestions(page, 'card_mod lane: inside style: | produced no popup');
  const ls = labels(await popupRowTexts(page));
  expect(ls.some((l) => /^display:/.test(l)), `card_mod lane: expected CSS display: inside the style block, got ${JSON.stringify(ls)}`).toBe(true);
  expect(ls.some((l) => YAML_CARD_KEY_RX.test(l)), `card_mod lane: YAML card keys leaked into the open CSS block: ${JSON.stringify(ls)}`).toBe(false);
});
