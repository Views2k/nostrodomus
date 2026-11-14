#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
# The monolith was decomposed into src modules, so the Settings modal-pointer /
# portal owner moved out of src/main.legacy.js into extracted modules. The invariant
# (Settings mounts inside the active native HA modal-dialog subtree, stops pointer
# bubbling into the HA dialog, closes on Escape, and stays separate from the completion
# overlay) is unchanged — only its location moved. Re-point each fact to its current
# home in source, and keep the same checks against the bundled (minified) dist.
active_editor = (ROOT / "src/editor/activeEditor.js").read_text(encoding="utf-8")
ha_selectors = (ROOT / "src/editor/haSelectors.js").read_text(encoding="utf-8")
portal_runtime = (ROOT / "src/ui/settingsPortalRuntime.js").read_text(encoding="utf-8")
panel_shell = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8")
project = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))

# --- Native top-layer modal dialog discovery owner: src/editor/activeEditor.js ---
# (delegated from settingsPortalRuntime.createSettingsPortalRuntime via the injected
# activeTopLayerDialogFromModule dependency).
assert "export function activeTopLayerDialog(options = {}) {" in active_editor, \
    "source must include native modal dialog discovery (now in src/editor/activeEditor.js)"
# The top-layer modal match is identified by candidate.open + candidate.matches(:modal).
# The literal ":modal" lives in the MODAL_PSEUDO selector constant (haSelectors.js), so
# the match site references that constant — same invariant, named constant form.
assert "candidate.open && candidate.matches?.(MODAL_PSEUDO)" in active_editor, \
    "source must identify top-layer modal dialogs (candidate.open + :modal match via MODAL_PSEUDO)"
assert 'export const MODAL_PSEUDO = ":modal";' in ha_selectors, \
    "MODAL_PSEUDO must remain the native top-layer :modal match"

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
# Settings stays separate from the completion overlay: the openSettings owner module
# never reaches for the completion overlay root.
assert "function openSettings()" in panel_shell, "source must own openSettings()"
assert "overlayRoot()" not in panel_shell, \
    "source Settings (openSettings owner) must stay separate from completion overlay"

# --- Bundled dist carries the same facts in minified form ---
assert "function activeTopLayerDialog(options=" in dist, \
    "dist must include native modal dialog discovery"
assert "candidate.open&&candidate.matches?.(MODAL_PSEUDO)" in dist, \
    "dist must identify top-layer modal dialogs"
assert 'MODAL_PSEUDO=":modal"' in dist, \
    "dist keeps the :modal selector constant"
# esbuild renames the inner closure helper (activeTopLayerDialog2) and emits `let`, so
# match the stable, rename-agnostic tail of the assignment + the appendChild guard.
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

# --- Version identity: un-pinned to a dynamic floor across the 31.6.x -> 0.1.x reset ---
# The Settings modal-pointer/portal invariant is the behavior above, not a frozen version
# literal. Floor at the start of the SemVer line and accept the original
# internal_version owner id ("editor-blur-preview-prepaint") OR any version past the floor.
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
assert version_tuple >= (0, 1, 0), "PROJECT.json remains at or beyond the SemVer baseline"
assert ("editor-blur-preview-prepaint" in internal or version_tuple > (0, 1, 0)), \
    "internal_version records the portal owner (or version advanced past the baseline)"

print("SETTINGS MODAL POINTER PORTAL STATIC TEST OK")
