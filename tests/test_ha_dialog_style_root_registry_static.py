#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

# The HA dialog style-root registry / Settings portal invariants were extracted out
# of the monolithic src/main.legacy.js into dedicated owner modules during the
# module decomposition. The facts below are re-pointed to their current source
# homes; dist/ still bundles every owner, so each fact is also confirmed in dist
# (matching the bundler's minified form where source spacing/identifiers differ).
SETTINGS_PORTAL = (ROOT / "src/ui/settingsPortalRuntime.js").read_text(encoding="utf-8")
SETTINGS_SHELL = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
ACTIVE_EDITOR = (ROOT / "src/editor/activeEditor.js").read_text(encoding="utf-8")
HA_SELECTORS = (ROOT / "src/editor/haSelectors.js").read_text(encoding="utf-8")
STYLE_DOM = (ROOT / "src/ui/styleDomRuntime.js").read_text(encoding="utf-8")
STYLE_ROOT = (ROOT / "src/ui/styleRootRuntime.js").read_text(encoding="utf-8")
CODEBOX_STYLE = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8")

# Union of every owner module that carries a fact this test pins. Asserting against
# this combined source text preserves the original "source half" of the contract.
src = "\n".join((
    SETTINGS_PORTAL,
    SETTINGS_SHELL,
    ACTIVE_EDITOR,
    HA_SELECTORS,
    STYLE_DOM,
    STYLE_ROOT,
    CODEBOX_STYLE,
))
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8")
project = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))


def either(text, *forms):
    return any(form in text for form in forms)


for label, text in (("source", src), ("dist", dist)):
    assert "function activeSettingsPortalRoot()" in text, f"{label} has HA-aware settings portal resolver"
    assert "function ensureSettingsPortalHost()" in text, f"{label} has dedicated settings portal host"
    # The active-modal discovery routine lives in src/editor/activeEditor.js
    # (export function activeTopLayerDialog) and the portal owner wraps it; both keep
    # the "function activeTopLayerDialog" identifier in source and in dist.
    assert "function activeTopLayerDialog" in text, f"{label} discovers the active native modal dialog"
    # The ":modal" literal was lifted into MODAL_PSEUDO (src/editor/haSelectors.js); the
    # open + modal top-layer preference is unchanged.
    assert either(
        text,
        'candidate.open && candidate.matches?.(MODAL_PSEUDO)',
        'candidate.open&&candidate.matches?.(MODAL_PSEUDO)',
    ), f"{label} prefers modal <dialog> top-layer subtree"
    assert "topLayerDialog?.appendChild" in text, f"{label} settings portal prefers active top-layer dialog before HA shadow fallback"

    assert either(
        text,
        'host.dataset.nostrodomusPortalRootKind = rootIsTopLayerDialog ? "top-layer-dialog" : "root-portal"',
        'nostrodomusPortalRootKind=rootIsTopLayerDialog?"top-layer-dialog":"root-portal"',
    ), f"{label} tags modal-dialog portal hosts"
    assert either(
        text,
        'portalKind !== "top-layer-dialog"',
        'portalKind!=="top-layer-dialog"',
    ), f"{label} avoids unnecessary popover promotion inside native modal dialog"
    assert either(
        text,
        'panel.addEventListener(type, ev => ev.stopPropagation())',
        'panel.addEventListener(type, (ev) => ev.stopPropagation())',
        'addEventListener(type,ev=>ev.stopPropagation())',
    ), f"{label} prevents settings pointer events from bubbling into HA editor dialog"
    assert "function openSettings()" in text, f"{label} defines the Settings open flow"
    assert either(
        text,
        'setAttribute("popover", "manual")',
        'setAttribute("popover","manual")',
    ) and "showPopover" in text, f"{label} attempts native manual popover promotion"
    assert "function styleContainerForRoot(root)" in text, f"{label} normalizes Document roots through styleContainerForRoot before style insertion"
    # styleContainerForRoot normalizes the Document root (documentRef) through
    # integrationDocumentStyleRoot() -> documentRef.head instead of appending <style>
    # straight onto the Document.
    assert either(
        text,
        'if (root === documentRef) return integrationDocumentStyleRoot()',
        'root===documentRef?integrationDocumentStyleRoot()',
    ), f"{label} avoids appending style tags directly to Document"
    assert "function discoverOpenStyleRoots" in text, f"{label} discovers open document/shadow style roots"
    assert "function ensureRootCodeboxStyle" in text and "nostrodomus-codebox-root-style-v1" in text, f"{label} installs managed codebox stylesheets per relevant root"
    assert "function attachStyleRootObserver(root)" in text, f"{label} observes discovered roots"
    assert "function scanStyleRoots" in text and "scheduleStyleRootScan" in text, f"{label} rescans open shadow roots with bounded scheduling"
    assert "rootStylesInstalled" in text and either(text, "editorBound: false", "editorBound:!1"), f"{label} permits stylesheet-only application before first editor click"

# The openSettings flow moved to src/ui/settings/settingsPanelShell.js. It must not
# reach for the completion overlay root. overlayRoot() is now entirely absent from the
# settings shell owner (the openSettings owner), so the original "Settings must not use
# completion overlay root" invariant holds at module scope (a stronger guarantee than
# the former in-monolith function slice).
assert "function openSettings()" in SETTINGS_SHELL, "openSettings flow lives in the settings panel shell owner"
assert "overlayRoot" not in SETTINGS_SHELL, "Settings shell (openSettings flow) must not use completion overlay root"

# Version was pinned to the pre-SemVer-reset 31.6.41 literal; un-pin to a dynamic
# floor (the style-root registry / settings portal owners shipped well before this).
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
assert version_tuple >= (0, 1, 17), "PROJECT.json remains at or beyond the style-root registry owner baseline"
assert ('"version": "' + version + '"') in (ROOT / "PROJECT.json").read_text(encoding="utf-8"), "PROJECT.json version literal is self-consistent"
assert "nostrodomus-v" in internal or version_tuple > (0, 1, 17), "internal_version records the nostrodomus runtime string (or version advanced beyond the registry baseline)"
print("HA DIALOG STYLE ROOT REGISTRY STATIC TEST OK")
