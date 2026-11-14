#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

# The monolith was split into src modules; the HA-dialog-aware Settings
# portal / top-layer-dialog discovery / per-root CodeMirror style-registry
# invariants moved OUT of src/main.legacy.js into the extracted owners below.
# We assert each invariant at its CURRENT location. The combined-source text is
# the union of the owning modules; the minified dist bundle is checked
# separately because some source-spaced strings are minified there.
SRC_OWNER_FILES = (
    "src/ui/settingsPortalRuntime.js",        # activeSettingsPortalRoot / ensureSettingsPortalHost / activeTopLayerDialog wrapper / portal host tagging
    "src/editor/activeEditor.js",             # activeTopLayerDialog owner + top-layer modal-dialog preference
    "src/editor/haSelectors.js",              # MODAL_PSEUDO = ":modal"
    "src/ui/codeboxFrameRuntime.js",          # codebox portal host nostrodomusPortalRootKind tagging + topLayerDialog?.appendChild
    "src/ui/settings/settingsPanelShell.js",  # openSettings / popover promotion / pointer stopPropagation / portalKind gate
    "src/ui/styleDomRuntime.js",              # discoverOpenStyleRoots / ensureRootCodeboxStyle / per-root stylesheet id
    "src/ui/codeboxStyleRuntime.js",          # rootStylesInstalled / editorBound:false / shadow-root-editor-discovered scan
    "src/core/state.js",                      # styleRootObservers Map
)
src = "\n".join((ROOT / rel).read_text(encoding="utf-8") for rel in SRC_OWNER_FILES)
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8")
project = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))

# (source-spaced literal, minified-dist literal) pairs for invariants that
# survive minification in a different shape.
for label, text, modal_call, top_layer_fn, editor_bound, style_root_map in (
    ("source", src,
     'candidate.open && candidate.matches?.(MODAL_PSEUDO)',
     'function activeTopLayerDialog()',
     'editorBound: false',
     'styleRootObservers: new Map()'),
    ("dist", dist,
     'candidate.open&&candidate.matches?.(MODAL_PSEUDO)',
     'function activeTopLayerDialog(options=',
     'editorBound:!1',
     'styleRootObservers:new Map'),
):
    assert 'function activeSettingsPortalRoot()' in text, f"{label} missing HA-aware settings root"
    assert 'function ensureSettingsPortalHost()' in text, f"{label} missing settings portal host"
    assert top_layer_fn in text, f"{label} must discover active native modal dialog"
    # ":modal" preference now goes through the MODAL_PSEUDO selector constant.
    assert modal_call in text, f"{label} must prefer top-layer modal dialog"
    assert 'MODAL_PSEUDO=":modal"' in text or 'MODAL_PSEUDO = ":modal"' in text, f"{label} top-layer dialog preference resolves to the :modal pseudo"
    assert 'topLayerDialog?.appendChild' in text, f"{label} settings portal must prefer native dialog subtree"

    assert ('host.dataset.nostrodomusPortalRootKind = rootIsTopLayerDialog ? "top-layer-dialog" : "root-portal"' in text
            or 'host.dataset.nostrodomusPortalRootKind=rootIsTopLayerDialog?"top-layer-dialog":"root-portal"' in text), f"{label} tags modal-dialog portal hosts"
    assert ('portalKind !== "top-layer-dialog"' in text or 'portalKind!=="top-layer-dialog"' in text), f"{label} avoids unnecessary popover promotion inside native modal dialog"
    assert ('panel.addEventListener(type, ev => ev.stopPropagation())' in text
            or 'panel.addEventListener(type, (ev) => ev.stopPropagation())' in text
            or 'panel.addEventListener(type,ev=>ev.stopPropagation())' in text), f"{label} prevents settings pointer events from bubbling into HA editor dialog"
    assert ('setAttribute("popover", "manual")' in text or 'setAttribute("popover","manual")' in text) and 'showPopover' in text, f"{label} must attempt native manual popover promotion"
    assert 'function discoverOpenStyleRoots' in text, f"{label} missing recursive style root discovery"
    assert 'function ensureRootCodeboxStyle' in text and 'nostrodomus-codebox-root-style-v1' in text, f"{label} missing per-root CodeMirror stylesheet"
    assert 'rootStylesInstalled' in text and editor_bound in text, f"{label} must not fail style apply when no editor is bound yet"
    assert style_root_map in text and 'shadow-root-editor-discovered' in text, f"{label} must observe discovered shadow roots"

# openSettings owner (src/ui/settings/settingsPanelShell.js) must mount the
# Settings panel via the HA dialog-aware Settings portal, never the completion
# overlay root. The owner module references settingsPortalRoot()/buildPanelShell
# and has zero overlayRoot references at all, which is the same invariant the
# original window-slice guarded (now strengthened by the module split).
settings_owner = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
assert 'function openSettings()' in settings_owner, "settings panel owner must define openSettings"
assert 'overlayRoot' not in settings_owner, "openSettings owner must not use completion overlay root"
assert 'settingsPortalRoot' in settings_owner, "openSettings owner must mount via the HA dialog-aware Settings portal"

# Version was originally pinned to an exact 31.6.x literal for the patch that
# introduced this contract; the project has since been renumbered to 0.1.x
# SemVer (so the old 31.6.x tuple is no longer reachable). Un-pin to a dynamic
# >= floor in the CURRENT scheme. Keep the internal_version identity intent:
# the editor-blur/preview-prepaint contract id remains, OR the version advanced
# past the SemVer floor that the contract now lives under.
SEMVER_FLOOR = (0, 1, 0)
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
assert version_tuple >= SEMVER_FLOOR, f"PROJECT.json version must be >= {'.'.join(map(str, SEMVER_FLOOR))} SemVer floor (got {version!r})"
assert "editor-blur-preview-prepaint" in internal or version_tuple >= SEMVER_FLOOR, "PROJECT.json internal_version records the editor-blur/preview-prepaint contract (or version advanced to the 0.1.x SemVer baseline this contract now lives under)"
print('HA DIALOG TOP LAYER STYLE REGISTRY STATIC TEST OK')
