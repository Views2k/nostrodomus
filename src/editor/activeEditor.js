// Nostrodomus active-editor scoping module
// Pure scoping helpers; stateful editor lifecycle stays runtime-owned.
// Invariant: completions only activate inside the active HA code editor surface.
// This protects against dashboard/global Ctrl+Space leakage.

import {
  CM_CONTENT,
  CM_CONTENT_CLASS,
  CM_EDITOR,
  CM_EDITOR_CLASS,
  CM_EDITOR_SURFACE,
  CM_SCROLLER,
  HA_CODE_EDITOR,
  HA_DIALOG,
  HA_DIALOG_BODY,
  HA_MD_DIALOG,
  HA_PANEL_LOVELACE,
  HA_YAML_EDITOR,
  HOME_ASSISTANT,
  HUI_CARD,
  HUI_CARD_EDITOR,
  HUI_CARD_ELEMENT_EDITOR,
  HUI_CARD_OPTIONS_EDITOR,
  HUI_DIALOG_CONTENT,
  HUI_DIALOG_EDIT_CARD,
  HUI_ROOT,
  HUI_VIEW,
  MODAL_PSEUDO,
  UNIVERSAL_PANEL_HOSTS,
  WA_DIALOG,
  isPanelEditorRoute,
  surfaceFromHostTag,
} from "./haSelectors.js";
import { insideCardOwnEditor } from "./cardOwnEditor.js";

// Autocomplete on non-card-dialog editors.
//
// The three completion scope gates below (isScopedEditorEvent / isViewAllowed / viewFromEvent)
// funnel through activeEditDialog(). For the panel editors (Dev Tools Template, dashboard raw
// config, automation / script YAML) the "no dashboard-wide Ctrl+Space leakage" invariant (file
// header) is enforced by the conjunction of (1) containment and (2) editor-surface presence, not by
// dialog identity. So the gates admit a panel keystroke/view only when it resolves to a real editor
// surface inside an allowlisted HA-native panel host (UNIVERSAL_PANEL_HOSTS): a bare dashboard
// keydown has no editor surface in its composedPath, and a third-party card editor is not inside an
// allowlisted host, so both still hit the existing return false. Gated by style.universalCodebox +
// style.universalAutocomplete.

function universalAutocompleteEnabled(deps = {}) {
  const style = deps.state?.settings?.style;
  return style?.universalCodebox !== false && style?.universalAutocomplete !== false;
}

// True when the event composedPath is inside an allowlisted non-card-dialog editor surface:
// it must carry a real editor surface (ha-code-editor / .cm-*) AND an allowlisted panel host.
function pathInsideUniversalEditorSurface(path) {
  if (!pathHasEditorSurface(path)) return false;
  return (path || []).some((n) => { try { return !!n?.matches?.(UNIVERSAL_PANEL_HOSTS); } catch { return false; } });
}

// True when a node (a CM view's .dom) lives inside an allowlisted non-card-dialog panel host
// (composed walk-up across shadow boundaries). The caller has already verified it is a real,
// visible CM view, so host containment is the allowlist/leak guard.
function nodeInsideUniversalEditorSurface(node) {
  let n = node;
  let depth = 0;
  while (n && depth++ < 40) {
    try { if (n.matches?.(UNIVERSAL_PANEL_HOSTS)) return true; } catch { /* detached */ }
    const root = n.getRootNode?.();
    n = root?.host || n.parentElement || null;
  }
  return false;
}

// Extract the first allowed CM view from an event composedPath (shared by the dialog and the
// universal arms of viewFromEvent). Every candidate is filtered through the (universal-aware)
// isViewAllowed, so this never returns a view outside an allowlisted surface.
function viewFromPathCandidates(path, deps = {}) {
  const candidates = [];
  for (const n of path || []) {
    if (looksLikeView(n?.codemirror)) candidates.push(n.codemirror);
    if (looksLikeView(n?._codeEditor?.codemirror)) candidates.push(n._codeEditor.codemirror);
    if (looksLikeView(n?.cmTile?.view)) candidates.push(n.cmTile.view);
    if (looksLikeView(n?.view)) candidates.push(n.view);
  }
  const cm = closestFromPath(path, CM_EDITOR);
  const content = cm?.querySelector?.(CM_CONTENT);
  if (looksLikeView(content?.cmTile?.view)) candidates.push(content.cmTile.view);
  for (const view of candidates) {
    if (isViewAllowed(view, deps)) return view;
  }
  return null;
}

export function visible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 20 && r.height > 20 && s.display !== "none" && s.visibility !== "hidden";
  }

export function closestFromPath(path, selector) {
    for (const n of path || []) {
      if (n?.matches?.(selector)) return n;
      if (n?.closest) {
        const hit = n.closest(selector);
        if (hit) return hit;
      }
    }
    return null;
  }

export function composedContains(host, node) {
    if (!host || !node) return false;
    let n = node;
    while (n) {
      if (n === host) return true;
      const root = n.getRootNode?.();
      if (root?.host) n = root.host;
      else n = n.parentElement;
    }
    return false;
  }

export function homeRoot() {
    return document.querySelector(HOME_ASSISTANT)?.shadowRoot || null;
  }

// HA's edit-card dialog body surface across versions: pre-2026.6 exposes a
// `.content` element directly in the dialog's shadow root; 2026.6 wraps the
// body in `ha-dialog`, whose own shadow root carries `wa-dialog` and
// `div.body` (the frozen v17 companion handles exactly this selector set).
// Completion's typing gate (isScopedEditorEvent → pathInsideActiveDialog) rides
// on this finder and has no companion-bridge fallback, so a `.content`-only
// check meant silence on 2026.6 instances without the legacy companion files.
export function visibleDialogSurface(dialog) {
    const root = dialog?.shadowRoot;
    if (!root) return false;
    const legacyContent = root.querySelector(HUI_DIALOG_CONTENT);
    if (legacyContent && visible(legacyContent)) return true;
    const haDialog = root.querySelector(HA_DIALOG);
    if (!haDialog) return false;
    const body = haDialog.shadowRoot?.querySelector(HA_DIALOG_BODY);
    if (body && visible(body)) return true;
    const waDialog = haDialog.shadowRoot?.querySelector(WA_DIALOG);
    if (waDialog && visible(waDialog)) return true;
    return visible(haDialog);
  }

// On 2026.6 the dialog element is still named hui-dialog-edit-card, but it no
// longer mounts under home-assistant's shadow root (dialogCount is 0 there
// while a shadow-piercing locator still finds the open dialog).
// Candidate roots, cheapest first: document light DOM, the legacy
// home-assistant shadow root, and that root's depth-1 child shadow roots
// (e.g. a main/manager element hosting dialogs one level down). Bounded by
// design: this runs on the typing hotpath, and wildcard deep shadow walks are
// no-touch-listed. If a future HA build mounts the dialog deeper, add that
// exact root to the registry rather than widening the walk.
//
// editCardDialogElements returns every hui-dialog-edit-card element, open or not.
// Home Assistant keeps the element attached after the dialog closes, with an emptied shadow
// root (measured on 2026.11: still in the DOM on another dashboard, shadow root with no
// children). editCardDialogCandidates leaves those out, so "a dialog is present" stops being
// true for the rest of the session after the first card edit.
function editCardDialogHasContent(dialog) {
    try {
      const root = dialog?.shadowRoot;
      return !(root && root.childElementCount === 0);
    } catch {
      return true;
    }
  }

export function editCardDialogCandidates() {
    return editCardDialogElements().filter(editCardDialogHasContent);
  }

export function editCardDialogElements() {
    const results = [];
    const push = (list) => {
      for (const dialog of list || []) {
        if (dialog && !results.includes(dialog)) results.push(dialog);
      }
    };
    try { push(document.querySelectorAll(HUI_DIALOG_EDIT_CARD)); } catch { /* stubbed/absent document */ }
    const hr = homeRoot();
    if (hr) {
      try { push(hr.querySelectorAll(HUI_DIALOG_EDIT_CARD)); } catch { /* stale root */ }
      for (const child of hr.children || []) {
        const root = child.shadowRoot;
        if (!root) continue;
        try { push(root.querySelectorAll(HUI_DIALOG_EDIT_CARD)); } catch { /* closed/hostile root */ }
      }
    }
    return results;
  }

// The visible edit-card dialog: scan every candidate (editCardDialogCandidates
// covers the 2026.6 mount point outside the home-assistant shadow root) and
// return the first whose body surface is visible.
export function activeEditDialog() {
    return editCardDialogCandidates().find((dialog) => visibleDialogSurface(dialog)) || null;
  }

// The surface to reconcile editor warnings on. Prefer the visible edit dialog, but fall
// back to the most recent edit-card candidate when the visibility filter yields null:
// HA can present the dialog (and its "visual editor not supported" alert) while its body
// surface fails visibleDialogSurface (the 2026.6+ 0-sized/reshaped open phase), so the
// badge would otherwise never apply. Scoped to edit-card candidates -- never dashboard-wide.
export function activeEditorWarningSurface() {
    return activeEditDialog() || editCardDialogCandidates().slice(-1)[0] || null;
  }

export function pathHasEditorSurface(path) {
    return (path || []).some((n) => {
      const tag = n?.tagName?.toLowerCase?.() || "";
      return tag === HA_CODE_EDITOR || n?.matches?.(CM_EDITOR_SURFACE);
    });
  }

export function pathInsideActiveDialog(path) {
    const dialog = activeEditDialog();
    if (!dialog) return false;
    return (path || []).some((n) => n === dialog || composedContains(dialog, n));
  }

export function isNostrodomusUiEvent(ev, deps = {}) {
    const runtimeState = deps.state || {};
    const path = ev?.composedPath?.() || [];
    return path.some((n) => n === runtimeState.overlay || n === runtimeState.settingsPanel || n?.id === "nostrodomus-completions-root" || n?.classList?.contains?.("nostrodomus-settings-panel"));
  }

// Shadow-piercing finder for the active edit-card dialog's ha-code-editor.
// Styling already locates the editor by DOM walk (it works on 2026.6); this
// is the same approach, used to bind the completion view authoritatively.
export function dialogCodeEditorElement(dialog) {
    if (!dialog) return null;
    const seen = new Set();
    const search = (root, depth = 0) => {
      if (!root || depth > 12) return null;
      let editors = [];
      try { editors = Array.from(root.querySelectorAll?.(HA_CODE_EDITOR) || []); } catch { editors = []; }
      // A code box inside a custom card's own visual editor is not the dialog's code editor.
      editors = editors.filter((ed) => !insideCardOwnEditor(ed));
      for (const ed of editors) {
        const cm = ed?.shadowRoot?.querySelector?.(CM_EDITOR) || ed?.querySelector?.(CM_EDITOR);
        if (visible(ed) || (cm && visible(cm))) return ed;
      }
      if (editors[0]) return editors[0];
      let hosts = [];
      try { hosts = Array.from(root.querySelectorAll?.("*") || []); } catch { hosts = []; }
      for (const el of hosts) {
        const sr = el.shadowRoot;
        if (sr && !seen.has(sr)) { seen.add(sr); const hit = search(sr, depth + 1); if (hit) return hit; }
      }
      return null;
    };
    return search(dialog.shadowRoot) || search(dialog);
  }

// The active dialog editor's CodeMirror view, read straight off the element
// (2026.6 and older expose it at `.codemirror`; the other property names are
// kept for parity with viewFromEvent). DOM-based so it does not depend on the
// keydown composedPath, which 2026.6 retargets at a shadow boundary — the
// root cause of the engine binding a stale/off-dialog view.
export function dialogCodeEditorView(deps = {}) {
    const getDialog = typeof deps.activeEditDialog === "function" ? deps.activeEditDialog : activeEditDialog;
    const dialog = getDialog();
    if (!dialog) return null;
    const editor = dialogCodeEditorElement(dialog);
    if (!editor) return null;
    const view = [editor.codemirror, editor._codeEditor?.codemirror, editor.cmTile?.view, editor.view].find((v) => looksLikeView(v));
    if (!view) return null;
    return visible(view.dom) ? view : null;
  }

// Whether a card dialog hosts a code editor, remembered per dialog element. isScopedEditorEvent
// asks for every key, click and focus change inside the dialog, and dialogCodeEditorElement
// answers by reading every element of every shadow root in the dialog when there is no code
// editor, which is the case in the visual editor: each key typed into a form field read the
// whole form and the whole card preview. A found editor is trusted while it is still in the
// dialog. "No editor" is trusted for DIALOG_NO_EDITOR_RECHECK_MS, so a burst of typing reads the
// dialog at most once per interval; an event from the editor surface inside the dialog drops it
// at once, so the editor that appears when switching to the code editor is seen on the next event.
const DIALOG_NO_EDITOR_RECHECK_MS = 1000;
const dialogEditorPresence = new WeakMap();

function dialogPresenceNow(deps) {
    if (typeof deps.now === "function") return deps.now();
    try { return globalThis.performance?.now?.() ?? Date.now(); } catch { return Date.now(); }
  }

function dialogHostsCodeEditor(dialog, deps = {}) {
    const now = dialogPresenceNow(deps);
    const known = dialogEditorPresence.get(dialog);
    if (known?.editor) {
      if (known.editor.isConnected !== false && composedContains(dialog, known.editor)) return true;
    } else if (known && now - known.at >= 0 && now - known.at < DIALOG_NO_EDITOR_RECHECK_MS) {
      return false;
    }
    const editor = dialogCodeEditorElement(dialog);
    dialogEditorPresence.set(dialog, { editor: editor || null, at: now });
    return !!editor;
  }

// A 2026.6 keydown composedPath can be
// retargeted at a shadow boundary, dropping the editor-surface nodes while
// the dialog node survives. When the event is inside the active edit dialog
// and that dialog hosts a code editor, it is still editor scope (the view
// binds via dialogCodeEditorView in viewFromEvent). Still dialog-bounded —
// dashboard events have no active edit dialog, so they stay out of scope.
export function isScopedEditorEvent(ev, deps = {}) {
    const path = ev?.composedPath?.() || [];
    // A key or click inside a custom card's own visual editor is that card's.
    if (insideCardOwnEditor(path[0] || ev?.target)) return false;
    const dialog = activeEditDialog();
    if (dialog && pathHasEditorSurface(path) && path.some((n) => n === dialog || composedContains(dialog, n))) {
      if (!dialogEditorPresence.get(dialog)?.editor) dialogEditorPresence.delete(dialog);
      return true;
    }
    if (!dialog) {
      // No card dialog open: admit the keystroke only when the event path is inside an allowlisted
      // non-card-dialog editor surface (real editor surface + allowlisted panel host). A bare
      // dashboard keydown has neither, so this stays false (no leakage).
      return universalAutocompleteEnabled(deps) && pathInsideUniversalEditorSurface(path);
    }
    const inDialog = path.some((n) => n === dialog || composedContains(dialog, n)) || composedContains(dialog, ev?.target);
    return inDialog && dialogHostsCodeEditor(dialog, deps);
  }

// Whether the page can have a code editor: one the runtime already knows, one that is mounting,
// or one that a style pass could still find. False only for a page like a plain dashboard: no
// bound or remembered editor, no editor-opening window, a pointer path with no editor, editor
// panel or dialog in it, a route that hosts no editor panel, and no card dialog in the document.
// The completion runtime uses it to leave out the style pass a pointerdown outside the editor
// asks for (see outsidePointerNeedsStyleApply there).
const EDITOR_CONTAINER_IN_PATH = [UNIVERSAL_PANEL_HOSTS, HUI_DIALOG_EDIT_CARD, HA_DIALOG, HA_MD_DIALOG, "dialog"].join(", ");

export function pageMayHaveEditor(ev, deps = {}) {
    const runtimeState = deps.state || {};
    if (runtimeState.activeEditorCache?.editor || runtimeState.view || runtimeState.hookedView) return true;
    if (Date.now() < (Number(runtimeState.editorSentinelLikelyOpeningUntil) || 0)) return true;
    const path = ev?.composedPath?.() || [];
    if (pathHasEditorSurface(path)) return true;
    if (path.some((n) => { try { return !!n?.matches?.(EDITOR_CONTAINER_IN_PATH); } catch { return false; } })) return true;
    let pathname = "";
    try { pathname = String((deps.window || globalThis.window || globalThis)?.location?.pathname || ""); } catch { /* sandboxed window */ }
    if (isPanelEditorRoute(pathname)) return true;
    try { return editCardDialogCandidates().length > 0; } catch { return true; }
  }

export function looksLikeView(v) {
    return !!v &&
      typeof v === "object" &&
      !!v.state &&
      typeof v.dispatch === "function" &&
      !!v.dom &&
      typeof v.coordsAtPos === "function";
  }

export function isViewAllowed(view, deps = {}) {
    const runtimeState = deps.state || {};
    const runtimeWindow = deps.window || globalThis?.window || globalThis;
    const candidateView = view || runtimeState.view;
    if (!looksLikeView(candidateView) || !visible(candidateView.dom)) return false;
    if (insideCardOwnEditor(candidateView.dom)) return false;
    const dialog = activeEditDialog();
    if (!dialog) {
      // No card dialog: allow a real, visible CM view whose DOM lives inside an allowlisted
      // non-card-dialog panel host. The looksLikeView + visible checks above are the editor-surface
      // guard; host containment is the allowlist guard. Bare dashboard yields false.
      return universalAutocompleteEnabled(deps) && nodeInsideUniversalEditorSurface(candidateView.dom);
    }
    if (composedContains(dialog, candidateView.dom)) return true;

    const bridgeActive = runtimeWindow?.__nostrodomusEditorBridgeV1?.active?.();
    if (bridgeActive?.cmEditor && composedContains(bridgeActive.cmEditor, candidateView.dom)) return true;
    if (bridgeActive?.codeEditor && composedContains(bridgeActive.codeEditor, candidateView.dom)) return true;

    return false;
  }

export function viewFromEvent(ev, deps = {}) {
    const path = ev?.composedPath?.() || [];
    const dialog = activeEditDialog();
    if (!dialog) {
      // No card dialog: bind a panel editor's CM view from the event path when the path is inside
      // an allowlisted non-card-dialog editor surface. Reuses the same candidate extraction as the
      // dialog path; every candidate must still pass the universal-aware isViewAllowed (real visible
      // CM view inside an allowlisted panel host).
      if (!universalAutocompleteEnabled(deps) || !pathInsideUniversalEditorSurface(path)) return null;
      return viewFromPathCandidates(path, deps);
    }
    const inDialog =
      path.some((n) => n === dialog || composedContains(dialog, n)) || composedContains(dialog, ev?.target);
    if (!inDialog) return null;

    if (pathHasEditorSurface(path)) {
      const pathView = viewFromPathCandidates(path, deps);
      if (pathView) return pathView;
    }

    // DOM fallback: the composedPath did not carry an allowed view because
    // 2026.6 retargets it at a shadow boundary. Bind the dialog's own
    // ha-code-editor view directly; isViewAllowed re-checks containment.
    const domView = dialogCodeEditorView({ ...deps, activeEditDialog: () => dialog });
    if (domView && isViewAllowed(domView, deps)) return domView;

    return null;
  }

// Derive the editor surface from the event path, reusing the host the completion gate already
// matches (no new DOM traversal beyond the composedPath). A card-edit dialog is always
// 'card-editor'; otherwise the first allowlisted panel host in the path names the surface
// (innermost wins: the specific developer-tools-* node precedes its ha-panel-developer-tools
// wrapper in composedPath). Fail-dark to 'unknown'. Pure read of the event path only.
function surfaceFromEventPath(ev) {
    try {
      if (activeEditDialog()) return "card-editor";
      const path = ev?.composedPath?.() || [];
      for (const n of path) {
        try {
          if (n?.matches?.(UNIVERSAL_PANEL_HOSTS)) {
            return surfaceFromHostTag(n.tagName ? n.tagName.toLowerCase() : "");
          }
        } catch { /* detached node */ }
      }
    } catch { /* fail-dark */ }
    return "unknown";
  }

export function rememberView(ev, deps = {}) {
    const runtimeState = deps.state || {};
    const hook = typeof deps.hookDispatch === "function" ? deps.hookDispatch : () => {};
    const view = viewFromEvent(ev, deps);
    if (!view) return false;

    runtimeState.view = view;
    // Cache the surface at the single view-bind point so the context detector can read it as plain
    // data (it must never touch the DOM). Written unconditionally (cheap); consumed only under the
    // engineV2 flag in runtimeContextRuntime.
    runtimeState.activeSurface = surfaceFromEventPath(ev);
    hook(view);
    return true;
  }

// Find the active top-layer modal dialog so Settings can mount inside it.
// The wildcard shadow traversal below is the Settings-only legacy path,
// not a general traversal strategy.
export function activeTopLayerDialog(options = {}) {
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const runtimeState = options.state || {};
  const recordRuntimeErrorOnce = typeof options.recordRuntimeErrorOnce === "function" ? options.recordRuntimeErrorOnce : () => {};
  const activeDialog = typeof options.activeEditDialog === "function" ? options.activeEditDialog() : activeEditDialog();
  const homeRootFn = typeof options.homeRoot === "function" ? options.homeRoot : homeRoot;
  const legacyRestoredMode = "legacy-restored";
  const roots = [];
  const seen = new Set();

  const addRoot = (root) => {
    if (!root || seen.has(root)) return;
    seen.add(root);
    roots.push(root);
  };

  addRoot(activeDialog?.shadowRoot);
  addRoot(homeRootFn());
  addRoot(documentRef);

  // Each root is read once per call: the document walk reaches the home-assistant shadow root
  // again, which used to walk the whole app a second time.
  const walked = new Set();
  let traversalAt = "";
  const walk = (root, depth = 0) => {
    if (!root || depth > 12 || walked.has(root)) return null;
    walked.add(root);

    let dialogs = [];
    try { dialogs = Array.from(root.querySelectorAll?.("dialog") || []); } catch (err) { recordRuntimeErrorOnce("settings:top-layer-dialog-query", err, { phase: "activeTopLayerDialog", depth }); dialogs = []; }
    for (const candidate of dialogs) {
      try {
        if (candidate.open && candidate.matches?.(MODAL_PSEUDO)) return candidate;
      } catch (err) { recordRuntimeErrorOnce("settings:top-layer-dialog-modal-check", err, { phase: "activeTopLayerDialog", depth }); }
    }
    for (const candidate of dialogs) {
      if (candidate.open) return candidate;
    }

    // Settings must find the active native HA modal dialog even when Home
    // Assistant inserts it under shadow hosts outside the targeted list. A
    // targeted traversal could miss the real top-layer dialog and mount Settings
    // outside the modal subtree, making the menu visible but inert. Keep this
    // Settings-only walk on the wildcard path until a measured, portal-safe
    // replacement is proven.
    let all = [];
    try { all = Array.from(root.querySelectorAll?.("*") || []); } catch (err) { recordRuntimeErrorOnce("settings:top-layer-dialog-shadow-query", err, { phase: "activeTopLayerDialog", depth }); all = []; }
    runtimeState.settingsTopLayerDialogShadowTraversalMode = legacyRestoredMode;
    runtimeState.settingsTopLayerDialogLegacyWildcardShadowTraversals = (runtimeState.settingsTopLayerDialogLegacyWildcardShadowTraversals || 0) + 1;
    runtimeState.lastSettingsTopLayerDialogShadowTraversal = {
      at: traversalAt || (traversalAt = new Date().toISOString()),
      reason: "activeTopLayerDialog-settings-portal-hotfix",
      mode: legacyRestoredMode,
      depth,
      candidates: all.length,
    };
    for (const el of all) {
      if (el.shadowRoot) {
        const hit = walk(el.shadowRoot, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };

  for (const root of roots) {
    const hit = walk(root);
    if (hit?.appendChild) return hit;
  }
  return null;
}

// Active-editor readout helper seam.
// These helpers are diagnostics-only and intentionally pure/local; active editor
// discovery, runtime state mutation, dispatch hooks, popup routing, Settings,
// styling, preview, and insertion/session behavior remain runtime-owned.
const ACTIVE_EDITOR_READOUT_MAX_TEXT = 220;

export function activeEditorReadoutString(value, limit = ACTIVE_EDITOR_READOUT_MAX_TEXT) {
  const text = String(value ?? "");
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

export function activeEditorReadoutVisible(el) {
  try {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const rect = el.getBoundingClientRect?.();
    const style = getComputedStyle(el);
    return !!rect && rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden";
  } catch (err) {
    return false;
  }
}

export function activeEditorReadoutLooksLikeView(view) {
  return !!view &&
    typeof view === "object" &&
    !!view.state &&
    typeof view.state.doc?.toString === "function" &&
    Number.isFinite(view.state.selection?.main?.head) &&
    !!view.dom;
}

export function activeEditorReadoutLinePosition(doc, pos, helpers = {}) {
  const stringify = typeof helpers.string === "function" ? helpers.string : activeEditorReadoutString;
  const safeDoc = typeof doc === "string" ? doc : "";
  const safePos = Math.max(0, Math.min(safeDoc.length, Number.isFinite(pos) ? pos : safeDoc.length));
  const before = safeDoc.slice(0, safePos);
  const lineNumber = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  let lineEnd = safeDoc.indexOf("\n", safePos);
  if (lineEnd < 0) lineEnd = safeDoc.length;
  const line = safeDoc.slice(lineStart, lineEnd);
  const column = safePos - lineStart;
  return {
    pos: safePos,
    lineNumber,
    column,
    linePreview: stringify(line),
    beforeCursorPreview: stringify(line.slice(0, column)),
    afterCursorPreview: stringify(line.slice(column)),
  };
}

// Active-editor readout discovery helper seam.
// These helpers are diagnostics-only: they do not mutate the active runtime
// view, hook dispatch, open/close popups, touch Settings, alter styling, or insert text.
const ACTIVE_EDITOR_READOUT_MAX_NODE_VISITS = 1800;
const ACTIVE_EDITOR_READOUT_MAX_CANDIDATES = 80;

const ACTIVE_EDITOR_READOUT_PERF_STORAGE_KEY = "nostrodomusPerf";

export function activeEditorReadoutPerfMode(options = {}) {
  try {
    const storage = options.storage || (typeof window !== "undefined" ? window.localStorage : null);
    const value = storage?.getItem?.(ACTIVE_EDITOR_READOUT_PERF_STORAGE_KEY) || "on";
    return value === "legacy" ? "legacy" : "on";
  } catch {
    return "on";
  }
}

export function activeEditorReadoutTraversalScopedEnabled(options = {}) {
  return activeEditorReadoutPerfMode(options) !== "legacy";
}

export function recordActiveEditorReadoutTraversal(state = null, summary = {}) {
  if (!state || typeof state !== "object") return null;
  const mode = summary.mode || (activeEditorReadoutTraversalScopedEnabled() ? "targeted" : "legacy-wildcard");
  state.activeEditorReadoutTraversalMode = mode;
  if (mode === "targeted") state.activeEditorReadoutTargetedTraversals = (state.activeEditorReadoutTargetedTraversals || 0) + 1;
  else state.activeEditorReadoutLegacyWildcardTraversals = (state.activeEditorReadoutLegacyWildcardTraversals || 0) + 1;
  state.lastActiveEditorReadoutTraversal = {
    at: new Date().toISOString(),
    mode,
    selector: summary.selector || "",
    children: summary.children || 0,
    visits: summary.visits || 0,
    queuedRoots: summary.queuedRoots || 0,
  };
  return state.lastActiveEditorReadoutTraversal;
}


export function activeEditorReadoutDeepActivePath(deps = {}) {
  const runtimeDocument = deps.document || (typeof document !== "undefined" ? document : null);
  const path = [];
  let root = runtimeDocument;
  let guard = 0;
  while (root && guard++ < 20) {
    const active = root.activeElement;
    if (!active || path.includes(active)) break;
    path.push(active);
    root = active.shadowRoot || null;
  }
  return path;
}

export function activeEditorReadoutNodeViewCandidates(node, helpers = {}) {
  const looksLike = typeof helpers.looksLikeView === "function"
    ? helpers.looksLikeView
    : activeEditorReadoutLooksLikeView;
  const out = [];
  if (!node) return out;
  try {
    if (looksLike(node.codemirror)) out.push(node.codemirror);
    if (looksLike(node._codeEditor?.codemirror)) out.push(node._codeEditor.codemirror);
    if (looksLike(node.cmTile?.view)) out.push(node.cmTile.view);
    if (looksLike(node.view)) out.push(node.view);
    const content = node.querySelector?.(CM_CONTENT);
    if (looksLike(content?.cmTile?.view)) out.push(content.cmTile.view);
  } catch {}
  return out;
}

export const ACTIVE_EDITOR_READOUT_TARGETED_SHADOW_HOST_SELECTOR = [
  HOME_ASSISTANT,
  HA_PANEL_LOVELACE,
  HUI_ROOT,
  HUI_VIEW,
  HUI_CARD,
  HUI_DIALOG_EDIT_CARD,
  HUI_CARD_ELEMENT_EDITOR,
  HUI_CARD_OPTIONS_EDITOR,
  HUI_CARD_EDITOR,
  HA_DIALOG,
  HA_MD_DIALOG,
  "dialog",
  HA_CODE_EDITOR,
  HA_YAML_EDITOR,
  CM_EDITOR,
  CM_SCROLLER,
  CM_CONTENT,
].join(",");

function activeEditorReadoutTraversalChildren(root, options = {}) {
  if (!root?.querySelectorAll) return [];
  const targeted = options.targetedTraversal === true;
  const selector = targeted ? ACTIVE_EDITOR_READOUT_TARGETED_SHADOW_HOST_SELECTOR : "*";
  try {
    return Array.from(root.querySelectorAll(selector) || []);
  } catch (err) {
    return [];
  }
}

export function activeEditorReadoutWalkRoots(startRoot, visit, options = {}) {
  const maxNodeVisits = Number.isFinite(options.maxNodeVisits)
    ? options.maxNodeVisits
    : ACTIVE_EDITOR_READOUT_MAX_NODE_VISITS;
  const visitor = typeof visit === "function" ? visit : () => {};
  const targetedTraversal = options.targetedTraversal === true;
  const queue = [startRoot];
  const seen = new Set();
  let visits = 0;
  while (queue.length && visits < maxNodeVisits) {
    const root = queue.shift();
    if (!root || seen.has(root)) continue;
    seen.add(root);
    visits += 1;

    const children = activeEditorReadoutTraversalChildren(root, { targetedTraversal });
    try {
      options.onTraversal?.({
        mode: targetedTraversal ? "targeted" : "legacy-wildcard",
        selector: targetedTraversal ? ACTIVE_EDITOR_READOUT_TARGETED_SHADOW_HOST_SELECTOR : "*",
        children: children.length,
        visits,
        queuedRoots: queue.length,
      });
    } catch {}

    for (const child of children) {
      if (visits++ >= maxNodeVisits) break;
      visitor(child);
      if (child.shadowRoot && !seen.has(child.shadowRoot)) queue.push(child.shadowRoot);
    }
  }
}

export function activeEditorReadoutFindView(options = {}) {
  const runtimeDocument = options.document || (typeof document !== "undefined" ? document : null);
  const stringify = typeof options.string === "function" ? options.string : activeEditorReadoutString;
  const isVisible = typeof options.visible === "function" ? options.visible : activeEditorReadoutVisible;
  const looksLike = typeof options.looksLikeView === "function" ? options.looksLikeView : activeEditorReadoutLooksLikeView;
  const deepActivePath = typeof options.deepActivePath === "function"
    ? options.deepActivePath
    : () => activeEditorReadoutDeepActivePath({ document: runtimeDocument });
  const nodeViewCandidates = typeof options.nodeViewCandidates === "function"
    ? options.nodeViewCandidates
    : (node) => activeEditorReadoutNodeViewCandidates(node, { looksLikeView: looksLike });
  const walkRoots = typeof options.walkRoots === "function"
    ? options.walkRoots
    : (root, visit) => activeEditorReadoutWalkRoots(root, visit, { maxNodeVisits: options.maxNodeVisits });
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const maxCandidates = Number.isFinite(options.maxCandidates)
    ? options.maxCandidates
    : ACTIVE_EDITOR_READOUT_MAX_CANDIDATES;

  const candidates = [];
  const activePath = deepActivePath();

  for (const node of activePath) {
    candidates.push(...nodeViewCandidates(node));
    try {
      const cm = node.closest?.(CM_EDITOR) || node.querySelector?.(CM_EDITOR);
      candidates.push(...nodeViewCandidates(cm));
    } catch (err) {
      onError("diagnostics:active-editor-node-query", err, { phase: "activeEditorReadoutFindView" });
    }
  }

  if (runtimeDocument) {
    walkRoots(runtimeDocument, (node) => {
      if (candidates.length >= maxCandidates) return;
      const tag = node.tagName?.toLowerCase?.() || "";
      const cls = node.className || "";
      const relevant = tag === HA_CODE_EDITOR || String(cls).includes(CM_EDITOR_CLASS) || String(cls).includes(CM_CONTENT_CLASS);
      if (!relevant) return;
      candidates.push(...nodeViewCandidates(node));
    });
  }

  const unique = [];
  const seen = new Set();
  for (const view of candidates) {
    if (!looksLike(view) || seen.has(view)) continue;
    seen.add(view);
    unique.push(view);
  }

  const activeDeep = activePath[activePath.length - 1] || null;
  const scored = unique.map((view, index) => {
    let focused = false;
    try {
      focused = !!activeDeep && (view.dom === activeDeep || view.dom.contains?.(activeDeep));
    } catch (err) {
      onError("diagnostics:active-editor-focus-check", err, { phase: "activeEditorReadoutFindView" });
    }
    const visible = isVisible(view.dom);
    return { view, index, focused, visible, score: (focused ? 100 : 0) + (visible ? 10 : 0) + index };
  }).filter((item) => item.visible || item.focused);

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.view || null;
  return {
    view: best,
    candidateCount: unique.length,
    activePath: activePath.map((node) => stringify(node.tagName || node.nodeName || "node", 40)),
  };
}

export function activeEditorReadoutRedactSnapshot(snapshotResult, cursor, helpers = {}) {
  const stringify = typeof helpers.string === "function" ? helpers.string : activeEditorReadoutString;
  const result = snapshotResult || {};
  const snapshot = result.snapshot || {};
  const safeCursor = cursor || {};
  const redactedSnapshot = {
    language: stringify(snapshot.language, 40),
    scope: stringify(snapshot.scope, 80),
    confidence: Number.isFinite(snapshot.confidence) ? snapshot.confidence : 0,
    cursor: {
      pos: safeCursor.pos,
      lineNumber: safeCursor.lineNumber,
      column: safeCursor.column,
      linePreview: safeCursor.linePreview,
      beforeCursorPreview: safeCursor.beforeCursorPreview,
      afterCursorPreview: safeCursor.afterCursorPreview,
    },
    yaml: snapshot.yaml || {},
    branch: snapshot.branch || {},
    card: snapshot.card || {},
    suggestion: snapshot.suggestion || {},
    runtime: snapshot.runtime || {},
  };
  return {
    ok: result.ok === true,
    stage: stringify(result.stage, 80),
    version: result.version || 0,
    dryRunOnly: result.dryRunOnly === true,
    redacted: true,
    snapshot: redactedSnapshot,
    warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 10).map((item) => stringify(item, 120)) : [],
  };
}

export function createActiveEditorContextSnapshotReadout(options = {}) {
  const runtimeDocument = options.document || (typeof document !== "undefined" ? document : null);
  const stringify = typeof options.string === "function" ? options.string : activeEditorReadoutString;
  const collectSnapshot = typeof options.collectSnapshot === "function" ? options.collectSnapshot : null;
  const traversalScoped = typeof options.traversalScoped === "function" ? options.traversalScoped : () => options.targetedTraversal === true;
  const onTraversal = typeof options.onTraversal === "function" ? options.onTraversal : () => {};
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const stage = options.stage || "2B-active-editor-context-snapshot-readout";
  const version = Number.isFinite(options.version) ? options.version : 1;
  const maxCandidates = Number.isFinite(options.maxCandidates) ? options.maxCandidates : ACTIVE_EDITOR_READOUT_MAX_CANDIDATES;
  const maxNodeVisits = Number.isFinite(options.maxNodeVisits) ? options.maxNodeVisits : ACTIVE_EDITOR_READOUT_MAX_NODE_VISITS;

  const found = activeEditorReadoutFindView({
    document: runtimeDocument,
    string: stringify,
    visible: activeEditorReadoutVisible,
    looksLikeView: activeEditorReadoutLooksLikeView,
    deepActivePath: () => activeEditorReadoutDeepActivePath({ document: runtimeDocument }),
    nodeViewCandidates: node => activeEditorReadoutNodeViewCandidates(node, { looksLikeView: activeEditorReadoutLooksLikeView }),
    walkRoots: (startRoot, visit) => activeEditorReadoutWalkRoots(startRoot, visit, {
      maxNodeVisits,
      targetedTraversal: traversalScoped(),
      onTraversal,
    }),
    maxCandidates,
    maxNodeVisits,
    onError,
  });

  const base = {
    ok: true,
    stage,
    version,
    consoleOnly: true,
    localOnly: true,
    redacted: true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    writesDom: false,
    networkAccess: false,
    editorFound: false,
    candidateCount: found.candidateCount,
    activePath: found.activePath,
  };

  const view = found.view;
  if (!view) {
    return Object.assign(base, {
      ok: false,
      editorFound: false,
      warning: "no-active-codemirror-view-found",
    });
  }

  const doc = view.state.doc.toString();
  const pos = Math.max(0, Math.min(doc.length, view.state.selection.main.head));
  const cursor = activeEditorReadoutLinePosition(doc, pos, { string: stringify });
  const snapshotResult = collectSnapshot
    ? collectSnapshot({ doc, pos, scope: "active-editor-console-diagnostics" })
    : { ok: false, dryRunOnly: true, stage: "missing-runtime-adapter", snapshot: null, warnings: ["missing-runtime-adapter"] };

  return Object.assign(base, {
    editorFound: true,
    editor: {
      docLength: doc.length,
      cursorOffset: pos,
      lineNumber: cursor.lineNumber,
      column: cursor.column,
      linePreview: cursor.linePreview,
    },
    snapshot: activeEditorReadoutRedactSnapshot(snapshotResult, cursor, { string: stringify }),
  });
}
