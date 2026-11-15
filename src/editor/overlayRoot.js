// Where the suggestion popup mounts: inside the root of the active ha-code-editor or CodeMirror
// editor, or the open card dialog, and only without either in the document body. A popup in the
// body can paint behind a modal editor whatever its z-index.

import {
  CM_CONTENT,
  CM_CONTENT_CLASS,
  CM_EDITOR,
  CM_EDITOR_CLASS,
  CM_ROOT_CANDIDATES,
  CM_SCROLLER,
  CM_SCROLLER_CLASS,
  DEVELOPER_TOOLS_ACTION,
  DEVELOPER_TOOLS_EVENT,
  DEVELOPER_TOOLS_TEMPLATE,
  TOOLS_ACTION,
  TOOLS_EVENT,
  TOOLS_TEMPLATE,
  HA_AUTOMATION_EDITOR,
  HA_CODE_EDITOR,
  HA_DIALOG,
  HA_MD_DIALOG,
  HA_PANEL_DEVELOPER_TOOLS,
  HA_PANEL_LOVELACE,
  HA_PANEL_TOOLS,
  HA_SCRIPT_EDITOR,
  HA_YAML_EDITOR,
  HOME_ASSISTANT,
  HOME_ASSISTANT_MAIN,
  HUI_CARD,
  HUI_CARD_EDITOR,
  HUI_CARD_ELEMENT_EDITOR,
  HUI_CARD_OPTIONS_EDITOR,
  HUI_DIALOG_EDIT_CARD,
  HUI_EDITOR,
  HUI_ROOT,
  HUI_STACK_CARD_EDITOR,
  HUI_VIEW,
  PARTIAL_PANEL_RESOLVER,
} from "./haSelectors.js";

function reportOverlayError(options, scope, err, detail) {
  try { options?.recordRuntimeErrorOnce?.(scope, err, detail); } catch { /* diagnostics must not throw */ }
}

function docFromOptions(options) {
  return options?.documentRef || globalThis.document;
}

function computedStyleFromOptions(options) {
  return options?.getComputedStyleRef || globalThis.getComputedStyle;
}

function rootFromActiveViewOptions(options) {
  const view = options?.currentView || options?.hookedView || null;
  const dom = options?.currentViewDom || view?.dom || null;
  const root = dom?.getRootNode?.();
  if (root?.querySelector && root?.appendChild) return root;
  return null;
}

function rootFromActiveDialogOptions(options) {
  const dialog = options?.activeEditDialog || options?.activeDialog || null;
  if (dialog?.shadowRoot?.querySelector && dialog.shadowRoot?.appendChild) return dialog.shadowRoot;
  if (dialog?.querySelector && dialog?.appendChild) return dialog;
  return null;
}

function isDocumentFallbackRoot(root, doc) {
  return !!root && !!doc && (root === doc.body || root === doc.documentElement);
}

const OVERLAY_ROOT_TARGETED_SHADOW_HOSTS = [
  HOME_ASSISTANT,
  HOME_ASSISTANT_MAIN,
  PARTIAL_PANEL_RESOLVER,
  HA_PANEL_LOVELACE,
  HUI_ROOT,
  HUI_VIEW,
  HUI_CARD,
  HUI_DIALOG_EDIT_CARD,
  HUI_CARD_ELEMENT_EDITOR,
  HUI_CARD_OPTIONS_EDITOR,
  HUI_CARD_EDITOR,
  // Stack and grid card editors nest their sub-card editors one boundary deeper through this host:
  // hui-dialog-edit-card > hui-card-element-editor > hui-stack-card-editor > hui-card-element-editor >
  // ha-yaml-editor > ha-code-editor. Without it the targeted walk stops here and a sub-card codebox is
  // styled only after a click. It is a card dialog host like the other hui-card-* hosts, so it is in
  // the base list and does not depend on universalCodebox. Form-field editors reached through it are
  // still rejected by editorInsideVisualFormField.
  HUI_STACK_CARD_EDITOR,
  HA_DIALOG,
  HA_MD_DIALOG,
  "dialog",
  HA_CODE_EDITOR,
  HA_YAML_EDITOR,
  CM_EDITOR,
  CM_SCROLLER,
  CM_CONTENT,
];

export const OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR = OVERLAY_ROOT_TARGETED_SHADOW_HOSTS.join(",");

// The base hosts plus the panel editor hosts outside the card dialog (Developer Tools, the
// dashboard raw configuration editor, automation and script YAML), used with universalEditorHosts
// so the walk reaches their ha-code-editor. A name that is not a shadow host on a given page simply
// matches nothing.
const OVERLAY_ROOT_UNIVERSAL_SHADOW_HOST_SELECTOR = [
  ...OVERLAY_ROOT_TARGETED_SHADOW_HOSTS,
  HUI_EDITOR,
  HA_AUTOMATION_EDITOR,
  HA_SCRIPT_EDITOR,
  HA_PANEL_DEVELOPER_TOOLS,
  DEVELOPER_TOOLS_TEMPLATE,
  DEVELOPER_TOOLS_ACTION,
  DEVELOPER_TOOLS_EVENT,
  HA_PANEL_TOOLS,
  TOOLS_TEMPLATE,
  TOOLS_ACTION,
  TOOLS_EVENT,
].join(",");

function overlayRootTraversalChildren(root, options = {}) {
  if (!root?.querySelectorAll) return [];
  const targeted = options.targetedTraversal === true;
  const selector = targeted
    ? (options.universalEditorHosts === true
      ? OVERLAY_ROOT_UNIVERSAL_SHADOW_HOST_SELECTOR
      : OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR)
    : "*";
  let all = [];
  try {
    all = Array.from(root.querySelectorAll(selector) || []);
  } catch (err) {
    reportOverlayError(options, "editor:walk-open-root-query", err, {
      phase: "nostrodomusWalkOpenRoots",
      mode: targeted ? "targeted" : "legacy-wildcard",
      selector,
    });
    all = [];
  }
  try {
    options.onTraversal?.({
      mode: targeted ? "targeted" : "legacy-wildcard",
      selector,
      children: all.length,
      hosts: all.filter(el => !!el?.shadowRoot).length,
    });
  } catch {}
  return all;
}

export function nostrodomusWalkOpenRoots(root, fn, seen = new Set(), options = {}) {
  if (!root || seen.has(root)) return;
  seen.add(root);

  try { fn(root); } catch (err) { reportOverlayError(options, "editor:walk-open-root-callback", err, { phase: "nostrodomusWalkOpenRoots" }); }

  const all = overlayRootTraversalChildren(root, options);

  for (const el of all) {
    if (el.shadowRoot) nostrodomusWalkOpenRoots(el.shadowRoot, fn, seen, options);
  }
}

export function nostrodomusFindActiveCodeEditorRoot(options = {}) {
  const doc = docFromOptions(options);
  const readComputedStyle = computedStyleFromOptions(options);
  const matches = [];

  nostrodomusWalkOpenRoots(doc, root => {
    let editors = [];
    try {
      editors = Array.from(root.querySelectorAll(CM_ROOT_CANDIDATES));
    } catch (err) {
      reportOverlayError(options, "editor:active-root-query", err, { phase: "nostrodomusFindActiveCodeEditorRoot" });
      editors = [];
    }

    for (const el of editors) {
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 200 || rect.height < 80) continue;

      const cs = readComputedStyle?.(el) || {};
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;

      const cls = String(el.className || "");
      const score =
        cls.includes(CM_CONTENT_CLASS) ? 1000 :
        cls.includes(CM_EDITOR_CLASS) ? 800 :
        cls.includes(CM_SCROLLER_CLASS) ? 700 :
        100;

      matches.push({
        root,
        el,
        score,
        area: rect.width * rect.height
      });
    }
  }, new Set(), options);

  matches.sort((a, b) => (b.score - a.score) || (b.area - a.area));
  return matches[0]?.root || null;
}

export function nostrodomusCodeEditorOverlayRoot(options = {}) {
  const doc = docFromOptions(options);
  const activeViewRoot = rootFromActiveViewOptions(options);
  const activeDialogRoot = rootFromActiveDialogOptions(options);
  let root = activeViewRoot || nostrodomusFindActiveCodeEditorRoot(options) || null;

  // Card editors can sit inside dialog or top-layer shells; with a modal editor open, a popup in
  // document.body can paint behind it whatever its z-index. The order is the bound view's root, then
  // the open card dialog, and the body only when there is no card dialog.
  if ((!root || isDocumentFallbackRoot(root, doc)) && activeDialogRoot) root = activeDialogRoot;
  if (!root) root = doc?.body;
  if (!root) return null;

  let host = null;
  try {
    host = root.querySelector("#nostrodomus-cm-root-overlay-host");
  } catch (err) {
    reportOverlayError(options, "editor:overlay-host-query", err, { phase: "nostrodomusCodeEditorOverlayRoot" });
    host = null;
  }

  if (!host) {
    host = doc.createElement("div");
    host.id = "nostrodomus-cm-root-overlay-host";
    host.dataset.nostrodomusPurpose = "cm-root-completions-overlay";

    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("width", "100vw", "important");
    host.style.setProperty("height", "100vh", "important");
    host.style.setProperty("overflow", "visible", "important");
    host.style.setProperty("contain", "none", "important");
    host.style.setProperty("pointer-events", "none", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("isolation", "isolate", "important");

    root.appendChild(host);
  }

  return host;
}

export function overlayRoot(options = {}) {
  return nostrodomusCodeEditorOverlayRoot(options);
}
