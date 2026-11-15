// The YAML key suggestions follow the block the cursor is in. A conditional card's conditions:
// block earlier in a stack must not turn every later card's key list into condition keys
// (condition:, above:, below:, the condition snippets); a block opener in the text before the
// cursor does not outrank the cursor's own YAML path. The same routing serves automation
// YAML, which this suite does not type into (Home Assistant's automation editor throws on
// half-typed YAML).
import { test, expect, readStamp } from './session.mjs';
import { openSeededCardCodeEditor, expectPopupWithSuggestions, popupRowTexts } from './editor-helpers.mjs';

const STACK = [
  'type: vertical-stack',
  'cards:',
  '  - type: conditional',
  '    conditions:',
  '      - condition: state',
  '        entity: input_boolean.demo_0',
  '        state: "on"',
  '    card:',
  '      type: tile',
  '      entity: input_boolean.demo_0',
  '  - type: tile',
  '    entity: input_boolean.demo_1',
].join('\n');

const CONDITION_ROWS = ['condition:', 'state condition', 'numeric condition', 'above:', 'below:'];

test('a card after a conditional card in a stack gets card keys, not condition keys', async ({ page }, testInfo) => {
  await openSeededCardCodeEditor(page, readStamp());
  await page.evaluate((text) => {
    const deepAll = (sel, root = document, out = []) => {
      try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
      try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
      return out;
    };
    const host = deepAll('ha-code-editor').find((h) => h.getBoundingClientRect().height > 50);
    host.codemirror.dispatch({ changes: { from: 0, to: host.codemirror.state.doc.length, insert: text }, selection: { anchor: 0 } });
  }, STACK);
  await page.waitForTimeout(1200);

  // A click binds the editor again after the scripted edit. Then a new line in the tile card
  // (the editor indents it to the card's key column), a typed letter and Ctrl+Space open the
  // list. (Typing alone does not open it right after a scripted replacement of the document.)
  await page.locator('hui-dialog-edit-card .cm-content').first().click({ position: { x: 150, y: 8 } });
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.keyboard.type('n', { delay: 80 });
  await page.waitForTimeout(300);
  await page.keyboard.press('ControlOrMeta+Space');
  await expectPopupWithSuggestions(page, 'Ctrl+Space in the second card of the stack opens the suggestion list');
  await page.waitForTimeout(400);

  const rows = (await popupRowTexts(page)).map((text) => text.replace(/\s+/g, ' ').trim());
  const top = await page.evaluate(() => (window.__nostrodomus?.debugSnapshot?.()?.topSuggestions || []).map((row) => ({ label: row.label, source: row.source })));
  await testInfo.attach('suggestion-rows.json', { body: JSON.stringify({ rows, top }, null, 2), contentType: 'application/json' });

  const contextRows = top.filter((row) => row.source === 'lovelace-context').map((row) => row.label);
  expect(contextRows, `context rows at the tile card key position: ${JSON.stringify(top)}`).toContain('name:');
  for (const label of CONDITION_ROWS) {
    expect(contextRows, `condition row "${label}" offered inside a tile card after a conditional card: ${JSON.stringify(top)}`).not.toContain(label);
    expect(rows.some((text) => text.includes(label)), `condition row "${label}" in the list: ${JSON.stringify(rows)}`).toBe(false);
  }
});
