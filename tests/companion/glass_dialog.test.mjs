// Glass editor dialog (style.glassDialog): the additive sheet the companion layer keeps in the
// shadow root of the card editor dialog. The sheet text is built from what the theme defines for
// its dialogs; the placement follows the setting and the companion gate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildGlassDialogCss,
  createCompanionStyleRuntime,
  GLASS_DIALOG_BACKDROP_FILTER,
  GLASS_DIALOG_STYLE_ID,
  GLASS_DIALOG_SURFACE_OPACITY_PERCENT,
  STACKED_PANES_STYLE_ID,
} from '../../src/companion/companionStyleRuntime.js';

const SURFACE_LINE = '--ha-dialog-surface-background: color-mix(in srgb, var(--card-background-color, var(--ha-color-surface-default, #fff)) 60%, transparent);';
const BLUR_LINE = '--ha-dialog-surface-backdrop-filter: blur(18px) saturate(135%);';
const PREVIEW_RULE = /\.element-preview \{\s*background: transparent !important;\s*\}/;

// ---- the sheet text ----

test('default theme: translucent surface, blur and a transparent preview pane', () => {
  const css = buildGlassDialogCss({ surfaceBackground: '', surfaceBackdropFilter: '', scrimBackdropFilter: 'brightness(68%)' });
  assert.equal(css, `
      ha-dialog {
        ${SURFACE_LINE}
        ${BLUR_LINE}
      }

      .element-preview {
        background: transparent !important;
      }
    `);
  // The same text when nothing could be read at all.
  assert.equal(buildGlassDialogCss(), css);
  assert.equal(buildGlassDialogCss({}), css);
});

test('the opacity and the filter each come from one constant', () => {
  assert.equal(GLASS_DIALOG_SURFACE_OPACITY_PERCENT, 60);
  assert.equal(GLASS_DIALOG_BACKDROP_FILTER, 'blur(18px) saturate(135%)');
  const css = buildGlassDialogCss();
  assert.equal(css.split(`${GLASS_DIALOG_SURFACE_OPACITY_PERCENT}%, transparent`).length, 2);
  assert.equal(css.split(GLASS_DIALOG_BACKDROP_FILTER).length, 2);
  // The custom properties need no important flag; only the preview background has one.
  assert.equal(css.split('!important').length, 2);
});

test('a theme that defines the dialog surface keeps it', () => {
  const css = buildGlassDialogCss({ surfaceBackground: ' rgba(20, 24, 32, 0.5) ', surfaceBackdropFilter: '', scrimBackdropFilter: '' });
  assert.equal(css.includes('--ha-dialog-surface-background'), false, 'no surface line');
  assert.ok(css.includes(BLUR_LINE), 'the blur line stays');
  assert.match(css, PREVIEW_RULE);
});

test('a theme that defines a surface backdrop filter gets no blur line', () => {
  for (const filter of ['blur(8px)', 'none', 'saturate(120%)']) {
    const css = buildGlassDialogCss({ surfaceBackground: '', surfaceBackdropFilter: filter, scrimBackdropFilter: '' });
    assert.equal(css.includes('--ha-dialog-surface-backdrop-filter'), false, `no blur line over "${filter}"`);
    assert.ok(css.includes(SURFACE_LINE), 'the surface line stays');
    assert.match(css, PREVIEW_RULE);
  }
});

test('a theme whose scrim already blurs the page gets no second blur', () => {
  for (const scrim of ['blur(6px)', 'brightness(80%) blur(12px)', 'BLUR(4px)']) {
    const css = buildGlassDialogCss({ surfaceBackground: '', surfaceBackdropFilter: '', scrimBackdropFilter: scrim });
    assert.equal(css.includes('--ha-dialog-surface-backdrop-filter'), false, `no blur line over a scrim of "${scrim}"`);
    assert.ok(css.includes(SURFACE_LINE));
  }
  // A scrim filter without a blur (the default theme dims the page) does not count.
  for (const scrim of ['brightness(68%)', 'none', '']) {
    assert.ok(buildGlassDialogCss({ scrimBackdropFilter: scrim }).includes(BLUR_LINE), `blur line with a scrim of "${scrim}"`);
  }
});

test('a theme that defines both: only the preview rule is left', () => {
  const css = buildGlassDialogCss({ surfaceBackground: '#101418cc', surfaceBackdropFilter: 'blur(20px)', scrimBackdropFilter: 'blur(2px)' });
  assert.equal(css.includes('ha-dialog'), false, 'no rule for ha-dialog at all');
  assert.equal(css, `
      .element-preview {
        background: transparent !important;
      }
    `);
});

// ---- placement ----

function fakeRoot(host = null) {
  const root = {
    children: [],
    host,
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

const glassSheet = (root) => root.querySelector(`#${GLASS_DIALOG_STYLE_ID}`);

test('on (the default): the sheet is injected into the dialog root, once, after the other dialog sheets', () => {
  const rt = createCompanionStyleRuntime({ documentRef: fakeDocument(), isActive: () => true });
  const dialogRoot = fakeRoot();
  assert.equal(rt.applyToRoots({ dialogRoot }), true);
  const ids = dialogRoot.children.map((c) => c.id);
  assert.equal(ids.at(-1), GLASS_DIALOG_STYLE_ID);
  assert.equal(ids.indexOf(GLASS_DIALOG_STYLE_ID), ids.indexOf(STACKED_PANES_STYLE_ID) + 1);
  assert.equal(glassSheet(dialogRoot).textContent, buildGlassDialogCss(), 'no computed style to read: the default-theme text');

  assert.equal(rt.applyToRoots({ dialogRoot }), false, 'a second apply adds nothing');
  assert.equal(dialogRoot.children.filter((c) => c.id === GLASS_DIALOG_STYLE_ID).length, 1);

  // Only the dialog root gets it.
  const codeRoot = fakeRoot();
  const waDialogRoot = fakeRoot({ id: 'ha-dialog' });
  rt.applyToRoots({ codeRoot, waDialogRoot });
  assert.equal(glassSheet(codeRoot), null);
  assert.equal(glassSheet(waDialogRoot), null);
});

test('off: nothing is injected, and turning it off removes the sheet on the next apply', () => {
  let on = false;
  const rt = createCompanionStyleRuntime({ documentRef: fakeDocument(), isActive: () => true, glassDialog: () => on });
  const dialogRoot = fakeRoot();
  rt.applyToRoots({ dialogRoot });
  assert.equal(glassSheet(dialogRoot), null, 'not injected while the setting is off');
  assert.equal(dialogRoot.children.length, 4, 'the other dialog sheets are not affected');

  on = true;
  assert.equal(rt.applyToRoots({ dialogRoot }), true);
  assert.ok(glassSheet(dialogRoot), 'injected once the setting is on');

  on = false;
  assert.equal(rt.applyToRoots({ dialogRoot }), true, 'the removal is reported');
  assert.equal(glassSheet(dialogRoot), null, 'removed');
  assert.equal(dialogRoot.children.length, 4);
  assert.equal(rt.applyToRoots({ dialogRoot }), false, 'and nothing more to do');
});

test('turning it off removes the sheet even when the settings panel has no editor to pass', () => {
  let on = true;
  const rt = createCompanionStyleRuntime({ documentRef: fakeDocument(), isActive: () => true, glassDialog: () => on });
  const dialog = { matches: (s) => s === 'hui-dialog-edit-card', shadowRoot: fakeRoot() };
  const yamlEditor = { matches: (s) => s === 'ha-yaml-editor', getRootNode: () => ({ host: dialog }) };
  const editor = { shadowRoot: fakeRoot(), matches: () => false, getRootNode: () => ({ host: yamlEditor }) };
  assert.equal(rt.applyForEditor(editor), true);
  assert.ok(glassSheet(dialog.shadowRoot), 'applyForEditor reaches the dialog root from the editor');

  // Still on: no editor, nothing changes.
  assert.equal(rt.applyForEditor(null), false);
  assert.ok(glassSheet(dialog.shadowRoot));

  on = false;
  assert.equal(rt.applyForEditor(undefined), true);
  assert.equal(glassSheet(dialog.shadowRoot), null);
  assert.equal(rt.applyForEditor(undefined), false);
});

test('dormant companion layer: no glass sheet', () => {
  const rt = createCompanionStyleRuntime({ documentRef: fakeDocument(), isActive: () => false, glassDialog: () => true });
  const dialogRoot = fakeRoot();
  assert.equal(rt.applyToRoots({ dialogRoot }), false);
  assert.equal(dialogRoot.children.length, 0);
});

test('teardown removes the sheet', () => {
  const rt = createCompanionStyleRuntime({ documentRef: fakeDocument(), isActive: () => true });
  const dialogRoot = fakeRoot();
  rt.applyToRoots({ dialogRoot });
  assert.ok(glassSheet(dialogRoot));
  rt.teardown();
  assert.equal(glassSheet(dialogRoot), null);
  assert.equal(dialogRoot.children.length, 0);

  // Also from a dialog root that was closed and dropped from the owned roots in the meantime.
  const closed = fakeRoot();
  rt.applyToRoots({ dialogRoot: closed });
  closed.isConnected = false;
  rt.pruneDetachedOwnedRoots();
  rt.teardown();
  assert.equal(glassSheet(closed), null);
});

// ---- the theme is read on the dialog host, once per opening of the dialog ----

function themedRuntime() {
  const reads = [];
  const rt = createCompanionStyleRuntime({
    documentRef: fakeDocument(),
    isActive: () => true,
    globalRef: {
      getComputedStyle: (el) => ({
        getPropertyValue: (name) => { reads.push([el, name]); return el.theme?.[name] ?? ''; },
      }),
    },
  });
  return { rt, reads };
}

test('the three theme values are read on the hui-dialog-edit-card host', () => {
  const { rt, reads } = themedRuntime();
  const host = { theme: { '--ha-dialog-surface-background': ' rgba(10, 12, 16, 0.4)', '--ha-dialog-scrim-backdrop-filter': 'blur(10px)' } };
  const dialogRoot = fakeRoot(host);
  rt.applyToRoots({ dialogRoot });
  assert.deepEqual(reads.map(([el, name]) => [el === host, name]), [
    [true, '--ha-dialog-surface-background'],
    [true, '--ha-dialog-surface-backdrop-filter'],
    [true, '--ha-dialog-scrim-backdrop-filter'],
  ]);
  const css = glassSheet(dialogRoot).textContent;
  assert.equal(css.includes('ha-dialog'), false, 'the theme covers the surface and the blur');
  assert.match(css, PREVIEW_RULE);
});

test('the host is read once per opening, and a theme chosen between two openings is seen', () => {
  const { rt, reads } = themedRuntime();
  const host = { theme: {} };
  const dialogRoot = fakeRoot(host);
  const firstOpening = fakeRoot({ id: 'ha-dialog' });
  for (let i = 0; i < 5; i += 1) rt.applyToRoots({ dialogRoot, waDialogRoot: firstOpening });
  assert.equal(reads.length, 3, 'one read of the three values for five applies');
  assert.ok(glassSheet(dialogRoot).textContent.includes(SURFACE_LINE));

  // The dialog is closed, the theme changes, the dialog opens again: Home Assistant shows the
  // same dialog element (the sheet is still in its root) with a new ha-dialog inside.
  host.theme = { '--ha-dialog-surface-background': '#0b0e13b3', '--ha-dialog-surface-backdrop-filter': 'blur(24px)' };
  const secondOpening = fakeRoot({ id: 'ha-dialog' });
  assert.equal(rt.applyToRoots({ dialogRoot, waDialogRoot: secondOpening }), true, 'the sheet text changed');
  assert.equal(reads.length, 6);
  assert.equal(dialogRoot.children.filter((c) => c.id === GLASS_DIALOG_STYLE_ID).length, 1, 'the same style element');
  assert.equal(glassSheet(dialogRoot).textContent.includes('ha-dialog'), false, 'rebuilt for the new theme');

  for (let i = 0; i < 5; i += 1) assert.equal(rt.applyToRoots({ dialogRoot, waDialogRoot: secondOpening }), false);
  assert.equal(reads.length, 6, 'and not read again during that opening');
});

// ---- wiring in the composition root (read from the source, as in uninstall_leftovers.test.mjs) ----

test('main passes the setting to the companion layer, and uninstall tears that layer down', () => {
  const main = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const construction = main.slice(main.indexOf('const companionStyleRuntime = createCompanionStyleRuntime({'), main.indexOf('const companionInputQuietRuntime'));
  assert.ok(construction.includes('glassDialog: () => state.settings?.style?.glassDialog !== false,'));
  const teardown = main.slice(main.indexOf('companionScrollbarTeardown: () => {'), main.indexOf('companionSettleCleanup:'));
  assert.ok(teardown.includes('return companionStyleRuntime.teardown();'), 'the uninstall lifecycle runs the teardown that removes the sheet');
});
