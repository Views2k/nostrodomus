#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8")
TELEMETRY_RUNTIME = (ROOT / "src" / "diagnostics" / "telemetryRuntime.js").read_text(encoding="utf-8")
SETTINGS_PANEL_RUNTIME = (ROOT / "src" / "ui" / "settingsPanelRuntime.js").read_text(encoding="utf-8")
# The settings panel runtime is a composer over src/ui/settings/ modules;
# the owner surface is the composer plus its modules.
SETTINGS_MODULES = "\n".join(
    path.read_text(encoding="utf-8") for path in sorted((ROOT / "src" / "ui" / "settings").glob("*.js"))
)
SOURCE_OWNER = SRC + "\n" + TELEMETRY_RUNTIME + "\n" + SETTINGS_PANEL_RUNTIME + "\n" + SETTINGS_MODULES
DIST = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8")

def canonical(value):
    return re.sub(r"\s+", "", value)

def require(text, token):
    compact = token.replace(', ', ',').replace(': ', ':').replace(' = ', '=')
    assert token in text or compact in text or canonical(token) in canonical(text), f"missing token: {token}"

def reject(text, token):
    assert token not in text, f"forbidden token: {token}"

for name, text in {"source owner": SOURCE_OWNER, "dist": DIST}.items():
    require(text, 'tabButton("Context", "context")')
    require(text, 'sectionPanel("context", activeTab, [')
    require(text, 'function contextInspectorMarkup()')
    require(text, 'function refreshContextInspectorPanel(')
    require(text, 'function updateContextInspectorPanel()')
    require(text, 'refreshContextInspectorPanel("context-inspector-live")')
    require(text, 'setInterval(')
    require(text, 'dataset: { contextCopyInspector: "" }')
    require(text, 'data-context-inspector-live')
    require(text, '"Context Inspector"')

    reject(text, 'dataset: { diagCopyInspector: "" }')
    reject(text, 'const contextInspector = contextInspectorCard(state.context);')

    if name == "dist":
        if 'function diagnosticsMarkup()' in text and 'function debug()' in text:
            diagnostics_start = text.index('function diagnosticsMarkup()')
            debug_start = text.index('function debug()')
            diagnostics_body = text[diagnostics_start:debug_start]
            assert 'contextInspectorCard(state.context)' not in diagnostics_body, f"{name}: Context Inspector must not be rendered by Diagnostics"
            assert 'Copy inspector' not in diagnostics_body, f"{name}: Copy inspector must live in Context tab, not Diagnostics"

print("CONTEXT INSPECTOR LIVE TAB STATIC TEST OK")
