import { clearElement } from '../core/dom.js';
import { uiAccentVarsFromSettings } from '../ui/codeboxStyle.js';
import { matchSpans } from './filtering.js';
import { resolveItemDetail } from './lazyResolve.js';
import { signatureHintModel } from './signatureHelp.js';
import {
  completionAccent,
  completionDetailModel,
  completionPillLabel,
  completionVisualKind,
  iconFor,
} from '../ui/suggestionPopup.js';

// A box that Home Assistant removed from the page together with the dialog that hosted it still
// has display:block. It does not count as open; otherwise the first change in the next editor
// would refresh the list and show it there without Ctrl+Space.
export function completionPopupIsOpen(state) {
  return !!state?.overlay && state.overlay.isConnected !== false && state.overlay.style.display !== 'none';
}

export function closeCompletionPopup(state) {
  if (!state) return;
  state.lastExplicitOpen = false;
  if (state.overlay) state.overlay.style.display = 'none';
  clearCompletionPopupA11y(state);
}

export function removeCompletionOverlay(state, deps = {}) {
  const { clearPreservedScrollRestoreTimers } = deps;
  try { clearPreservedScrollRestoreTimers?.('overlay-remove'); } catch { /* injected delegate */ }
  clearCompletionPopupA11y(state);
  try {
    if (state?.a11yAnnouncer?.parentNode) state.a11yAnnouncer.parentNode.removeChild(state.a11yAnnouncer);
  } catch { /* detached node */ }
  if (state?.overlay?.parentNode) state.overlay.parentNode.removeChild(state.overlay);
  // The next placement puts the window listeners back; after an uninstall there is none.
  unwirePopupWindowReposition(state);
  if (state) {
    state.overlay = null;
    state.overlayRoot = null;
    state.a11yAnnouncer = null;
  }
}

// --- Accessibility: a live announcer for the active suggestion, and the ARIA combobox
// pattern wired onto the focused CodeMirror content element so a screen reader follows selection. ---

function completionOptionKindLabel(item) {
  return String(item?.type || item?.meta?.kind || 'suggestion').replace(/[-_]/g, ' ');
}

// "light.turn_on, service, 2 of 20" — read out on each selection change via the polite live region.
export function describeActiveCompletion(state) {
  const items = Array.isArray(state?.items) ? state.items : [];
  if (!items.length) return '';
  const i = Math.min(Math.max(0, state.selected || 0), items.length - 1);
  const label = String(items[i]?.label || items[i]?.insert || '').trim();
  if (!label) return '';
  return `${label}, ${completionOptionKindLabel(items[i])}, ${i + 1} of ${items.length}`;
}

// A visually-hidden aria-live region kept as a stable sibling of the popup (persists across the
// box re-render so screen readers see each text mutation). Created lazily on the overlay root.
function ensureCompletionAnnouncer(state, documentRef) {
  const root = state?.overlayRoot;
  if (!root || !documentRef?.createElement) return null;
  if (state.a11yAnnouncer && state.a11yAnnouncer.isConnected) return state.a11yAnnouncer;
  const node = documentRef.createElement('div');
  node.id = 'nostrodomus-a11y-announcer';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.setAttribute('aria-atomic', 'true');
  node.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
  try { root.appendChild(node); } catch { return null; }
  state.a11yAnnouncer = node;
  return node;
}

// Wire aria-controls/aria-expanded/aria-activedescendant onto the focused .cm-content so assistive
// tech tracks the active option while typing (ARIA 1.1 editable-combobox pattern). Without an
// editor element, or when the element rejects the attributes, nothing happens: the ARIA is extra
// and must never break editing.
export function syncCompletionEditorAria(state, open) {
  let content = null;
  try {
    // The attributes go on the editor the list serves (state.view, where the caret is). The style
    // cache's editor can be another editor on a page with several, so it is only the fallback.
    content = state?.view?.contentDOM
      || state?.view?.dom?.querySelector?.('.cm-content')
      || state?.activeEditorCache?.editor?.querySelector?.('.cm-content')
      || null;
  } catch { content = null; }
  if (!content || typeof content.setAttribute !== 'function') return;
  try {
    if (open && Array.isArray(state.items) && state.items.length) {
      const i = Math.min(Math.max(0, state.selected || 0), state.items.length - 1);
      // CodeMirror observes this element, and writing an attribute that already has the value
      // still queues a mutation record, so unchanged values are not written.
      const setIfChanged = (name, value) => {
        if (typeof content.getAttribute === 'function' && content.getAttribute(name) === value) return;
        content.setAttribute(name, value);
      };
      setIfChanged('aria-controls', 'nostrodomus-listbox');
      setIfChanged('aria-expanded', 'true');
      setIfChanged('aria-activedescendant', `nostrodomus-intelli-option-${i}`);
    } else {
      content.removeAttribute('aria-controls');
      content.removeAttribute('aria-expanded');
      content.removeAttribute('aria-activedescendant');
    }
  } catch { /* the ARIA is optional; editing goes on without it */ }
}

export function clearCompletionPopupA11y(state) {
  try { if (state?.a11yAnnouncer) state.a11yAnnouncer.textContent = ''; } catch { /* detached */ }
  syncCompletionEditorAria(state, false);
}

function updateCompletionA11y(state, documentRef) {
  const announcer = ensureCompletionAnnouncer(state, documentRef);
  if (announcer) announcer.textContent = describeActiveCompletion(state);
  syncCompletionEditorAria(state, Array.isArray(state?.items) && state.items.length > 0);
}

export function ensureCompletionOverlay(state, deps = {}) {
  const {
    documentRef = globalThis.document,
    overlayRoot,
    removeOverlay,
  } = deps;

  // The overlay root of a bound editor is the host element in the root node of the editor's own
  // DOM (nostrodomusCodeEditorOverlayRoot). While the box sits in a host in that root node,
  // resolving the root again would return the same host, so the lookup (which includes an
  // active-dialog search) is skipped. A refresh asks for the box several times.
  if (state.overlay && state.overlayRoot && state.overlay.parentNode === state.overlayRoot) {
    let viewRoot = null;
    try { viewRoot = (state.view || state.hookedView)?.dom?.getRootNode?.() || null; } catch { viewRoot = null; }
    if (viewRoot?.querySelector && viewRoot?.appendChild && state.overlayRoot.getRootNode?.() === viewRoot) {
      applyPopupAccentVars(state.overlay, state);
      return state.overlay;
    }
  }

  const root = overlayRoot?.();
  if (!root || !documentRef?.createElement) return null;

  if (state.overlay && state.overlayRoot === root) {
    // Reuse the live overlay, but refresh the accent so a settings change (new codebox color)
    // reflects without waiting for the overlay to be recreated. The signature guard makes the
    // per-render call a no-op when the accent is unchanged, so nothing writes on the hot path.
    applyPopupAccentVars(state.overlay, state);
    return state.overlay;
  }

  removeOverlay?.();

  const box = documentRef.createElement('div');
  box.id = 'nostrodomus-completions-root';
  box.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'isolation:isolate',
    'min-width:220px',
    'max-width:360px',
    'max-height:178px',
    'overflow:hidden',
    'padding:3px',
    'border-radius:9px',
    'background:rgba(10,14,22,0.97)',
    'border:1px solid rgba(var(--nostrodomus-brand-rgb, 120, 210, 255), 0.38)',
    'box-shadow:0 10px 28px rgba(0,0,0,0.48), 0 0 14px rgba(var(--nostrodomus-accent-rgb, 80, 180, 255), 0.14)',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
    'font-size:11.5px',
    'line-height:1.2',
    'color:white',
    'display:none',
    'pointer-events:auto',
  ].join(';');

  root.appendChild(box);
  try {
    box.removeAttribute('popover');
    box.style.setProperty('position', 'fixed', 'important');
    box.style.setProperty('z-index', '2147483647', 'important');
    box.style.setProperty('pointer-events', 'auto', 'important');
    box.style.setProperty('cursor', 'default', 'important');
    box.style.setProperty('inset', 'auto', 'important');
    box.style.setProperty('margin', '0', 'important');
  } catch { /* detached node */ }

  applyPopupAccentVars(box, state);

  state.overlay = box;
  state.overlayRoot = root;
  return box;
}

// Match the list's blue to the user's codebox accent (border color), so the list uses the same
// color as the codebox and the settings panel. The tokens are set inline on the box and the
// match highlight and the list scrollbar inherit them. A signature stamp skips the writes when the
// accent is unchanged, since this runs on every render.
function applyPopupAccentVars(box, state) {
  try {
    const accent = uiAccentVarsFromSettings(state?.settings?.style);
    const signature = `${accent.brand}|${accent.accent}|${accent.scrollbar}`;
    if (box.__nostrodomusAccentSig === signature) return;
    box.__nostrodomusAccentSig = signature;
    box.style.setProperty('--nostrodomus-brand-rgb', accent.brand);
    box.style.setProperty('--nostrodomus-accent-rgb', accent.accent);
    box.style.setProperty('--nostrodomus-scrollbar-rgb', accent.scrollbar);
  } catch { /* accent is decorative; never break the popup */ }
}

export function completionPopupPosition(cursor, boxSize, bounds, options = {}) {
  const gap = Number(options.gap) || 2;
  const cursorTop = Number(cursor?.top ?? bounds?.top ?? 0);
  const cursorBottom = Number(cursor?.bottom ?? cursorTop);
  const cursorLeft = Number(cursor?.left ?? bounds?.left ?? 0);
  const width = Math.max(1, Number(boxSize?.width) || 330);
  const height = Math.max(1, Number(boxSize?.height) || 150);
  const leftBound = Number(bounds?.left) || 0;
  const rightBound = Number(bounds?.right) || width;
  const topBound = Number(bounds?.top) || 0;
  const bottomBound = Number(bounds?.bottom) || height;
  const availableBelow = bottomBound - cursorBottom - gap;
  const availableAbove = cursorTop - topBound - gap;
  const placeBelow = availableBelow >= height || availableBelow >= availableAbove;
  // The box follows the caret horizontally and stays between the editor's left edge and the right
  // bound. The caller clamps rightBound and bottomBound to the window but not leftBound and
  // topBound, so the far bound wins over the near edge (and 0 is the floor): an editor narrower
  // than the box moves the box inward instead of pushing its far edge off the screen.
  const maxLeft = rightBound - width;
  const left = Math.max(0, Math.min(maxLeft, Math.max(leftBound, Math.min(cursorLeft, maxLeft))));
  const rawTop = placeBelow ? cursorBottom + gap : cursorTop - height - gap;
  const maxTop = bottomBound - height;
  const top = Math.max(0, Math.min(maxTop, Math.max(topBound, Math.min(rawTop, maxTop))));
  return { left: Math.round(left), top: Math.round(top), placement: placeBelow ? 'below' : 'above' };
}

// Whether the caret is in the part of the editor that is visible in the window. CodeMirror gives
// no coordinates for a line it no longer draws, which is a caret far outside the view. A view
// that cannot be asked counts as visible, so the list stays where it is.
function completionCaretOnScreen(state, deps) {
  const view = state?.view;
  if (typeof view?.coordsAtPos !== 'function') return true;
  let coords = null;
  try { coords = view.coordsAtPos(deps?.getPos?.()); } catch { return true; }
  if (!coords) return false;
  const dom = view.dom || null;
  const scroller = dom?.querySelector?.('.cm-scroller') || dom?.closest?.('.cm-scroller') || dom;
  const rect = scroller?.getBoundingClientRect?.();
  const win = deps?.windowRef || globalThis.window;
  let top = 0;
  let left = 0;
  let bottom = win?.innerHeight || Infinity;
  let right = win?.innerWidth || Infinity;
  if (rect && rect.width > 40 && rect.height > 40) {
    top = Math.max(top, rect.top);
    left = Math.max(left, rect.left);
    bottom = Math.min(bottom, rect.bottom);
    right = Math.min(right, rect.right);
  }
  return coords.bottom > top && coords.top < bottom && coords.left >= left - 1 && coords.left <= right + 1;
}

// The elements around the editor's scroller whose scrolling moves the editor on the screen: its
// ancestors in the flattened tree, through slots and shadow roots (the scrolling body of a dialog
// is in the dialog's shadow root, above the slot the editor is assigned to).
function popupOuterScrollTargets(scroller) {
  const targets = [];
  let node = scroller;
  for (let guard = 0; node && guard < 200; guard += 1) {
    let next = null;
    try { next = node.assignedSlot || node.parentElement || node.getRootNode?.()?.host || null; } catch { next = null; }
    if (!next || next === node) break;
    if (typeof next.addEventListener === 'function') targets.push(next);
    node = next;
  }
  return targets;
}

// The one handler that puts the open list back at the caret after something other than a
// keystroke moved the editor on the screen. At most one placement per frame, and a no-op while
// the list is hidden. A caret that left the visible editor has no place to put the list at: the
// list is closed instead of being pinned to an edge of the window.
function popupRepositionHandler(state) {
  if (state.popupReposition) return state.popupReposition;
  state.popupReposition = () => {
    if (!state.overlay || state.overlay.style.display === 'none') return; // popup not open → no-op
    if (state.popupScrollRaf) return;
    const win = state.popupPlacementDeps?.windowRef || globalThis.window;
    const raf = win && typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame.bind(win) : (fn) => fn();
    state.popupScrollRaf = raf(() => {
      state.popupScrollRaf = 0;
      if (!state.overlay || state.overlay.style.display === 'none') return;
      const deps = state.popupPlacementDeps || {};
      if (!completionCaretOnScreen(state, deps)) {
        closeCompletionPopup(state);
        return;
      }
      placeCompletionPopupAtCursor(state, deps);
    });
  };
  return state.popupReposition;
}

// Keeps the open list at the caret when the editor moves. `scroll` events are composed:false, so
// a window listener does not see the editor's own `.cm-scroller` (it is in the ha-code-editor
// shadow root); the passive handler goes on that scroller (once, marked with an expando), on the
// containers around it (once per element) and on the window for a resize or a document scroll.
// The scroller's listener goes away with the editor.
function wirePopupScrollReposition(state, scroller, deps) {
  state.popupPlacementDeps = deps;
  const reposition = popupRepositionHandler(state);
  const win = deps?.windowRef || globalThis.window;
  if (win && typeof win.addEventListener === 'function' && state.popupWindowWired !== win) {
    try {
      win.addEventListener('resize', reposition, { passive: true });
      win.addEventListener('scroll', reposition, { passive: true });
      state.popupWindowWired = win;
    } catch { /* stubbed window */ }
  }
  if (!scroller || typeof scroller.addEventListener !== 'function' || scroller.__nostrodomusPopupScroll) return;
  try {
    scroller.__nostrodomusPopupScroll = true;
    scroller.addEventListener('scroll', reposition, { passive: true });
  } catch { /* detached / cross-origin scroller */ }
  const wired = state.popupScrollTargets || (state.popupScrollTargets = new WeakSet());
  for (const target of popupOuterScrollTargets(scroller)) {
    if (wired.has(target)) continue;
    try {
      target.addEventListener('scroll', reposition, { passive: true });
      wired.add(target);
    } catch { /* detached node */ }
  }
}

function unwirePopupWindowReposition(state) {
  const win = state?.popupWindowWired;
  if (!win || !state.popupReposition) return;
  try {
    win.removeEventListener?.('resize', state.popupReposition);
    win.removeEventListener?.('scroll', state.popupReposition);
  } catch { /* stubbed window */ }
  state.popupWindowWired = null;
}

export function placeCompletionPopupAtCursor(state, deps = {}) {
  const {
    getPos,
    ensureOverlay,
    windowRef = globalThis.window,
  } = deps;

  // The list sits under the start of the word being completed (state.context.from), not the
  // caret, so it does not move right while typing. The row comes from the caret; when the word
  // wrapped onto another visual row, the caret's left is used.
  const caretPos = getPos?.();
  const fromPos = Number.isFinite(state?.context?.from) ? state.context.from : caretPos;
  const caretCoords = state?.view?.coordsAtPos?.(caretPos);
  const anchorCoords = (fromPos !== caretPos ? state?.view?.coordsAtPos?.(fromPos) : caretCoords) || caretCoords;
  const box = ensureOverlay?.();
  if (!box) return;

  const margin = 10;
  const gap = 2;
  const rect = box.getBoundingClientRect?.();
  const boxWidth = Math.max(280, Math.ceil(rect?.width || 330));
  const boxHeight = Math.max(90, Math.ceil(rect?.height || 150));

  const editorDom = state.view?.dom || null;
  const scroller = editorDom?.querySelector?.('.cm-scroller') || editorDom?.closest?.('.cm-scroller') || null;
  const editorRect = (scroller || editorDom)?.getBoundingClientRect?.();

  const innerWidth = windowRef?.innerWidth || 0;
  const innerHeight = windowRef?.innerHeight || 0;
  const bounds = editorRect && editorRect.width > 40 && editorRect.height > 40
    ? {
        left: Math.max(margin, editorRect.left + margin),
        right: Math.min(innerWidth - margin, editorRect.right - margin),
        // Vertically the list may leave the editor: clamped to the editor, it would cover the
        // line being typed whenever neither side of the caret has room inside a short editor.
        top: margin,
        bottom: innerHeight - margin,
      }
    : {
        left: margin,
        right: innerWidth - margin,
        top: margin,
        bottom: innerHeight - margin,
      };

  const cursorTop = caretCoords?.top || bounds.top;
  const cursorBottom = caretCoords?.bottom || cursorTop;
  const sameRow = caretCoords && anchorCoords && Math.abs((anchorCoords.top || 0) - (caretCoords.top || 0)) < 4;
  const cursorLeft = (sameRow ? anchorCoords?.left : caretCoords?.left) || bounds.left;

  const pos = completionPopupPosition(
    { top: cursorTop, bottom: cursorBottom, left: cursorLeft },
    { width: boxWidth, height: boxHeight },
    bounds,
    { gap },
  );

  // The box is position:fixed, but an ancestor with a transform or a filter becomes its containing
  // block and shifts it, so the shift (landed position minus styled position) is subtracted. The
  // rectangle read above, at the previous position, already shows the shift when the box is not
  // scaled or rotated (its rectangle then has its layout size), and the corrected position is
  // written at once, without a second layout. Otherwise, or without a previous position, the box
  // is placed, measured again and corrected.
  const styledLeft = parseFloat(box.style.left);
  const styledTop = parseFloat(box.style.top);
  const offsetKnown = !!rect && rect.width > 0 && rect.height > 0
    && Number.isFinite(styledLeft) && Number.isFinite(styledTop)
    && Number.isFinite(rect.left) && Number.isFinite(rect.top)
    && Math.abs(rect.width - box.offsetWidth) < 0.75 && Math.abs(rect.height - box.offsetHeight) < 0.75;
  box.dataset.placement = pos.placement;
  if (offsetKnown) {
    const dx = rect.left - styledLeft;
    const dy = rect.top - styledTop;
    box.style.left = `${Math.abs(dx) > 1 ? pos.left - dx : pos.left}px`;
    box.style.top = `${Math.abs(dy) > 1 ? pos.top - dy : pos.top}px`;
  } else {
    box.style.left = `${pos.left}px`;
    box.style.top = `${pos.top}px`;
    const landed = box.getBoundingClientRect?.();
    if (landed) {
      const dx = landed.left - pos.left;
      const dy = landed.top - pos.top;
      if (Math.abs(dx) > 1) box.style.left = `${pos.left - dx}px`;
      if (Math.abs(dy) > 1) box.style.top = `${pos.top - dy}px`;
    }
  }
  wirePopupScrollReposition(state, scroller, deps);
}

function appendHighlightedLabel(documentRef, parent, label, spans = [], styleText = '') {
  const wrap = documentRef.createElement('span');
  if (styleText) wrap.style.cssText = styleText;
  const text = String(label == null ? '' : label);
  let cursor = 0;
  for (const span of spans || []) {
    const start = Math.max(0, Math.min(text.length, Number(span.start) || 0));
    const end = Math.max(start, Math.min(text.length, Number(span.end) || 0));
    if (start > cursor) wrap.appendChild(documentRef.createTextNode(text.slice(cursor, start)));
    if (end > start) {
      const hi = documentRef.createElement('span');
      hi.className = 'nostrodomus-intelli-match';
      hi.style.cssText = 'font-weight:950;color:rgba(var(--nostrodomus-brand-rgb, 120, 225, 255),.98);text-shadow:0 0 8px rgba(var(--nostrodomus-accent-rgb, 90, 210, 255),.28)';
      hi.appendChild(documentRef.createTextNode(text.slice(start, end)));
      wrap.appendChild(hi);
    }
    cursor = end;
  }
  if (cursor < text.length) wrap.appendChild(documentRef.createTextNode(text.slice(cursor)));
  parent.appendChild(wrap);
  return wrap;
}

function textNodeElement(documentRef, tag, text, styleText = '') {
  const el = documentRef.createElement(tag);
  if (styleText) el.style.cssText = styleText;
  el.textContent = text == null ? '' : String(text);
  return el;
}

const ICON_ID_RX = /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_.-]*$/i;

// An icon row shows the icon itself, drawn by Home Assistant's ha-icon element, which also draws
// the icons of the installed icon sets. Without ha-icon (outside Home Assistant) the row keeps
// its letters.
function iconPreviewElement(documentRef, item, color) {
  if (item?.type !== 'icon') return null;
  let defined = false;
  try { defined = !!documentRef?.defaultView?.customElements?.get?.('ha-icon'); } catch { defined = false; }
  const id = String(item.insert || item.label || '');
  if (!defined || !ICON_ID_RX.test(id)) return null;
  const el = documentRef.createElement('ha-icon');
  el.setAttribute('icon', id);
  el.style.cssText = `width:18px;flex:0 0 18px;display:inline-flex;justify-content:center;--mdc-icon-size:16px;color:${color};opacity:.92`;
  return el;
}

function popupSettingsButton(documentRef, openSettings) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.nostrodomusSettings = '1';
  button.title = 'Open settings (Ctrl+,)';
  button.setAttribute('aria-label', 'Open settings');
  button.setAttribute('aria-keyshortcuts', 'Control+,');
  button.style.cssText = 'all:unset;cursor:pointer;color:rgba(255,255,255,.72);font-size:12px;line-height:1';
  button.textContent = '⚙';
  button.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openSettings?.();
  }, true);
  // Enter or Space on the focused button and a screen reader's activation arrive as a click that
  // no mouse button produced (detail 0). A click that follows the mousedown above has detail 1
  // and was already handled.
  button.addEventListener('click', (ev) => {
    if (ev.detail !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    openSettings?.();
  }, true);
  return button;
}

function popupHeader(documentRef, ctx, openSettings, flex = false) {
  const header = documentRef.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 6px 3px;color:rgba(190,230,255,.9);font-weight:800;font-size:11px' + (flex ? ';flex:0 0 auto' : '');

  header.appendChild(textNodeElement(documentRef, 'span', 'Nostrodomus'));

  const right = documentRef.createElement('span');
  right.style.cssText = 'display:flex;align-items:center;gap:8px';
  right.appendChild(textNodeElement(documentRef, 'span', ctx?.lang || '', 'opacity:.75'));
  right.appendChild(popupSettingsButton(documentRef, openSettings));
  header.appendChild(right);

  return header;
}

function signatureHintElement(documentRef, model) {
  if (!model || !Array.isArray(model.params) || !model.params.length) return null;
  const wrap = documentRef.createElement('div');
  wrap.dataset.nostrodomusSignature = '1';
  wrap.style.cssText = 'margin:1px 4px 3px;padding:4px 8px;border-radius:7px;background:rgba(120,210,255,.08);border:1px solid rgba(120,210,255,.18);color:rgba(210,240,255,.92);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

  wrap.appendChild(textNodeElement(documentRef, 'span', model.title, 'color:rgba(255,220,150,.96);font-weight:800'));
  wrap.appendChild(textNodeElement(documentRef, 'span', '(', 'opacity:.7'));
  model.params.forEach((p, i) => {
    if (i) wrap.appendChild(textNodeElement(documentRef, 'span', ', ', 'opacity:.55'));
    const name = p.required ? `${p.name}*` : p.name;
    wrap.appendChild(textNodeElement(documentRef, 'span', name, p.active
      ? 'color:rgba(120,235,175,.99);font-weight:900;text-decoration:underline'
      : 'opacity:.82'));
  });
  wrap.appendChild(textNodeElement(documentRef, 'span', ')', 'opacity:.7'));
  if (model.doc) {
    wrap.appendChild(textNodeElement(documentRef, 'div', model.doc, 'opacity:.66;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'));
  }
  return wrap;
}

function appendSignatureHint(box, state, ctx, documentRef, deps = {}) {
  // A display-only argument hint at the top of the list, behind the signatureHelp flag (off by
  // default). The data snapshot is read only when the flag is on.
  if (state?.settings?.completions?.signatureHelp !== true || typeof deps.runtimeSnapshot !== 'function') return;
  let snapshot = null;
  try { snapshot = deps.runtimeSnapshot(); } catch { snapshot = null; }
  const sig = signatureHintModel(ctx, snapshot);
  const el = sig ? signatureHintElement(documentRef, sig) : null;
  if (el) box.appendChild(el);
}

function completionDetailElement(state, documentRef, deps = {}) {
  if (!state.settings.showDetailsPane) return null;
  const item = state.items[state.selected];
  const model = completionDetailModel(item);
  if (!model) return null;

  // With the lazyResolve flag on (off by default), the documentation of the highlighted row is
  // filled in from the Home Assistant data snapshot (service fields, entity friendly name,
  // registry names). Only this row is resolved, never every row.
  if (item && state?.settings?.completions?.lazyResolve === true && typeof deps.runtimeSnapshot === 'function') {
    let snapshot = null;
    try { snapshot = deps.runtimeSnapshot(); } catch { snapshot = null; }
    const extra = resolveItemDetail(item, snapshot);
    if (extra && extra.documentation) model.documentation = extra.documentation;
  }

  const expanded = !!state.docsExpanded && !!model.documentation;

  const detail = documentRef.createElement('div');
  detail.dataset.nostrodomusDetail = '1';
  detail.style.cssText = 'flex:0 0 auto;margin:5px 2px 1px;padding:7px 9px;border-top:1px solid rgba(255,255,255,.10);color:rgba(255,255,255,.72);font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:11px;line-height:1.28';
  detail.setAttribute('aria-live', expanded ? 'polite' : 'off');

  const top = documentRef.createElement('div');
  top.style.cssText = `display:flex;align-items:center;gap:7px;margin-bottom:${model.documentation ? '4px' : '0'}`;

  top.appendChild(textNodeElement(documentRef, 'span', model.icon, 'flex:0 0 auto;color:rgba(210,240,255,.95);font-weight:900'));
  top.appendChild(textNodeElement(documentRef, 'span', model.label, 'min-width:0;color:rgba(240,250,255,.96);font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'));
  top.appendChild(textNodeElement(documentRef, 'span', model.source, 'margin-left:auto;opacity:.62;white-space:nowrap'));
  if (model.documentation) {
    const toggle = documentRef.createElement('button');
    toggle.type = 'button';
    toggle.title = expanded ? 'Collapse documentation' : 'Expand documentation';
    toggle.style.cssText = 'all:unset;cursor:pointer;border:1px solid rgba(140,220,255,.22);border-radius:999px;padding:0 6px;color:rgba(190,235,255,.88);font-size:10px;font-weight:800';
    toggle.textContent = expanded ? 'less' : 'docs';
    toggle.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      state.docsExpanded = !state.docsExpanded;
      renderCompletionPopup(state, {
        ...deps,
        documentRef,
        ensureOverlay: deps.ensureOverlay || (() => state.overlay),
        measurePerformanceEvent: deps.measurePerformanceEvent || ((_n, _l, fn) => fn?.()),
      });
      deps.placeAtCursor?.();
    }, true);
    top.appendChild(toggle);
  }
  detail.appendChild(top);

  if (model.documentation) {
    const summary = String(model.documentation).split('\n').find(Boolean) || model.documentation;
    detail.appendChild(textNodeElement(
      documentRef,
      'div',
      expanded ? 'Ctrl+Space collapses documentation.' : summary,
      expanded
        ? 'opacity:.62;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
        : 'opacity:.82;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
    ));
    if (expanded) {
      detail.appendChild(textNodeElement(
        documentRef,
        'div',
        model.documentation,
        'opacity:.88;white-space:pre-wrap;max-height:104px;overflow:auto;padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075)'
      ));
    }
  }

  return detail;
}

function ensureSelectedVisible(state) {
  const box = state.overlay;
  if (!box) return;
  const list = box.querySelector('[data-nostrodomus-list="1"]');
  const row = box.querySelector(`.nostrodomus-intelli-row[data-i="${state.selected}"]`);
  if (!list || !row) return;

  const listTop = list.scrollTop;
  const listBottom = listTop + list.clientHeight;
  const rowTop = row.offsetTop;
  const rowBottom = rowTop + row.offsetHeight;

  if (rowTop < listTop) list.scrollTop = rowTop;
  else if (rowBottom > listBottom) list.scrollTop = rowBottom - list.clientHeight;
}

// For the caller that shows a box the list was rendered into while it was hidden: the rows had
// no size then, so the render could not scroll a kept selection into view.
export function scrollCompletionSelectionIntoView(state) {
  if (state?.selected > 0 && typeof state.overlay?.querySelector === 'function') ensureSelectedVisible(state);
}

function renderCompletionPopupIdle(state, box, ctx, deps = {}) {
  const { documentRef, openSettings } = deps;
  clearElement(box);
  if (!state.lastExplicitOpen || !state.settings.idlePaneText) {
    box.style.display = 'none';
    return;
  }

  box.appendChild(popupHeader(documentRef, ctx, openSettings));
  box.appendChild(textNodeElement(
    documentRef,
    'div',
    'No suggestions',
    'padding:7px 8px;color:rgba(255,255,255,.58);font-style:italic;font-size:11px'
  ));
}

export function renderCompletionPopup(state, deps = {}) {
  const {
    documentRef = globalThis.document,
    ensureOverlay,
    insertItem,
    measurePerformanceEvent,
    openSettings,
    preserveScrollDuring,
  } = deps;

  return measurePerformanceEvent?.('popup-render', state.items?.length ? `${state.items.length} items` : 'idle', () => {
    const box = ensureOverlay?.();
    if (!box) return;
    const ctx = state.context;

    if (!state.items.length) {
      renderCompletionPopupIdle(state, box, ctx, { documentRef, openSettings });
      updateCompletionA11y(state, documentRef);
      return;
    }

    const rowPad = state.settings.popupSize === 'large' ? '5px 7px' : state.settings.popupSize === 'comfortable' ? '4px 7px' : '3px 6px';
    const listMax = state.settings.popupSize === 'large' ? '150px' : state.settings.popupSize === 'comfortable' ? '124px' : '98px';

    clearElement(box);
    box.appendChild(popupHeader(documentRef, ctx, openSettings, true));
    appendSignatureHint(box, state, ctx, documentRef, deps);

    const list = documentRef.createElement('div');
    list.dataset.nostrodomusList = '1';
    list.id = 'nostrodomus-listbox';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-activedescendant', `nostrodomus-intelli-option-${state.selected}`);
    list.setAttribute('aria-label', 'Nostrodomus suggestions');
    list.style.cssText = `max-height:${listMax};overflow:auto;padding-right:2px;scrollbar-color:rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255),.68) rgba(255,255,255,.045);scrollbar-width:thin`;

    state.items.forEach((item, i) => {
      const selected = i === state.selected;
      const accent = completionAccent(item, selected);
      const visualKind = String(completionVisualKind(item) || 'default').replace(/[^a-z0-9_-]/gi, '') || 'default';

      const row = documentRef.createElement('div');
      row.className = `nostrodomus-intelli-row nostrodomus-row--${visualKind}`;
      row.dataset.i = String(i);
      row.dataset.kind = visualKind;
      row.id = `nostrodomus-intelli-option-${i}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', selected ? 'true' : 'false');
      row.style.cssText = `
        display:flex;
        gap:8px;
        align-items:center;
        padding:${rowPad};
        border-radius:9px;
        border-left:3px solid ${accent.left};
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        cursor:pointer;
        background:${selected ? accent.bg : 'transparent'};
        color:${selected ? '#fff' : accent.fg};
      `;

      const kindIcon = iconPreviewElement(documentRef, item, accent.fg)
        || textNodeElement(documentRef, 'span', iconFor(item), `width:18px;flex:0 0 18px;font-size:10px;text-align:center;color:${accent.fg};opacity:.92;font-weight:900`);
      kindIcon.setAttribute('aria-hidden', 'true');
      row.appendChild(kindIcon);
      const spans = matchSpans(item.label, ctx?.prefix || '', item.matchReason || item.matchTier);
      appendHighlightedLabel(documentRef, row, item.label, spans, `min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:${item.type === 'snippet' ? '760' : '650'}`);
      row.appendChild(textNodeElement(documentRef, 'span', completionPillLabel(item), `margin-left:auto;border:1px solid ${accent.border};background:${accent.bg};color:${accent.fg};border-radius:999px;padding:1px 6px;font-size:9px;font-weight:800;letter-spacing:.01em;max-width:74px;overflow:hidden;text-overflow:ellipsis`));

      row.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        preserveScrollDuring?.(() => insertItem?.(state.items[Number(row.dataset.i)]));
      }, true);

      list.appendChild(row);
    });

    box.appendChild(list);

    const detail = completionDetailElement(state, documentRef, deps);
    if (detail) box.appendChild(detail);
    // The 178px cap fits the header and the list. The details pane and the signature hint come on
    // top of that and would be cut off by overflow:hidden, so the cap is lifted for them; each
    // limits its own height.
    const hasHint = !!box.querySelector?.('[data-nostrodomus-signature="1"]');
    box.style.maxHeight = detail || hasHint ? 'none' : '178px';

    // A list that was just built is scrolled to its top, where the first row is. Measuring the
    // rows for the first row would only force a layout.
    if (state.selected > 0) ensureSelectedVisible(state);
    updateCompletionA11y(state, documentRef);
    // A hidden box has no size to place; the caller places it after showing it.
    if (box.style.display !== 'none') deps.placeAtCursor?.();
  });
}

// Moves the highlight from one row to another in the rendered list. An arrow key changes two
// rows and the details pane, so the rows are not rebuilt. Returns false when the rendered list
// is not the list in state.items; the caller then renders in full.
export function updateCompletionPopupSelection(state, previousSelected, deps = {}) {
  const { documentRef = globalThis.document } = deps;
  const box = state?.overlay;
  const list = box?.querySelector?.('[data-nostrodomus-list="1"]');
  const items = Array.isArray(state?.items) ? state.items : [];
  const rows = list?.children;
  if (!list || !rows || !items.length || rows.length !== items.length) return false;
  const next = rows[state.selected];
  if (!next || next.dataset?.i !== String(state.selected)) return false;

  const paint = (index, selected) => {
    const row = rows[index];
    const item = items[index];
    if (!row || !item) return;
    const accent = completionAccent(item, selected);
    row.setAttribute('aria-selected', selected ? 'true' : 'false');
    row.style.background = selected ? accent.bg : 'transparent';
    row.style.color = selected ? '#fff' : accent.fg;
  };
  if (previousSelected !== state.selected) paint(previousSelected, false);
  paint(state.selected, true);
  list.setAttribute('aria-activedescendant', `nostrodomus-intelli-option-${state.selected}`);

  const oldDetail = box.querySelector('[data-nostrodomus-detail="1"]');
  const detail = completionDetailElement(state, documentRef, deps);
  if (oldDetail && detail) box.replaceChild(detail, oldDetail);
  else if (oldDetail) oldDetail.remove();
  else if (detail) box.appendChild(detail);
  const hasHint = !!box.querySelector('[data-nostrodomus-signature="1"]');
  box.style.maxHeight = detail || hasHint ? 'none' : '178px';

  ensureSelectedVisible(state);
  updateCompletionA11y(state, documentRef);
  // Only the details pane changes the size of the box here, and the place of the box depends on
  // its size. With no pane before and none now the box is where the last placement put it.
  if ((oldDetail || detail) && box.style.display !== 'none') deps.placeAtCursor?.();
  return true;
}
