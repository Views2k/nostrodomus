// Shared editor choreography for the specs: enter dashboard edit mode,
// open the real card edit dialog on the seeded entities card, switch to the
// YAML code editor, and drive the Nostrodomus completion popup. The real-DOM timing
// here was measured on a running instance. Keep every wait an
// explicit HA-ready signal, never a sleep (the suite runs with retries: 0).

import { expect } from '@playwright/test';
import {
  CM_CONTENT,
  EDIT_MODE_CARD_WRAPPERS,
  HA_CODE_EDITOR,
  HUI_DIALOG_EDIT_CARD,
  HUI_ENTITIES_CARD,
  NOSTRODOMUS_POPUP,
  NOSTRODOMUS_POPUP_ROW,
} from './selectors.mjs';

/**
 * The seeded entities card's own "Edit" button. In 2026.6 edit mode every
 * card renders a visible per-card Edit button (clicking the card body does
 * NOT open the editor), so the button
 * must be scoped to THIS card's wrapper: the page shows one per card.
 * Structural scoping first (wrapper candidates), geometric fallback (the
 * button sits directly under the card; :below() sorts by distance).
 */
async function cardEditButton(page, cardSelector = HUI_ENTITIES_CARD, cardText = 'E2E Demo Entities') {
  const card = page.locator(cardSelector).filter({ hasText: cardText });
  for (const wrapper of EDIT_MODE_CARD_WRAPPERS) {
    const scoped = page.locator(wrapper).filter({ has: card });
    const button = scoped.getByRole('button', { name: 'Edit', exact: true });
    if ((await button.count()) > 0) return button.first();
  }
  const below = page
    .locator(`button:below(${cardSelector}, 240)`)
    .and(page.getByRole('button', { name: 'Edit', exact: true }));
  if ((await below.count()) > 0) return below.first();
  throw new Error(
    `no Edit button found for the seeded card [${cardSelector} / "${cardText}"] — tried wrappers [${EDIT_MODE_CARD_WRAPPERS.join(', ')}] and the geometric fallback; HA may have changed edit-mode DOM again.`,
  );
}

/**
 * From the already-guarded seeded dashboard (openDashboard ran), reload into
 * edit mode (`?edit=1` is HA's own edit-mode URL state), open the seeded
 * card's editor via its per-card Edit button (entities card by default; pass
 * { cardSelector, cardText } for another seeded card), and switch the edit
 * dialog to the YAML code editor. Returns the dialog and the CodeMirror
 * content locator, focused, with the cursor at the end of the document.
 */
export async function openSeededCardCodeEditor(page, stamp, { cardSelector = HUI_ENTITIES_CARD, cardText = 'E2E Demo Entities', skipEditorClick = false, visualOnly = false } = {}) {
  await page.goto(`${stamp.dashboardPath}?edit=1`);

  const card = page.locator(cardSelector).filter({ hasText: cardText }).first();
  await card.waitFor({ state: 'visible', timeout: 30000 });
  const editButton = await cardEditButton(page, cardSelector, cardText);
  await editButton.click();

  // The dialog name can change between HA versions. On timeout, enumerate dialog-like elements so
  // a rename is diagnosable from the failure message alone.
  const dialog = page.locator(HUI_DIALOG_EDIT_CARD);
  try {
    await dialog.waitFor({ state: 'attached', timeout: 15000 });
  } catch (error) {
    const candidates = await page.evaluate(() => {
      const names = new Set();
      const walk = (root) => {
        for (const el of root.querySelectorAll('*')) {
          const tag = el.tagName.toLowerCase();
          if (tag.includes('dialog')) names.add(tag);
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(document);
      return [...names].sort();
    });
    throw new Error(
      `hui-dialog-edit-card never attached after clicking the card's Edit button — 2026.6 may have renamed it. Dialog-like elements present: [${candidates.join(', ') || 'none'}]`,
      { cause: error },
    );
  }

  // visualOnly: stay in the VISUAL editor (do NOT switch to YAML). For cards whose visual
  // editor embeds a CodeMirror form field (a markdown template selector, condition/action
  // editors): the companion-form-field-guard spec asserts that field is not the codebox.
  if (visualOnly) {
    await armDialogLifecycleRecorder(page);
    await expectDialogAlive(page, 'after opening the card in its visual editor');
    return { dialog, yaml: null };
  }

  // The dialog opens in the visual editor by default; switch to YAML. If HA
  // remembered a previous YAML-mode choice the button is absent and the
  // code editor is already there.
  const codeEditor = dialog.locator(HA_CODE_EDITOR);
  const showCode = dialog.getByRole('button', { name: /code editor/i });
  if ((await codeEditor.count()) === 0 || !(await codeEditor.first().isVisible())) {
    await showCode.first().click();
  }
  // Arm the dialog lifecycle recorder. The dialog can VANISH mid-test in an
  // automated run (present at attach, absent from the whole DOM at failure
  // time). Every input event and the exact removal moment are timestamped so
  // the killing step or timer names itself in the failure.
  await armDialogLifecycleRecorder(page);

  const yaml = dialog.locator(`${HA_CODE_EDITOR} ${CM_CONTENT}`).first();
  await yaml.waitFor({ state: 'visible', timeout: 15000 });
  await expectDialogAlive(page, 'after switching to the code editor');

  // skipEditorClick: leave the codebox UN-focused/UN-clicked. The apply-on-open spec
  // needs this — any click (even outside the codebox) re-triggers companion discovery,
  // so to prove the companion applies on DIALOG SETTLE rather than on a codebox click,
  // the test must never click into the editor.
  if (!skipEditorClick) {
    // Focus and park the cursor at the end of the document.
    await yaml.click();
    await page.keyboard.press('ControlOrMeta+End');
    await expectDialogAlive(page, 'after focusing the editor and pressing Ctrl+End');
  }
  return { dialog, yaml };
}

async function armDialogLifecycleRecorder(page) {
  await page.evaluate(() => {
    if (window.__e2eDialogLog) return;
    const log = [];
    window.__e2eDialogLog = log;
    const stamp = (type, detail) => log.push({ at: Date.now(), type, detail: String(detail ?? '') });
    for (const type of ['keydown', 'mousedown', 'mouseup', 'click']) {
      document.addEventListener(
        type,
        (ev) => stamp(type, ev.key || ev.composedPath?.()[0]?.tagName?.toLowerCase?.() || ''),
        { capture: true, passive: true },
      );
    }
    window.addEventListener('dialog-closed', (ev) => stamp('ha-dialog-closed-event', ev?.detail?.dialog), { capture: true });
    window.addEventListener('popstate', () => stamp('popstate', window.location.href), { capture: true });

    const deepFind = (root, depth = 0) => {
      if (!root || depth > 25) return null;
      const direct = root.querySelector?.('hui-dialog-edit-card');
      if (direct) return direct;
      for (const el of root.querySelectorAll?.('*') || []) {
        if (el.shadowRoot) {
          const hit = deepFind(el.shadowRoot, depth + 1);
          if (hit) return hit;
        }
      }
      return null;
    };
    const dialog = deepFind(document);
    if (!dialog) {
      stamp('recorder-found-no-dialog', '');
      return;
    }
    const parent = dialog.parentNode;
    stamp('recorder-armed', `${dialog.tagName.toLowerCase()} in ${parent?.host ? `#shadow-root of ${parent.host.tagName.toLowerCase()}` : parent?.nodeName || 'unknown'}`);
    if (!parent) return;
    const observer = new MutationObserver(() => {
      if (!parent.contains(dialog)) {
        stamp('dialog-REMOVED-from-dom', '');
        observer.disconnect();
      }
    });
    observer.observe(parent, { childList: true });
  });
}

/** Read the lifecycle log (null if the recorder never armed or the page died). */
async function dialogLifecycleLog(page) {
  try {
    return await page.evaluate(() => window.__e2eDialogLog || null);
  } catch {
    return null;
  }
}

/**
 * Step-level liveness assertion: the 2026.6 vanish investigation hinges on
 * which step kills the dialog, so every spec names its steps. Cheap (one
 * shadow-piercing count), loud (dumps the lifecycle log on death).
 */
export async function expectDialogAlive(page, step) {
  const alive = (await page.locator(HUI_DIALOG_EDIT_CARD).count()) > 0;
  if (!alive) {
    const log = await dialogLifecycleLog(page);
    throw new Error(
      `the edit dialog VANISHED ${step}.\ndialog lifecycle log: ${JSON.stringify(log, null, 2)}`,
    );
  }
}

/** The completion popup, wherever it is mounted (locators pierce shadow DOM). */
export function popup(page) {
  return page.locator(NOSTRODOMUS_POPUP);
}

/**
 * The completion-gate probe: when the popup fails to appear, this DOM map of
 * the dialog anatomy (which surface shapes exist where) plus the runtime
 * handle state is the diagnosis — it distinguishes engine-gate failures
 * (dialog finder misses the open dialog) from popup-mount failures (gate
 * open, popup absent) in the failure message itself.
 */
async function completionGateDiagnosis(page) {
  try {
    return await page.evaluate(() => {
      const api = window.__nostrodomus;
      const hr = document.querySelector('home-assistant')?.shadowRoot;
      const legacyDialogs = hr ? [...hr.querySelectorAll('hui-dialog-edit-card')] : [];

      // Diagnostics-only deep walk (never in runtime hotpaths): find the
      // dialog wherever it actually mounts and report its ancestor chain so
      // a mount-point move names itself in the failure message.
      const deepFind = (root, depth = 0) => {
        if (!root || depth > 25) return null;
        const direct = root.querySelector?.('hui-dialog-edit-card');
        if (direct) return direct;
        for (const el of root.querySelectorAll?.('*') || []) {
          if (el.shadowRoot) {
            const hit = deepFind(el.shadowRoot, depth + 1);
            if (hit) return hit;
          }
        }
        return null;
      };
      const dialog = deepFind(document);
      const ancestorChain = [];
      let node = dialog;
      while (node && ancestorChain.length < 20) {
        ancestorChain.push(node.tagName ? node.tagName.toLowerCase() : String(node.nodeName || 'node'));
        if (node.parentElement) {
          node = node.parentElement;
        } else {
          const root = node.getRootNode?.();
          if (root?.host) {
            ancestorChain.push('#shadow-root');
            node = root.host;
          } else {
            node = null;
          }
        }
      }

      const shape = (d) => {
        const root = d?.shadowRoot;
        const haDialog = root?.querySelector('ha-dialog');
        return {
          hasContent: !!root?.querySelector('.content'),
          hasHaDialog: !!haDialog,
          haDialogShadowChildren: haDialog?.shadowRoot
            ? [...haDialog.shadowRoot.children].map(
                (child) => child.tagName.toLowerCase() + (child.className ? `.${String(child.className).trim().split(/\s+/).join('.')}` : ''),
              )
            : null,
          shadowTopLevelTags: root ? [...root.children].map((child) => child.tagName.toLowerCase()) : null,
        };
      };

      // Runtime self-report: health() distinguishes a DOM-detected editor
      // from a bound CodeMirror VIEW (looksLikeView(state.view)) and reports
      // edit-dialog/scoping — the decisive split when the dialog is found but
      // typing does nothing.
      let healthChecks = null;
      let viewBound = null;
      try {
        const h = typeof api?.health === 'function' ? api.health() : null;
        if (h?.checks) {
          healthChecks = {};
          for (const c of h.checks) healthChecks[c.name] = c.ok;
        }
        viewBound = api?.state?.view ? true : false;
      } catch (e) {
        healthChecks = { probeError: String(e) };
      }

      // Deep-pierce view-extraction probe. The runtime extracts the view from
      // the keydown's composedPath, which crosses every shadow, so viewBound can
      // be true while a structured ha-dialog → wa-dialog → querySelector probe
      // finds nothing in the wa-dialog layer. This walks ALL shadow roots
      // to locate ha-code-editor / .cm-editor wherever 2026.6 puts it, and
      // reads viewFromEvent's candidate properties on each.
      const looksLikeView = (v) =>
        !!v && typeof v === 'object' && !!v.state && typeof v.dispatch === 'function' && !!v.dom && typeof v.coordsAtPos === 'function';
      const deepQueryAll = (selector, max = 30) => {
        const out = [];
        const walk = (root, depth = 0) => {
          if (!root || depth > 30 || out.length >= max) return;
          for (const el of root.querySelectorAll?.(selector) || []) out.push(el);
          for (const el of root.querySelectorAll?.('*') || []) {
            if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
          }
        };
        walk(document);
        return out;
      };
      const viewProps = (el) =>
        el
          ? {
              tag: el.tagName.toLowerCase(),
              codemirror: looksLikeView(el.codemirror),
              _codeEditorCodemirror: looksLikeView(el._codeEditor?.codemirror),
              cmTileView: looksLikeView(el.cmTile?.view),
              view: looksLikeView(el.view),
              cmView: looksLikeView(el.cmView),
              editorView: looksLikeView(el.editorView),
              viewKeyHits: Object.keys(el).filter((k) => /codemirror|view|editor|cm/i.test(k)).slice(0, 25),
            }
          : null;
      const haCodeEditors = deepQueryAll('ha-code-editor');
      const cmEditors = deepQueryAll('.cm-editor');
      const viewExtraction = {
        haCodeEditorCount: haCodeEditors.length,
        haCodeEditorProps: haCodeEditors.slice(0, 3).map(viewProps),
        cmEditorCount: cmEditors.length,
        cmEditorProps: cmEditors.slice(0, 3).map(viewProps),
      };

      // Reconcile the bound view: is state.view connected and inside the
      // active dialog? A stale/detached bound view would explain viewBound
      // true yet no working completion.
      const boundView = api?.state?.view || null;
      const boundViewReport = boundView
        ? {
            looksLikeView: looksLikeView(boundView),
            domConnected: !!boundView.dom?.isConnected,
            domInDialog: !!(dialog && boundView.dom && dialog.contains?.(boundView.dom)),
            docLength: boundView.state?.doc?.length ?? null,
          }
        : null;

      // debugSnapshot is the compute oracle: did typing produce a context
      // (prefix/yamlRole), did shouldSuggest fire, were any items produced,
      // and was there an error? Empty context after typing = the dispatch
      // hook never fired (afterDispatch → compute never ran), which would
      // ALSO explain runtime-hass false (runtimeData/runtimeCache only fill
      // during compute).
      let debug = null;
      try {
        debug = typeof api?.debugSnapshot === 'function' ? api.debugSnapshot() : null;
      } catch (e) {
        debug = { error: String(e) };
      }
      const computeOracle = debug
        ? {
            prefix: debug.prefix,
            yamlRole: debug.yamlRole,
            currentLine: debug.currentLine,
            shouldSuggest: debug.shouldSuggest,
            idleReason: debug.idleReason,
            providers: debug.providers,
            topSuggestionCount: Array.isArray(debug.topSuggestions) ? debug.topSuggestions.length : null,
            topSuggestions: Array.isArray(debug.topSuggestions) ? debug.topSuggestions.slice(0, 5).map((s) => s.label) : null,
            lastError: debug.lastError,
          }
        : null;

      // hass discovery (replicates findHass): which element, if any, carries
      // a usable hass — answers runtime-hass while we are here.
      const hasHass = (el) => !!(el?.hass?.states || el?.hass?.services);
      const ha = document.querySelector('home-assistant');
      const hassDiscovery = {
        windowHass: hasHass(window),
        homeAssistantHass: hasHass(ha),
        homeAssistantHasHassObject: !!ha?.hass,
        hassHasCallWS: typeof ha?.hass?.callWS === 'function',
        hassStateKeys: ha?.hass ? Object.keys(ha.hass).filter((k) => /state|service|connection|config/i.test(k)).slice(0, 12) : null,
      };

      return {
        installed: api?.installed === true,
        version: String(api?.version || 'absent'),
        legacyRootDialogCount: legacyDialogs.length,
        dialogFoundDeep: !!dialog,
        dialogAncestorChain: ancestorChain,
        dialogShape: dialog ? shape(dialog) : null,
        healthChecks,
        viewBound,
        boundViewReport,
        viewExtraction,
        computeOracle,
        hassDiscovery,
        dialogLifecycleLog: window.__e2eDialogLog || null,
      };
    });
  } catch (error) {
    return { probeFailed: String(error) };
  }
}

/** Wait until the popup is visible and has at least one suggestion row. */
export async function expectPopupWithSuggestions(page, message) {
  const box = popup(page);
  try {
    await expect(box, message).toBeVisible({ timeout: 10000 });
    await expect
      .poll(() => box.locator(NOSTRODOMUS_POPUP_ROW).count(), {
        timeout: 10000,
        message: `${message} — popup is visible but rendered no suggestion rows`,
      })
      .toBeGreaterThan(0);
  } catch (error) {
    const diagnosis = await completionGateDiagnosis(page);
    throw new Error(`${message}\ncompletion-gate diagnosis: ${JSON.stringify(diagnosis, null, 2)}`, { cause: error });
  }
  return box;
}

/** All suggestion row texts currently rendered in the popup. */
export async function popupRowTexts(page) {
  return popup(page).locator(NOSTRODOMUS_POPUP_ROW).allInnerTexts();
}

/**
 * Type text into the focused CodeMirror document key by key (CodeMirror needs
 * real key events for the completion keystroke path; fill() would bypass it).
 */
export async function typeInYaml(page, text) {
  await page.keyboard.type(text, { delay: 40 });
}
