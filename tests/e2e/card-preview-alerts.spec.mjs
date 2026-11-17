// card-preview-alerts.spec: what a card shows in the preview of the card editor dialog stays
// visible while Nostrodomus styles the dialog.
//
// Home Assistant renders the previewed card into hui-card's own light tree, which is part of the
// dialog's shadow root. The dialog stylesheet that Nostrodomus took over from the standalone editor
// layout script hid every ha-alert, [role="alert"], .warning and .error in that root, so a card
// that draws without a shadow root lost its own messages in the preview. This spec defines such a
// card in the page, previews it in the real dialog, and checks its messages, with "Hide editor
// warnings" off (the default) and on.

import { test, expect, openDashboard } from './session.mjs';
import { openSeededCardCodeEditor } from './editor-helpers.mjs';
import { CM_CONTENT, HA_CODE_EDITOR, HUI_DIALOG_EDIT_CARD } from './selectors.mjs';

const DIALOG_ROOT_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-dialog-root';

// Runs in the page. A card without a shadow root that shows an error line, an alert role line, a
// warning line and an ha-alert, as some cards do when an entity is missing.
function defineAlertCard() {
  if (customElements.get('e2e-alert-card')) return;
  customElements.define('e2e-alert-card', class extends HTMLElement {
    setConfig(config) {
      this._config = config;
      this.replaceChildren();
      const error = document.createElement('div');
      error.className = 'error';
      error.id = 'e2e-preview-error';
      error.textContent = 'Entity not available: sensor.e2e_missing';
      const role = document.createElement('div');
      role.setAttribute('role', 'alert');
      role.id = 'e2e-preview-role-alert';
      role.textContent = 'Connection lost';
      const warning = document.createElement('div');
      warning.className = 'warning';
      warning.id = 'e2e-preview-warning';
      warning.textContent = 'Battery low';
      const alert = document.createElement('ha-alert');
      alert.id = 'e2e-preview-ha-alert';
      alert.setAttribute('alert-type', 'warning');
      alert.textContent = 'Card note';
      this.append(error, role, warning, alert);
      this.style.display = 'block';
      this.style.padding = '16px';
    }
    set hass(_hass) { /* nothing to show */ }
    getCardSize() { return 2; }
  });
}

function measurePreview(styleId) {
  const deepAll = (sel, root = document, out = []) => {
    try { root.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* closed root */ }
    try { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(sel, e.shadowRoot, out); }); } catch { /* closed root */ }
    return out;
  };
  const dialogRoot = deepAll('hui-dialog-edit-card')[0]?.shadowRoot || null;
  if (!dialogRoot) return { dialog: false };
  const box = (id) => {
    const el = dialogRoot.getElementById ? dialogRoot.getElementById(id) : dialogRoot.querySelector(`#${id}`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, inPreview: !!el.closest('.element-preview') };
  };
  const sheet = dialogRoot.querySelector(`#${styleId}`);
  return {
    dialog: true,
    dialogSheet: !!sheet,
    dialogSheetHidesAlerts: sheet ? /ha-alert|\[role="alert"\]|\.error\b|\.warning\b/.test(sheet.textContent || '') : null,
    error: box('e2e-preview-error'),
    role: box('e2e-preview-role-alert'),
    warning: box('e2e-preview-warning'),
    haAlert: box('e2e-preview-ha-alert'),
  };
}

const shown = (b) => !!b && b.inPreview && b.w > 0 && b.h > 0 && b.display !== 'none' && b.visibility !== 'hidden' && Number(b.opacity) > 0;

for (const hideWarnings of [false, true]) {
  test(`card-preview-alerts: a card's own messages stay visible in the preview (Hide editor warnings ${hideWarnings ? 'on' : 'off'})`, async ({ page }) => {
    const stamp = await openDashboard(page);
    await openSeededCardCodeEditor(page, stamp);
    await page.evaluate(defineAlertCard);
    if (hideWarnings) {
      await page.evaluate(() => { window.__nostrodomus.state.settings.style.hideEditorWarnings = true; });
    }
    const content = page.locator(`${HUI_DIALOG_EDIT_CARD} ${HA_CODE_EDITOR} ${CM_CONTENT}`).first();
    await content.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('type: custom:e2e-alert-card\n');

    await expect
      .poll(async () => {
        const m = await page.evaluate(measurePreview, DIALOG_ROOT_STYLE_ID);
        return m.dialogSheet && !!m.error;
      }, { timeout: 15000, message: 'the styled dialog never showed the test card in its preview' })
      .toBe(true);
    await page.waitForTimeout(1500); // the settle passes of the dialog styling have run

    const m = await page.evaluate(measurePreview, DIALOG_ROOT_STYLE_ID);
    const where = JSON.stringify(m);
    expect(m.dialogSheet, `the dialog is not styled by Nostrodomus: ${where}`).toBe(true);
    expect(m.dialogSheetHidesAlerts, `the dialog sheet still hides alerts: ${where}`).toBe(false);
    expect(shown(m.error), `the card's .error line is hidden in the preview: ${where}`).toBe(true);
    expect(shown(m.role), `the card's role="alert" line is hidden in the preview: ${where}`).toBe(true);
    expect(shown(m.warning), `the card's .warning line is hidden in the preview: ${where}`).toBe(true);
    expect(shown(m.haAlert), `the card's ha-alert is hidden in the preview: ${where}`).toBe(true);
  });
}
