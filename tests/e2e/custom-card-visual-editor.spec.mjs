// A custom card with its own visual editor, the kind that mixes ordinary controls with an embedded
// code box (Bubble Card's "Custom styles" section, for example). Many people set such cards up
// without writing YAML, so Nostrodomus must leave that editor as the card built it: every control
// visible and working, notes not collapsed, the embedded code box at the size the card gave it
// and with the suggestions the card turned on, and the dialog as Home Assistant drew it.
//
// Nostrodomus decides this by where an element sits (inside the editor element a card supplies),
// not by which card it is, so two test cards stand for all of them. They are defined in the page
// by this spec, built from the same Home Assistant elements such cards use, and need no
// third-party download. One editor draws in a shadow root, as most do; the other draws without one.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor, popup } from './editor-helpers.mjs';
import { CM_CONTENT, HA_CODE_EDITOR, HUI_DIALOG_EDIT_CARD } from './selectors.mjs';

const WARNING_HIDE_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-warning-hide';

const EDITORS = [
  ['with a shadow root', 'e2e-embedded-card'],
  ['without a shadow root', 'e2e-lightdom-card'],
];

// Runs in the page, at once or as an init script. Home Assistant replaces the element registry
// while it loads, so as an init script it waits for Home Assistant's own elements first.
function defineFixtureCards() {
  const define = () => {
    if (customElements.get('e2e-embedded-card')) return;
    const fire = (el, type, detail) => el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

    class FixtureEditor extends HTMLElement {
      setConfig(config) {
        this._config = { ...config };
        this._render();
        const name = this._root.querySelector('#name');
        if (name && name.value !== (this._config.name || '')) name.value = this._config.name || '';
        const toggle = this._root.querySelector('#show-state');
        if (toggle) toggle.checked = !!this._config.show_state;
      }

      set hass(hass) {
        this._hass = hass;
        const code = this._root && this._root.querySelector('ha-code-editor');
        if (code) code.hass = hass;
      }

      _change(patch) {
        this._config = { ...this._config, ...patch };
        fire(this, 'config-changed', { config: this._config });
      }

      _render() {
        if (this._root) return;
        const root = this.constructor.lightDom ? this : this.attachShadow({ mode: 'open' });
        this._root = root;
        const style = document.createElement('style');
        style.textContent = '.row { display: flex; gap: 8px; align-items: center; margin: 12px 0; } #styles { display: block; }';
        const note = document.createElement('ha-alert');
        note.id = 'note';
        note.setAttribute('alert-type', 'info');
        note.textContent = 'This card has its own editor. Use the controls below.';
        const nameRow = document.createElement('div');
        nameRow.className = 'row';
        nameRow.innerHTML = '<label for="name">Name</label><input id="name" type="text">';
        const toggleRow = document.createElement('div');
        toggleRow.className = 'row';
        toggleRow.innerHTML = '<label><input id="show-state" type="checkbox"> Show state</label>';
        const buttonRow = document.createElement('div');
        buttonRow.className = 'row';
        buttonRow.innerHTML = '<button id="add" type="button">Add sub-button</button><span id="count">0</span>';
        const panel = document.createElement('ha-expansion-panel');
        panel.id = 'panel';
        panel.setAttribute('outlined', '');
        panel.expanded = true;
        const header = document.createElement('h4');
        header.slot = 'header';
        header.textContent = 'Custom styles';
        const code = document.createElement('ha-code-editor');
        code.id = 'styles';
        code.mode = 'yaml';
        code.hass = this._hass;
        // The card turns Home Assistant's entity and icon suggestions on for its code box.
        code.autocompleteEntities = true;
        code.autocompleteIcons = true;
        code.value = String(this._config.styles || '');
        panel.append(header, code);
        root.append(style, note, nameRow, toggleRow, buttonRow, panel);
        if (this.constructor.tall) {
          // Many more controls than fit in the dialog, and one at the very end.
          for (let i = 0; i < 40; i += 1) {
            const row = document.createElement('div');
            row.className = 'row';
            row.innerHTML = `<label>Option ${i + 1} <input type="text"></label>`;
            root.append(row);
          }
          const lastRow = document.createElement('div');
          lastRow.className = 'row';
          lastRow.innerHTML = '<button id="last" type="button">Last control</button><span id="last-count">0</span>';
          root.append(lastRow);
          root.querySelector('#last').addEventListener('click', () => {
            const count = root.querySelector('#last-count');
            count.textContent = String(Number(count.textContent) + 1);
          });
        }

        root.querySelector('#name').addEventListener('input', (ev) => this._change({ name: ev.target.value }));
        root.querySelector('#show-state').addEventListener('change', (ev) => this._change({ show_state: ev.target.checked }));
        root.querySelector('#add').addEventListener('click', () => {
          const count = root.querySelector('#count');
          count.textContent = String(Number(count.textContent) + 1);
          this._change({ sub_buttons: Number(count.textContent) });
        });
        code.addEventListener('value-changed', (ev) => {
          ev.stopPropagation();
          window.__fixtureCodeChanges = (window.__fixtureCodeChanges || 0) + 1;
          this._change({ styles: ev.detail.value });
        });
      }
    }
    class LightDomFixtureEditor extends FixtureEditor {
      static lightDom = true;
    }
    class TallFixtureEditor extends FixtureEditor {
      static tall = true;
    }

    const cardClass = (editorTag) => class extends HTMLElement {
      static getConfigElement() { return document.createElement(editorTag); }
      static getStubConfig() { return { name: 'Fixture' }; }
      setConfig(config) { this._config = config; this.textContent = `Fixture card: ${config.name || ''}`; this.style.display = 'block'; this.style.padding = '16px'; }
      set hass(_hass) { /* nothing to show */ }
      getCardSize() { return 1; }
    };

    customElements.define('e2e-embedded-card-editor', FixtureEditor);
    customElements.define('e2e-embedded-card', cardClass('e2e-embedded-card-editor'));
    customElements.define('e2e-lightdom-card-editor', LightDomFixtureEditor);
    customElements.define('e2e-lightdom-card', cardClass('e2e-lightdom-card-editor'));
    customElements.define('e2e-tall-card-editor', TallFixtureEditor);
    customElements.define('e2e-tall-card', cardClass('e2e-tall-card-editor'));
  };
  if (customElements.get('home-assistant')) { define(); return; }
  const timer = setInterval(() => {
    if (customElements.get('home-assistant')) { clearInterval(timer); define(); }
  }, 50);
}

function measureVisualEditor({ editorTag, hideSheetId }) {
  const deepAll = (sel, root = document, out = []) => {
    try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
    try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
    return out;
  };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, position: cs.position };
  };
  const dialogRoot = deepAll('hui-dialog-edit-card')[0].shadowRoot;
  const editor = deepAll(editorTag, dialogRoot)[0] || null;
  const root = editor && (editor.shadowRoot || editor);
  const code = root ? root.querySelector('#styles') : null;
  const cmEditor = code && code.shadowRoot ? code.shadowRoot.querySelector('.cm-editor') : null;
  const pane = deepAll('.element-editor', dialogRoot)[0] || null;
  const note = root ? root.querySelector('#note') : null;
  const dialog = deepAll('dialog', dialogRoot)[0] || null;
  return {
    viewport: [window.innerWidth, window.innerHeight],
    hasEditor: !!editor,
    ownRoot: !!(editor && editor.shadowRoot),
    dialog: box(dialog),
    dialogBlur: dialog ? getComputedStyle(dialog).backdropFilter : null,
    ourDialogSheets: [...dialogRoot.querySelectorAll('style[id*="nostrodomus"]')].map((s) => s.id),
    pane: box(pane),
    editor: box(editor),
    note: box(note),
    noteText: note ? (note.textContent || '').trim() : '',
    name: box(root ? root.querySelector('#name') : null),
    nameValue: root ? root.querySelector('#name').value : null,
    toggle: box(root ? root.querySelector('#show-state') : null),
    button: box(root ? root.querySelector('#add') : null),
    count: root ? root.querySelector('#count').textContent : null,
    panel: box(root ? root.querySelector('#panel') : null),
    code: box(code),
    codeInlineStyle: code ? (code.getAttribute('style') || '') : null,
    cmEditor: box(cmEditor),
    cmInlineStyle: cmEditor ? (cmEditor.getAttribute('style') || '') : null,
    codeFramed: code ? code.hasAttribute('data-nostrodomus-codebox-frame-host') : null,
    codeStyled: cmEditor ? cmEditor.hasAttribute('data-nostrodomus-codebox-style') : null,
    codeOurSheets: code && code.shadowRoot ? [...code.shadowRoot.querySelectorAll('style[id*="nostrodomus"]')].map((s) => s.id) : null,
    codeOurAttributes: code ? [...code.attributes, ...(cmEditor ? [...cmEditor.attributes] : [])].map((a) => a.name).filter((n) => /nostrodomus/i.test(n)) : null,
    codeEntitySuggestions: code ? code.autocompleteEntities : null,
    codeIconSuggestions: code ? code.autocompleteIcons : null,
    codeChanges: window.__fixtureCodeChanges || 0,
    hideSheets: deepAll(`#${hideSheetId}`, dialogRoot).length,
    showCodeButton: deepAll('ha-button, mwc-button, button', dialogRoot).some((b) => /show code editor/i.test(b.textContent || '') && b.getBoundingClientRect().width > 0),
    footer: box(deepAll('ha-dialog-footer', dialogRoot).find((f) => f.getBoundingClientRect().height > 0) || null),
    preview: box(deepAll('.element-preview', dialogRoot)[0] || null),
  };
}

const visible = (b) => !!b && b.w > 0 && b.h > 0 && b.display !== 'none' && b.visibility !== 'hidden' && Number(b.opacity) > 0;
const measure = (page, cardType) => page.evaluate(measureVisualEditor, { editorTag: `${cardType}-editor`, hideSheetId: WARNING_HIDE_STYLE_ID });

async function openFixtureVisualEditor(page, cardType, { beforeVisualEditor = null } = {}) {
  const stamp = await openDashboard(page);
  await openSeededCardCodeEditor(page, stamp);
  await page.evaluate(defineFixtureCards);
  if (beforeVisualEditor) await beforeVisualEditor();
  const content = page.locator(`${HUI_DIALOG_EDIT_CARD} ${HA_CODE_EDITOR} ${CM_CONTENT}`).first();
  await content.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(`type: custom:${cardType}\nname: Kitchen\nstyles: ""\n`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /show visual editor/i }).first().click();
  await page.locator(`${HUI_DIALOG_EDIT_CARD} ${cardType}-editor`).first().waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(2500); // the interaction ladder and the settle passes have run
}

// The note is a full banner in the flow of the editor, not a badge taken out of it.
function expectNoteAsBuilt(m, when) {
  const where = `${when}: ${JSON.stringify(m)}`;
  expect(visible(m.note), `the card's note is not visible. ${where}`).toBe(true);
  expect(m.note.w, `the card's note was collapsed to ${m.note.w}px wide. ${where}`).toBeGreaterThan(200);
  expect(m.note.h, `the card's note was collapsed to ${m.note.h}px high. ${where}`).toBeGreaterThan(30);
  expect(m.note.position, `the card's note was taken out of the editor's flow. ${where}`).not.toBe('absolute');
  expect(m.note.top, `the card's note is not above the card's first control. ${where}`).toBeLessThan(m.name.top);
  expect(m.note.left, `the card's note is outside the editor pane. ${where}`).toBeGreaterThanOrEqual(m.pane.left - 1);
}

// The embedded code box is the card's: the size the card gave it, nothing of Nostrodomus on it or
// in it, and the suggestions the card turned on still on.
function expectCodeBoxAsBuilt(m, when) {
  const where = `${when}: ${JSON.stringify(m)}`;
  expect(visible(m.code), `the embedded code box is not visible. ${where}`).toBe(true);
  expect(m.code.right, `the embedded code box runs past the editor pane. ${where}`).toBeLessThanOrEqual(m.pane.right + 1);
  expect(m.code.w, `the embedded code box is wider than the editor pane. ${where}`).toBeLessThanOrEqual(m.pane.w + 1);
  expect(m.code.h, `the embedded code box was stretched to ${m.code.h}px. ${where}`).toBeLessThan(m.viewport[1] * 0.45);
  expect(m.codeInlineStyle, `a style was written on the embedded code box. ${where}`).toBe('');
  expect(m.cmInlineStyle, `a size was written inside the embedded code box. ${where}`).not.toMatch(/height|width/);
  expect(m.cmEditor.w, `the code area is wider than its box. ${where}`).toBeLessThanOrEqual(m.code.w + 1);
  expect(m.codeFramed, `the embedded code box got the Nostrodomus frame. ${where}`).toBe(false);
  expect(m.codeStyled, `the embedded code box got the Nostrodomus codebox style. ${where}`).toBe(false);
  expect(m.codeOurSheets, `Nostrodomus put a style sheet into the embedded code box. ${where}`).toEqual([]);
  expect(m.codeOurAttributes, `Nostrodomus wrote an attribute on the embedded code box. ${where}`).toEqual([]);
  expect(m.codeEntitySuggestions, `the entity suggestions the card turned on were switched off. ${where}`).toBe(true);
  expect(m.codeIconSuggestions, `the icon suggestions the card turned on were switched off. ${where}`).toBe(true);
}

async function workInTheEditor(page, cardType) {
  const editor = page.locator(`${HUI_DIALOG_EDIT_CARD} ${cardType}-editor`).first();
  await editor.locator('#name').fill('Living room');
  await editor.locator('#show-state').check();
  await editor.locator('#add').click();
  await editor.locator('#add').click();
  await page.waitForTimeout(600);
  let m = await measure(page, cardType);
  expect(m.nameValue).toBe('Living room');
  expect(m.count, 'the button ran twice').toBe('2');

  // Typing in the embedded code box reaches the card's editor, and no Nostrodomus list opens.
  await editor.locator(`#styles ${CM_CONTENT}`).click();
  await page.keyboard.type('color: red', { delay: 30 });
  await page.waitForTimeout(1500);
  expect(await popup(page).isVisible(), 'the Nostrodomus suggestion list opened in the card\'s code box').toBe(false);
  m = await measure(page, cardType);
  expect(m.codeChanges, 'the embedded code box reported its changes to the card editor').toBeGreaterThan(0);
  const typed = await editor.locator(`#styles ${CM_CONTENT}`).innerText();
  expect(typed).toContain('color: red');
  return m;
}

async function expectChangesInYaml(page) {
  await page.getByRole('button', { name: /show code editor/i }).first().click();
  const yaml = page.locator(`${HUI_DIALOG_EDIT_CARD} ha-yaml-editor ${CM_CONTENT}`).first();
  await yaml.waitFor({ state: 'visible', timeout: 15000 });
  await expect(yaml).toContainText('name: Living room');
  await expect(yaml).toContainText('show_state: true');
  await expect(yaml).toContainText('sub_buttons: 2');
  await expect(yaml).toContainText('color: red');
}

for (const [label, cardType] of EDITORS) {
  test(`custom card visual editor ${label}: its controls, its note and its embedded code box are left as the card built them`, async ({ page }, testInfo) => {
    await openFixtureVisualEditor(page, cardType);
    const m = await measure(page, cardType);
    await testInfo.attach('visual-editor.json', { body: JSON.stringify(m, null, 2), contentType: 'application/json' });
    console.log(`[custom-card-editor ${cardType}]`, JSON.stringify(m));
    const where = JSON.stringify(m);

    expect(m.hasEditor, 'the card\'s own editor is shown').toBe(true);
    expect(m.ownRoot, 'the editor draws where this variant says it does').toBe(cardType === 'e2e-embedded-card');
    for (const [name, b] of [['name field', m.name], ['toggle', m.toggle], ['button', m.button], ['expandable section', m.panel]]) {
      expect(visible(b), `the ${name} is not visible. ${where}`).toBe(true);
    }
    expect(m.nameValue, 'the name field shows the configured value').toBe('Kitchen');
    expectNoteAsBuilt(m, 'after opening');
    expectCodeBoxAsBuilt(m, 'after opening');

    // Home Assistant's own controls around the editor are still there.
    expect(m.showCodeButton, 'the Show code editor button is shown').toBe(true);
    expect(visible(m.footer), 'the Save and Cancel row is shown').toBe(true);
    expect(visible(m.preview), 'the preview is shown').toBe(true);
  });

  test(`custom card visual editor ${label}: the controls and the embedded code box still work`, async ({ page }) => {
    await openFixtureVisualEditor(page, cardType);
    const before = await measure(page, cardType);
    const m = await workInTheEditor(page, cardType);
    console.log(`[custom-card-editor ${cardType} after typing]`, JSON.stringify({ code: m.code, codeFramed: m.codeFramed, codeStyled: m.codeStyled, codeOurSheets: m.codeOurSheets, note: m.note, pane: m.pane }));

    // Working in the embedded code box did not change the editor around it.
    expectNoteAsBuilt(m, 'after typing in the embedded code box');
    expectCodeBoxAsBuilt(m, 'after typing in the embedded code box');
    expect(m.pane.w, 'the editor pane kept its width').toBe(before.pane.w);
    expect(Math.abs(m.code.w - before.code.w), 'the embedded code box kept its width').toBeLessThanOrEqual(1);

    // The changes made with the controls are in the card's configuration.
    await expectChangesInYaml(page);

    // Back in the code editor the dialog is laid out for the codebox again: the pane no longer
    // scrolls on its own (its glow needs the room) and the dialog surface is unclipped.
    await expect
      .poll(() => page.evaluate(() => {
        const all = (sel, root = document, out = []) => { root.querySelectorAll(sel).forEach((e) => out.push(e)); root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) all(sel, e.shadowRoot, out); }); return out; };
        const root = all('hui-dialog-edit-card')[0].shadowRoot;
        const dialog = all('dialog', root)[0];
        return {
          paneScrollSheet: !!root.querySelector('style[id$="visual-editor-scroll"]'),
          dialogUnclipped: dialog.hasAttribute('data-nostrodomus-codebox-unclip'),
          paneOverflow: getComputedStyle(all('.element-editor', root)[0]).overflowY,
        };
      }), { timeout: 15000 })
      .toEqual({ paneScrollSheet: false, dialogUnclipped: true, paneOverflow: 'visible' });
  });

  test(`custom card visual editor ${label}: "Hide editor warnings" leaves the card's own note`, async ({ page }) => {
    // The setting is in place before the visual editor is shown, as it is for someone who turned
    // it on in Settings earlier. It is changed in memory only, so it ends with this page.
    await openFixtureVisualEditor(page, cardType, {
      beforeVisualEditor: () => page.evaluate(() => { window.__nostrodomus.state.settings.style.hideEditorWarnings = true; }),
    });
    // The hide sheet is in the dialog, so the setting is in effect for Home Assistant's warnings.
    await expect
      .poll(async () => (await measure(page, cardType)).hideSheets, { timeout: 15000, message: 'the hide sheet never reached the dialog' })
      .toBeGreaterThan(0);
    await page.waitForTimeout(600);
    const m = await measure(page, cardType);
    console.log(`[custom-card-editor ${cardType} hide on]`, JSON.stringify({ hideSheets: m.hideSheets, note: m.note }));
    expectNoteAsBuilt(m, 'with Hide editor warnings on');
  });

  // The usual way in: the card is on the dashboard and its Edit button opens the visual editor
  // first. Nostrodomus has nothing to do in that dialog until the code editor is shown.
  test(`custom card visual editor ${label}: a saved card opens with the dialog as Home Assistant drew it, and working in its code box keeps it so`, async ({ page }) => {
    await page.addInitScript(defineFixtureCards);
    const stamp = await openDashboard(page);
    const urlPath = stamp.dashboardPath.split('/').filter(Boolean)[0];
    const callWs = (message) => page.evaluate((msg) => document.querySelector('home-assistant').hass.callWS(msg), message);
    const original = await callWs({ type: 'lovelace/config', url_path: urlPath, force: false });
    const withCard = JSON.parse(JSON.stringify(original));
    withCard.views[0].cards = [...(withCard.views[0].cards || []), { type: `custom:${cardType}`, name: 'Kitchen', styles: '' }];
    try {
      await callWs({ type: 'lovelace/config/save', url_path: urlPath, config: withCard });
      await openSeededCardCodeEditor(page, stamp, { cardSelector: cardType, cardText: 'Fixture card', visualOnly: true });
      await page.locator(`${HUI_DIALOG_EDIT_CARD} ${cardType}-editor`).first().waitFor({ state: 'attached', timeout: 15000 });
      await page.waitForTimeout(3000);

      const before = await measure(page, cardType);
      console.log(`[custom-card-editor ${cardType} saved card, before]`, JSON.stringify({ dialog: before.dialog, sheets: before.ourDialogSheets, blur: before.dialogBlur }));
      expect(before.ourDialogSheets, 'Nostrodomus styled a dialog that only shows a card\'s visual editor').toEqual([]);
      expectNoteAsBuilt(before, 'saved card, after opening');
      expectCodeBoxAsBuilt(before, 'saved card, after opening');

      const after = await workInTheEditor(page, cardType);
      console.log(`[custom-card-editor ${cardType} saved card, after]`, JSON.stringify({ dialog: after.dialog, sheets: after.ourDialogSheets, blur: after.dialogBlur, codeFramed: after.codeFramed }));
      expect(after.ourDialogSheets, 'working in the card\'s code box made Nostrodomus style the dialog').toEqual([]);
      expect(after.dialog.w, 'the dialog changed width').toBe(before.dialog.w);
      expect(after.dialog.left, 'the dialog moved').toBe(before.dialog.left);
      expect(after.dialogBlur, 'the dialog look changed').toBe(before.dialogBlur);
      expectNoteAsBuilt(after, 'saved card, after working in the code box');
      expectCodeBoxAsBuilt(after, 'saved card, after working in the code box');

      // Showing the code editor is where Nostrodomus starts: the dialog is enlarged for it.
      await expectChangesInYaml(page);
      await expect
        .poll(async () => (await measure(page, cardType)).dialog.w, { timeout: 15000, message: 'the dialog was not enlarged for the code editor' })
        .toBeGreaterThan(before.dialog.w);
    } finally {
      await callWs({ type: 'lovelace/config/save', url_path: urlPath, config: original }).catch(() => {});
    }
  });
}

// A custom card editor with far more controls than fit in the dialog (Bubble Card's is like
// that). Once the code editor has been shown, the dialog has the size and layout Nostrodomus
// gives it; the card's editor must still scroll, so that its last control can be reached.
for (const [width, height] of [[1280, 720], [1920, 1080], [900, 800]]) {
  test(`custom card visual editor, taller than the dialog, at ${width}x${height}: every control can be reached after the code editor was shown`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openFixtureVisualEditor(page, 'e2e-tall-card');
    const editor = page.locator(`${HUI_DIALOG_EDIT_CARD} e2e-tall-card-editor`).first();
    const facts = () => editor.evaluate((el) => {
      const r = (node) => { const b = node.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
      const footer = (() => {
        const all = [];
        const walk = (root) => { root.querySelectorAll('*').forEach((n) => { if (n.localName === 'ha-dialog-footer') all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); };
        walk(document);
        return all.find((f) => f.getBoundingClientRect().height > 0) || null;
      })();
      return { viewport: [window.innerWidth, window.innerHeight], editor: r(el), last: r(el.shadowRoot.querySelector('#last')), name: r(el.shadowRoot.querySelector('#name')), footer: footer ? r(footer) : null };
    });

    const start = await facts();
    console.log(`[custom-card-editor tall ${width}x${height} start]`, JSON.stringify(start));
    expect(start.editor.h, 'the test editor is taller than the window').toBeGreaterThan(height);

    // The last control: scrolled to, in view above the Save row, and it works.
    const last = editor.locator('#last');
    await last.scrollIntoViewIfNeeded({ timeout: 10000 });
    const atEnd = await facts();
    console.log(`[custom-card-editor tall ${width}x${height} at the end]`, JSON.stringify(atEnd));
    expect(atEnd.last.bottom, `the last control is below the window. ${JSON.stringify(atEnd)}`).toBeLessThanOrEqual(height);
    expect(atEnd.last.top, `the last control is above the window. ${JSON.stringify(atEnd)}`).toBeGreaterThanOrEqual(0);
    await last.click({ timeout: 10000 });
    await expect(editor.locator('#last-count')).toHaveText('1');
    // The Save and Cancel row is in the window, or the dialog scrolls to it (stacked layout).
    await page.getByRole('button', { name: /^save$/i }).first().scrollIntoViewIfNeeded({ timeout: 10000 });
    const withSave = await facts();
    console.log(`[custom-card-editor tall ${width}x${height} save row]`, JSON.stringify(withSave.footer));
    expect(withSave.footer.bottom, `the Save row is below the window. ${JSON.stringify(withSave)}`).toBeLessThanOrEqual(height + 1);

    // And back to the first one.
    const name = editor.locator('#name');
    await name.scrollIntoViewIfNeeded({ timeout: 10000 });
    await name.fill('Top');
    await expect(name).toHaveValue('Top');
  });
}

// The window is narrowed below the stacking width while the visual editor is shown (a snapped
// browser window, a rotated tablet), after the code editor had been shown in the wide layout.
test('custom card visual editor, taller than the dialog: the window is narrowed while it is shown, and the last control and the Save row can still be reached', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFixtureVisualEditor(page, 'e2e-tall-card');
  await page.setViewportSize({ width: 900, height: 800 });
  await page.waitForTimeout(1200);
  const editor = page.locator(`${HUI_DIALOG_EDIT_CARD} e2e-tall-card-editor`).first();
  const last = editor.locator('#last');
  await last.scrollIntoViewIfNeeded({ timeout: 10000 });
  await last.click({ timeout: 10000 });
  await expect(editor.locator('#last-count')).toHaveText('1');
  const save = page.getByRole('button', { name: /^save$/i }).first();
  await save.scrollIntoViewIfNeeded({ timeout: 10000 });
  const box = await save.boundingBox();
  console.log('[custom-card-editor tall narrowed save button]', JSON.stringify(box));
  expect(box.y + box.height, `the Save button is below the window: ${JSON.stringify(box)}`).toBeLessThanOrEqual(800);
  expect(box.y, 'the Save button is above the window').toBeGreaterThanOrEqual(0);
});
