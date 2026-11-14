#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
# The monolith was decomposed: the provider-toggle scroll-preservation owners moved out of
# src/main.legacy.js into extracted modules. Same invariants, current locations:
#   - capture/restore + preserve-during interaction  -> src/ui/settingsInteractionRuntime.js
#   - the provider-change handler (in-place card update, no close/reopen) -> src/ui/settings/settingsPanelShell.js
#   - providerStatusText / updateProviderControlCard / data-provider-card markers -> src/diagnostics/telemetryRuntime.js
# Concatenate those owners into one "source" blob so each fact is checked against real current source.
SRC_PARTS = [
    "src/ui/settingsInteractionRuntime.js",
    "src/ui/settings/settingsPanelShell.js",
    "src/diagnostics/telemetryRuntime.js",
]
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/PROVIDER_TOGGLE_SCROLL_PRESERVE_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

src = "\n".join((ROOT / rel).read_text(encoding="utf-8", errors="replace") for rel in SRC_PARTS)
dist = DIST.read_text(encoding="utf-8", errors="replace")
project = json.loads(PROJECT.read_text(encoding="utf-8"))

for text_name, text in (("source", src), ("dist", dist)):
    require("captureSettingsInteractionSnapshot" in text, f"{text_name} captures settings interaction state before provider toggle")
    require("restoreSettingsInteractionSnapshot" in text, f"{text_name} restores settings interaction state after provider toggle")
    # Source keeps the spaced "(panel, providerId);" form; the minified dist collapses it to "(panel,providerId)".
    require("updateProviderControlCard(panel, providerId);" in text or "updateProviderControlCard(panel,providerId)" in text, f"{text_name} updates provider card in place")
    require("function providerStatusText(provider)" in text, f"{text_name} centralizes provider status text")
    require("data-provider-card" in text or "providerCard" in text, f"{text_name} marks provider cards for in-place updates")
    handler_start = text.find('for (const input of panel.querySelectorAll("input[data-provider]"))')
    handler_end = text.find('for (const btn of panel.querySelectorAll("button[data-option-group]"))', handler_start)
    handler = text[handler_start:handler_end] if handler_start != -1 and handler_end != -1 else ""
    require("closeSettings(false)" not in handler, f"{text_name} provider toggles do not close settings")
    require("openSettings()" not in handler, f"{text_name} provider toggles do not reopen settings")

require(project.get("internal_version", "").startswith(f"nostrodomus-v{project.get('version')}-"), "PROJECT.json internal_version matches current version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Provider toggle scroll preservation static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PROVIDER TOGGLE SCROLL PRESERVE STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("PROVIDER TOGGLE SCROLL PRESERVE STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
