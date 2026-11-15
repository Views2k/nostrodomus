// Codebox-enlargement learned memory + bounded tab detection unit tests.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCodeboxEnlargeRuntime,
  SIMPLE_CM_HEIGHT,
  SIMPLE_SCROLLER_HEIGHT,
  CM_HEIGHT,
  SCROLLER_HEIGHT,
  PANEL_MAX_HEIGHT,
  PANEL_MAX_WIDTH,
  PANEL_SIDE_ROOM,
  PANEL_TOP_ROOM,
  PANEL_SCROLLER_PADDING,
  PANEL_CONTENT_PADDING,
  PANEL_SCROLLER_MAX_WIDTH,
} from '../../src/companion/codeboxEnlargeRuntime.js';
import { OPTION_TAB_CONTAINERS, OPTION_TABS } from '../../src/editor/haSelectors.js';
import { OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR } from '../../src/editor/overlayRoot.js';

function rt({ active = true, universalCodeboxEnabled = () => true } = {}) {
  return createCodeboxEnlargeRuntime({ isActive: () => active, visible: () => true, universalCodeboxEnabled });
}

// --- learned memory (the named asset): truth table ---

test('learns simple once and yields the taller simple height set', () => {
  const r = rt();
  const dialog = { id: 'd1' };
  const h = r.learnedHeights(dialog, { detectedSimple: true, settingsOpen: false });
  assert.equal(h.simple, true);
  assert.equal(h.cm, SIMPLE_CM_HEIGHT);
  assert.equal(h.scroller, SIMPLE_SCROLLER_HEIGHT);
});

test('a first-measurement tabbed editor stays tabbed (shorter height set)', () => {
  const r = rt();
  const dialog = { id: 'd1' };
  const h = r.learnedHeights(dialog, { detectedSimple: false, settingsOpen: false });
  assert.equal(h.simple, false);
  assert.equal(h.cm, CM_HEIGHT);
  assert.equal(h.scroller, SCROLLER_HEIGHT);
});

test('a learned-simple dialog is not downgraded while settings is open', () => {
  const r = rt();
  const dialog = { id: 'd1' };
  r.learnedHeights(dialog, { detectedSimple: true, settingsOpen: false }); // learn simple
  const h = r.learnedHeights(dialog, { detectedSimple: false, settingsOpen: true }); // transient (settings UI)
  assert.equal(h.simple, true, 'settingsOpen guard keeps the learned simple mode');
  assert.equal(h.cm, SIMPLE_CM_HEIGHT);
});

test('runoff repair: a learned-simple dialog does downgrade when real tabs render (no settings open)', () => {
  const r = rt();
  const dialog = { id: 'd1' };
  r.learnedHeights(dialog, { detectedSimple: true, settingsOpen: false }); // learn simple
  const h = r.learnedHeights(dialog, { detectedSimple: false, settingsOpen: false }); // real tabs appeared
  assert.equal(h.simple, false, 'real tabs after first measurement downgrade to tabbed');
  assert.equal(h.cm, CM_HEIGHT);
});

test('the runoff repair is stored, so opening settings keeps the tabbed heights', () => {
  // A settle rung that measures a 0-sized dialog can learn a tabbed editor as simple. If the repair
  // changed only the returned value and not the stored one, opening Nostrodomus settings would bring
  // the simple mode back and make the codebox 249px too tall.
  const r = rt();
  const dialog = { id: 'd1' };
  r.learnedHeights(dialog, { detectedSimple: true, settingsOpen: false });  // learned before the tabs render
  r.learnedHeights(dialog, { detectedSimple: false, settingsOpen: false }); // tabs render: runoff repair, stored
  const open = r.learnedHeights(dialog, { detectedSimple: false, settingsOpen: true }); // user opens settings
  assert.equal(open.simple, false, 'settingsOpen reads the repaired (tabbed) verdict, not the stale simple one');
  assert.equal(open.cm, CM_HEIGHT);
});

test('a learned-simple dialog stays simple when still detected simple', () => {
  const r = rt();
  const dialog = { id: 'd1' };
  r.learnedHeights(dialog, { detectedSimple: true, settingsOpen: false });
  const h = r.learnedHeights(dialog, { detectedSimple: true, settingsOpen: false });
  assert.equal(h.simple, true);
});

test('a learned-tabbed dialog stays tabbed after a transient no-tabs measurement', () => {
  // The mirror case of the runoff repair: a tabbed dialog that measures no tabs for one apply
  // (0-sized or in the middle of a rebuild) must not turn simple and then be held there by the
  // settingsOpen guard, which would make the codebox 249px too tall for as long as settings is open.
  const r = rt();
  const dialog = { id: 'd1' };
  assert.equal(r.learnedHeights(dialog, { detectedSimple: false, settingsOpen: false }).simple, false, 'learned tabbed');
  assert.equal(r.learnedHeights(dialog, { detectedSimple: true, settingsOpen: false }).simple, false, 'a transient no-tabs measurement does not flip it to simple');
  assert.equal(r.learnedHeights(dialog, { detectedSimple: false, settingsOpen: true }).simple, false, 'settingsOpen reads the sticky tabbed verdict, not a poisoned simple one');
  // A dialog that was never tabbed still learns simple normally.
  const s = { id: 's1' };
  assert.equal(r.learnedHeights(s, { detectedSimple: true, settingsOpen: false }).simple, true);
});

test('per-dialog isolation: two dialogs learn independently', () => {
  const r = rt();
  const a = { id: 'a' };
  const b = { id: 'b' };
  r.learnedHeights(a, { detectedSimple: true, settingsOpen: false });
  r.learnedHeights(b, { detectedSimple: false, settingsOpen: false });
  assert.equal(r.learnedHeights(a, { detectedSimple: false, settingsOpen: true }).simple, true, 'a stays simple');
  assert.equal(r.learnedHeights(b, { detectedSimple: false, settingsOpen: false }).simple, false, 'b stays tabbed');
});

// --- bounded, depth-capped tab detection (no wildcard document walk) ---

function el() { return { matches: () => false, getBoundingClientRect: () => ({ width: 10, height: 10 }) }; }
function rootWith({ containers = [], tabs = [], hosts = [], host = null } = {}) {
  return {
    host,
    querySelectorAll(sel) {
      if (sel === OPTION_TAB_CONTAINERS) return containers;
      if (sel === OPTION_TABS) return tabs;
      if (sel === OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR) return hosts;
      return [];
    },
  };
}

test('hasOptionTabs: a visible tab container at the dialog root => tabbed', () => {
  const r = rt();
  assert.equal(r.hasOptionTabs(rootWith({ containers: [el()] })), true);
});

test('hasOptionTabs: >=2 visible tabs => tabbed; <2 => not', () => {
  const r = rt();
  assert.equal(r.hasOptionTabs(rootWith({ tabs: [el(), el()] })), true);
  assert.equal(r.hasOptionTabs(rootWith({ tabs: [el()] })), false);
});

test('hasOptionTabs: descends into editor-host shadow roots to find nested tabs', () => {
  const r = rt();
  const nested = rootWith({ containers: [el()] });
  const hostEl = { shadowRoot: nested };
  const dialogRoot = rootWith({ hosts: [hostEl] });
  assert.equal(r.hasOptionTabs(dialogRoot), true, 'found tabs one shadow level down');
});

test('hasOptionTabs: no tabs anywhere => simple (false)', () => {
  const r = rt();
  assert.equal(r.hasOptionTabs(rootWith({})), false);
});

test('hasOptionTabs: depth cap stops descent (tabs beyond the cap are not found)', () => {
  const r = createCodeboxEnlargeRuntime({ isActive: () => true, visible: () => true, maxDepth: 1 });
  // depth0 -> host -> depth1 -> host -> depth2(tabs). With maxDepth=1, depth1 won't expand to depth2.
  const deep = rootWith({ containers: [el()] });
  const mid = rootWith({ hosts: [{ shadowRoot: deep }] });
  const top = rootWith({ hosts: [{ shadowRoot: mid }] });
  assert.equal(r.hasOptionTabs(top), false, 'tabs deeper than maxDepth are not reached');
});

// --- dormant no-op ---

test('applyForEditor is a strict no-op while dormant (no inline height written)', () => {
  const r = rt({ active: false });
  const writes = [];
  const styleEl = { style: { setProperty: (k, v) => writes.push([k, v]) } };
  const editor = {
    style: { setProperty: (k, v) => writes.push(['editor', k, v]) },
    shadowRoot: { querySelector: () => styleEl },
    matches: () => false,
    getRootNode: () => ({ host: null }),
  };
  assert.equal(r.applyForEditor(editor), null);
  assert.equal(writes.length, 0, 'no DOM writes while dormant');
});

test('applyForEditor writes the simple height set on cm internals when active + simple, in the card dialog', () => {
  const r = rt({ active: true });
  const heights = {};
  const mk = (name) => ({ style: { setProperty: (k, v) => { heights[`${name}.${k}`] = v; } } });
  const cmEditor = mk('cmEditor');
  const cmScroller = mk('cmScroller');
  // A real card-edit editor always has a hui-dialog-edit-card ancestor; the dialog has no option
  // tabs here -> detectedSimple true. (Models the dialog context the simple heights are tuned for.)
  const dialog = { matches: (s) => s === 'hui-dialog-edit-card', shadowRoot: rootWith({}) };
  // The real main codebox is ha-yaml-editor-wrapped; the enlarge only applies to it.
  const yamlHost = { matches: (s) => s === 'ha-yaml-editor', getRootNode: () => ({ host: dialog }) };
  const editor = {
    style: { setProperty: (k, v) => { heights[`editor.${k}`] = v; } },
    shadowRoot: { querySelector: (s) => (s === '.cm-editor' ? cmEditor : s === '.cm-scroller' ? cmScroller : null) },
    matches: () => false,
    getRootNode: () => ({ host: yamlHost }),
  };
  const out = r.applyForEditor(editor);
  assert.equal(out.simple, true);
  assert.equal(heights['cmEditor.height'], SIMPLE_CM_HEIGHT);
  assert.equal(heights['cmScroller.height'], SIMPLE_SCROLLER_HEIGHT);
});

// In a card dialog, only the main codebox (ha-yaml-editor-wrapped) gets the
// dialog-scale enlarge; a combo/custom card's embedded editor (a raw ha-code-editor
// with no ha-yaml-editor ancestor) must keep native sizing or it inherits the 94vh
// heights and blows off-screen. Structural DOM stubs -- no YAML indentation, so the
// auto-indent-matrix rule does not apply here.
function cardDialogEditorStub(writes, { yamlWrapped, formNested = false } = {}) {
  const sink = (tag) => ({ style: { setProperty: (k, v) => writes.push([tag, k, v]) } });
  const wrapper = sink('wrapper');
  const cmEditor = sink('cm');
  const cmScroller = sink('scroller');
  const cmContent = sink('content');
  const dialog = { matches: (s) => s === 'hui-dialog-edit-card', shadowRoot: rootWith({}) };
  let host = dialog;
  if (formNested) host = { matches: (s) => s === 'ha-form' || s.includes('ha-form'), getRootNode: () => ({ host }) };
  if (yamlWrapped) host = { matches: (s) => s === 'ha-yaml-editor', getRootNode: () => ({ host: formNested ? { matches: (s) => s === 'ha-form' || s.includes('ha-form'), getRootNode: () => ({ host: dialog }) } : dialog }) };
  return {
    editor: {
      style: { setProperty: (k, v) => writes.push(['editor', k, v]) },
      shadowRoot: { host: wrapper, querySelector: (s) => (s === '.cm-editor' ? cmEditor : s === '.cm-scroller' ? cmScroller : s === '.cm-content' ? cmContent : null) },
      matches: () => false,
      getRootNode: () => ({ host }),
    },
  };
}

test('applyForEditor enlarges the main ha-yaml-editor-wrapped codebox in a card dialog', () => {
  const writes = [];
  const { editor } = cardDialogEditorStub(writes, { yamlWrapped: true });
  const out = rt({ active: true }).applyForEditor(editor);
  assert.equal(out.simple, true, 'the main codebox still gets the learned enlarge');
  assert.ok(writes.some(([, k, v]) => k === 'height' && String(v).includes('94vh')), 'main gets the dialog-scale height');
});

test('applyForEditor leaves an embedded (non-ha-yaml-editor) card editor at native size', () => {
  const writes = [];
  const { editor } = cardDialogEditorStub(writes, { yamlWrapped: false });
  const out = rt({ active: true }).applyForEditor(editor);
  assert.deepEqual(out, { embedded: true }, 'an embedded raw editor is recognized and left alone');
  assert.equal(writes.length, 0, 'no inline height is written to an embedded editor');
});

test('applyForEditor leaves an ha-form-nested editor at native size even if ha-yaml-editor-wrapped', () => {
  const writes = [];
  const { editor } = cardDialogEditorStub(writes, { yamlWrapped: true, formNested: true });
  const out = rt({ active: true }).applyForEditor(editor);
  assert.deepEqual(out, { embedded: true }, 'a form-nested editor is never the main codebox');
  assert.equal(writes.length, 0);
});

function panelEditorStub(writes) {
  const push = (tag) => ({ style: { setProperty: (k, v) => writes.push([tag, k, v]) } });
  const wrapper = push('wrapper'); // ha-code-editor host (carries the frame + glow)
  const cmEditor = push('cm');
  const cmScroller = push('scroller');
  const cmContent = push('content');
  return {
    editor: {
      style: { setProperty: (k, v) => writes.push(['editor', k, v]) },
      shadowRoot: { host: wrapper, querySelector: (s) => (s === '.cm-editor' ? cmEditor : s === '.cm-scroller' ? cmScroller : s === '.cm-content' ? cmContent : null) },
      matches: () => false,
      getRootNode: () => ({ host: null }), // no dialog ancestor => panel editor
    },
  };
}

test('applyForEditor gives a panel editor glow room on all sides (max-width, side and top margins) and a bottom max-height cap', () => {
  // As in the card editor, the panel host gets room on every side so the frame and glow show all
  // around: max-width and side margins, margin-top, and the gap below max-height. Panels do not get
  // the card dialog's fixed calc(94vh - …) heights, which would squash them, and with max-height only
  // a short script keeps its natural size.
  const writes = [];
  const { editor } = panelEditorStub(writes);
  const out = rt({ active: true }).applyForEditor(editor);
  assert.equal(out?.panel, true);
  assert.equal(out?.frameRoom, true);
  const wrap = writes.filter(([t]) => t === 'wrapper').map(([, k, v]) => [k, v]);
  assert.ok(wrap.some(([k, v]) => k === 'max-width' && v === PANEL_MAX_WIDTH), 'side room via max-width');
  assert.ok(wrap.some(([k, v]) => k === 'margin-left' && v === PANEL_SIDE_ROOM), 'left room');
  assert.ok(wrap.some(([k, v]) => k === 'margin-right' && v === PANEL_SIDE_ROOM), 'right room');
  assert.ok(wrap.some(([k, v]) => k === 'margin-top' && v === PANEL_TOP_ROOM), 'top room');
  assert.ok(wrap.some(([k, v]) => k === 'max-height' && v === PANEL_MAX_HEIGHT), 'bottom room via max-height');
  // never a fixed height (would force a short script taller)
  assert.ok(!writes.some(([, k]) => k === 'height'), 'no fixed height on a panel editor');
});

test('applyForEditor clears the frame rounded bottom corners: card-editor scroller + content padding on a panel', () => {
  // The frame's 22px rounded bottom corners clip the last gutter line number (bottom-left) and the
  // scrollbar end (bottom-right) when content runs square to the bottom edge. Panels get the same frame
  // but not the card's CODEBOX_CSS clearance, so we apply the card's exact scroller/content padding here.
  const writes = [];
  const { editor } = panelEditorStub(writes);
  const out = rt({ active: true }).applyForEditor(editor);
  assert.equal(out?.cornerClearance, true);
  const scroller = writes.filter(([t]) => t === 'scroller').map(([, k, v]) => [k, v]);
  const content = writes.filter(([t]) => t === 'content').map(([, k, v]) => [k, v]);
  assert.ok(scroller.some(([k, v]) => k === 'padding' && v === PANEL_SCROLLER_PADDING), 'scroller corner-clearance padding');
  assert.ok(scroller.some(([k, v]) => k === 'box-sizing' && v === 'border-box'), 'scroller border-box so padding stays within max-height');
  assert.ok(scroller.some(([k, v]) => k === 'max-width' && v === PANEL_SCROLLER_MAX_WIDTH), 'scroller right gap so the scrollbar clears the rounded bottom-right corner');
  assert.ok(content.some(([k, v]) => k === 'padding' && v === PANEL_CONTENT_PADDING), 'content corner-clearance padding');
});

test('applyForEditor is a no-op on a panel editor when universalCodebox is off', () => {
  const writes = [];
  const { editor } = panelEditorStub(writes);
  assert.equal(rt({ active: true, universalCodeboxEnabled: () => false }).applyForEditor(editor), null, 'no-op when the flag is off');
  assert.equal(writes.length, 0, 'no inline styles written when the flag is off');
});


// The YAML editor of a single row in the visual automation editor is outside the card dialog but
// is not a panel editor; it must not get the panel margins and height cap.
test('a row editor of the visual automation editor does not get the panel treatment', () => {
  const writes = [];
  const { editor } = panelEditorStub(writes);
  const row = { localName: 'ha-automation-action-row', matches: () => false, getRootNode: () => ({ host: null }) };
  editor.getRootNode = () => ({ host: row });
  const out = rt({ active: true }).applyForEditor(editor);
  assert.deepEqual(out, { embedded: true });
  assert.deepEqual(writes, [], 'no margins or height cap are written');

  const sidebar = { localName: 'ha-automation-sidebar-action', matches: () => false, getRootNode: () => ({ host: null }) };
  const second = panelEditorStub([]);
  second.editor.getRootNode = () => ({ host: sidebar });
  assert.deepEqual(rt({ active: true }).applyForEditor(second.editor), { embedded: true });
});