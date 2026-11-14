// ABSORB P2 — scrollbar module placement/injection unit tests (DOM stubs).
// (Byte-identity is asserted by the frozen scrollbar_css_byte_identity baseline;
// this covers placement: inject-once, first-injector-wins, teardown, dormant no-op,
// and the editor->dialog composed walk-up.)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createScrollbarStyleRuntime,
  CODEBOX_STYLE_ID,
  NO_WRAP_STYLE_ID,
  CONTENT_FIT_STYLE_ID,
  FULLSCREEN_HIDE_STYLE_ID,
  NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID,
  DIALOG_ROOT_STYLE_ID,
  PREVIEW_FILL_STYLE_ID,
  EDITOR_GUTTER_STYLE_ID,
  STACKED_PANES_STYLE_ID,
  WA_DIALOG_STYLE_ID,
  WARNING_HIDE_STYLE_ID,
} from '../../src/companion/scrollbarStyleRuntime.js';

function fakeRoot() {
  const root = {
    children: [],
    querySelector(sel) {
      const id = sel.startsWith('#') ? sel.slice(1) : sel;
      return root.children.find((c) => c.id === id) || null;
    },
    appendChild(el) {
      el._parent = root;
      root.children.push(el);
      return el;
    },
  };
  return root;
}

function fakeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        id: '',
        textContent: '',
        remove() {
          const p = this._parent;
          if (p) {
            const i = p.children.indexOf(this);
            if (i >= 0) p.children.splice(i, 1);
          }
        },
      };
    },
  };
}

function makeRuntime({ active = true, hideWarnings = false } = {}) {
  return createScrollbarStyleRuntime({
    documentRef: fakeDocument(),
    isActive: () => active,
    hideEditorWarnings: () => hideWarnings,
  });
}

// The dialog's main code editor sits inside ha-yaml-editor; the dialog-geometry sheets are for it only.
function yamlEditorIn(dialog) {
  return { matches: (s) => s === 'ha-yaml-editor', getRootNode: () => ({ host: dialog }) };
}

test('applyToRoots injects each provided stylesheet once per root when active', () => {
  const rt = makeRuntime({ active: true });
  const codeRoot = fakeRoot();
  const dialogRoot = fakeRoot();
  const waDialogRoot = fakeRoot();

  assert.equal(rt.applyToRoots({ codeRoot, dialogRoot, waDialogRoot }), true, 'first apply injects');
  // codeRoot (dialog-scoped) gets: frozen CODEBOX_CSS, the NO_WRAP override, the CONTENT_FIT refit (all
  // dialog-scoped), then the FULLSCREEN_HIDE + NATIVE_AUTOCOMPLETE_HIDE sheets (ungated). Order = injection
  // order = cascade order.
  assert.equal(codeRoot.children.length, 5);
  assert.equal(codeRoot.children[0].id, CODEBOX_STYLE_ID);
  assert.ok(codeRoot.children[0].textContent.includes('--nostrodomus-codebox-scrollbar-thumb'));
  assert.equal(codeRoot.children[1].id, NO_WRAP_STYLE_ID, 'no-wrap sheet injected after CODEBOX_CSS');
  assert.ok(codeRoot.children[1].textContent.includes('white-space: pre'));
  assert.equal(codeRoot.children[2].id, CONTENT_FIT_STYLE_ID, 'content-fit injected after no-wrap');
  assert.ok(codeRoot.children[2].textContent.includes('min(100%, calc(-18px + 54vw))'));
  assert.equal(codeRoot.children[3].id, FULLSCREEN_HIDE_STYLE_ID, 'fullscreen-hide injected (ungated)');
  assert.ok(codeRoot.children[3].textContent.includes('Enter fullscreen'));
  assert.equal(codeRoot.children[4].id, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID, 'native-autocomplete-hide injected (ungated)');
  assert.ok(codeRoot.children[4].textContent.includes('.cm-tooltip-autocomplete'));
  // dialogRoot gets the byte-frozen DIALOG_ROOT_CSS, then the additive preview-fill + editor-gutter sheets.
  assert.equal(dialogRoot.children.length, 4);
  assert.equal(dialogRoot.children[3].id, STACKED_PANES_STYLE_ID, 'stacked-panes sheet injected after editor-gutter');
  {
    // Everything in the stacked-panes sheet sits inside the narrow-window media query.
    const stackedCss = dialogRoot.children[3].textContent.trim();
    assert.ok(stackedCss.startsWith('@media (max-width: 999px) {') && stackedCss.endsWith('}'));
    assert.equal(stackedCss.split('@media').length, 2, 'one media block and nothing outside it');
    assert.ok(stackedCss.includes('.content .element-editor') && stackedCss.includes('.content .element-preview'));
  }
  assert.equal(dialogRoot.children[0].id, DIALOG_ROOT_STYLE_ID);
  assert.equal(dialogRoot.children[1].id, PREVIEW_FILL_STYLE_ID, 'preview-fill sheet injected after DIALOG_ROOT_CSS');
  assert.ok(dialogRoot.children[1].textContent.includes('hui-section'));
  // v0.1.199 — the preview card must CENTER (symmetric auto margins), never left-anchor. Guard the
  // emitted PREVIEW_FILL_CSS: both margin-left:auto AND margin-right:auto, and NO offset (no lone
  // right:/position:relative — that was the v0.1.197 nudge that broke centering).
  {
    const previewCss = dialogRoot.children[1].textContent;
    assert.ok(previewCss.includes('margin-left: auto'), 'preview card centers: has margin-left:auto');
    assert.ok(previewCss.includes('margin-right: auto'), 'preview card centers: has margin-right:auto');
    assert.ok(!/\bposition:\s*relative/.test(previewCss), 'no position:relative offset on the preview card');
    assert.ok(!/(^|[^-])right:\s/m.test(previewCss), 'no lone right: offset on the preview card (only margin-right allowed)');
  }
  assert.equal(dialogRoot.children[2].id, EDITOR_GUTTER_STYLE_ID, 'editor-gutter sheet injected after preview-fill');
  assert.ok(dialogRoot.children[2].textContent.includes('.element-editor.ha-scrollbar') && dialogRoot.children[2].textContent.includes('padding-right: 0'));
  assert.equal(waDialogRoot.children.length, 1);
  assert.equal(waDialogRoot.children[0].id, WA_DIALOG_STYLE_ID);
  assert.ok(waDialogRoot.children[0].textContent.includes('wa-dialog::part(dialog)'));

  // second apply is a no-op (ids already present) — never duplicates
  assert.equal(rt.applyToRoots({ codeRoot, dialogRoot, waDialogRoot }), false, 'second apply injects nothing');
  assert.equal(codeRoot.children.length, 5);
  assert.equal(dialogRoot.children.length, 4);
  assert.equal(waDialogRoot.children.length, 1);
});

test('first-injector-wins: an externally-owned id is left untouched', () => {
  const rt = makeRuntime({ active: true });
  const codeRoot = fakeRoot();
  // simulate an external companion having already injected the codebox style
  const external = { id: CODEBOX_STYLE_ID, textContent: 'EXTERNAL', _parent: codeRoot };
  codeRoot.children.push(external);

  // First-injector-wins keeps the external CODEBOX untouched; the additive sheets (different ids —
  // no-wrap, content-fit, fullscreen-hide, native-autocomplete-hide) are still injected, so applyToRoots
  // reports it injected.
  assert.equal(rt.applyToRoots({ codeRoot }), true, 'additive sheets injected; external codebox untouched');
  assert.equal(codeRoot.children.length, 5);
  assert.equal(codeRoot.children[0].textContent, 'EXTERNAL', 'external style preserved');
  assert.equal(codeRoot.children[1].id, NO_WRAP_STYLE_ID, 'no-wrap sheet added alongside the external codebox');
  assert.equal(codeRoot.children[2].id, CONTENT_FIT_STYLE_ID);
  assert.equal(codeRoot.children[3].id, FULLSCREEN_HIDE_STYLE_ID);
  assert.equal(codeRoot.children[4].id, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID);
});

test('teardown removes only the stylesheets this runtime created', () => {
  const rt = makeRuntime({ active: true });
  const codeRoot = fakeRoot();
  const dialogRoot = fakeRoot();
  const waDialogRoot = fakeRoot();
  rt.applyToRoots({ codeRoot, dialogRoot, waDialogRoot });
  assert.equal(codeRoot.children.length, 5);

  rt.teardown();
  assert.equal(codeRoot.children.length, 0, 'codebox + no-wrap + content-fit + fullscreen-hide + native-autocomplete-hide styles removed');
  assert.equal(dialogRoot.children.length, 0, 'dialog-root style removed');
  assert.equal(waDialogRoot.children.length, 0, 'wa-dialog style removed');
});

test('dormant: applyToRoots and applyForEditor are strict no-ops (no DOM write)', () => {
  const rt = makeRuntime({ active: false });
  const codeRoot = fakeRoot();
  const dialogRoot = fakeRoot();
  assert.equal(rt.applyToRoots({ codeRoot, dialogRoot }), false);
  assert.equal(codeRoot.children.length, 0);
  assert.equal(dialogRoot.children.length, 0);

  const editor = { shadowRoot: fakeRoot(), matches: () => false, getRootNode: () => ({ host: null }) };
  assert.equal(rt.applyForEditor(editor), false);
  assert.equal(editor.shadowRoot.children.length, 0);
});

test('applyForEditor derives codeRoot from the editor and dialogRoot via composed walk-up', () => {
  const rt = makeRuntime({ active: true });
  const dialog = { matches: (s) => s === 'hui-dialog-edit-card', shadowRoot: fakeRoot() };
  const editor = {
    shadowRoot: fakeRoot(),
    matches: () => false,
    getRootNode: () => ({ host: yamlEditorIn(dialog) }),
  };

  assert.equal(rt.applyForEditor(editor), true);
  assert.equal(editor.shadowRoot.children[0]?.id, CODEBOX_STYLE_ID, 'codebox injected into editor shadow root');
  assert.equal(dialog.shadowRoot.children[0]?.id, DIALOG_ROOT_STYLE_ID, 'dialog-root injected into the dialog shadow root');
  assert.equal(dialog.shadowRoot.children[1]?.id, PREVIEW_FILL_STYLE_ID, 'preview-fill injected after dialog-root');
  assert.equal(dialog.shadowRoot.children[2]?.id, EDITOR_GUTTER_STYLE_ID, 'editor-gutter injected after preview-fill');
  // Pre-2026.6 (no nested ha-dialog/wa-dialog): the wa-dialog sheet is NOT injected. The
  // fakeRoot has no querySelectorAll, so the nested-editor warning walk finds nothing — the
  // dialog shadow root carries only the dialog-root + preview-fill + editor-gutter sheets.
  assert.equal(dialog.shadowRoot.children[3]?.id, STACKED_PANES_STYLE_ID, 'stacked-panes injected after editor-gutter');
  assert.equal(dialog.shadowRoot.children.length, 4, 'no wa-dialog / warning sheet when there is no nested editor');
});

test('applyForEditor injects the wa-dialog sizing sheet into ha-dialog\'s shadow root (HA 2026.6)', () => {
  const rt = makeRuntime({ active: true });
  // 2026.6 chain: hui-dialog-edit-card(shadow) -> ha-dialog(shadow) -> wa-dialog.
  // (fakeRoot.querySelector matches by id, so the stubs use id = tag name.)
  const waDialog = { id: 'wa-dialog' };
  const haDialogShadow = fakeRoot();
  haDialogShadow.children.push(waDialog);
  const haDialog = { id: 'ha-dialog', shadowRoot: haDialogShadow };
  haDialogShadow.host = haDialog;
  const dialog = { matches: (s) => s === 'hui-dialog-edit-card', shadowRoot: fakeRoot() };
  dialog.shadowRoot.children.push(haDialog);
  const editor = { shadowRoot: fakeRoot(), matches: () => false, getRootNode: () => ({ host: yamlEditorIn(dialog) }) };

  assert.equal(rt.applyForEditor(editor), true);
  assert.equal(editor.shadowRoot.querySelector(`#${CODEBOX_STYLE_ID}`)?.id, CODEBOX_STYLE_ID, 'codebox in editor shadow root');
  assert.equal(dialog.shadowRoot.querySelector(`#${DIALOG_ROOT_STYLE_ID}`)?.id, DIALOG_ROOT_STYLE_ID, 'dialog-root in hui-dialog-edit-card shadow root');
  const waSheet = haDialogShadow.querySelector(`#${WA_DIALOG_STYLE_ID}`);
  assert.equal(waSheet?.id, WA_DIALOG_STYLE_ID, 'wa-dialog sheet injected into ha-dialog shadow root (the scope containing wa-dialog)');
  assert.ok(waSheet.textContent.includes('wa-dialog::part(dialog)'), 'targets ::part(dialog)');
  assert.ok(waSheet.textContent.includes('98vw') && waSheet.textContent.includes('94vh'), 'sized 98vw x 94vh');

  // teardown removes the wa-dialog sheet from the ha-dialog shadow root too.
  rt.teardown();
  assert.equal(haDialogShadow.querySelector(`#${WA_DIALOG_STYLE_ID}`), null, 'wa-dialog sheet removed on teardown');
});

// The "visual editor is not supported" notice AND real validation errors live inside the
// nested editor host's shadow root — beyond DIALOG_ROOT_CSS's reach (live [alert-map] proof).
// Build that nested host so the targeted walk can reach it. (fakeRoot only implements
// querySelector by id, so the dialog shadow gets a minimal querySelectorAll stub.)
function makeNestedDialogEditor() {
  const editorHostShadow = fakeRoot();
  const editorHost = { localName: 'hui-card-element-editor', shadowRoot: editorHostShadow };
  const dialogShadow = fakeRoot();
  dialogShadow.querySelectorAll = (sel) => (String(sel).includes('hui-card-element-editor') ? [editorHost] : []);
  const dialog = { matches: (s) => s === 'hui-dialog-edit-card', shadowRoot: dialogShadow };
  const editor = { shadowRoot: fakeRoot(), matches: () => false, getRootNode: () => ({ host: yamlEditorIn(dialog) }) };
  return { editor, dialogShadow, editorHostShadow };
}

test('hideEditorWarnings ON: warning-hide injected into nested editor shadow roots; preview-fill into dialog root', () => {
  const rt = makeRuntime({ active: true, hideWarnings: true });
  const { editor, dialogShadow, editorHostShadow } = makeNestedDialogEditor();

  assert.equal(rt.applyForEditor(editor), true);
  // dialog root always carries DIALOG_ROOT + PREVIEW_FILL (preview-fill is NOT gated)
  assert.equal(dialogShadow.querySelector(`#${DIALOG_ROOT_STYLE_ID}`)?.id, DIALOG_ROOT_STYLE_ID);
  const fill = dialogShadow.querySelector(`#${PREVIEW_FILL_STYLE_ID}`);
  assert.equal(fill?.id, PREVIEW_FILL_STYLE_ID, 'preview-fill injected into dialog root');
  assert.ok(fill.textContent.includes('hui-section') && fill.textContent.includes('hui-grid-section'), 'covers both section types');
  assert.ok(fill.textContent.includes('zoom: 1.5'), 'preview enlarged ~50%');
  // the NESTED editor host shadow root carries the warning-hide sheet (toggle ON)
  const warn = editorHostShadow.querySelector(`#${WARNING_HIDE_STYLE_ID}`);
  assert.equal(warn?.id, WARNING_HIDE_STYLE_ID, 'warning-hide injected into the nested editor shadow root');
  assert.ok(warn.textContent.includes('ha-alert') && warn.textContent.includes('display: none'));

  rt.teardown();
  assert.equal(editorHostShadow.querySelector(`#${WARNING_HIDE_STYLE_ID}`), null, 'warning-hide removed on teardown');
});

test('hideEditorWarnings OFF (default): preview-fill injected, but NO warning-hide (warnings stay visible)', () => {
  const rt = makeRuntime({ active: true, hideWarnings: false });
  const { editor, dialogShadow, editorHostShadow } = makeNestedDialogEditor();

  assert.equal(rt.applyForEditor(editor), true, 'preview-fill / codebox still applied');
  assert.equal(dialogShadow.querySelector(`#${PREVIEW_FILL_STYLE_ID}`)?.id, PREVIEW_FILL_STYLE_ID, 'preview-fill still injected');
  assert.equal(editorHostShadow.querySelector(`#${WARNING_HIDE_STYLE_ID}`), null, 'no warning-hide when the toggle is OFF');
});

test('hideEditorWarnings reconciles on re-apply: ON injects, flipping OFF removes the nested warning-hide', () => {
  let hide = true;
  const rt = createScrollbarStyleRuntime({
    documentRef: fakeDocument(),
    isActive: () => true,
    hideEditorWarnings: () => hide,
  });
  const { editor, editorHostShadow } = makeNestedDialogEditor();

  rt.applyForEditor(editor);
  assert.equal(editorHostShadow.querySelector(`#${WARNING_HIDE_STYLE_ID}`)?.id, WARNING_HIDE_STYLE_ID, 'injected while ON');

  // user flips the toggle OFF; the style-toggle change re-applies → reconcile removes the sheet
  hide = false;
  rt.applyForEditor(editor);
  assert.equal(editorHostShadow.querySelector(`#${WARNING_HIDE_STYLE_ID}`), null, 'removed after flipping OFF + re-apply');
});

test('applyForEditor does NOT inject the dialog-geometry codebox sheet on a non-dialog (panel) editor', () => {
  // UNIVERSAL A1 feel-check, Issue #1: the frozen CODEBOX_CSS encodes the card dialog's absolute
  // geometry (.cm-editor/.cm-scroller { width: calc(-18px + 54vw); height: calc(94vh - 437px) }).
  // On a non-dialog PANEL editor (Dev Tools / dashboard raw config / automation / script YAML),
  // which fills its host and has no preview pane, that geometry squished the editor to ~54vw. The
  // companion now gates the code-root sheets (CODEBOX_CSS + the NO_WRAP override that pairs with
  // it) to the card-dialog context, so a panel editor keeps its native full-width geometry; main's
  // decorative chrome still applies via discovery. (Was previously asserted to inject regardless —
  // that assertion encoded the leak; the dialog-editor positive cases above prove the dialog path
  // is unchanged.)
  const rt = makeRuntime({ active: true });
  const editor = { shadowRoot: fakeRoot(), matches: () => false, getRootNode: () => ({ host: null }) };
  // The dialog-geometry sheets (CODEBOX_CSS / NO_WRAP / CONTENT_FIT) are NOT injected on a panel editor.
  // The ungated FULLSCREEN_HIDE + NATIVE_AUTOCOMPLETE_HIDE sheets ARE (remove the fullscreen button and
  // kill the native suggestion box everywhere), so applyForEditor reports it injected those two and nothing else.
  assert.equal(rt.applyForEditor(editor), true, 'panel: only the ungated sheets inject');
  assert.equal(editor.shadowRoot.children.length, 2, 'no dialog-geometry sheet — only the ungated fullscreen-hide + native-autocomplete-hide');
  assert.equal(editor.shadowRoot.children[0].id, FULLSCREEN_HIDE_STYLE_ID, 'first panel sheet is the fullscreen-hide');
  assert.equal(editor.shadowRoot.children[1].id, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID, 'second panel sheet is the native-autocomplete-hide');
});

test('applyToRoots with codeRootDialogScoped:false skips the dialog-geometry code-root sheets', () => {
  // Direct-call guard for the Issue #1 gate: when the code root is NOT dialog-scoped, neither the
  // frozen CODEBOX_CSS nor the NO_WRAP override is injected; the other roots are unaffected.
  const rt = makeRuntime({ active: true });
  const codeRoot = fakeRoot();
  const dialogRoot = fakeRoot();
  assert.equal(rt.applyToRoots({ codeRoot, dialogRoot, codeRootDialogScoped: false }), true, 'dialog-root + ungated code-root sheets injected');
  // The dialog-geometry sheets (CODEBOX_CSS / NO_WRAP / CONTENT_FIT) are gated out; only the ungated
  // fullscreen-hide + native-autocomplete-hide land on the non-dialog code root.
  assert.equal(codeRoot.children.length, 2, 'no CODEBOX_CSS / NO_WRAP / CONTENT_FIT on a non-dialog code root');
  assert.equal(codeRoot.children[0].id, FULLSCREEN_HIDE_STYLE_ID, 'fullscreen-hide on a non-dialog code root');
  assert.equal(codeRoot.children[1].id, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID, 'native-autocomplete-hide on a non-dialog code root');
  assert.equal(dialogRoot.children[0]?.id, DIALOG_ROOT_STYLE_ID, 'dialog-root sheet unaffected by the code-root gate');
});

// The frozen CODEBOX_CSS carries the geometry of the dialog's main codebox (54vw wide,
// 94vh - 437px high). The sizing layer leaves every other editor in the dialog alone: a code
// editor a custom card puts in its own visual editor, or one inside a form field. The scrollbar
// layer injected the geometry sheets into those as well, which forced a small embedded editor
// to the size of the main one.
function dialogEditor({ yamlWrapped = true, inForm = false } = {}) {
  const dialog = { matches: (s) => s === 'hui-dialog-edit-card', shadowRoot: fakeRoot() };
  let host = dialog;
  if (inForm) {
    const form = { matches: (s) => String(s).split(',').map((p) => p.trim()).includes('ha-form'), getRootNode: () => ({ host: dialog }) };
    host = form;
  }
  if (yamlWrapped) {
    const below = host;
    host = { matches: (s) => s === 'ha-yaml-editor', getRootNode: () => ({ host: below }) };
  }
  const parent = host;
  const editor = { shadowRoot: fakeRoot(), matches: () => false, getRootNode: () => ({ host: parent }) };
  return { editor, dialog };
}

test('the main codebox of the card dialog gets the dialog-geometry sheets', () => {
  const rt = makeRuntime({ active: true });
  const { editor } = dialogEditor({ yamlWrapped: true });
  assert.equal(rt.applyForEditor(editor), true);
  assert.deepEqual(editor.shadowRoot.children.map((c) => c.id), [
    CODEBOX_STYLE_ID, NO_WRAP_STYLE_ID, CONTENT_FIT_STYLE_ID, FULLSCREEN_HIDE_STYLE_ID, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID,
  ]);
});

test('an embedded editor in the card dialog gets no dialog-geometry sheet', () => {
  for (const [label, shape] of [
    ['a code editor outside ha-yaml-editor', { yamlWrapped: false }],
    ['a YAML editor inside a form field', { yamlWrapped: true, inForm: true }],
  ]) {
    const rt = makeRuntime({ active: true });
    const { editor, dialog } = dialogEditor(shape);
    assert.equal(rt.applyForEditor(editor), true, label);
    assert.deepEqual(
      editor.shadowRoot.children.map((c) => c.id),
      [FULLSCREEN_HIDE_STYLE_ID, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID],
      `${label}: only the sheets every code editor gets`,
    );
    assert.equal(dialog.shadowRoot.children[0]?.id, DIALOG_ROOT_STYLE_ID, `${label}: the dialog itself is styled as before`);
    assert.equal(dialog.shadowRoot.children.length, 4);
  }
});
