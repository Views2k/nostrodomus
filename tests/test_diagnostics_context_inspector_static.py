#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "app.js"
DIST = ROOT / "dist" / "nostrodomus.js"
TELEMETRY_RUNTIME = ROOT / "src" / "diagnostics" / "diagnosticsRuntime.js"
SETTINGS_PANEL_RUNTIME = ROOT / "src" / "ui" / "settingsPanelRuntime.js"
SETTINGS_MODULES_DIR = ROOT / "src" / "ui" / "settings"

src = SRC.read_text(encoding="utf-8")
telemetry_runtime = TELEMETRY_RUNTIME.read_text(encoding="utf-8") if TELEMETRY_RUNTIME.exists() else ""
settings_panel_runtime = SETTINGS_PANEL_RUNTIME.read_text(encoding="utf-8") if SETTINGS_PANEL_RUNTIME.exists() else ""
# The settings panel runtime composes the modules in src/ui/settings/; the checks read all of them.
settings_modules = "\n".join(
    path.read_text(encoding="utf-8") for path in sorted(SETTINGS_MODULES_DIR.glob("*.js"))
) if SETTINGS_MODULES_DIR.exists() else ""
source_owner = src + "\n" + telemetry_runtime + "\n" + settings_panel_runtime + "\n" + settings_modules
dist = DIST.read_text(encoding="utf-8")

required_tokens = [
    "function contextRouteLabel(",
    "function contextInspectorPayload(",
    "function contextInspectorCard(",
    "function contextInspectorMarkup(",
    "function refreshContextInspectorPanel(",
    "Context Inspector",
    "Provider route",
    "Suggestion gate",
    "data-context-copy-inspector",
    "contextInspector: contextInspectorPayload",
    "nostrodomus-diagnostic-card[data-context-inspector=",
]

for token in required_tokens:
    assert token in source_owner, f"missing context inspector source owner token: {token}"
    compact = token.replace(': ', ':').replace(', ', ',')
    assert token in dist or compact in dist, f"missing context inspector dist token: {token}"

assert "data-diag-copy-inspector" not in source_owner, "Context Inspector copy action must not be a Diagnostics action"
assert "fetch(" not in source_owner, "context inspector must stay local-only and must not fetch diagnostic data"
assert ".innerHTML" not in source_owner, "context inspector must not use innerHTML rendering"

print("DIAGNOSTICS CONTEXT INSPECTOR STATIC TEST OK")
