// The card dialog in a window narrower than 1000px, where Home Assistant stacks the preview under
// the editor.
//
// Measured on Home Assistant 2026.11 at 900x800: with the dialog body forced to overflow visible,
// the body grows to the height of both panes (1254px in a 752px dialog) and pushes the row with
// Save and Cancel below the window; a codebox fitted down to that row covers the top of the
// preview, and nothing in the dialog can scroll.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxEnlargeRuntime, FIT_FOOTER_GAP_PX } from '../../src/companion/codeboxEnlargeRuntime.js';
import { CONTENT_FIT_CSS, STACKED_PANES_CSS, WA_DIALOG_CSS } from '../../src/companion/companionStyleRuntime.js';
import { createCodeboxUnclip } from '../../src/ui/codebox/codeboxUnclip.js';
import { CARD_DIALOG_STACKED_MEDIA } from '../../src/editor/haSelectors.js';

test('the dialog body is stopped from scrolling only in the side-by-side layout', () => {
  const css = WA_DIALOG_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const plainBodyRule = /wa-dialog::part\(body\) \{([^}]*)\}/.exec(css.split('@media')[0]);
  assert.ok(plainBodyRule, 'the unconditional body rule exists');
  assert.doesNotMatch(plainBodyRule[1], /overflow/, 'no overflow outside a media query');
  assert.match(css, /@media \(min-width: 1000px\) \{\s*wa-dialog::part\(body\) \{\s*overflow: hidden !important;\s*\}\s*\}/);
  assert.match(css, /@media \(max-width: 999px\) \{\s*wa-dialog::part\(body\) \{\s*overflow: hidden auto !important;\s*\}\s*\}/);
  assert.equal(CARD_DIALOG_STACKED_MEDIA, '(max-width: 999px)');
});

// Measured on Home Assistant 2026.6 and 2026.11 at 1280x600: the dialog starts 40px below the top
// of the window, so at 94vh high it ends 4px below the window, inside the Save row.
test('the dialog height is capped at the window height minus its top margin', () => {
  const css = WA_DIALOG_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const cap = 'min(94vh, calc(100vh - var(--dialog-surface-margin-top, 40px)))';
  assert.ok(css.includes(`height: ${cap} !important;`), 'height');
  assert.ok(css.includes(`max-height: ${cap} !important;`), 'max-height');
  assert.doesNotMatch(css, /height: 94vh !important/, 'no bare 94vh height');
});

test('stacked: the panes and the code take the full width, only below 1000px', () => {
  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const panes = strip(STACKED_PANES_CSS).trim();
  assert.ok(panes.startsWith('@media (max-width: 999px) {'));
  assert.match(panes, /\.content \.element-editor,[^{]*\{[^}]*width: 100% !important;[^}]*min-width: 0 !important;/);
  assert.match(panes, /\.content \.element-preview,[^{]*\{[^}]*width: 100% !important;[^}]*height: auto !important;/);
  const fit = strip(CONTENT_FIT_CSS);
  const [wide, stacked] = fit.split('@media (max-width: 999px)');
  assert.match(wide, /\.cm-editor \{[^}]*width: min\(100%, calc\(-18px \+ 54vw\)\) !important;/, 'the side-by-side cap is unchanged');
  assert.match(stacked, /\.cm-editor,\s*\.cm-scroller,\s*\.cm-scroller\.ha-scrollbar \{\s*width: 100% !important;/);
});

// ---- the slot unclip leaves the scrolling body alone in the stacked layout ----

function styleStore() {
  const values = new Map();
  return {
    values,
    getPropertyValue: (prop) => values.get(prop)?.value || '',
    getPropertyPriority: (prop) => values.get(prop)?.priority || '',
    setProperty: (prop, value, priority = '') => values.set(prop, { value, priority }),
    removeProperty: (prop) => values.delete(prop),
  };
}

function node(selectors, parent = null) {
  return {
    nodeType: 1,
    localName: selectors[0],
    className: '',
    dataset: {},
    style: styleStore(),
    isConnected: true,
    parent,
    matches: (selector) => selectors.includes(selector),
  };
}

function unclipHarness({ stacked }) {
  const media = { matches: stacked, listeners: new Set(), addEventListener(_, fn) { this.listeners.add(fn); }, removeEventListener(_, fn) { this.listeners.delete(fn); } };
  const surface = node(['dialog.dialog.open']);
  const body = node(['div.body'], surface);
  const haBody = node(['div.body.ha-scrollbar', 'div.body'], body);
  const editor = node(['.cm-editor'], haBody);
  const state = {};
  const unclip = createCodeboxUnclip({
    document: { defaultView: { matchMedia: () => media }, documentElement: {} },
    MutationObserver: class { observe() {} disconnect() {} },
    state,
    recordPerformanceEvent: () => {},
    codeboxComposedParent: (n) => n?.parent || null,
    codeboxFrameHostForEditor: () => null,
    isCodeMirrorInlineStyleTarget: () => false,
    haCodeEditorHostForEditor: () => null,
  });
  return { unclip, media, surface, body, haBody, editor, state };
}

const overflowOf = (n) => n.style.getPropertyValue('overflow');

test('side by side: the dialog body and surface are unclipped', () => {
  const h = unclipHarness({ stacked: false });
  assert.equal(h.unclip.applyCodeboxSlotDialogBodyUnclip(h.editor, 'test'), true);
  assert.equal(overflowOf(h.surface), 'visible');
  assert.equal(overflowOf(h.body), 'visible');
  assert.equal(overflowOf(h.haBody), 'visible');
});

test('stacked: only the dialog surface is unclipped, the body keeps its own overflow', () => {
  const h = unclipHarness({ stacked: true });
  h.unclip.applyCodeboxSlotDialogBodyUnclip(h.editor, 'test');
  assert.equal(overflowOf(h.surface), 'visible');
  assert.equal(overflowOf(h.body), '');
  assert.equal(overflowOf(h.haBody), '');
});

test('a window that crosses the breakpoint with the dialog open hands the body back, and takes it again', () => {
  const h = unclipHarness({ stacked: false });
  h.unclip.applyCodeboxSlotDialogBodyUnclip(h.editor, 'test');
  assert.equal(overflowOf(h.body), 'visible');
  assert.equal(h.media.listeners.size, 1, 'one listener for the layout change');

  h.media.matches = true;
  for (const fn of h.media.listeners) fn();
  assert.equal(overflowOf(h.body), '', 'the body is restored when the layout becomes stacked');
  assert.equal(overflowOf(h.haBody), '');
  assert.equal(overflowOf(h.surface), 'visible');

  h.media.matches = false;
  for (const fn of h.media.listeners) fn();
  assert.equal(overflowOf(h.body), 'visible');

  h.unclip.cleanupCodeboxSlotUnclip('test');
  assert.equal(h.media.listeners.size, 0, 'cleanup removes the listener');
  assert.equal(overflowOf(h.surface), '');
});

// ---- the measured fit follows the editor pane, not the footer, in the stacked layout ----

function buildStackedDialog({ editorTop, paneBottom, footerTop }) {
  const writes = [];
  const layout = { editorTop, paneBottom, footerTop };
  const rect = (top, bottom, width = 100) => ({ top, bottom, width, height: bottom - top });
  const footer = { getBoundingClientRect: () => rect(layout.footerTop, layout.footerTop + 68) };
  const dialog = {
    matches: (selector) => selector === 'hui-dialog-edit-card',
    getBoundingClientRect: () => rect(24, 776),
    shadowRoot: {
      querySelector: (selector) => (selector === 'ha-dialog-footer' ? footer : null),
      querySelectorAll: () => [],
    },
  };
  const pane = { getBoundingClientRect: () => rect(layout.editorTop, layout.paneBottom, 486) };
  const elementEditor = {
    matches: (selector) => selector === 'hui-card-element-editor',
    closest: (selector) => (selector === '.element-editor' ? pane : null),
    getRootNode: () => ({ host: dialog }),
  };
  const sink = (tag, r) => ({ style: { setProperty: (key, value) => writes.push([tag, key, value]) }, getBoundingClientRect: r });
  const wrapper = sink('wrapper', () => rect(layout.editorTop, layout.editorTop + 500, 482));
  const cmEditor = sink('cm', () => rect(0, 0));
  const cmScroller = sink('scroller', () => rect(0, 0));
  const yamlHost = { matches: (selector) => selector === 'ha-yaml-editor', getRootNode: () => ({ host: elementEditor }) };
  const editor = {
    shadowRoot: {
      host: wrapper,
      querySelector: (selector) => (selector === '.cm-editor' ? cmEditor : selector === '.cm-scroller' ? cmScroller : null),
    },
    matches: () => false,
    getRootNode: () => ({ host: yamlHost }),
  };
  return { writes, layout, editor };
}

const heightOf = (writes, tag) => writes.filter(([t, key]) => t === tag && key === 'height').map(([, , value]) => value).pop();

function fitRuntime(stacked) {
  return createCodeboxEnlargeRuntime({
    isActive: () => true,
    visible: () => true,
    globalRef: { innerHeight: 800, matchMedia: (query) => ({ matches: stacked && query === CARD_DIALOG_STACKED_MEDIA }) },
  });
}

test('stacked: the codebox ends inside its own pane, above the preview', () => {
  // Measured on 2026.11 at 900x800: editor pane 116..670, preview from 670, footer pushed to 792.
  const { writes, editor } = buildStackedDialog({ editorTop: 116, paneBottom: 670, footerTop: 792 });
  const out = fitRuntime(true).applyForEditor(editor);
  assert.equal(out.measured, true);
  assert.equal(heightOf(writes, 'wrapper'), `${670 - FIT_FOOTER_GAP_PX - 116}px`);
});

test('stacked: scrolling the dialog body does not change the fitted height', () => {
  const { writes, layout, editor } = buildStackedDialog({ editorTop: 116, paneBottom: 670, footerTop: 708 });
  const rt = fitRuntime(true);
  rt.applyForEditor(editor);
  const afterFirst = writes.length;
  // The body scrolled 300px: the editor and its pane moved up together, the footer stayed.
  layout.editorTop -= 300;
  layout.paneBottom -= 300;
  rt.refitForEditor(editor);
  assert.equal(writes.length, afterFirst, 'no new height after a scroll');
});

test('side by side: the same dialog is fitted to the footer', () => {
  const { writes, editor } = buildStackedDialog({ editorTop: 116, paneBottom: 670, footerTop: 708 });
  fitRuntime(false).applyForEditor(editor);
  assert.equal(heightOf(writes, 'wrapper'), `${708 - FIT_FOOTER_GAP_PX - 116}px`);
});
