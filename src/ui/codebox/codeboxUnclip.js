// Keeps the codebox frame and glow from being clipped: the wrappers around the editor and the
// card dialog's surface and body get `overflow: visible` (and no contain, clip-path or mask),
// each with a record of its own inline values so cleanup can put them back. The CodeMirror
// inline-style guard (isCodeMirrorInlineStyleTarget) and haCodeEditorHostForEditor are injected
// from codeboxStyleRuntime.js.

import {
  CARD_DIALOG_STACKED_MEDIA,
  HA_CODE_EDITOR,
  HA_DIALOG_BODY,
  HA_DIALOG_BODY_SCROLLBAR,
  HA_YAML_EDITOR,
  HUI_CARD_ELEMENT_EDITOR,
} from "../../editor/haSelectors.js";
import { insideCardOwnEditor } from "../../editor/cardOwnEditor.js";

// True for an element that clips on some axis (overflow other than visible) although its content
// fits, give or take a scrollbar gutter (`threshold`). Such an element can be unclipped without
// losing a scroll area; a real scroller (a tall stack card list) overflows by far more. A stack
// editor's div.card-config is one: overflow: auto, content about 13px wider (the gutter) and no
// taller, so it clips the glow and shows a needless scrollbar.
/** @param {{ overflowX?: string, overflowY?: string, xOver?: number, yOver?: number, threshold?: number }} [opts] */
export function isNonScrollingClipper(opts = {}) {
  const { overflowX, overflowY, xOver, yOver, threshold = 24 } = opts;
  const clipsX = !!overflowX && overflowX !== "visible";
  const clipsY = !!overflowY && overflowY !== "visible";
  if (!clipsX && !clipsY) return false;
  return Number(xOver) <= threshold && Number(yOver) <= threshold;
}

export function createCodeboxUnclip(deps = {}) {
  const {
    document = globalThis.document,
    MutationObserver = globalThis.MutationObserver,
    state,
    recordPerformanceEvent,
    codeboxComposedParent,
    codeboxFrameHostForEditor,
    isCodeMirrorInlineStyleTarget,
    haCodeEditorHostForEditor,
  } = deps;

  function labelCodeboxUnclipTarget(node) {
    const local = String(node?.localName || node?.tagName || "node").toLowerCase();
    const cls = String(node?.className || "").trim().replace(/\s+/g, ".");
    return cls ? `${local}.${cls}` : local;
  }

  function rememberCodeboxUnclipOriginal(node) {
    if (!node?.style || state.codeboxSlotUnclipOriginals?.has?.(node)) return;
    if (!state.codeboxSlotUnclipOriginals) state.codeboxSlotUnclipOriginals = new Map();
    state.codeboxSlotUnclipOriginals.set(node, {
      overflow: node.style.getPropertyValue("overflow"),
      overflowPriority: node.style.getPropertyPriority("overflow"),
      overflowX: node.style.getPropertyValue("overflow-x"),
      overflowXPriority: node.style.getPropertyPriority("overflow-x"),
      overflowY: node.style.getPropertyValue("overflow-y"),
      overflowYPriority: node.style.getPropertyPriority("overflow-y"),
      contain: node.style.getPropertyValue("contain"),
      containPriority: node.style.getPropertyPriority("contain"),
      clipPath: node.style.getPropertyValue("clip-path"),
      clipPathPriority: node.style.getPropertyPriority("clip-path"),
      maskImage: node.style.getPropertyValue("mask-image"),
      maskImagePriority: node.style.getPropertyPriority("mask-image"),
      webkitMaskImage: node.style.getPropertyValue("-webkit-mask-image"),
      webkitMaskImagePriority: node.style.getPropertyPriority("-webkit-mask-image"),
      dataset: node.dataset?.nostrodomusCodeboxUnclip || "",
    });
  }

  function setImportantIfNeeded(node, prop, value) {
    if (!node?.style) return false;
    if (node.style.getPropertyValue(prop) === value && node.style.getPropertyPriority(prop) === "important") return false;
    node.style.setProperty(prop, value, "important");
    return true;
  }

  function forceCodeboxUnclipTarget(node, reason = "slot-dialog-body") {
    if (!node?.style) return false;
    rememberCodeboxUnclipOriginal(node);
    try { node.dataset.nostrodomusCodeboxUnclip = reason; } catch { /* detached node */ }
    let changed = false;
    changed = setImportantIfNeeded(node, "overflow", "visible") || changed;
    changed = setImportantIfNeeded(node, "overflow-x", "visible") || changed;
    changed = setImportantIfNeeded(node, "overflow-y", "visible") || changed;
    changed = setImportantIfNeeded(node, "contain", "none") || changed;
    changed = setImportantIfNeeded(node, "clip-path", "none") || changed;
    changed = setImportantIfNeeded(node, "mask-image", "none") || changed;
    changed = setImportantIfNeeded(node, "-webkit-mask-image", "none") || changed;
    return changed;
  }

  function restoreCodeboxUnclipTarget(node, old) {
    if (!node?.style || !old) return;
    const restore = (prop, value, priority) => {
      if (value) node.style.setProperty(prop, value, priority || "");
      else node.style.removeProperty(prop);
    };
    restore("overflow", old.overflow, old.overflowPriority);
    restore("overflow-x", old.overflowX, old.overflowXPriority);
    restore("overflow-y", old.overflowY, old.overflowYPriority);
    restore("contain", old.contain, old.containPriority);
    restore("clip-path", old.clipPath, old.clipPathPriority);
    restore("mask-image", old.maskImage, old.maskImagePriority);
    restore("-webkit-mask-image", old.webkitMaskImage, old.webkitMaskImagePriority);
    try {
      if (old.dataset) node.dataset.nostrodomusCodeboxUnclip = old.dataset;
      else delete node.dataset.nostrodomusCodeboxUnclip;
    } catch { /* detached node */ }
  }

  // What allowCodeboxFrameOverflow wrote on the wrappers around the editor (ha-yaml-editor, the
  // element editor, a wrapper with overflow: auto): for each one, the inline value and priority
  // every property had before, and its unclip mark, so cleanup can put them back.
  const frameSurfaceOriginals = new Map();

  function setFrameSurfaceProperty(node, prop, value) {
    let original = frameSurfaceOriginals.get(node);
    if (!original) {
      original = { props: new Map(), mark: node.dataset?.nostrodomusCodeboxUnclip || "" };
      frameSurfaceOriginals.set(node, original);
    }
    if (!original.props.has(prop)) {
      original.props.set(prop, { value: node.style.getPropertyValue(prop), priority: node.style.getPropertyPriority(prop) });
    }
    node.style.setProperty(prop, value, "important");
  }

  // A wrapper that left the page is only forgotten.
  function forgetDetachedFrameSurfaces() {
    for (const node of Array.from(frameSurfaceOriginals.keys())) {
      if (node?.isConnected === false) frameSurfaceOriginals.delete(node);
    }
  }

  function restoreFrameSurfaces() {
    for (const [node, original] of frameSurfaceOriginals) {
      if (node?.isConnected === false) continue;
      for (const [prop, old] of original.props) {
        try {
          if (old.value) node.style.setProperty(prop, old.value, old.priority || "");
          else node.style.removeProperty(prop);
        } catch { /* detached node */ }
      }
      try {
        if (original.mark) node.dataset.nostrodomusCodeboxUnclip = original.mark;
        else delete node.dataset.nostrodomusCodeboxUnclip;
      } catch { /* detached node */ }
    }
    frameSurfaceOriginals.clear();
  }

  function cleanupCodeboxSlotUnclip(reason = "cleanup") {
    stopWatchingStackedLayout();
    if (state.codeboxSlotUnclipObservers) {
      for (const observer of state.codeboxSlotUnclipObservers.values()) {
        try { observer.disconnect(); } catch { /* injected observer */ }
      }
      state.codeboxSlotUnclipObservers.clear();
    }
    if (state.codeboxSlotUnclipOriginals) {
      for (const [node, old] of state.codeboxSlotUnclipOriginals.entries()) {
        restoreCodeboxUnclipTarget(node, old);
      }
      state.codeboxSlotUnclipOriginals.clear();
    }
    // After the dialog targets: an element that is both gets its own inline values back last.
    restoreFrameSurfaces();
    state.codeboxSlotUnclipLastReason = reason;
    state.codeboxSlotUnclipTargetCount = 0;
  }

  // The media query list for the stacked card dialog layout, or null where matchMedia is missing.
  let stackedLayoutQuery = null;
  function stackedLayoutMedia() {
    if (stackedLayoutQuery) return stackedLayoutQuery;
    try { stackedLayoutQuery = document?.defaultView?.matchMedia?.(CARD_DIALOG_STACKED_MEDIA) || null; } catch { stackedLayoutQuery = null; }
    return stackedLayoutQuery;
  }

  function dialogLayoutIsStacked() {
    return stackedLayoutMedia()?.matches === true;
  }

  // The editor whose dialog body was last unclipped, so a change of layout (the window crossing the
  // stacked breakpoint) can redo the walk for it. Held weakly; the listener is removed on cleanup.
  let slotUnclipEditorRef = null;
  let stackedLayoutListening = false;
  function onStackedLayoutChange() {
    const editor = slotUnclipEditorRef?.deref?.() || null;
    if (!editor || editor.isConnected === false) return;
    try { applyCodeboxSlotDialogBodyUnclip(editor, "layout-change"); } catch { /* never throws from the media query listener */ }
  }
  function watchStackedLayout(editor) {
    try { slotUnclipEditorRef = typeof WeakRef === "function" ? new WeakRef(editor) : null; } catch { slotUnclipEditorRef = null; }
    if (stackedLayoutListening || !slotUnclipEditorRef) return;
    const media = stackedLayoutMedia();
    if (!media?.addEventListener) return;
    try { media.addEventListener("change", onStackedLayoutChange); stackedLayoutListening = true; } catch { /* old engine */ }
  }
  function stopWatchingStackedLayout() {
    slotUnclipEditorRef = null;
    if (!stackedLayoutListening) return;
    try { stackedLayoutMedia()?.removeEventListener?.("change", onStackedLayoutChange); } catch { /* old engine */ }
    stackedLayoutListening = false;
  }

  // `stacked`: the card dialog shows the preview under the editor. The dialog body is then the
  // element that scrolls to the preview, so it keeps its own overflow; only the dialog surface is
  // unclipped.
  function isCodeboxSlotUnclipTarget(node, stacked = false) {
    if (!node?.matches) return false;
    try {
      if (node.matches("dialog.dialog.open")) return true;
      if (stacked) return false;
      return node.matches(HA_DIALOG_BODY_SCROLLBAR) || node.matches(HA_DIALOG_BODY);
    } catch {
      return false;
    }
  }

  function attachCodeboxSlotUnclipObserver(node, reason) {
    if (!node || !state.codeboxSlotUnclipObservers) return;
    if (state.codeboxSlotUnclipObservers.has(node)) return;
    const observer = new MutationObserver(() => {
      forceCodeboxUnclipTarget(node, `${reason}-reapplied`);
    });
    try { observer.observe(node, { attributes: true, attributeFilter: ["style", "class"] }); } catch { return; }
    state.codeboxSlotUnclipObservers.set(node, observer);
  }

  function applyCodeboxSlotDialogBodyUnclip(editor, reason = "slot-dialog-body") {
    const frameHost = codeboxFrameHostForEditor(editor);
    const starts = [frameHost, editor, editor?.getRootNode?.()?.host].filter(Boolean);
    const targets = new Set();
    const stacked = dialogLayoutIsStacked();
    if (editor) watchStackedLayout(editor);
    for (const start of starts) {
      let node = start;
      for (let i = 0; node && i < 80; i += 1) {
        if (node.nodeType === 1 && isCodeboxSlotUnclipTarget(node, stacked)) targets.add(node);
        node = codeboxComposedParent(node);
      }
    }

    if (!state.codeboxSlotUnclipOriginals) state.codeboxSlotUnclipOriginals = new Map();
    if (!state.codeboxSlotUnclipObservers) state.codeboxSlotUnclipObservers = new Map();

    // Restore stale dialog targets when the active editor moves to a new dialog.
    for (const [node, old] of Array.from(state.codeboxSlotUnclipOriginals.entries())) {
      if (!targets.has(node)) {
        const observer = state.codeboxSlotUnclipObservers.get(node);
        try { observer?.disconnect?.(); } catch { /* injected observer */ }
        state.codeboxSlotUnclipObservers.delete(node);
        restoreCodeboxUnclipTarget(node, old);
        state.codeboxSlotUnclipOriginals.delete(node);
      }
    }

    let changed = 0;
    for (const node of targets) {
      const label = labelCodeboxUnclipTarget(node).slice(0, 72);
      const targetReason = `${reason}-${label}`;
      if (forceCodeboxUnclipTarget(node, targetReason)) changed += 1;
      attachCodeboxSlotUnclipObserver(node, targetReason);
    }

    state.codeboxSlotUnclipTargetCount = targets.size;
    state.codeboxSlotUnclipLastReason = reason;
    if (changed) recordPerformanceEvent("codebox-slot-unclip", 0, `${reason}:${targets.size}`);
    return targets.size > 0;
  }

  // isNonScrollingClipper for an element, from its computed overflow and its content size. False
  // without getComputedStyle or for a detached node.
  function frameHostNearChainClipsWithoutScrolling(node) {
    if (!node || node.nodeType !== 1) return false;
    const view = document?.defaultView;
    if (!view?.getComputedStyle) return false;
    let cs;
    try { cs = view.getComputedStyle(node); } catch { return false; }
    if (!cs) return false;
    let xOver = 0;
    let yOver = 0;
    try {
      xOver = node.scrollWidth - node.clientWidth;
      yOver = node.scrollHeight - node.clientHeight;
    } catch { return false; }
    return isNonScrollingClipper({ overflowX: cs.overflowX, overflowY: cs.overflowY, xOver, yOver });
  }

  function allowCodeboxFrameOverflow(editor) {
    // The frame is drawn by the ha-code-editor host, but Home Assistant wraps the editor in
    // containers that clip while the dialog settles. Only the wrappers close to the editor are
    // unclipped, so the glow at the bottom shows.
    const frameHost = codeboxFrameHostForEditor(editor);
    forgetDetachedFrameSurfaces();
    const markFrameSurface = (node, reason = "frame-surface") => {
      if (!node?.style) return false;
      // The properties first: the first one records the mark the element had before.
      setFrameSurfaceProperty(node, "overflow", "visible");
      setFrameSurfaceProperty(node, "overflow-x", "visible");
      setFrameSurfaceProperty(node, "overflow-y", "visible");
      setFrameSurfaceProperty(node, "contain", "none");
      setFrameSurfaceProperty(node, "clip-path", "none");
      setFrameSurfaceProperty(node, "mask-image", "none");
      setFrameSurfaceProperty(node, "-webkit-mask-image", "none");
      try { node.dataset.nostrodomusCodeboxUnclip = reason; } catch { /* detached node */ }
      return true;
    };
    if (frameHost?.style) {
      try { frameHost.dataset.nostrodomusCodeboxFrameHost = "1"; } catch { /* detached node */ }
      if (!isCodeMirrorInlineStyleTarget(frameHost)) {
        setFrameSurfaceProperty(frameHost, "position", "relative");
        setFrameSurfaceProperty(frameHost, "display", "block");
        setFrameSurfaceProperty(frameHost, "background", "transparent");
        setFrameSurfaceProperty(frameHost, "box-shadow", "none");
        setFrameSurfaceProperty(frameHost, "border", "0");
        markFrameSurface(frameHost, "frame-host");
      } else {
        state.codeboxFrameInlineInternalOverflowCedance = (state.codeboxFrameInlineInternalOverflowCedance || 0) + 1;
      }

      // The wrappers up to the dialog here, then the dialog body through a walk that follows
      // slots. CodeMirror's own elements are not written on (CodeMirror and the companion layer
      // own them). On the automation and script pages nothing clips the glow (hass-subpage is
      // overflow: visible); their room for it comes from the panel sizing in
      // codeboxEnlargeRuntime.
      let node = haCodeEditorHostForEditor(editor) || frameHost;
      for (let i = 0; i < 8; i += 1) {
        const parent = codeboxComposedParent(node);
        if (!parent || parent === document.documentElement) break;
        // A YAML editor that a custom card's editor nests for a sub-card: the elements around it
        // are that card's layout and are not written on.
        if (insideCardOwnEditor(parent)) break;
        const local = String(parent.localName || "").toLowerCase();
        if (local === HA_CODE_EDITOR || local === HA_YAML_EDITOR || local === HUI_CARD_ELEMENT_EDITOR) {
          markFrameSurface(parent, `frame-parent-${i}`);
        } else if (frameHostNearChainClipsWithoutScrolling(parent)) {
          // A plain wrapper that clips but does not scroll (see isNonScrollingClipper).
          markFrameSurface(parent, `frame-parent-noscroll-${i}`);
        }
        if (local === "dialog" || local === "wa-dialog" || local === "ha-dialog") break;
        node = parent;
      }
      applyCodeboxSlotDialogBodyUnclip(editor, "frame-overflow");
    }
    try { editor.dataset.nostrodomusCodeboxStyle = "1"; } catch { /* detached node */ }
  }

  return {
    labelCodeboxUnclipTarget,
    rememberCodeboxUnclipOriginal,
    setImportantIfNeeded,
    forceCodeboxUnclipTarget,
    restoreCodeboxUnclipTarget,
    cleanupCodeboxSlotUnclip,
    isCodeboxSlotUnclipTarget,
    attachCodeboxSlotUnclipObserver,
    applyCodeboxSlotDialogBodyUnclip,
    allowCodeboxFrameOverflow,
  };
}
