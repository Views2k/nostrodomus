// Which editor, and which events, completion may act on.
//
// Completion runs only inside a Home Assistant code editor: in the open card dialog, or in a panel
// editor inside one of the UNIVERSAL_PANEL_HOSTS. A Ctrl+Space anywhere else on a dashboard is left
// alone. The editor lifecycle and its state belong to the runtimes that call these helpers.

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

// Completion in panel editors outside the card dialog.
//
// The three scope checks below (isScopedEditorEvent, isViewAllowed, viewFromEvent) first look for
// the open card dialog. Without one, a key or a view on a panel (Developer Tools Template, the
// dashboard raw configuration editor, automation or script YAML) is in scope only when it belongs
// to an editor surface inside one of the UNIVERSAL_PANEL_HOSTS. A key on a dashboard has no editor
// surface in its composedPath, and a third-party card editor is not inside one of those hosts, so
// both stay out of scope. Needs style.universalCodebox and style.universalAutocomplete.

function universalAutocompleteEnabled(deps = {}) {
  const style = deps.state?.settings?.style;
  return style?.universalCodebox !== false && style?.universalAutocomplete !== false;
}

// True when the event path holds both an editor surface (ha-code-editor or a .cm-* element) and
// one of the panel hosts.
function pathInsideUniversalEditorSurface(path) {
  if (!pathHasEditorSurface(path)) return false;
  return (path || []).some((n) => { try { return !!n?.matches?.(UNIVERSAL_PANEL_HOSTS); } catch { return false; } });
}

// True when a node (a CodeMirror view's .dom) is inside one of the panel hosts, across shadow
// boundaries. The caller has already checked that the view is real and visible.
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

// The first CodeMirror view in an event path that isViewAllowed accepts, for both the dialog and
// the panel case of viewFromEvent.
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

// Whether the card dialog's body is visible. Before 2026.6 the dialog's shadow root holds a
// `.content` element; from 2026.6 the body is wrapped in `ha-dialog`, whose shadow root holds
// `wa-dialog` and `div.body`. activeEditDialog and so every completion scope check depend on it.
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

// From 2026.6 the hui-dialog-edit-card element no longer mounts under the home-assistant shadow
// root. editCardDialogElements looks in these roots, cheapest first: the document's light DOM,
// the home-assistant shadow root, and the shadow roots of that root's direct children (an element
// that hosts dialogs one level down). It runs on every key in the editor, so it does not walk
// deeper; if a Home Assistant release mounts the dialog deeper, add that exact root here.
//
// editCardDialogElements returns every hui-dialog-edit-card element, open or not. Home Assistant
// keeps the element attached after the dialog closes, with an emptied shadow root (measured on
// 2026.11: still in the DOM on another dashboard, shadow root with no children).
// editCardDialogCandidates leaves those out, so a dialog counts as present only while it has
// content.
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

// The first card dialog whose body is visible.
export function activeEditDialog() {
  return editCardDialogCandidates().find((dialog) => visibleDialogSurface(dialog)) || null;
}

// Where the editor warnings are badged or hidden: the visible card dialog, or else the newest
// card dialog candidate. From 2026.6 Home Assistant can show the dialog and its "visual editor not
// supported" alert while the body is still at zero size and fails visibleDialogSurface. Never
// anything outside a card dialog.
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

// The ha-code-editor of a card dialog, found by walking its shadow roots, the way styling finds
// the editor. Completion binds its view from it.
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

// The CodeMirror view of the open dialog's editor, read off the element (`.codemirror`; the other
// property names are the ones viewFromEvent also accepts). From 2026.6 a keydown composedPath is
// retargeted at a shadow boundary and may not reach the editor, so this does not rely on the event.
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
// asks for every key, click and focus change inside the dialog, and when there is no code editor
// (the visual editor) dialogCodeEditorElement reads every element of every shadow root in the
// dialog, the form and the card preview included. A found editor is trusted while it is still in
// the dialog. "No editor" is trusted for DIALOG_NO_EDITOR_RECHECK_MS, so a burst of typing reads
// the dialog at most once per interval; an event from the editor surface inside the dialog drops it
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

// From 2026.6 a keydown composedPath can be retargeted at a shadow boundary: the editor-surface
// nodes are gone while the dialog node is still there. An event inside the open card dialog is in
// scope when the dialog holds a code editor (viewFromEvent then binds its view through
// dialogCodeEditorView). Without an open card dialog only panel editors can be in scope.
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
    // No card dialog: in scope only inside a panel editor. A key on a dashboard is not.
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
    // No card dialog: a real, visible view (checked above) is allowed inside a panel host only.
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
    // No card dialog: a panel editor's view from the event path, accepted by isViewAllowed.
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

  // The event path carried no allowed view (retargeted at a shadow boundary from 2026.6): bind
  // the view of the dialog's own ha-code-editor; isViewAllowed checks it again.
  const domView = dialogCodeEditorView({ ...deps, activeEditDialog: () => dialog });
  if (domView && isViewAllowed(domView, deps)) return domView;

  return null;
}

// The editor surface of an event: 'card-editor' while a card dialog is open, otherwise the surface
// of the first panel host in the event path (the innermost: a developer-tools-* element comes
// before its ha-panel-developer-tools wrapper), or 'unknown'. Reads only the event path.
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
  } catch { /* no surface */ }
  return "unknown";
}

export function rememberView(ev, deps = {}) {
  const runtimeState = deps.state || {};
  const hook = typeof deps.hookDispatch === "function" ? deps.hookDispatch : () => {};
  const view = viewFromEvent(ev, deps);
  if (!view) return false;

  runtimeState.view = view;
  // The surface is stored where the view is bound, so the context detector, which does not read
  // the DOM, gets it as data. Only runtimeContextRuntime reads it, with completions.engineV2 on.
  runtimeState.activeSurface = surfaceFromEventPath(ev);
  hook(view);
  return true;
}

// The open top-layer modal dialog, so the Settings panel can mount inside it. Only the Settings
// panel uses this wildcard shadow walk.
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

  // Each root is read once per call: the document walk reaches the home-assistant shadow root again.
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

    // Home Assistant can put its modal dialog under shadow hosts that no targeted list names. A
    // targeted walk that misses it mounts Settings outside the modal subtree, where the panel is
    // visible but does not take input, so this walk enters every shadow host.
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

// Active-editor readout for diagnostics (__nostrodomus.contextDiagnostics.readActiveEditor). These
// helpers only read: they do not bind views, hook dispatch, open the popup, style or insert text.
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
  const stage = options.stage || "active-editor-snapshot-readout";
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
