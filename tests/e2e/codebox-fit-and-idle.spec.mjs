// Two regressions measured on a live Home Assistant 2026.11 instance:
//
// 1. Idle loop. With a card editor open and no input, the runtime re-applied its styles about
//    31 times per second, re-inserting a <style> in the editor shadow root 62 times per second
//    and writing 216 attributes per second. Once the open has settled there must be no applies.
//
// 2. Codebox fit. The editor height was a viewport formula, so it ran below the dialog and the
//    window whenever the space above it differed from the one measured case. The box must end
//    above the dialog footer and inside the window at every window size.

import { test, expect, readStamp } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';

function measureIdle(durationMs) {
  const deepAll = (sel, root = document, out = []) => {
    try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
    try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
    return out;
  };
  const host = deepAll('ha-code-editor').find((h) => h.getBoundingClientRect().height > 50) || null;
  const root = host && host.shadowRoot;
  let styleInserts = 0;
  let attributeWrites = 0;
  const observer = root ? new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') { attributeWrites += 1; continue; }
      for (const node of record.addedNodes) if (node.localName === 'style') styleInserts += 1;
    }
  }) : null;
  if (observer) observer.observe(root, { childList: true, subtree: true, attributes: true });
  const applyCount = () => {
    try { return window.__nostrodomus.debug().companionSettle.applyCount; } catch { return -1; }
  };
  const before = applyCount();
  return new Promise((resolve) => {
    setTimeout(() => {
      if (observer) observer.disconnect();
      resolve({ hasEditor: !!root, applies: applyCount() - before, styleInserts, attributeWrites });
    }, durationMs);
  });
}

function measureFit() {
  const deepAll = (sel, root = document, out = []) => {
    try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
    try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
    return out;
  };
  const host = deepAll('ha-code-editor').find((h) => h.getBoundingClientRect().height > 50) || null;
  const footer = deepAll('ha-dialog-footer').find((f) => f.getBoundingClientRect().height > 0) || null;
  const hostRect = host ? host.getBoundingClientRect() : null;
  const footerRect = footer ? footer.getBoundingClientRect() : null;
  return {
    viewport: [window.innerWidth, window.innerHeight],
    hasHost: !!host,
    hasFooter: !!footer,
    hostTop: hostRect ? Math.round(hostRect.top) : null,
    hostBottom: hostRect ? Math.round(hostRect.bottom) : null,
    hostHeight: hostRect ? Math.round(hostRect.height) : null,
    footerTop: footerRect ? Math.round(footerRect.top) : null,
    inlineHeight: host ? host.style.height : '',
  };
}

test('idle: no style applies, <style> re-insertions or attribute writes once the editor has settled', async ({ page }, testInfo) => {
  await page.addInitScript(() => { try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ } });
  await openSeededCardCodeEditor(page, readStamp(), { skipEditorClick: true });
  // The settle ladder after open runs to 2800ms; measure after it has finished.
  await page.waitForTimeout(4000);

  const idle = await page.evaluate(measureIdle, 3000);
  await testInfo.attach('idle.json', { body: JSON.stringify(idle, null, 2), contentType: 'application/json' });
  console.log('[idle]', JSON.stringify(idle));

  expect(idle.hasEditor, 'a code editor is open').toBe(true);
  expect(idle.styleInserts, 'no <style> may be re-inserted in the editor root while idle').toBe(0);
  expect(idle.applies, `settle applies in 3s of idle, got ${idle.applies}`).toBeLessThanOrEqual(1);
  expect(idle.attributeWrites, `attribute writes in the editor root in 3s of idle, got ${idle.attributeWrites}`).toBeLessThanOrEqual(2);
});

test('fit: the codebox ends above the dialog footer and inside the window at every size', async ({ page }, testInfo) => {
  await page.addInitScript(() => { try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ } });
  await openSeededCardCodeEditor(page, readStamp(), { skipEditorClick: true });
  await page.waitForTimeout(3200);

  const sizes = [[1280, 720], [1920, 1358], [1100, 640], [1280, 927]];
  const results = [];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(700); // resize listener re-fits on the next frame
    results.push(await page.evaluate(measureFit));
  }
  await testInfo.attach('fit.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  console.log('[fit]', JSON.stringify(results));

  for (const fit of results) {
    const label = `${fit.viewport[0]}x${fit.viewport[1]}`;
    expect(fit.hasHost, `${label}: code editor present`).toBe(true);
    expect(fit.inlineHeight, `${label}: measured px height, got "${fit.inlineHeight}"`).toMatch(/^\d+px$/);
    expect(fit.hostBottom, `${label}: codebox bottom ${fit.hostBottom} must be inside the window`).toBeLessThanOrEqual(fit.viewport[1]);
    if (fit.hasFooter) {
      expect(fit.hostBottom, `${label}: codebox bottom ${fit.hostBottom} must be above the footer top ${fit.footerTop}`).toBeLessThanOrEqual(fit.footerTop);
    }
    expect(fit.hostHeight, `${label}: codebox keeps a usable height`).toBeGreaterThanOrEqual(160);
  }
});

// Opens the Sections-view card's editor. That view wraps cards in hui-card-edit-mode, whose Edit
// entry is a menu item, so the home-view helper (a per-card Edit button) does not apply.
async function openSectionsCardCodeEditor(page, stamp) {
  const sectionsPath = String(stamp.dashboardPath).replace(/\/home$/, '/sections');
  await page.goto(`${sectionsPath}?edit=1`);
  await page.locator('hui-card-edit-mode').first().waitFor({ state: 'attached', timeout: 30000 });
  await page.evaluate(() => {
    const deepAll = (sel, root = document, out = []) => {
      try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
      try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
      return out;
    };
    const host = deepAll('hui-card-edit-mode')[0];
    const edit = deepAll('ha-dropdown-item', host.shadowRoot || host).find((item) => (item.textContent || '').trim() === 'Edit');
    edit.click();
    edit.dispatchEvent(new CustomEvent('wa-select', { bubbles: true, composed: true, detail: { item: edit } }));
  });
  await page.locator('hui-dialog-edit-card').waitFor({ state: 'attached', timeout: 15000 });
  const showCode = page.getByRole('button', { name: /show code editor/i });
  await showCode.first().click({ timeout: 15000 });
  await page.locator('hui-dialog-edit-card ha-code-editor').first().waitFor({ state: 'visible', timeout: 15000 });
}

test('fit: content above the editor shortens the box instead of pushing it off screen', async ({ page }, testInfo) => {
  await page.addInitScript(() => { try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ } });
  // On Home Assistant 2026.11 a tab row (Config / Visibility / Layout), a stack card's own tab bar
  // and toolbar, or an alert sit above the editor and lower its top by 235px or more. The 2026.7
  // test image renders none of them, so the same displacement is applied directly: the element
  // editor is pushed down by 235px, the amount measured live for a stack sub-card.
  await openSectionsCardCodeEditor(page, readStamp());
  await page.waitForTimeout(3200);
  await page.evaluate(() => {
    const deepAll = (sel, root = document, out = []) => {
      try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
      try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
      return out;
    };
    const elementEditor = deepAll('hui-card-element-editor')[0];
    elementEditor.style.display = 'block';
    elementEditor.style.paddingTop = '235px';
  });

  const results = [];
  for (const [width, height] of [[1280, 720], [1920, 1358], [1280, 927]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(700);
    results.push(await page.evaluate(measureFit));
  }
  await testInfo.attach('fit-tabbed.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  console.log('[fit-tabbed]', JSON.stringify(results));

  expect(results[0].hostTop, 'the editor starts 235px lower than the plain 116px').toBeGreaterThan(300);
  for (const fit of results) {
    const label = `${fit.viewport[0]}x${fit.viewport[1]}`;
    expect(fit.inlineHeight, `${label}: measured px height, got "${fit.inlineHeight}"`).toMatch(/^\d+px$/);
    expect(fit.hostBottom, `${label}: codebox bottom ${fit.hostBottom} must be inside the window`).toBeLessThanOrEqual(fit.viewport[1]);
    if (fit.hasFooter) {
      expect(fit.hostBottom, `${label}: codebox bottom ${fit.hostBottom} must be above the footer top ${fit.footerTop}`).toBeLessThanOrEqual(fit.footerTop);
    }
  }
});

// Click cost. Measured live before the fix: one click with a dialog element in the page armed
// three 13-rung ladders, and Home Assistant keeps the closed dialog element attached, so that
// held on every dashboard afterwards.
const settleCounters = () => {
  try {
    const settle = window.__nostrodomus.debug().companionSettle;
    return { applies: settle.applyCount, ladders: settle.settleArmCount };
  } catch {
    return { applies: -1, ladders: -1 };
  }
};

test('clicks: one ladder per click while the editor is open, none after it closes, and a reopen is styled without help', async ({ page }, testInfo) => {
  await page.addInitScript(() => { try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ } });
  await openSeededCardCodeEditor(page, readStamp(), { skipEditorClick: true });
  await page.waitForTimeout(4000);

  // 1. One click inside the open dialog (its title area, not the editor).
  const openBefore = await page.evaluate(settleCounters);
  await page.locator('hui-dialog-edit-card').getByText(/card configuration/i).first().click();
  await page.waitForTimeout(3300);
  const openAfter = await page.evaluate(settleCounters);

  // 2. Close the dialog, let everything settle, then click the dashboard.
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  await page.locator('hui-dialog-edit-card ha-code-editor').first().waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(4000);
  const closedBefore = await page.evaluate(settleCounters);
  await page.mouse.click(8, 8);
  await page.waitForTimeout(1500);
  const closedAfter = await page.evaluate(settleCounters);

  // 3. Reopen the same card in the same page, with no page reload and no extra click.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const showCode = page.getByRole('button', { name: /show code editor/i });
  if (await showCode.count()) await showCode.first().click({ timeout: 15000 }).catch(() => { /* already in code mode */ });
  const host = page.locator('hui-dialog-edit-card ha-code-editor').first();
  await host.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(3200);
  const reopened = await host.evaluate((el) => ({
    inlineHeight: el.style.height,
    styled: el.getAttribute('data-nostrodomus-codebox-style'),
  }));

  const result = {
    openClick: { ladders: openAfter.ladders - openBefore.ladders, applies: openAfter.applies - openBefore.applies },
    closedClick: { ladders: closedAfter.ladders - closedBefore.ladders, applies: closedAfter.applies - closedBefore.applies },
    reopened,
  };
  await testInfo.attach('clicks.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  console.log('[clicks]', JSON.stringify(result));

  expect(result.openClick.ladders, 'one click arms one ladder').toBe(1);
  expect(result.openClick.applies, `applies after one click, got ${result.openClick.applies}`).toBeLessThanOrEqual(16);
  expect(result.closedClick.ladders, 'a click after the dialog closed arms no ladder').toBe(0);
  expect(result.closedClick.applies, `applies after a click with the dialog closed, got ${result.closedClick.applies}`).toBeLessThanOrEqual(1);
  expect(reopened.styled, 'the reopened editor is styled').toBe('1');
  expect(reopened.inlineHeight, `the reopened editor is fitted, got "${reopened.inlineHeight}"`).toMatch(/^\d+px$/);
});

// Typing cost. Measured before the fix on a 708-line card: about 930 attribute writes per
// keystroke inside .cm-content (the painter's classes being wiped by CodeMirror and restored),
// live Range objects that every DOM mutation on the page had to visit, and script listeners for
// the input events that pulled Home Assistant's preview rebuild into each keystroke.
test('typing: nothing is written on CodeMirror elements, ranges are static, no input listeners', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ }
    const seen = [];
    window.__inputListeners = seen;
    const add = window.EventTarget.prototype.addEventListener;
    window.EventTarget.prototype.addEventListener = function patched(type, handler, options) {
      if ((this === document || this === window) && ['input', 'beforeinput', 'compositionupdate'].includes(type)
        && /nostrodomus/i.test(String(new Error().stack || ''))) seen.push(type);
      return add.call(this, type, handler, options);
    };
  });
  await openSeededCardCodeEditor(page, readStamp(), { skipEditorClick: true });
  await page.waitForTimeout(3500);

  const content = page.locator('hui-dialog-edit-card .cm-content').first();
  await content.click({ position: { x: 150, y: 8 } });
  await page.keyboard.press('End');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const deepAll = (sel, root = document, out = []) => {
      try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
      try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
      return out;
    };
    const host = deepAll('ha-code-editor').find((h) => h.getBoundingClientRect().height > 50);
    const cmContent = host.shadowRoot.querySelector('.cm-content');
    const counts = { classWrites: 0, dataWrites: 0 };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'class') counts.classWrites += 1;
        else if (String(record.attributeName).startsWith('data-nostrodomus')) counts.dataWrites += 1;
      }
    });
    observer.observe(cmContent, { attributes: true, subtree: true });
    window.__typingProbe = { counts, observer };
  });
  await page.keyboard.type('  # abcdefghijklmnopqrst', { delay: 40 });
  await page.waitForTimeout(600);

  const result = await page.evaluate(() => {
    window.__typingProbe.observer.disconnect();
    let ranges = 0; let live = 0;
    for (const [, highlight] of CSS.highlights) for (const range of highlight) { ranges += 1; if (range instanceof window.Range) live += 1; }
    return { ...window.__typingProbe.counts, ranges, liveRanges: live, inputListeners: window.__inputListeners };
  });
  await testInfo.attach('typing.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  console.log('[typing]', JSON.stringify(result));

  expect(result.inputListeners, 'no input-event listeners on document or window').toEqual([]);
  expect(result.ranges, 'the editor is colored by highlight ranges').toBeGreaterThan(0);
  expect(result.liveRanges, 'none of them is a live Range').toBe(0);
  // The painter used to write one data attribute per visible line per pass (hundreds here). A
  // handful of one-off markers on the content element itself is not that.
  expect(result.dataWrites, `painter data-attribute writes for 22 keystrokes, got ${result.dataWrites}`).toBeLessThan(10);
  // CodeMirror itself toggles a few classes while typing (active line, focus); the painter's
  // wipe-and-restore cycle produced about 800 per keystroke.
  expect(result.classWrites, `class writes for 22 keystrokes, got ${result.classWrites}`).toBeLessThan(120);
});

// Syntax passes skip work that is already done: a pass with nothing changed returns early, the
// viewport start comes from the editor, and line modes continue from the last pass. An arrow key
// in the suggestion list repaints two rows. This checks that the colors stay correct through
// scrolling, an edit and key presses that change nothing, and that the list keeps its rows.
test('syntax ranges stay correct through scrolling, edits and idle key presses; arrow keys keep the list rows', async ({ page }, testInfo) => {
  await page.addInitScript(() => { try { window.localStorage.setItem('nostrodomusCompanion', 'active'); } catch { /* opaque origin */ } });
  await openSeededCardCodeEditor(page, readStamp(), { skipEditorClick: true });
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const deepAll = (sel, root = document, out = []) => {
      try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
      try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
      return out;
    };
    const lines = ['type: entities', 'title: Ranges', 'entities:'];
    for (let i = 0; i < 80; i += 1) lines.push('  - entity: input_boolean.demo_1', '    name: Room');
    lines.push('card_mod:', '  style: |');
    for (let i = 0; i < 60; i += 1) lines.push('    .row {', '      color: red;', '    }');
    lines.push('footer:', '  type: buttons', '  entities:', '    - entity: input_boolean.demo_2');
    const editorHost = () => deepAll('ha-code-editor').find((h) => h.getBoundingClientRect().height > 50);
    const host = editorHost();
    host.codemirror.dispatch({ changes: { from: 0, to: host.codemirror.state.doc.length, insert: lines.join('\n') }, selection: { anchor: 0 } });
    window.__editorView = () => editorHost().codemirror;
    window.__rangeProbe = () => {
      const current = editorHost();
      const content = current.shadowRoot.querySelector('.cm-content');
      const scroller = current.shadowRoot.querySelector('.cm-scroller');
      const kindsByLine = new Map();
      let detached = 0;
      for (const [name, highlight] of CSS.highlights) {
        for (const range of highlight) {
          if (!range.startContainer.isConnected) { detached += 1; continue; }
          const line = range.startContainer.parentElement?.closest('.cm-line');
          if (!line || !content.contains(line)) continue;
          if (!kindsByLine.has(line)) kindsByLine.set(line, new Set());
          kindsByLine.get(line).add(name.replace('nostrodomus-source-syntax-', ''));
        }
      }
      const box = scroller.getBoundingClientRect();
      const rows = [];
      for (const line of content.querySelectorAll('.cm-line')) {
        const rect = line.getBoundingClientRect();
        if (rect.bottom < box.top || rect.top > box.bottom) continue;
        const text = line.textContent;
        if (!text.trim()) continue;
        rows.push({ text, kinds: [...(kindsByLine.get(line) || [])].sort() });
      }
      return { detached, scrollTop: Math.round(scroller.scrollTop), rows };
    };
    window.__scrollEditorTo = (lineNumber) => {
      const current = editorHost();
      const view = current.codemirror;
      const block = view.lineBlockAt(view.state.doc.line(lineNumber).from);
      current.shadowRoot.querySelector('.cm-scroller').scrollTop = block.top;
    };
    window.__replaceLine = (lineNumber, text) => {
      const view = editorHost().codemirror;
      const line = view.state.doc.line(lineNumber);
      view.dispatch({ changes: { from: line.from, to: line.to, insert: text } });
    };
  });
  await page.waitForTimeout(1500);
  // A click on line 1, as a user would do before editing. It attaches the plugin to this editor
  // view and leaves the cursor on line 1 for the scrolling below.
  const content = page.locator('hui-dialog-edit-card .cm-content').first();
  await content.click({ position: { x: 150, y: 8 } });
  await page.waitForTimeout(600);

  const probe = () => page.evaluate(() => window.__rangeProbe());
  const check = (snapshot, label) => {
    expect(snapshot.detached, `${label}: ranges on removed text nodes`).toBe(0);
    expect(snapshot.rows.length, `${label}: visible lines`).toBeGreaterThan(5);
    for (const row of snapshot.rows) {
      expect(row.kinds.length, `${label}: "${row.text}" has no color`).toBeGreaterThan(0);
      if (/^\s+color: red;$/.test(row.text)) expect(row.kinds, `${label}: CSS declaration`).toContain('cssProp');
      if (/^\s+\.row \{$/.test(row.text)) expect(row.kinds, `${label}: CSS selector`).toContain('cssSelector');
      // The closing brace has no tokens of its own, so it shows the mode of its document line.
      // The cursor stays on line 1 through the scrolling below, and CodeMirror keeps that line
      // in the DOM above the viewport; counted as one block, these lines took list-line colors.
      if (/^\s+\}$/.test(row.text)) expect(row.kinds, `${label}: closing brace`).toEqual(['punct']);
      // A list line keeps the kinds it had in the first pass, which started at line 1.
      if (yamlReference.has(row.text)) expect(row.kinds, `${label}: "${row.text}"`).toEqual(yamlReference.get(row.text));
    }
  };

  const yamlReference = new Map();
  const top = await probe();
  for (const row of top.rows) if (/^\s+(- entity|name): /.test(row.text)) yamlReference.set(row.text, row.kinds);
  expect(yamlReference.size, 'list lines are in view at the top').toBe(2);
  expect(yamlReference.get('  - entity: input_boolean.demo_1'), 'a list item').toContain('yamlList');
  check(top, 'top');

  // The middle of the CSS block: every rendered line also occurs earlier in the document.
  await page.evaluate(() => window.__scrollEditorTo(250));
  await page.waitForTimeout(700);
  const css = await probe();
  expect(css.scrollTop, 'the editor scrolled').toBeGreaterThan(1000);
  check(css, 'css block');
  expect(css.rows.some((row) => /color: red;/.test(row.text)), 'CSS lines are in view').toBe(true);

  // Back into the YAML list, which the earlier pass already classified.
  await page.evaluate(() => window.__scrollEditorTo(60));
  await page.waitForTimeout(700);
  check(await probe(), 'yaml list');

  // An edit above the viewport (line 168 is a closing brace) opens a block comment over the rest
  // of the CSS; then the line is put back.
  await page.evaluate(() => window.__replaceLine(168, '    /* open'));
  await page.evaluate(() => window.__scrollEditorTo(250));
  await page.waitForTimeout(700);
  const commented = await probe();
  expect(commented.detached).toBe(0);
  expect(commented.rows.length).toBeGreaterThan(5);
  for (const row of commented.rows) expect(row.kinds, `inside the open comment: "${row.text}"`).toEqual(['comment']);
  await page.evaluate(() => window.__replaceLine(168, '    }'));
  await page.waitForTimeout(700);
  check(await probe(), 'after the comment is removed');

  // Key presses that change nothing in the editor leave the ranges in place.
  await page.evaluate(() => window.__scrollEditorTo(1));
  await page.waitForTimeout(500);
  await content.click({ position: { x: 150, y: 8 } });
  await page.keyboard.press('Control+End');
  // An entity value under a key the card does not know, so the preview does not reject it.
  for (const line of ['some_unknown_list:', '  - input_boolean.']) {
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type(line, { delay: 30 });
  }
  await page.keyboard.press('Control+Space');
  await page.waitForTimeout(800);

  const listState = () => page.evaluate(() => {
    const deepAll = (sel, root = document, out = []) => {
      try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
      try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
      return out;
    };
    const list = deepAll('[data-nostrodomus-list="1"]').find((el) => el.getBoundingClientRect().height > 10);
    if (!list) return null;
    const rows = [...list.children];
    window.__listRows = window.__listRows || rows;
    const selected = rows.findIndex((row) => row.getAttribute('aria-selected') === 'true');
    const box = list.getBoundingClientRect();
    const rowBox = rows[selected]?.getBoundingClientRect();
    return {
      count: rows.length,
      selected,
      selectedCount: rows.filter((row) => row.getAttribute('aria-selected') === 'true').length,
      sameRows: rows.length === window.__listRows.length && rows.every((row, i) => row === window.__listRows[i]),
      selectedInView: !!rowBox && rowBox.top >= box.top - 1 && rowBox.bottom <= box.bottom + 1,
      active: list.getAttribute('aria-activedescendant'),
    };
  });
  const opened = await listState();
  expect(opened, 'the suggestion list is open').not.toBeNull();
  expect(opened.count, 'the list has rows').toBeGreaterThan(3);
  expect(opened.selected).toBe(0);
  const steps = Math.min(8, opened.count - 1);
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
  const moved = await listState();
  await testInfo.attach('list.json', { body: JSON.stringify({ opened, moved }, null, 2), contentType: 'application/json' });
  expect(moved.selected, 'the selection moved').toBe(steps);
  expect(moved.selectedCount, 'one row is selected').toBe(1);
  expect(moved.sameRows, 'the rows were not rebuilt').toBe(true);
  expect(moved.selectedInView, 'the selected row is scrolled into view').toBe(true);
  expect(moved.active).toBe(`nostrodomus-intelli-option-${steps}`);
  check(await probe(), 'after arrow keys');
  await page.keyboard.press('Escape');
});
