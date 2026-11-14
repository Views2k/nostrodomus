// popup-position.spec — the 0.1.201/203 completion-popup anchoring: the popup opens AT the caret
// (word-start anchor, self-corrected for the containing-block offset, ~2px gap below the caret line),
// not parked a fixed ~170px from the editor's left edge.
//
// Measures the caret with the view's own coordsAtPos (authoritative) against the popup's rendered box.
// Uses a caret pushed well to the right so a "parked near the left edge" regression is unmistakable.
// Append-to-valid-config setup (no typeless HA crash).

import { test, expect, openDashboard } from './session.mjs';
import {
  openSeededCardCodeEditor,
  expectDialogAlive,
  expectPopupWithSuggestions,
  popup,
  typeInYaml,
} from './editor-helpers.mjs';

test('popup position: the completion popup opens at the caret, not parked at the editor left edge', async ({ page }) => {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);

  // Append a key whose entity-shaped value pushes the caret well to the right, then open completion so
  // the popup must track the caret horizontally (the wide-editor case the fix addresses). The value uses
  // the seeded input_boolean. domain so real suggestions exist on the container (a domain absent on the
  // instance would compute zero rows and never render the popup to measure).
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await typeInYaml(page, 'a_marker_key_for_position: input_boolean.');
  await expectDialogAlive(page, 'after typing a right-shifted entity value');
  await page.keyboard.press('Control+Space');
  await expectPopupWithSuggestions(page, 'popup position: entity value + Ctrl+Space produced no popup');

  // The view's own caret coordinates (viewport space) — authoritative, not a DOM guess.
  const caret = await page.evaluate(() => {
    const v = window.__nostrodomus?.state?.view;
    if (!v || typeof v.coordsAtPos !== 'function') return null;
    const c = v.coordsAtPos(v.state.selection.main.head);
    return c ? { left: c.left, bottom: c.bottom } : null;
  });
  expect(caret, 'popup position: could not read the caret coordinates from the view').not.toBeNull();

  const box = await popup(page).boundingBox();
  expect(box, 'popup position: the popup had no bounding box').not.toBeNull();

  // Horizontal: the popup tracks the caret (word-start anchor sits at/near it). A "parked ~170px from
  // the left edge" regression, with the caret far right, blows well past this tolerance.
  expect(
    Math.abs(box.x - caret.left),
    `popup position: popup.left ${Math.round(box.x)} is not near the caret ${Math.round(caret.left)} (parked at the edge?)`,
  ).toBeLessThan(160);
  // Vertical: the popup sits just below the caret's line, not above or floating far away.
  expect(
    box.y,
    `popup position: popup.top ${Math.round(box.y)} is not just below the caret line bottom ${Math.round(caret.bottom)}`,
  ).toBeGreaterThanOrEqual(caret.bottom - 8);
  expect(box.y).toBeLessThan(caret.bottom + 60);
});
