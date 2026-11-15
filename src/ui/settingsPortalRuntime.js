// Where the settings panel and the suggestion list are attached. The settings portal host goes
// into the open top-layer dialog when there is one (a panel outside it could not be used while
// the modal dialog is open), else into the card dialog, the editor's shadow root or the
// home-assistant root. The overlay root lookups of src/editor/overlayRoot.js are wrapped here
// with the runtime state, and each walk is counted for diagnostics. Dependencies are injected.

import * as overlayRoots from '../editor/overlayRoot.js';

export const OVERLAY_ROOT_DIAGNOSTIC_SCOPES = Object.freeze([
  "editor:walk-open-root-callback",
  "editor:walk-open-root-query",
  "editor:active-root-query",
  "editor:overlay-host-query",
  "nostrodomus-cm-root-overlay-host",
  "cm-root-completions-overlay",
]);

export function createSettingsPortalRuntime(ctx = {}) {
  const {
    documentRef = globalThis.document,
    getComputedStyleRef = globalThis.getComputedStyle,
    NodeRef = globalThis.Node,
    state,
    nostrodomusPerfMode = () => "standard",
    recordRuntimeErrorOnce = () => {},
    activeEditDialog = () => null,
    activeTopLayerDialogFromModule = () => null,
    homeRoot = () => null,
    activeCodeboxStyleEditor = () => null,
    integrationDocumentStyleRoot = () => null,
  } = ctx;

  function overlayRootTraversalScopedEnabled() {
    return nostrodomusPerfMode() !== "legacy";
  }

  function recordOverlayRootTraversal(summary = {}) {
    if (!state) return null;
    const mode = summary.mode || (overlayRootTraversalScopedEnabled() ? "targeted" : "legacy-wildcard");
    state.overlayRootTraversalMode = mode;
    if (mode === "targeted") state.overlayRootTargetedTraversals = (state.overlayRootTargetedTraversals || 0) + 1;
    else state.overlayRootLegacyWildcardTraversals = (state.overlayRootLegacyWildcardTraversals || 0) + 1;
    state.lastOverlayRootTraversal = {
      at: new Date().toISOString(),
      mode,
      selector: summary.selector || "",
      children: summary.children || 0,
      hosts: summary.hosts || 0,
    };
    return state.lastOverlayRootTraversal;
  }

  function overlayRootOptions() {
    return {
      documentRef,
      getComputedStyleRef,
      currentView: state?.view,
      hookedView: state?.hookedView,
      activeEditDialog: activeEditDialog(),
      recordRuntimeErrorOnce,
      diagnosticScopes: OVERLAY_ROOT_DIAGNOSTIC_SCOPES,
      targetedTraversal: overlayRootTraversalScopedEnabled(),
      // The walk also enters the hosts of the panel editors (Developer Tools, the raw dashboard
      // configuration, the automation and script editors), unless style.universalCodebox is
      // false (no control in the panel), which limits it to card dialogs.
      universalEditorHosts: state?.settings?.style?.universalCodebox !== false,
      onTraversal: recordOverlayRootTraversal,
    };
  }

  function nostrodomusWalkOpenRoots(root, fn, seen = new Set()) {
    return overlayRoots.nostrodomusWalkOpenRoots(root, fn, seen, overlayRootOptions());
  }

  function nostrodomusFindActiveCodeEditorRoot() {
    return overlayRoots.nostrodomusFindActiveCodeEditorRoot(overlayRootOptions());
  }

  function nostrodomusCodeEditorOverlayRoot() {
    return overlayRoots.nostrodomusCodeEditorOverlayRoot(overlayRootOptions());
  }

  function overlayRoot() {
    return overlayRoots.overlayRoot(overlayRootOptions());
  }

  function activeTopLayerDialog() {
    return activeTopLayerDialogFromModule({
      documentRef,
      state,
      activeEditDialog,
      homeRoot,
      recordRuntimeErrorOnce,
    });
  }

  function activeSettingsPortalRoot() {
    const topLayerDialog = activeTopLayerDialog();
    if (topLayerDialog?.appendChild) return topLayerDialog;

    const dialog = activeEditDialog();
    if (dialog?.shadowRoot?.appendChild) return dialog.shadowRoot;
    if (dialog?.appendChild) return dialog;

    const editor = activeCodeboxStyleEditor();
    const editorRoot = editor?.getRootNode?.();
    if (editorRoot?.nodeType === NodeRef?.DOCUMENT_FRAGMENT_NODE && editorRoot?.host && editorRoot?.appendChild) return editorRoot;

    const haRoot = homeRoot();
    if (haRoot?.appendChild) return haRoot;

    return documentRef?.body || documentRef?.documentElement || integrationDocumentStyleRoot();
  }

  function ensureSettingsPortalHost() {
    const root = activeSettingsPortalRoot();
    if (!root?.appendChild) return documentRef?.body || documentRef?.documentElement;

    const rootIsTopLayerDialog = root?.localName === "dialog" && !!root.open;
    let host = null;
    try {
      host = root.querySelector?.("#nostrodomus-settings-portal-host-v1") || null;
    } catch (err) {
      recordRuntimeErrorOnce("settings:portal-host-query", err, { phase: "ensureSettingsPortalHost" });
      host = null;
    }

    if (!host) {
      host = documentRef.createElement("div");
      host.id = "nostrodomus-settings-portal-host-v1";
      host.dataset.nostrodomusPurpose = "settings-portal";
    }

    host.dataset.nostrodomusPortalRootKind = rootIsTopLayerDialog ? "top-layer-dialog" : "root-portal";
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("width", "100vw", "important");
    host.style.setProperty("height", "100vh", "important");
    host.style.setProperty("overflow", "visible", "important");
    host.style.setProperty("contain", "none", "important");
    host.style.setProperty("isolation", "isolate", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("pointer-events", "none", "important");

    try {
      root.appendChild(host);
    } catch (err) {
      recordRuntimeErrorOnce("settings:portal-host-append", err, { phase: "ensureSettingsPortalHost", rootKind: rootIsTopLayerDialog ? "top-layer-dialog" : "root-portal" });
      try {
        const fallback = documentRef?.body || documentRef?.documentElement;
        host.dataset.nostrodomusPortalRootKind = "document-fallback";
        fallback?.appendChild?.(host);
      } catch (fallbackErr) {
        recordRuntimeErrorOnce("settings:portal-host-fallback-append", fallbackErr, { phase: "ensureSettingsPortalHost" });
      }
    }

    if (state) {
      state.settingsPortalHost = host;
      state.settingsPortalRootKind = host.dataset.nostrodomusPortalRootKind || "unknown";
    }
    return host;
  }

  function settingsPortalRoot() {
    return ensureSettingsPortalHost();
  }

  return {
    activeSettingsPortalRoot,
    activeTopLayerDialog,
    ensureSettingsPortalHost,
    overlayRoot,
    overlayRootOptions,
    overlayRootTraversalScopedEnabled,
    recordOverlayRootTraversal,
    settingsPortalRoot,
    nostrodomusCodeEditorOverlayRoot,
    nostrodomusFindActiveCodeEditorRoot,
    nostrodomusWalkOpenRoots,
  };
}
