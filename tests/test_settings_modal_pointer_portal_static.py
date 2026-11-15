#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Settings mounts inside the active native HA modal dialog, stops pointer events from reaching
# the HA dialog, closes on Escape and stays separate from the completion overlay. Each fact is
# checked in source and in dist.
active_editor = (ROOT / "src/editor/activeEditor.js").read_text(encoding="utf-8")
ha_selectors = (ROOT / "src/editor/haSelectors.js").read_text(encoding="utf-8")
portal_runtime = (ROOT / "src/ui/settingsPortalRuntime.js").read_text(encoding="utf-8")
panel_shell = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8")

# --- Native modal dialog discovery: src/editor/activeEditor.js ---
assert "export function activeTopLayerDialog(options = {}) {" in active_editor, \
    "source must include native modal dialog discovery (src/editor/activeEditor.js)"
# MODAL_PSEUDO (":modal") is defined in haSelectors.js.
assert "candidate.open && candidate.matches?.(MODAL_PSEUDO)" in active_editor, \
    "source must identify top-layer modal dialogs (candidate.open + :modal match via MODAL_PSEUDO)"
assert 'export const MODAL_PSEUDO = ":modal";' in ha_selectors, \
    "MODAL_PSEUDO must be the native top-layer :modal match"

# --- Settings portal root owner: src/ui/settingsPortalRuntime.js ---
assert "const topLayerDialog = activeTopLayerDialog();" in portal_runtime, \
    "source activeSettingsPortalRoot must ask for modal dialog first"
assert "if (topLayerDialog?.appendChild) return topLayerDialog;" in portal_runtime, \
    "source Settings must mount inside top-layer dialog subtree"
assert 'host.dataset.nostrodomusPortalRootKind = rootIsTopLayerDialog ? "top-layer-dialog" : "root-portal";' in portal_runtime, \
    "source portal host must mark top-layer dialog mode"

# --- Settings panel shell owner: src/ui/settings/settingsPanelShell.js ---
assert 'portalKind !== "top-layer-dialog"' in panel_shell, \
    "source must not use showPopover as the primary path inside modal dialog"
assert ('panel.addEventListener(type, ev => ev.stopPropagation())' in panel_shell or
        'panel.addEventListener(type, (ev) => ev.stopPropagation())' in panel_shell), \
    "source must stop pointer bubbling into HA dialog"
assert 'if (ev.key === "Escape")' in panel_shell and 'closeSettings(false)' in panel_shell, \
    "source Settings Escape should close Nostrodomus settings before HA editor dialog"
# The module that owns openSettings never uses the completion overlay root.
assert "function openSettings()" in panel_shell, "source must own openSettings()"
assert "overlayRoot()" not in panel_shell, \
    "source Settings (openSettings owner) must stay separate from completion overlay"

# --- dist, minified ---
assert "function activeTopLayerDialog(options=" in dist, \
    "dist must include native modal dialog discovery"
assert "candidate.open&&candidate.matches?.(MODAL_PSEUDO)" in dist, \
    "dist must identify top-layer modal dialogs"
assert 'MODAL_PSEUDO=":modal"' in dist, \
    "dist keeps the :modal selector constant"
# esbuild renames the inner helper (activeTopLayerDialog2), so only the guard is matched.
assert "topLayerDialog?.appendChild)return topLayerDialog" in dist, \
    "dist activeSettingsPortalRoot mounts inside top-layer dialog subtree"
assert 'nostrodomusPortalRootKind=rootIsTopLayerDialog?"top-layer-dialog":"root-portal"' in dist, \
    "dist portal host must mark top-layer dialog mode"
assert 'portalKind!=="top-layer-dialog"' in dist, \
    "dist must not use showPopover as the primary path inside modal dialog"
assert "panel.addEventListener(type,ev=>ev.stopPropagation())" in dist, \
    "dist must stop pointer bubbling into HA dialog"
# Minified: `false` -> `!1`.
assert 'ev.key==="Escape"' in dist and "closeSettings(!1)" in dist, \
    "dist Settings Escape should close Nostrodomus settings before HA editor dialog"

print("SETTINGS MODAL POINTER PORTAL STATIC TEST OK")
