#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Styles and the Settings portal reach Home Assistant's dialogs and shadow roots. Each fact is
# checked in the owner modules and in dist, in its minified form where spacing differs.
SETTINGS_PORTAL = (ROOT / "src/ui/settingsPortalRuntime.js").read_text(encoding="utf-8")
SETTINGS_SHELL = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
ACTIVE_EDITOR = (ROOT / "src/editor/activeEditor.js").read_text(encoding="utf-8")
HA_SELECTORS = (ROOT / "src/editor/haSelectors.js").read_text(encoding="utf-8")
STYLE_DOM = (ROOT / "src/ui/styleDomRuntime.js").read_text(encoding="utf-8")
STYLE_ROOT = (ROOT / "src/ui/styleRootRuntime.js").read_text(encoding="utf-8")
CODEBOX_STYLE = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8")
CODEBOX_FRAME = (ROOT / "src/ui/codeboxFrameRuntime.js").read_text(encoding="utf-8")
STATE = (ROOT / "src/core/state.js").read_text(encoding="utf-8")

src = "\n".join((
    SETTINGS_PORTAL,
    SETTINGS_SHELL,
    ACTIVE_EDITOR,
    HA_SELECTORS,
    STYLE_DOM,
    STYLE_ROOT,
    CODEBOX_STYLE,
    CODEBOX_FRAME,
    STATE,
))
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8")


def either(text, *forms):
    return any(form in text for form in forms)


for label, text in (("source", src), ("dist", dist)):
    assert "function activeSettingsPortalRoot()" in text, f"{label} has HA-aware settings portal resolver"
    assert "function ensureSettingsPortalHost()" in text, f"{label} has dedicated settings portal host"
    assert "function activeTopLayerDialog" in text, f"{label} discovers the active native modal dialog"
    # MODAL_PSEUDO (":modal") is defined in src/editor/haSelectors.js.
    assert either(
        text,
        'candidate.open && candidate.matches?.(MODAL_PSEUDO)',
        'candidate.open&&candidate.matches?.(MODAL_PSEUDO)',
    ), f"{label} prefers modal <dialog> top-layer subtree"
    assert either(text, 'MODAL_PSEUDO = ":modal"', 'MODAL_PSEUDO=":modal"'), f"{label} top-layer dialog preference resolves to the :modal pseudo"
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
    # styleContainerForRoot sends the Document root to integrationDocumentStyleRoot() (its head).
    assert either(
        text,
        'if (root === documentRef) return integrationDocumentStyleRoot()',
        'root===documentRef?integrationDocumentStyleRoot()',
    ), f"{label} avoids appending style tags directly to Document"
    assert "function discoverOpenStyleRoots" in text, f"{label} discovers open document/shadow style roots"
    assert "function ensureRootCodeboxStyle" in text and "nostrodomus-codebox-root-style-v1" in text, f"{label} installs managed codebox stylesheets per relevant root"
    assert "function attachStyleRootObserver(root)" in text, f"{label} observes discovered roots"
    assert either(text, "styleRootObservers: new Map()", "styleRootObservers:new Map") and "shadow-root-editor-discovered" in text, f"{label} observes discovered shadow roots"
    assert "function scanStyleRoots" in text and "scheduleStyleRootScan" in text, f"{label} rescans open shadow roots with bounded scheduling"
    assert "rootStylesInstalled" in text and either(text, "editorBound: false", "editorBound:!1"), f"{label} permits stylesheet-only application before first editor click"

# openSettings lives in the settings panel shell, which never uses the completion overlay root.
assert "function openSettings()" in SETTINGS_SHELL, "openSettings flow lives in the settings panel shell owner"
assert "overlayRoot" not in SETTINGS_SHELL, "Settings shell (openSettings flow) must not use completion overlay root"
assert "settingsPortalRoot" in SETTINGS_SHELL, "openSettings mounts through the HA dialog-aware Settings portal"
print("HA DIALOG STYLE ROOT REGISTRY STATIC TEST OK")
