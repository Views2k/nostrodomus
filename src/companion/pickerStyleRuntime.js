// Companion picker visual-fix module.
//
// The entity-picker/popover/popup transparency-blur fix. The traversal must not use a
// `querySelectorAll("*")` document walk (illegal under the no-wildcard §8 gate), so it is
// a bounded, depth-capped, registry-driven walk: it descends ONLY into known host types
// (the editor hosts + the picker overlay hosts), capped at maxDepth, over explicit roots
// (document + home shadow + active dialog/top-layer). The collection grouping uses exact
// matches() checks.
//
// The injected per-group stylesheets are byte-identical to the frozen picker-safe source
// (the @gen blocks are generated from it; the byte-identity test asserts this) under the
// SAME element id. Lands DORMANT (companionLayerActive); apply is gated by the typing-quiet
// window (defer during typing) and emits one performance mark pair (measured). No-op until
// the shipped default is flipped active.

import { companionLayerActive } from './coordinatorRuntime.js';
import { OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR } from '../editor/overlayRoot.js';
import { PICKER_FIX_SELECTOR, HOME_ASSISTANT } from '../editor/haSelectors.js';

export const PICKER_STYLE_ID = 'nostrodomus-picker-only-final-v2';
// Shipped default: dormant. Flip to true to ship the picker fix active.
const PICKER_SHIPPED_ACTIVE = false;
const DEFAULT_MAX_DEPTH = 12;

// Host types the bounded walk descends INTO: the editor/dialog hosts (registry) plus
// the picker overlay hosts (so nested items/ripple/search inside the picker's shadow
// are reachable without a `*` descent).
const PICKER_SCAN_HOST_SELECTOR = [
  OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR,
  'ha-picker-combo-box', 'wa-popover', 'wa-popup', 'ha-input-search', 'wa-input',
  'ha-combo-box-item', 'ha-ripple',
].join(', ');

// @gen:picker-css-start
const PICKER_CSS = `
        :host {
          position: relative !important;
          isolation: isolate !important;
          overflow: hidden !important;
          background: rgba(18, 24, 34, 0.10) !important;
          backdrop-filter: blur(28px) saturate(155%) !important;
          -webkit-backdrop-filter: blur(28px) saturate(155%) !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        :host::before {
          content: "" !important;
          position: absolute !important;
          inset: 0 !important;
          z-index: 0 !important;
          pointer-events: none !important;
          background: rgba(18, 24, 34, 0.10) !important;
          backdrop-filter: blur(28px) saturate(155%) !important;
          -webkit-backdrop-filter: blur(28px) saturate(155%) !important;
        }

        :host > * {
          position: relative !important;
          z-index: 1 !important;
        }

        ha-input-search {
          display: block !important;
          margin: 8px !important;
          padding: 0 !important;
          border-radius: 14px !important;
          background: rgba(0, 0, 0, 0.10) !important;
          backdrop-filter: blur(28px) saturate(155%) !important;
          -webkit-backdrop-filter: blur(28px) saturate(155%) !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        .virtualizer-wrapper,
        lit-virtualizer,
        .combo-box-row,
        .combo-box-row.current-value {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        .combo-box-row:hover,
        .combo-box-row:focus,
        .combo-box-row:focus-within {
          background: rgba(255, 255, 255, 0.06) !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        ha-combo-box-item {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
          --md-list-item-container-color: transparent !important;
          --md-list-item-selected-container-color: transparent !important;
          --md-list-item-hover-state-layer-color: rgba(255, 255, 255, 0.06) !important;
        }
      `;
// @gen:picker-css-end
// @gen:search-css-start
const SEARCH_CSS = `
        :host {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;

          --wa-form-control-background-color: transparent !important;
          --wa-form-control-background-color-hover: transparent !important;
          --wa-form-control-filled-background-color: transparent !important;
          --wa-form-control-border-color: transparent !important;
          --wa-form-control-border-color-hover: transparent !important;
          --wa-form-control-border-color-focus: transparent !important;
        }

        wa-input,
        wa-input::part(base),
        wa-input::part(input) {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
      `;
// @gen:search-css-end
// @gen:searchInput-css-start
const SEARCH_INPUT_CSS = `
        :host {
          --wa-form-control-background-color: transparent !important;
          --wa-form-control-background-color-hover: transparent !important;
          --wa-form-control-filled-background-color: transparent !important;
          --wa-form-control-border-color: transparent !important;
          --wa-form-control-border-color-hover: transparent !important;
          --wa-form-control-border-color-focus: transparent !important;
        }

        .text-field,
        div[part~="base"],
        input,
        input.control,
        input[part~="input"] {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
          color: rgba(255, 255, 255, 0.95) !important;
        }
      `;
// @gen:searchInput-css-end
// @gen:items-css-start
const ITEMS_CSS = `
        :host,
        #item,
        .list-item,
        button,
        md-item {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
      `;
// @gen:items-css-end
// @gen:ripples-css-start
const RIPPLES_CSS = `
        .surface {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
      `;
// @gen:ripples-css-end
// @gen:popover-css-start
const POPOVER_CSS = `
        :host,
        dialog,
        wa-popup,
        div,
        * {
          border: 0 !important;
          border-color: transparent !important;
          outline: 0 !important;
          outline-color: transparent !important;
          box-shadow: none !important;
        }

        dialog {
          background: transparent !important;
          background-color: transparent !important;
          padding: 0 !important;
        }

        wa-popup {
          background: transparent !important;
          background-color: transparent !important;
        }
      `;
// @gen:popover-css-end
// @gen:popup-css-start
const POPUP_CSS = `
        :host,
        div,
        .popup,
        .popup__container,
        [part],
        * {
          border: 0 !important;
          border-color: transparent !important;
          outline: 0 !important;
          outline-color: transparent !important;
          box-shadow: none !important;
        }

        :host,
        div,
        .popup,
        .popup__container {
          background: transparent !important;
          background-color: transparent !important;
        }
      `;
// @gen:popup-css-end

export function buildPickerFixCss() {
  return {
    picker: PICKER_CSS,
    search: SEARCH_CSS,
    searchInput: SEARCH_INPUT_CSS,
    items: ITEMS_CSS,
    ripples: RIPPLES_CSS,
    popover: POPOVER_CSS,
    popup: POPUP_CSS,
  };
}

function safeDocument(globalRef) {
  try { return globalRef?.document || (typeof document !== 'undefined' ? document : null); } catch { return null; }
}

function setImportant(el, prop, value) {
  try { el?.style?.setProperty?.(prop, value, 'important'); } catch { /* detached */ }
}

/** @param {Record<string, any>} [deps] */
export function createPickerStyleRuntime(deps = {}) {
  const {
    globalRef = globalThis,
    storage,
    documentRef = safeDocument(globalRef),
    isActive,
    deferDuringTyping = () => false,
    recordMark = () => {},
    maxDepth = DEFAULT_MAX_DEPTH,
  } = deps;

  function active() {
    if (typeof isActive === 'function') return !!isActive();
    return companionLayerActive({ globalRef, storage, shippedDefault: PICKER_SHIPPED_ACTIVE });
  }

  // Bounded, depth-capped, registry-driven collection of picker-fix targets. The add()
  // grouping is the matches() logic; the walk is bounded (the no-wildcard law).
  function collectPickerFixTargets(roots) {
    const groups = { pickers: [], popovers: [], popups: [], searches: [], searchInputs: [], items: [], ripples: [] };
    const seen = new WeakSet();
    const visitedRoots = new Set();

    const add = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      try {
        if (el.matches?.('ha-picker-combo-box')) groups.pickers.push(el);
        if (el.matches?.('wa-popover')) groups.popovers.push(el);
        if (el.matches?.('wa-popup')) groups.popups.push(el);
        if (el.matches?.('ha-input-search')) groups.searches.push(el);
        if (el.matches?.('ha-input-search wa-input')) groups.searchInputs.push(el);
        if (el.matches?.('ha-picker-combo-box ha-combo-box-item')) groups.items.push(el);
        if (el.matches?.('ha-picker-combo-box ha-ripple')) groups.ripples.push(el);
      } catch { /* detached */ }
    };

    const stack = [];
    for (const r of roots) if (r) stack.push({ root: r, depth: 0 });
    while (stack.length) {
      const { root, depth } = stack.pop();
      if (!root || visitedRoots.has(root) || !root.querySelectorAll) continue;
      visitedRoots.add(root);
      try { root.querySelectorAll(PICKER_FIX_SELECTOR).forEach(add); } catch { /* bad selector root */ }
      if (depth >= maxDepth) continue;
      let hosts = [];
      try { hosts = Array.from(root.querySelectorAll(PICKER_SCAN_HOST_SELECTOR) || []); } catch { hosts = []; }
      for (const host of hosts) {
        if (host?.shadowRoot && !visitedRoots.has(host.shadowRoot)) stack.push({ root: host.shadowRoot, depth: depth + 1 });
      }
    }
    return groups;
  }

  // first-injector-wins: skip a shadow root whose id an external picker-safe owns.
  function injectOwned(root, css) {
    if (!root?.querySelector || !documentRef?.createElement) return;
    if (root.querySelector(`#${PICKER_STYLE_ID}`)) return;
    const style = documentRef.createElement('style');
    style.id = PICKER_STYLE_ID;
    style.textContent = css;
    root.appendChild(style);
  }

  // Explicit roots for the bounded walk: document + the home-assistant shadow root +
  // any open top-layer dialogs (where pickers/popovers mount).
  function scanRoots() {
    const out = [];
    if (documentRef) out.push(documentRef);
    try {
      const home = documentRef?.querySelector?.(HOME_ASSISTANT)?.shadowRoot;
      if (home) out.push(home);
    } catch { /* */ }
    return out;
  }

  function apply(rootsOverride = null) {
    if (!active()) return false;
    // Quiet-window deferral: pause picker work during typing.
    if (deferDuringTyping('picker-fix', () => apply(rootsOverride))) return false;

    recordMark('picker-fix-start');
    const roots = rootsOverride || scanRoots();
    const groups = collectPickerFixTargets(roots);
    const { pickers, popovers, popups, searches, searchInputs, items, ripples } = groups;
    const hasPrimary = !!(pickers.length || popovers.length || popups.length);
    if (!hasPrimary) { recordMark('picker-fix-end'); return false; }

    for (const picker of pickers) {
      setImportant(picker, 'position', 'relative');
      setImportant(picker, 'z-index', '2147483647');
      setImportant(picker, 'isolation', 'isolate');
      setImportant(picker, 'background', 'rgba(18, 24, 34, 0.10)');
      setImportant(picker, 'backdrop-filter', 'blur(28px) saturate(155%)');
      setImportant(picker, '-webkit-backdrop-filter', 'blur(28px) saturate(155%)');
      setImportant(picker, 'border', '0');
      setImportant(picker, 'outline', '0');
      setImportant(picker, 'box-shadow', 'none');
      injectOwned(picker.shadowRoot, PICKER_CSS);
    }
    for (const search of searches) {
      setImportant(search, 'border', '0');
      setImportant(search, 'outline', '0');
      setImportant(search, 'box-shadow', 'none');
      injectOwned(search.shadowRoot, SEARCH_CSS);
    }
    for (const wa of searchInputs) injectOwned(wa.shadowRoot, SEARCH_INPUT_CSS);
    for (const item of items) injectOwned(item.shadowRoot, ITEMS_CSS);
    for (const ripple of ripples) injectOwned(ripple.shadowRoot, RIPPLES_CSS);
    for (const el of popovers) {
      setImportant(el, 'border', '0');
      setImportant(el, 'outline', '0');
      setImportant(el, 'box-shadow', 'none');
      setImportant(el, 'background', 'transparent');
      injectOwned(el.shadowRoot, POPOVER_CSS);
    }
    for (const el of popups) {
      setImportant(el, 'border', '0');
      setImportant(el, 'outline', '0');
      setImportant(el, 'box-shadow', 'none');
      setImportant(el, 'background', 'transparent');
      injectOwned(el.shadowRoot, POPUP_CSS);
    }
    recordMark('picker-fix-end');
    return true;
  }

  return {
    apply,
    collectPickerFixTargets,
    buildCss: buildPickerFixCss,
    isActive: active,
  };
}
