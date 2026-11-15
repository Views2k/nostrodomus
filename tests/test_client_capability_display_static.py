#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/app.js"
DIST = ROOT / "dist/nostrodomus.js"
MODULE = ROOT / "src/core/string.js"
CLIENT_RUNTIME = ROOT / "src/diagnostics/clientCapabilitiesRuntime.js"
TELEMETRY_RUNTIME = ROOT / "src/diagnostics/diagnosticsRuntime.js"
SETTINGS_PANEL_RUNTIME = ROOT / "src/ui/settingsPanelRuntime.js"
# Holds overflow-wrap:anywhere for diagnostic values, so long GPU and browser strings wrap.
SETTINGS_STYLESHEET = ROOT / "src/ui/settings/settingsStylesheet.js"
REPORT = ROOT / "reports/CLIENT_CAPABILITY_DISPLAY_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

required_tokens = [
    "function browserInfoSnapshot()",
    "displayRenderer",
    "Client CPU",
    "diagnosticValue(\"RAM\"",
    "Client GPU",
    "Browser",
    "Browser window",
    # The privacy note: GPU details are coarse signals the browser exposes.
    "browser-exposed WebGL/WebGPU signals",
    "overflow-wrap:anywhere",
]

# app.js imports the five display label functions from src/core/string.js and
# defines none of them itself.
source_display_tokens = [
    "  compactGpuRendererLabel,",
    "  displayBrowserLabel,",
    "  displayMemoryLabel,",
    "  displayViewportLabel,",
    "  displayMonitorLabel,",
    "} from './core/string.js';",
]

# The signatures as esbuild writes them in dist (no spaces around '=' or after commas).
# app.js must not contain them.
dist_display_tokens = [
    "function compactGpuRendererLabel(value)",
    "function displayBrowserLabel(browser={})",
    "function displayMemoryLabel(deviceMemoryGB)",
    "function displayViewportLabel(viewport={})",
    "function displayMonitorLabel(viewport={},screenInfo={})",
]

module_display_tokens = [
    "export function compactGpuRendererLabel(value)",
    "export function displayBrowserLabel(browser = {})",
    "export function displayMemoryLabel(deviceMemoryGB)",
    "export function displayViewportLabel(viewport = {})",
    "export function displayMonitorLabel(viewport = {}, screenInfo = {})",
    "frontend JavaScript cannot reliably",
]

module_text = MODULE.read_text(encoding="utf-8", errors="replace")
client_runtime_text = CLIENT_RUNTIME.read_text(encoding="utf-8", errors="replace")
telemetry_runtime_text = TELEMETRY_RUNTIME.read_text(encoding="utf-8", errors="replace")
settings_panel_runtime_text = SETTINGS_PANEL_RUNTIME.read_text(encoding="utf-8", errors="replace")
settings_stylesheet_text = SETTINGS_STYLESHEET.read_text(encoding="utf-8", errors="replace")
source_owner_text = module_text + "\n" + client_runtime_text + "\n" + telemetry_runtime_text + "\n" + settings_panel_runtime_text + "\n" + settings_stylesheet_text
for token in module_display_tokens:
    require(token in module_text, f"src/core/string.js owns display label token: {token}")

for path, label in [(SRC, "src"), (DIST, "dist")]:
    text = path.read_text(encoding="utf-8", errors="replace")
    owner_text = text if label == "dist" else text + "\n" + source_owner_text
    for token in required_tokens:
        require(token in owner_text, f"{label} owner contains {token}")
    if label == "src":
        for token in source_display_tokens:
            require(token in text, f"{label} wires client display labels through core string module token: {token}")
        for token in dist_display_tokens:
            require(token not in text, f"{label} has no local {token} declaration")
    else:
        for token in dist_display_tokens:
            require(token in text, f"{label} contains bundled display label function token: {token}")
        require("displayPrivacyNote" in text, f"{label} retains display privacy note in runtime diagnostics")
    require("GB bucket" not in text, f"{label} does not label RAM as a bucket in the UI")
    require("Client CPU/RAM" not in text, f"{label} splits CPU and RAM into separate readable diagnostic rows")
    require("diagnosticValue(\"Display\"" not in text, f"{label} does not label browser viewport as physical Display")
    require("diagnosticValue(\"Browser window\"" in owner_text, f"{label} owner labels browser-visible size as Browser window")
    require("return `RAM: ${memory}GB${suffix}`;" in text or "return `RAM: ${memory}GB${suffix}`;" in module_text, f"{label} keeps RAM UI compact without long browser-estimate suffix")
    require("Direct3D|D3D|Vulkan|OpenGL|Metal" in text or "Direct3D|D3D|Vulkan|OpenGL|Metal" in module_text, f"{label} compact GPU renderer strips backend suffixes")
    require("sendBeacon" not in text and "fetch(" not in text, f"{label} remains local-only/no network reporting")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Client capability display static test\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("CLIENT CAPABILITY DISPLAY STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("CLIENT CAPABILITY DISPLAY STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
