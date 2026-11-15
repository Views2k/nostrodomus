// Sheets added to the code roots next to the frozen CODEBOX_CSS:
//  (1) CONTENT_FIT_CSS fits the dialog's fixed 54vw codebox content to its host, so the scrollbar and
//      the text stay inside the frame of a nested or narrow codebox.
//  (2) FULLSCREEN_HIDE_CSS removes only Home Assistant's Enter/Exit fullscreen toolbar button and
//      keeps find and replace.
//  (3) NATIVE_AUTOCOMPLETE_HIDE_CSS hides Home Assistant's own autocomplete list.
// The tests check the CSS text and where each sheet is added and removed.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCompanionStyleRuntime,
  CONTENT_FIT_CSS,
  FULLSCREEN_HIDE_CSS,
  NATIVE_AUTOCOMPLETE_HIDE_CSS,
  CONTENT_FIT_STYLE_ID,
  FULLSCREEN_HIDE_STYLE_ID,
  NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID,
  CODEBOX_STYLE_ID,
} from '../../src/companion/companionStyleRuntime.js';

// --- CONTENT_FIT_CSS contract ---

test('CONTENT_FIT fits .cm-editor and .cm-scroller to the host: 54vw when wide, the host width when narrow', () => {
  assert.match(CONTENT_FIT_CSS, /\.cm-editor\s*\{[^}]*width:\s*min\(100%,\s*calc\(-18px \+ 54vw\)\)/i, 'cm-editor width = min(100%, 54vw-18px) so the wide dialog is unchanged and a narrow host fits');
  assert.match(CONTENT_FIT_CSS, /\.cm-editor\s*\{[^}]*min-width:\s*0/i, 'overrides the frozen min-width:54vw that forces the overflow');
  assert.match(CONTENT_FIT_CSS, /\.cm-scroller\s*,\s*\.cm-scroller\.ha-scrollbar\s*\{[^}]*width:\s*min\(100%/i, 'cm-scroller (and .ha-scrollbar variant) refit too');
  // must not touch .cm-content (NO_WRAP owns it so long lines still scroll horizontally inside the scroller)
  assert.doesNotMatch(CONTENT_FIT_CSS, /\.cm-content/, 'leaves .cm-content alone — long-line horizontal scroll stays inside the frame');
});

test('CONTENT_FIT squares the .cm-editor inner box (border-radius:0), so no rounded corner clips the scrollbar arrow', () => {
  assert.match(CONTENT_FIT_CSS, /\.cm-editor\s*\{[^}]*border-radius:\s*0/i, 'overrides the frozen 24px rounding that clipped the scrollbar down arrow');
  // the visible rounded frame is the host ::before — CONTENT_FIT must not touch that
  assert.doesNotMatch(CONTENT_FIT_CSS, /::before|:host/i, 'does not touch the host frame (the visible rounded glow stays)');
});

// --- FULLSCREEN_HIDE_CSS contract ---

test('FULLSCREEN_HIDE removes only the fullscreen toggle (Enter and Exit, both host tags) and never find-and-replace', () => {
  assert.match(FULLSCREEN_HIDE_CSS, /\[aria-label="Enter fullscreen"\]/, 'targets Enter fullscreen');
  assert.match(FULLSCREEN_HIDE_CSS, /\[aria-label="Exit fullscreen"\]/, 'targets Exit fullscreen (the toggled label)');
  assert.match(FULLSCREEN_HIDE_CSS, /ha-button\[aria-label="Enter fullscreen"\]/, 'covers the ha-button host tag');
  assert.match(FULLSCREEN_HIDE_CSS, /ha-icon-button\[aria-label="Enter fullscreen"\]/, 'covers the ha-icon-button host tag');
  assert.match(FULLSCREEN_HIDE_CSS, /display:\s*none/i, 'hides it');
  assert.doesNotMatch(FULLSCREEN_HIDE_CSS, /Find and replace/i, 'KEEP find-and-replace — never matched here');
});

// --- NATIVE_AUTOCOMPLETE_HIDE_CSS contract ---

test('NATIVE_AUTOCOMPLETE_HIDE hides only the CodeMirror native autocomplete tooltip and info (including the HA custom class)', () => {
  assert.match(NATIVE_AUTOCOMPLETE_HIDE_CSS, /\.cm-tooltip-autocomplete/, 'targets the native autocomplete tooltip');
  assert.match(NATIVE_AUTOCOMPLETE_HIDE_CSS, /\.cm-completionInfo/, 'targets the stock CM completion detail panel');
  // Home Assistant renders the detail panel with its own class `completion-info`, which shows up at
  // the screen corner (0,0) when only the stock class is hidden.
  assert.match(NATIVE_AUTOCOMPLETE_HIDE_CSS, /\.completion-info\b/, 'targets HA\'s custom completion-info detail panel');
  assert.match(NATIVE_AUTOCOMPLETE_HIDE_CSS, /display:\s*none\s*!important/i, 'hides it, winning over CM tooltip styles');
  // Must not hide Nostrodomus's own pane (a div, not a CM tooltip) or generic CM tooltips (hover/lint).
  assert.doesNotMatch(NATIVE_AUTOCOMPLETE_HIDE_CSS, /nostrodomus-engine/, 'never targets Nostrodomus\'s own pane');
  assert.doesNotMatch(NATIVE_AUTOCOMPLETE_HIDE_CSS, /\.cm-tooltip\s*[,{]/, 'never hides generic .cm-tooltip (hover/lint tooltips keep working)');
});

// --- injection + teardown wiring ---

function makeRoot() {
  const styles = [];
  const root = {
    _styles: styles,
    querySelector: (sel) => styles.find((s) => '#' + s.id === sel) || null,
    appendChild: (n) => { n._parent = root; styles.push(n); return n; },
  };
  return root;
}
const fakeDoc = {
  createElement: () => ({
    id: '', textContent: '',
    remove() { const p = this._parent; if (p) { const i = p._styles.indexOf(this); if (i >= 0) p._styles.splice(i, 1); } },
  }),
};
const has = (root, id) => root._styles.some((s) => s.id === id);

test('applyToRoots: content-fit is dialog-scoped (rides the 54vw inject); fullscreen-hide is ungated (panels too)', () => {
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true });

  // Dialog codebox: both the 54vw geometry and the content-fit + fullscreen-hide land.
  const dialogRoot = makeRoot();
  rt.applyToRoots({ codeRoot: dialogRoot, codeRootDialogScoped: true });
  assert.ok(has(dialogRoot, CODEBOX_STYLE_ID), 'dialog: 54vw geometry injected');
  assert.ok(has(dialogRoot, CONTENT_FIT_STYLE_ID), 'dialog: content-fit injected (corrects the 54vw)');
  assert.ok(has(dialogRoot, FULLSCREEN_HIDE_STYLE_ID), 'dialog: fullscreen-hide injected');
  assert.ok(has(dialogRoot, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID), 'dialog: native-autocomplete-hide injected');

  // Panel codebox (not dialog-scoped): no 54vw geometry, no content-fit, but fullscreen-hide still lands.
  const panelRoot = makeRoot();
  rt.applyToRoots({ codeRoot: panelRoot, codeRootDialogScoped: false });
  assert.ok(!has(panelRoot, CODEBOX_STYLE_ID), 'panel: no 54vw geometry (would squish it)');
  assert.ok(!has(panelRoot, CONTENT_FIT_STYLE_ID), 'panel: no content-fit (no 54vw to correct)');
  assert.ok(has(panelRoot, FULLSCREEN_HIDE_STYLE_ID), 'panel: fullscreen-hide still injected (everywhere)');
  assert.ok(has(panelRoot, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID), 'panel: native-autocomplete-hide still injected (everywhere)');
});

test('teardown removes the content-fit + fullscreen-hide sheets', () => {
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true });
  const root = makeRoot();
  rt.applyToRoots({ codeRoot: root, codeRootDialogScoped: true });
  assert.ok(has(root, CONTENT_FIT_STYLE_ID) && has(root, FULLSCREEN_HIDE_STYLE_ID), 'injected');
  rt.teardown();
  assert.ok(!has(root, CONTENT_FIT_STYLE_ID), 'content-fit removed on teardown');
  assert.ok(!has(root, FULLSCREEN_HIDE_STYLE_ID), 'fullscreen-hide removed on teardown');
  assert.ok(!has(root, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID), 'native-autocomplete-hide removed on teardown');
});

test('the native-autocomplete hide follows the "Replace Home Assistant native autocomplete" setting', () => {
  let replace = true;
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, replaceNativeAutocomplete: () => replace });
  const root = makeRoot();
  rt.applyToRoots({ codeRoot: root, codeRootDialogScoped: true });
  assert.ok(has(root, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID), 'on: the native list is hidden');
  replace = false;
  rt.applyToRoots({ codeRoot: root, codeRootDialogScoped: true });
  assert.ok(!has(root, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID), 'off: the sheet is removed');
});