// Sizes the codebox: the main code editor of the card editor dialog, and the main editor of a
// panel page (Developer Tools, the raw dashboard configuration, the automation and script
// editors).
//
// In the card dialog the codebox is fitted to the space between where it starts and the dialog
// footer, measured once the dialog is laid out. Before that it gets a height from a viewport
// formula, taller for an editor without the row of option tabs ("simple") than for a tabbed one;
// which of the two a dialog is, is remembered per dialog. A panel editor gets a maximum height
// and margins, so the frame and its glow have room on every side.
//
// The heights are inline styles on the ha-code-editor host, .cm-editor and .cm-scroller. The
// companion layer owns those elements (docs/contracts/STYLE_OWNERSHIP_CONTRACT.md); the codebox
// style runtime does not write them. The tab scan enters only the known editor hosts
// (OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR), depth-capped, never every element.
//
// Active by default; dormant while a standalone companion script owns the layer or the layer is
// switched off by hand (companionLayerActive).

import { companionLayerActive } from './coordinatorRuntime.js';
import { insideCardOwnEditor, nestedInCardOwnEditor } from '../editor/cardOwnEditor.js';
import { OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR } from '../editor/overlayRoot.js';
import { CARD_DIALOG_EDITOR_PANE, CARD_DIALOG_STACKED_MEDIA, PANEL_ROW_EDITOR_HOST } from '../editor/haSelectors.js';
import { HA_DIALOG, HA_DIALOG_FOOTER, HA_FORM, HA_SELECTOR, HA_YAML_EDITOR, HUI_CARD_ELEMENT_EDITOR, HUI_DIALOG_EDIT_CARD, OPTION_TAB_CONTAINERS, OPTION_TABS, WA_DIALOG } from '../editor/haSelectors.js';

// Viewport formula heights for the card dialog's main codebox, used until the dialog can be
// measured. Applied inline with `!important` (setHeight), so they win over the frozen
// CODEBOX_CSS. The SIMPLE_* set is for an editor without the option tab row.
//
// .cm-editor and .cm-scroller end 14px above the bottom of the ha-code-editor host. That keeps
// the ends of the horizontal scrollbar and the vertical down arrow inside the 22px rounded
// corners of the frame (the host's ::before); at 14px the corner's inset is about 1.5px.
//
// The tabbed height comes from a measurement on Home Assistant at an inner height of 1358px and
// 100% zoom: the codebox starts 3vh + 310px from the top (dialog header, option tabs and the
// code toolbar), and the dialog ends at 97vh. Ending the box 30px inside the dialog gives
// 97vh - 30px - (3vh + 310px) = 94vh - 340px, which stays inside the dialog at every viewport
// height. Keep the 94vh slope of the dialog; change the constant only with a new measurement of
// where the codebox starts.
const WRAPPER_HEIGHT = 'calc(94vh - 340px)';
export const CM_HEIGHT = 'calc(94vh - 354px)';
export const SCROLLER_HEIGHT = 'calc(94vh - 354px)';
const SIMPLE_WRAPPER_HEIGHT = 'calc(94vh - 150px)';
export const SIMPLE_CM_HEIGHT = 'calc(94vh - 164px)';
export const SIMPLE_SCROLLER_HEIGHT = 'calc(94vh - 164px)';
// Panel editors (Developer Tools, the raw dashboard configuration, the automation and script
// editors). Home Assistant draws them edge to edge, below the 56px header and down to the bottom
// of the window, which leaves no room for the frame's 52px outer glow. The host gets 56px of
// room on each side and 52px above, and a maximum height that leaves 52px below
// (56 + 52 + 52 = 160px); a short editor keeps its natural height. Nothing above the host clips,
// so the room is all visible glow. In the card dialog the pane around the editor gives it that
// room already.
export const PANEL_MAX_HEIGHT = 'calc(100vh - 160px)';
export const PANEL_TOP_ROOM = '52px';
export const PANEL_SIDE_ROOM = '56px';
export const PANEL_MAX_WIDTH = 'calc(100% - 112px)';
// The scroller and content padding of CODEBOX_CSS, so the last line number and the end of the
// scrollbar stay clear of the frame's rounded bottom corners as they do in the card dialog.
// Panels do not get CODEBOX_CSS itself: its 54vw width is for the two panes of the dialog.
export const PANEL_SCROLLER_PADDING = '16px 18px 30px 14px';
export const PANEL_CONTENT_PADDING = '0 8px 18px 0';
// The scrollbar sits on the scroller's right edge. Insetting that edge by 18px, the gap the card
// dialog has between its scroller (54vw - 18px) and its pane (54vw), keeps the bottom end of the
// scrollbar inside the rounded corner.
export const PANEL_SCROLLER_MAX_WIDTH = 'calc(100% - 18px)';

// Measured fit for the card dialog's main codebox. The viewport formulas above assume a fixed
// amount of dialog chrome above the editor, and that amount varies with the card (option tab
// row, the tab bar and toolbar of a stack's sub-card, alerts), the Home Assistant release and
// the window size (on 2026.11 a stack sub-card editor ended 114px below the dialog). Once the
// editor is laid out, its height is taken from where it starts and where the dialog footer is.
export const FIT_FOOTER_GAP_PX = 22; // the gap the simple formula leaves above the footer
export const FIT_DIALOG_INSET_PX = 30; // used against the dialog edge when no footer is found
export const FIT_MIN_HEIGHT_PX = 160;
export const FIT_FLUSH_CLEARANCE_PX = 14; // editor + scroller sit this far above the host bottom

const CODEBOX_ENLARGE_SHIPPED_ACTIVE = true;

// The hosts the tab scan enters, and how deep.
const TAB_SCAN_HOST_SELECTOR = OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR;
const DEFAULT_MAX_DEPTH = 12;

function defaultVisible(el, globalRef) {
  try {
    const r = el?.getBoundingClientRect?.();
    if (!r || r.width <= 0 || r.height <= 0) return false;
    const cs = (globalRef?.getComputedStyle || globalThis.getComputedStyle)?.(el);
    if (!cs) return true;
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
  } catch {
    return false;
  }
}

function looksLikeNostrodomusUi(node) {
  try {
    const id = String(node?.id || '');
    const cls = String(node?.className || '');
    if (node?.dataset?.nostrodomusUi === '1') return true;
    if (id.startsWith('nostrodomus-')) return true;
    return cls.includes('nostrodomus-settings') || cls.includes('nostrodomus-suggestion') || cls.includes('nostrodomus');
  } catch {
    return false;
  }
}

// True when a composed ancestor is a row (or the row sidebar) of the visual automation/script editor.
function insidePanelRowEditor(node) {
  let n = node;
  let guard = 0;
  while (n && guard++ < 60) {
    if (PANEL_ROW_EDITOR_HOST.test(String(n.localName || ""))) return true;
    const root = n.getRootNode?.();
    n = root?.host || n.parentElement || null;
  }
  return false;
}

// The nearest element matching `selector`, walking up through shadow hosts.
function composedClosestSelector(node, selector) {
  let n = node;
  while (n) {
    try { if (n.matches?.(selector)) return n; } catch { /* detached */ }
    const root = n.getRootNode?.();
    n = root?.host || n.parentElement || null;
  }
  return null;
}

// The shadow root that holds CodeMirror, from any editor node. The active editor is the
// `.cm-editor` div (activeEditorCacheRuntime.styleEditorFromNode); its root node is the
// ha-code-editor shadow root, whose host gets the wrapper height. The last branch returns a
// local variable because tests/test_settings_out_of_band_static.py rejects the text
// `return host.shadowRoot` in the bundle.
function codeShadowRootForEditor(editor) {
  if (!editor) return null;
  try {
    if (editor.shadowRoot) return editor.shadowRoot;
  } catch { /* detached */ }
  try {
    const root = editor.getRootNode?.();
    if (root && root.host && typeof root.querySelector === 'function') return root;
  } catch { /* detached */ }
  try {
    const editorHost = editor.closest?.('ha-code-editor');
    const editorHostRoot = editorHost?.shadowRoot || null;
    if (editorHostRoot) return editorHostRoot;
  } catch { /* detached */ }
  return null;
}

/** @param {Record<string, any>} [deps] */
export function createCodeboxEnlargeRuntime(deps = {}) {
  const {
    globalRef = globalThis,
    storage,
    isActive,
    visible = (el) => defaultVisible(el, globalRef),
    maxDepth = DEFAULT_MAX_DEPTH,
    // style.universalCodebox: whether panel editors are sized at all.
    universalCodeboxEnabled = () => true,
    ResizeObserver: ResizeObserverRef = globalRef?.ResizeObserver,
    requestAnimationFrame: rafRef = globalRef?.requestAnimationFrame?.bind?.(globalRef),
    cancelAnimationFrame: cafRef = globalRef?.cancelAnimationFrame?.bind?.(globalRef),
  } = deps;

  // Whether each dialog is simple or tabbed, by dialog element, for this page load only.
  const dialogModeCache = new WeakMap();
  // Last measured wrapper height per ha-code-editor host, so an unchanged fit writes nothing.
  const lastFit = new WeakMap();
  // One layout watcher for the fitted editor. The element editor that contains the codebox is
  // auto-height, so anything that appears above the codebox (tab row, stack tab bar, alert)
  // changes its size. That is the signal to re-fit; no timer or polling is involved.
  const watch = { observer: null, target: null, editor: null, frame: 0, sized: null };

  function stopWatching() {
    try { watch.observer?.disconnect?.(); } catch { /* injected observer */ }
    if (watch.frame && typeof cafRef === 'function') { try { cafRef(watch.frame); } catch { /* injected timer */ } }
    watch.observer = null;
    watch.target = null;
    watch.editor = null;
    watch.frame = 0;
  }

  // The element editor nearest the dialog (a stack card nests a second one for its sub-card).
  function outermostElementEditor(editor, dialog) {
    let found = null;
    let node = editor;
    for (let hops = 0; node && node !== dialog && hops < 24; hops += 1) {
      try { if (node.matches?.(HUI_CARD_ELEMENT_EDITOR)) found = node; } catch { /* detached */ }
      let next = null;
      try { next = node.getRootNode?.()?.host || node.parentElement || null; } catch { next = null; }
      node = next;
    }
    return found;
  }

  function watchLayout(editor, dialog) {
    if (typeof ResizeObserverRef !== 'function') return;
    const target = outermostElementEditor(editor, dialog);
    if (!target) return;
    if (watch.target === target) { watch.editor = editor; return; }
    stopWatching();
    try {
      watch.observer = new ResizeObserverRef(() => {
        if (watch.frame) return;
        const run = () => {
          watch.frame = 0;
          const current = watch.editor;
          if (!current || current.isConnected === false) { stopWatching(); return; }
          try { applyForEditor(current); } catch { /* a failed fit leaves the current height */ }
        };
        // Deferred to the next frame so the write never lands inside the observer's own delivery.
        watch.frame = typeof rafRef === 'function' ? (rafRef(run) || 0) : (run(), 0);
      });
      watch.observer.observe(target);
      watch.target = target;
      watch.editor = editor;
    } catch {
      stopWatching();
    }
  }

  function active() {
    if (typeof isActive === 'function') return !!isActive();
    return companionLayerActive({ globalRef, storage, shippedDefault: CODEBOX_ENLARGE_SHIPPED_ACTIVE });
  }

  // A visible tab container, or at least two visible tabs that are not Nostrodomus's own UI,
  // means a tabbed editor. Enters only the known editor hosts, at most maxDepth deep.
  function hasOptionTabs(dialogShadowRoot) {
    if (!dialogShadowRoot?.querySelectorAll) return false;
    const seen = new Set();
    const stack = [{ root: dialogShadowRoot, depth: 0 }];
    while (stack.length) {
      const { root, depth } = stack.pop();
      if (!root || seen.has(root)) continue;
      seen.add(root);
      if (looksLikeNostrodomusUi(root.host)) continue;

      let containers = [];
      let tabs = [];
      try { containers = Array.from(root.querySelectorAll(OPTION_TAB_CONTAINERS) || []); } catch { containers = []; }
      try { tabs = Array.from(root.querySelectorAll(OPTION_TABS) || []); } catch { tabs = []; }
      if (containers.some((el) => visible(el) && !looksLikeNostrodomusUi(el))) return true;
      if (tabs.filter((el) => visible(el) && !looksLikeNostrodomusUi(el)).length >= 2) return true;

      if (depth >= maxDepth) continue;
      let hosts = [];
      try { hosts = Array.from(root.querySelectorAll(TAB_SCAN_HOST_SELECTOR) || []); } catch { hosts = []; }
      for (const host of hosts) {
        if (host?.shadowRoot && !seen.has(host.shadowRoot)) stack.push({ root: host.shadowRoot, depth: depth + 1 });
      }
    }
    return false;
  }

  // The simple or tabbed verdict for a dialog, from this measurement and what the dialog was
  // before. While the settings panel is open the remembered verdict stands: the panel is attached
  // inside the dialog, and a measurement taken then is not used. Otherwise tabs win: tabs seen
  // now turn a simple dialog tabbed (they were not laid out yet at the first measurement), and a
  // dialog once seen with tabs stays tabbed through a measurement taken mid-rebuild, when the row
  // has no size. The verdict is pure over the arguments and the per-dialog memory, so it is
  // tested without a DOM.
  /** @param {any} dialogKey @param {Record<string, any>} [options] */
  function learnedHeights(dialogKey, options = {}) {
    const { detectedSimple, settingsOpen = false } = options;
    const cached = dialogKey ? dialogModeCache.get(dialogKey) : null;
    let simple = detectedSimple;
    if (cached) {
      if (settingsOpen) simple = cached.simple;
      else if (cached.simple === false) simple = false;
    }
    if (dialogKey) {
      // A dialog first seen as simple and then with tabs is remembered as tabbed, so that opening
      // the settings panel does not bring back the taller simple height.
      const tabsAppeared = !!cached && cached.simple === true && detectedSimple === false && !settingsOpen;
      const shouldWriteCache = !cached || simple === true || (!settingsOpen && cached.simple !== true) || tabsAppeared;
      if (shouldWriteCache) dialogModeCache.set(dialogKey, { simple });
    }
    return {
      simple,
      wrapper: simple ? SIMPLE_WRAPPER_HEIGHT : WRAPPER_HEIGHT,
      cm: simple ? SIMPLE_CM_HEIGHT : CM_HEIGHT,
      scroller: simple ? SIMPLE_SCROLLER_HEIGHT : SCROLLER_HEIGHT,
    };
  }

  function setHeight(el, value) {
    if (!el?.style?.setProperty) return;
    try {
      el.style.setProperty('height', value, 'important');
      el.style.setProperty('max-height', value, 'important');
      el.style.setProperty('min-height', '0', 'important');
    } catch { /* detached element */ }
  }

  function rectOf(el) {
    try {
      const rect = el?.getBoundingClientRect?.();
      return rect && Number.isFinite(rect.top) && Number.isFinite(rect.bottom) ? rect : null;
    } catch {
      return null;
    }
  }

  // The lowest y the codebox may reach inside its dialog: just above the footer row, or just
  // inside the dialog edge when there is no footer, and never below the window.
  function fitBottomForDialog(dialog) {
    let bottom = 0;
    let haDialog = null;
    let footer = null;
    try { haDialog = dialog?.shadowRoot?.querySelector?.(HA_DIALOG) || null; } catch { haDialog = null; }
    try { footer = dialog?.shadowRoot?.querySelector?.(HA_DIALOG_FOOTER) || null; } catch { footer = null; }
    const footerRect = rectOf(footer);
    if (footerRect && footerRect.height > 0) {
      bottom = footerRect.top - FIT_FOOTER_GAP_PX;
    } else {
      let surface = null;
      try { surface = haDialog?.shadowRoot?.querySelector?.(WA_DIALOG)?.shadowRoot?.querySelector?.('dialog') || null; } catch { surface = null; }
      const surfaceRect = rectOf(surface) || rectOf(haDialog) || rectOf(dialog);
      if (surfaceRect && surfaceRect.height > 0) bottom = surfaceRect.bottom - FIT_DIALOG_INSET_PX;
    }
    const viewportHeight = Number(globalRef?.innerHeight) || 0;
    if (viewportHeight > 0) {
      const viewportBottom = viewportHeight - FIT_DIALOG_INSET_PX;
      bottom = bottom > 0 ? Math.min(bottom, viewportBottom) : viewportBottom;
    }
    return bottom;
  }

  // True while the card dialog stacks the preview under the editor (a narrow window).
  function dialogLayoutIsStacked() {
    try { return globalRef?.matchMedia?.(CARD_DIALOG_STACKED_MEDIA)?.matches === true; } catch { return false; }
  }

  // The lowest y the codebox may reach in the stacked layout: just inside the bottom of the
  // editor pane, which ends where the preview begins. The footer is no use as a reference there:
  // the dialog body scrolls, so the distance from the codebox to the footer changes with the
  // scroll position, while the codebox and its pane move together.
  function fitBottomForStackedPane(editor, dialog) {
    const elementEditor = outermostElementEditor(editor, dialog);
    let pane = null;
    try { pane = elementEditor?.closest?.(CARD_DIALOG_EDITOR_PANE) || null; } catch { pane = null; }
    const paneRect = rectOf(pane);
    return paneRect && paneRect.height > 0 ? paneRect.bottom - FIT_FOOTER_GAP_PX : 0;
  }

  // Heights in px that make the wrapper end at the fit bottom, or null while that cannot be
  // measured (not laid out yet, zero-sized dialog during the open animation, no layout engine).
  function measuredHeights(wrapper, dialog, editor = null) {
    const rect = rectOf(wrapper);
    if (!rect || !(rect.width > 0)) return null;
    const bottom = dialogLayoutIsStacked() ? fitBottomForStackedPane(editor, dialog) : fitBottomForDialog(dialog);
    if (!(bottom > 0)) return null;
    const wrapperPx = Math.max(FIT_MIN_HEIGHT_PX, Math.floor(bottom - rect.top));
    const innerPx = wrapperPx - FIT_FLUSH_CLEARANCE_PX;
    return { measured: true, wrapperPx, wrapper: `${wrapperPx}px`, cm: `${innerPx}px`, scroller: `${innerPx}px` };
  }

  // What the panel branch wrote: for each element, the inline value and priority every property
  // had before, so teardown and style.universalCodebox can put them back.
  const panelSized = new Map();

  function setPanelProperty(el, prop, value) {
    let before = panelSized.get(el);
    if (!before) { before = new Map(); panelSized.set(el, before); }
    if (!before.has(prop)) {
      before.set(prop, { value: el.style.getPropertyValue?.(prop) || '', priority: el.style.getPropertyPriority?.(prop) || '' });
    }
    el.style.setProperty(prop, value, 'important');
  }

  // Put back what the panel branch wrote. An element that left the page is only forgotten.
  function restorePanelSizing() {
    for (const [el, before] of panelSized) {
      if (el?.isConnected === false) continue;
      for (const [prop, old] of before) {
        try {
          if (old.value) el.style.setProperty(prop, old.value, old.priority);
          else el.style.removeProperty?.(prop);
        } catch { /* detached element */ }
      }
    }
    panelSized.clear();
  }

  function forgetDetachedPanelSizing() {
    for (const el of Array.from(panelSized.keys())) {
      if (el?.isConnected === false) panelSized.delete(el);
    }
  }

  // Panel editors get a maximum height and no fixed height, so a short script keeps its own.
  function setMaxHeight(el, value) {
    if (!el?.style?.setProperty) return;
    try {
      setPanelProperty(el, 'max-height', value);
      setPanelProperty(el, 'min-height', '0');
    } catch { /* detached element */ }
  }

  // Room for the glow above and on both sides of the panel's ha-code-editor host (below, the
  // maximum height leaves it). Margins plus a maximum width give equal room on the left and right
  // whether the container is a flex box or a block.
  function setFrameRoom(el) {
    if (!el?.style?.setProperty) return;
    try {
      setPanelProperty(el, 'box-sizing', 'border-box');
      setPanelProperty(el, 'max-width', PANEL_MAX_WIDTH);
      setPanelProperty(el, 'margin-left', PANEL_SIDE_ROOM);
      setPanelProperty(el, 'margin-right', PANEL_SIDE_ROOM);
      setPanelProperty(el, 'margin-top', PANEL_TOP_ROOM);
    } catch { /* detached element */ }
  }

  // The card dialog's inner padding on the panel's scroller and content (see PANEL_SCROLLER_PADDING).
  function setCornerClearance(scroller, content) {
    if (scroller?.style?.setProperty) {
      try {
        setPanelProperty(scroller, 'padding', PANEL_SCROLLER_PADDING);
        setPanelProperty(scroller, 'box-sizing', 'border-box');
        setPanelProperty(scroller, 'max-width', PANEL_SCROLLER_MAX_WIDTH);
      } catch { /* detached element */ }
    }
    if (content?.style?.setProperty) {
      try {
        setPanelProperty(content, 'padding', PANEL_CONTENT_PADDING);
        setPanelProperty(content, 'box-sizing', 'border-box');
      } catch { /* detached element */ }
    }
  }

  // Sizes the editor: the panel treatment outside a card dialog, the measured fit or the viewport
  // formula for the dialog's main codebox, nothing for any other editor. Does nothing while the
  // layer is dormant. `settingsOpen` keeps the remembered simple or tabbed verdict while the
  // settings panel is open (see learnedHeights).
  /** @param {any} editor @param {Record<string, any>} [options] */
  function applyForEditor(editor, options = {}) {
    const { settingsOpen = false } = options;
    if (!active() || !editor) return null;
    if (panelSized.size) forgetDetachedPanelSizing();
    const codeRoot = codeShadowRootForEditor(editor);
    if (!codeRoot) return null;
    // The wrapper is the ha-code-editor host, not the `.cm-editor` that is passed in.
    const wrapper = codeRoot.host || null;
    const cmEditor = codeRoot.querySelector?.('.cm-editor') || null;
    const cmScroller = codeRoot.querySelector?.('.cm-scroller') || null;
    const cmContent = codeRoot.querySelector?.('.cm-content') || null;
    const dialog = composedClosestSelector(editor, HUI_DIALOG_EDIT_CARD);

    if (!dialog) {
      // A panel editor (see PANEL_MAX_HEIGHT). With style.universalCodebox off, a panel editor
      // that was sized earlier is handed back.
      if (!universalCodeboxEnabled()) { restorePanelSizing(); return null; }
      // Only the panel's main editor. The YAML editor of one row in the visual automation or
      // script editor, and a code field inside a form, are small editors inside the page.
      if (insidePanelRowEditor(editor) || composedClosestSelector(editor, `${HA_FORM}, ${HA_SELECTOR}`)) return { embedded: true };
      setFrameRoom(wrapper);
      setMaxHeight(wrapper, PANEL_MAX_HEIGHT);
      setMaxHeight(cmEditor, PANEL_MAX_HEIGHT);
      setMaxHeight(cmScroller, PANEL_MAX_HEIGHT);
      setCornerClearance(cmScroller, cmContent);
      return { panel: true, maxHeight: PANEL_MAX_HEIGHT, frameRoom: true, cornerClearance: true };
    }

    // Only the dialog's main codebox gets the dialog heights. It is always inside ha-yaml-editor
    // and never inside a form control or a custom card's own editor; any other code editor in
    // the dialog (one a card embeds, a form field) would grow past the window with them.
    const isMainCodebox = !!composedClosestSelector(editor, HA_YAML_EDITOR)
      && !composedClosestSelector(editor, `${HA_FORM}, ${HA_SELECTOR}`)
      && !insideCardOwnEditor(editor)
      && !nestedInCardOwnEditor(editor);
    if (!isMainCodebox) return { embedded: true };

    watch.sized = { wrapper, cmEditor, cmScroller };
    watchLayout(editor, dialog);
    // Measured fit first: it accounts for whatever sits above the editor, so it needs no simple
    // or tabbed verdict. The viewport formulas apply only until the layout can be measured.
    const fitted = measuredHeights(wrapper, dialog, editor);
    if (fitted) {
      if (lastFit.get(wrapper) === fitted.wrapperPx) return fitted;
      setHeight(wrapper, fitted.wrapper);
      setHeight(cmEditor, fitted.cm);
      setHeight(cmScroller, fitted.scroller);
      lastFit.set(wrapper, fitted.wrapperPx);
      return fitted;
    }
    const detectedSimple = !hasOptionTabs(dialog?.shadowRoot || null);
    const heights = learnedHeights(dialog || editor, { detectedSimple, settingsOpen });
    // The formula heights replace the fitted ones, so the remembered fit no longer describes
    // what is on the element. Forget it, or an equal fit later would be skipped as unchanged.
    if (wrapper) lastFit.delete(wrapper);
    setHeight(wrapper, heights.wrapper);
    setHeight(cmEditor, heights.cm);
    setHeight(cmScroller, heights.scroller);
    // Horizontal overflow is left to the NO_WRAP sheet of companionStyleRuntime.
    return heights;
  }

  // Re-fit an editor that is already sized: one layout read, and a write only when the
  // available height changed (tab row rendered, alert appeared, window resized).
  function refitForEditor(editor) {
    if (!active() || !editor) return null;
    const dialog = composedClosestSelector(editor, HUI_DIALOG_EDIT_CARD);
    if (!dialog) return null;
    return applyForEditor(editor);
  }

  // Stop watching and hand the card dialog's codebox and any sized panel editor back to Home
  // Assistant's own sizing.
  function teardown() {
    const sized = watch.sized;
    stopWatching();
    watch.sized = null;
    restorePanelSizing();
    for (const el of [sized?.wrapper, sized?.cmEditor, sized?.cmScroller]) {
      if (!el?.style?.removeProperty) continue;
      try {
        el.style.removeProperty('height');
        el.style.removeProperty('max-height');
        el.style.removeProperty('min-height');
      } catch { /* detached element */ }
    }
    if (sized?.wrapper) lastFit.delete(sized.wrapper);
  }

  return {
    applyForEditor,
    refitForEditor,
    teardown,
    // The layout watcher of the fitted editor, for the observer readout and the manual
    // disconnect in diagnostics. The next fit watches again.
    layoutObserverCount: () => (watch.observer ? 1 : 0),
    stopWatchingLayout: stopWatching,
    learnedHeights,
    hasOptionTabs,
    isActive: active,
  };
}
