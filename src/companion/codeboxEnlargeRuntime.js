// Companion codebox-enlargement learned memory.
//
// The codebox enlargement to the tabbed height ships in the static CSS. This module
// adds the learned refinement: editors without the Layout/Visibility/Config option-tab
// row ("simple" editors) have unused vertical space, so the codebox can extend taller.
// The mode is keyed per-dialog with a never-downgrade memory.
//
// Two adaptations forced by the binding gates (the stricter rule wins):
//  - Ownership: main cedes CodeMirror internals to the companion (property-ownership
//    contract), so this lives in the companion layer (sibling to scrollbarStyleRuntime),
//    not in main's apply. It sets inline heights on .cm-editor/.cm-scroller
//    (companion-owned); main's apply still skips them, protected tests unchanged.
//  - No-wildcard: the tab scan must not use `querySelectorAll("*")`, so it is a
//    bounded, depth-capped traversal that descends only into the registry's known
//    editor-host types (OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR) and queries the
//    registry's tab selectors at each root.
//
// Active by default; dormant under an external legacy companion or the force-dormant
// flag (companionLayerActive).

import { companionLayerActive } from './coordinatorRuntime.js';
import { insideCardOwnEditor, nestedInCardOwnEditor } from '../editor/cardOwnEditor.js';
import { OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR } from '../editor/overlayRoot.js';
import { CARD_DIALOG_EDITOR_PANE, CARD_DIALOG_STACKED_MEDIA, PANEL_ROW_EDITOR_HOST } from '../editor/haSelectors.js';
import { HA_DIALOG, HA_DIALOG_FOOTER, HA_FORM, HA_SELECTOR, HA_YAML_EDITOR, HUI_CARD_ELEMENT_EDITOR, HUI_DIALOG_EDIT_CARD, OPTION_TAB_CONTAINERS, OPTION_TABS, WA_DIALOG } from '../editor/haSelectors.js';

// Height constants. The tabbed defaults match the static codebox CSS; the SIMPLE_*
// set is the taller override this module applies. Applied inline `!important`
// (setHeight) to the dialog's MAIN codebox only, so they win over the frozen
// CODEBOX_CSS and do not touch the form-nested Layout editor (FORM_NESTED_FILL).
//
// Scrollbar-flush clearance: editor + scroller sit 14px above the host bottom (wrapper
// height MINUS 14), down from the old ~38-40px frosted dead-strip. That brings the
// horizontal scrollbar riding the .cm-scroller bottom close to flush while keeping its
// ends — and the vertical down-arrow — clear of the host ::before 22px rounded frame
// corners. A true-flush editor with the deliberate CONTENT_FIT square clip
// (border-radius:0, which un-clips the down-arrow) pokes the bar past the corner arc;
// rounding the content back would re-clip the down-arrow. 14px is the clean middle: at
// that height the frame's corner inset is ~1.5px, so any arc overlap is sub-pixel.
// Editor and scroller share the height so the residual strip is uniform.
// Tabbed-lane height, derived from a measurement on a real HA instance
// (innerHeight 1358, zoom 100%): the tabbed codebox TOP sits at 3vh + ~310px of fixed
// dialog chrome (header + option tabs + code-mode toolbar; measured top 351px). The
// dialog bottom edge is at 97vh, so ending the box 30px inside it gives
// 97vh - 30 - (3vh + 310) = 94vh - 340px — the tallest box that stays inside the
// dialog at every viewport height. Two earlier constants missed for want of this
// measurement: 110vh - 399px outgrew the 94vh dialog on tall screens, and
// 94vh - 198px assumed ~250px of chrome and ran 72px off a 1358px screen. The height
// must keep the dialog's own 94vh slope; only the constant may change, and only with
// a fresh top-offset measurement. SIMPLE and panel lanes untouched.
const WRAPPER_HEIGHT = 'calc(94vh - 340px)';
export const CM_HEIGHT = 'calc(94vh - 354px)';
export const SCROLLER_HEIGHT = 'calc(94vh - 354px)';
const SIMPLE_WRAPPER_HEIGHT = 'calc(94vh - 150px)';
export const SIMPLE_CM_HEIGHT = 'calc(94vh - 164px)';
export const SIMPLE_SCROLLER_HEIGHT = 'calc(94vh - 164px)';
// Non-card-dialog panel editors (Dev Tools / raw config / automation / script YAML). HA otherwise fills
// the editor edge-to-edge in the panel (ha-code-editor top 56, bottom == viewport bottom, ~full width),
// so the host-owned glow halo and the frame have no room: the glow shows only where there happens to be a
// gap. The card editor shows the glow on all sides because its ha-code-editor is smaller than its
// overflow:visible pane (the pane is calc(94vh - 198px) but the editor is calc(94vh - 437px) → ~239px of
// vertical room, plus pane padding and the 98vw dialog around the 54vw editor). So for panels we shrink
// the host with room on every side (~10%): the glow halo (the ::before's `0 0 52px` outer shadow) then
// shows all around and the frame (incl. the bottom border) wraps the box cleanly. Nothing clips it
// (nearest clipping ancestor = null), so room equals visible glow. Values leave ≈56px each side for the
// 52px halo; max-height (top header 56 + top room 52 + bottom room 52 = 160) caps tall scripts (short ones
// keep their natural size). All applied inline → panel-scoped; the card dialog uses its learned heights.
export const PANEL_MAX_HEIGHT = 'calc(100vh - 160px)';
export const PANEL_TOP_ROOM = '52px';
export const PANEL_SIDE_ROOM = '56px';
export const PANEL_MAX_WIDTH = 'calc(100% - 112px)';
// Inner clearance so the editor content, gutter line numbers and scrollbar clear the frame's 22px rounded
// bottom corners. Without it the content fills square to the frame's bottom edge, so the last line number
// (bottom-left) and the scrollbar end (bottom-right) run into the corner curve and get clipped. These
// mirror the card editor's CODEBOX_CSS scroller + content padding exactly: the card never clips because it
// carries this padding; panels share the same frame but never get CODEBOX_CSS (it also holds the 54vw
// width that squished panels), so we apply just the padding here. Same padding on the same frame gives the
// same result. Padding only, never the card's width/height.
export const PANEL_SCROLLER_PADDING = '16px 18px 30px 14px';
export const PANEL_CONTENT_PADDING = '0 8px 18px 0';
// The scrollbar rides the scroller's right edge; with the scroller full-width that edge sits at the
// frame's right edge, so the scrollbar's bottom end pokes past the rounded bottom-right corner. Inset the
// scroller's right edge by the card editor's exact 18px gap (the card's scroller is calc(54vw - 18px),
// 18px narrower than its 54vw pane) so the scrollbar clears the 22px corner. Same frame and same gap gives
// the same result.
export const PANEL_SCROLLER_MAX_WIDTH = 'calc(100% - 18px)';

// Measured fit for the card dialog's main codebox. The viewport formulas above assume a fixed
// amount of dialog chrome above the editor. That amount varies with the card (option-tab row,
// stack sub-card tab bar and toolbar, alerts), the Home Assistant release and the window size,
// and every mismatch pushed the box below the dialog (measured live on 2026.11: a stack
// sub-card editor ended 114px below the dialog and 98px below the window). When the editor is
// laid out, its height is instead taken from where it actually starts and where the dialog
// footer actually is. The formulas remain only as the value used before layout is measurable.
export const FIT_FOOTER_GAP_PX = 22; // the gap the SIMPLE lane leaves above the footer when it fits
export const FIT_DIALOG_INSET_PX = 30; // used against the dialog edge when no footer is found
export const FIT_MIN_HEIGHT_PX = 160;
export const FIT_FLUSH_CLEARANCE_PX = 14; // editor + scroller sit this far above the host bottom

// Active by default. An external legacy companion or the force-dormant flag still keeps
// this internal layer dormant (companionLayerActive).
const CODEBOX_ENLARGE_SHIPPED_ACTIVE = true;

// The bounded host-descent selector (registry-sourced) + the depth cap.
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

// Walk up composed parents to the nearest selector match (the host-chain idiom).
function composedClosestSelector(node, selector) {
  let n = node;
  while (n) {
    try { if (n.matches?.(selector)) return n; } catch { /* detached */ }
    const root = n.getRootNode?.();
    n = root?.host || n.parentElement || null;
  }
  return null;
}

// Resolve the shadow root that hosts CodeMirror from any editor node. The active editor
// (activeEditorCacheRuntime.styleEditorFromNode) is the `.cm-editor` div, which has no
// shadowRoot of its own: its getRootNode() is the ha-code-editor shadow root (whose `.host`
// is the wrapper element the WRAPPER height applies to). Returns a local, never the literal
// `return host.shadowRoot`, which a settings-overlay regression guard
// (test_settings_out_of_band_static) forbids in dist.
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
    // Gate the non-card-dialog panel max-height cap (default on). Panels are only
    // discovered/styled when style.universalCodebox is on, so this is also implicitly gated.
    universalCodeboxEnabled = () => true,
    ResizeObserver: ResizeObserverRef = globalRef?.ResizeObserver,
    requestAnimationFrame: rafRef = globalRef?.requestAnimationFrame?.bind?.(globalRef),
    cancelAnimationFrame: cafRef = globalRef?.cancelAnimationFrame?.bind?.(globalRef),
  } = deps;

  // Per-dialog learned mode (WeakMap keyed by the dialog element) — in-session only,
  // exactly as v17 (no persistence).
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
          try { applyForEditor(current); } catch { /* fail-dark: sizing never throws into layout */ }
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

  // Bounded tab detection: a visible tab container, or >=2 visible tabs (excluding
  // Nostrodomus's own UI), means a tabbed editor. Descends only into known editor-host
  // shadow roots, capped at maxDepth (the no-wildcard law).
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

  // The learned memory: a dialog that has safely learned simple=true is not downgraded
  // by transient detection (the settingsOpen guard); a real tab render after the first
  // measurement DOES downgrade (the runoff repair). Pure over (detectedSimple,
  // settingsOpen) + the per-dialog cache, so the truth table is unit-testable without
  // the DOM.
  /** @param {any} dialogKey @param {Record<string, any>} [options] */
  function learnedHeights(dialogKey, options = {}) {
    const { detectedSimple, settingsOpen = false } = options;
    const cached = dialogKey ? dialogModeCache.get(dialogKey) : null;
    let simple = detectedSimple;
    if (cached) {
      if (settingsOpen) {
        simple = cached.simple;
      } else if (cached.simple === true && detectedSimple === false) {
        simple = false; // runoff repair: real tabs rendered after the first measurement
      } else if (cached.simple === false && detectedSimple === true) {
        // Sticky tabbed: a dialog already learned as TABBED must not be flipped to simple by a
        // single transient no-tabs measurement (a 0-sized / mid-rebuild moment when the tab row
        // isn't measurable). Tabs are the truth — once seen, don't let a runoff moment poison the
        // cache to simple=true (which then rides the settingsOpen guard and oversizes the codebox).
        simple = false;
      }
    }
    if (dialogKey) {
      // Persist the runoff repair too. The 0-sized settle ladder can mis-learn a genuinely TABBED
      // editor as simple=true (tabs aren't measurable yet); when tabs finally render the repair
      // corrects the RETURNED value to simple=false, but this write-guard was false in that case, so
      // the cache kept simple=true — and then opening Nostrodomus settings hit the settingsOpen guard,
      // read the stale simple=true, and made a tabbed codebox 249px too tall. Persisting the repair
      // makes the memory match the corrected verdict.
      const runoffRepaired = !!cached && cached.simple === true && detectedSimple === false && !settingsOpen;
      const shouldWriteCache = !cached || simple === true || (!settingsOpen && cached.simple !== true) || runoffRepaired;
      if (shouldWriteCache) {
        dialogModeCache.set(dialogKey, {
          simple,
          detectedSimple,
          settingsOpen,
          stickySimple: cached?.simple === true && detectedSimple === false,
        });
      }
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
  // had before, so teardown and the universal switch can put them back. Without it uninstall
  // left the margins, the height cap and the corner padding on the panel editor.
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

  // Cap-only sizing for panel editors: sets max-height (so the box leaves room for the glow halo and a
  // clean bottom border) without a fixed height, so a short script keeps its natural size.
  function setMaxHeight(el, value) {
    if (!el?.style?.setProperty) return;
    try {
      setPanelProperty(el, 'max-height', value);
      setPanelProperty(el, 'min-height', '0');
    } catch { /* detached element */ }
  }

  // Inset the panel ha-code-editor host from its container on the top and both sides so the host-owned
  // glow halo has room there too (the bottom room comes from the max-height gap). Left margin + max-width
  // leave equal left/right room without depending on the container being flex vs block; top margin drops
  // the box below the panel header so the top glow shows on the panel surface, not under the header.
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

  // Give the panel's scroller + content the card editor's exact inner padding so the content, gutter line
  // numbers and scrollbar clear the frame's rounded bottom corners (the card uses these values and never
  // clips). Padding only, not the card's 54vw width/height (those squish panels).
  function setCornerClearance(scroller, content) {
    if (scroller?.style?.setProperty) {
      try {
        setPanelProperty(scroller, 'padding', PANEL_SCROLLER_PADDING);
        setPanelProperty(scroller, 'box-sizing', 'border-box');
        // Right gap: inset the scroller (and the scrollbar it carries) from the frame's right edge so
        // the scrollbar's bottom end clears the rounded bottom-right corner (matching the card editor).
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

  // Editor-ready hook. Derives the dialog (composed walk-up), classifies simple vs
  // tabbed through the learned memory, and applies the inline height set to the
  // companion-owned CodeMirror internals + the ha-code-editor wrapper. No-op while
  // dormant. `settingsOpen` lets the caller protect a learned-simple dialog from a
  // transient downgrade while the Nostrodomus settings panel is open.
  /** @param {any} editor @param {Record<string, any>} [options] */
  function applyForEditor(editor, options = {}) {
    const { settingsOpen = false } = options;
    if (!active() || !editor) return null;
    if (panelSized.size) forgetDetachedPanelSizing();
    const codeRoot = codeShadowRootForEditor(editor);
    if (!codeRoot) return null;
    // The WRAPPER is the ha-code-editor host (codeRoot.host), NOT the node handed in — the active
    // editor is the inner `.cm-editor`. The cm-editor / cm-scroller resolve from the CodeMirror root.
    const wrapper = codeRoot.host || null;
    const cmEditor = codeRoot.querySelector?.('.cm-editor') || null;
    const cmScroller = codeRoot.querySelector?.('.cm-scroller') || null;
    const cmContent = codeRoot.querySelector?.('.cm-content') || null;
    const dialog = composedClosestSelector(editor, HUI_DIALOG_EDIT_CARD);

    if (!dialog) {
      // Non-card-dialog panel editor. HA fills it edge-to-edge in the panel, so the host-owned glow and
      // frame have no room (a max-height alone only opens the bottom). Mirror the card editor (where
      // ha-code-editor is smaller than its overflow:visible pane, with room on all sides): shrink the host
      // with room on the top and both sides (setFrameRoom) and a max-height that leaves bottom room, ~10%
      // overall. Nothing clips, so the glow halo shows all around and the frame (incl. bottom border)
      // wraps the box cleanly. Gated on universalCodebox; inline → panel-scoped; the card dialog (below)
      // keeps its learned heights.
      // With the switch off a panel editor that was sized earlier is handed back.
      if (!universalCodeboxEnabled()) { restorePanelSizing(); return null; }
      // Only the panel's main editor gets the panel margins and height cap. The YAML editor of one
      // row in the visual automation or script editor, and a code field inside a form, are small
      // editors inside the page; the panel treatment pushed them 56px in from each side.
      if (insidePanelRowEditor(editor) || composedClosestSelector(editor, `${HA_FORM}, ${HA_SELECTOR}`)) return { embedded: true };
      setFrameRoom(wrapper);
      setMaxHeight(wrapper, PANEL_MAX_HEIGHT);
      setMaxHeight(cmEditor, PANEL_MAX_HEIGHT);
      setMaxHeight(cmScroller, PANEL_MAX_HEIGHT);
      setCornerClearance(cmScroller, cmContent);
      return { panel: true, maxHeight: PANEL_MAX_HEIGHT, frameRoom: true, cornerClearance: true };
    }

    // Only the dialog's MAIN codebox gets the dialog-scale learned heights. The main
    // editor is always ha-yaml-editor-wrapped and never inside a form control; a
    // combo/custom card's embedded auxiliary editor (a raw ha-code-editor, or one
    // nested in ha-form) would otherwise inherit the 94vh heights and blow off-screen.
    // Registry-only, layout-free -- a belt against a discovery mis-selection.
    const isMainCodebox = !!composedClosestSelector(editor, HA_YAML_EDITOR)
      && !composedClosestSelector(editor, `${HA_FORM}, ${HA_SELECTOR}`)
      && !insideCardOwnEditor(editor)
      && !nestedInCardOwnEditor(editor);
    if (!isMainCodebox) return { embedded: true };

    watch.sized = { wrapper, cmEditor, cmScroller };
    watchLayout(editor, dialog);
    // Measured fit first: it accounts for whatever sits above the editor, so it needs no
    // simple/tabbed verdict. The learned viewport formulas apply only until layout is measurable.
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
    // (The codebox's horizontal-overflow behavior is owned by the companion scrollbar layer's
    // additive NO_WRAP sheet — long lines extend, the bar appears only when needed — NOT set
    // inline here, so it doesn't override that sheet.)
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
