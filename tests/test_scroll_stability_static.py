#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
# The monolith was decomposed into src modules, so the scroll-stability owners moved out of
# src/main.legacy.js: the shared scroll/interaction guards now live in the extracted
# src/ui/settingsInteractionRuntime.js, the popup click-insert wrapper in src/completion/popupRuntime.js,
# and the option-button handler in src/ui/settings/settingsPanelShell.js. The single bundled
# dist/nostrodomus.js still carries all of these (minified). Same invariants, current homes.
SETTINGS_INTERACTION = ROOT / "src/ui/settingsInteractionRuntime.js"
POPUP = ROOT / "src/completion/popupRuntime.js"
SETTINGS_PANEL = ROOT / "src/ui/settings/settingsPanelShell.js"
TELEMETRY = ROOT / "src/diagnostics/telemetryRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/SCROLL_STABILITY_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
version = project.get("version", "")

settings_interaction = SETTINGS_INTERACTION.read_text(encoding="utf-8", errors="replace")
popup = POPUP.read_text(encoding="utf-8", errors="replace")
settings_panel = SETTINGS_PANEL.read_text(encoding="utf-8", errors="replace")
telemetry = TELEMETRY.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")

# --- Source: each invariant verified at its current module location ---
require("function captureScrollSnapshot()" in settings_interaction, "source captures page/editor scroll state")
require("function preserveScrollDuring(fn)" in settings_interaction, "source has shared scroll-preservation wrapper")
# popupRuntime.js wraps the popup click insertion in the scroll-preservation guard; the current form
# is optional-chained (preserveScrollDuring?.(() => insertItem?.( ... ))), same page-jump protection.
require("preserveScrollDuring?.(() => insertItem?.(" in popup, "source protects popup suggestion click insertion from page jumps")
require("applySettingChangePreservingInteraction" in settings_interaction, "source defines shared settings mutation guard for option changes")
require("applySettingChangePreservingInteraction" in settings_panel, "source option handler uses shared settings mutation guard")
require("restoreSettingsInteractionSnapshot" in settings_interaction, "source restores settings interaction state after option changes")
handler_match = re.search(r'for \(const btn of panel\.querySelectorAll\("button\[data-option-group\]"\)\) \{(?P<body>.*?)\n    \}', settings_panel, re.S)
require(handler_match is not None, "source has option-button handler")
if handler_match:
    body = handler_match.group("body")
    require("closeSettings(false)" not in body and "openSettings()" not in body, "source option-button handler does not close/reopen settings")
    require("classList.toggle(\"active\"" in body, "source option buttons update active state in place")
require('qualityMetric("Score spread"' not in telemetry, "source removes abstract score-spread dashboard row")

# --- Dist: same invariants survive into the shipped bundle (minified forms where esbuild rewrites them) ---
require("function captureScrollSnapshot()" in dist, "dist captures page/editor scroll state")
require("function preserveScrollDuring(fn)" in dist, "dist has shared scroll-preservation wrapper")
# Minified: spaces stripped and insertItem renamed -> preserveScrollDuring?.(()=>insertItem...(
require("preserveScrollDuring?.(()=>insertItem" in dist, "dist protects popup suggestion click insertion from page jumps")
require("applySettingChangePreservingInteraction" in dist, "dist uses shared settings mutation guard for option changes")
require("restoreSettingsInteractionSnapshot" in dist, "dist restores settings interaction state after option changes")
# The option-button handler survives as a minified single-statement loop. Rather than fence the
# brace-stripped body with a fragile regex, scope the handler by its stable siblings: the slice from
# the button[data-option-group] loop to the immediately-following select[data-option-group] loop holds
# exactly the one button click handler (verified: a single addEventListener("click") in that window).
dist_btn = dist.find('querySelectorAll("button[data-option-group]")')
dist_select = dist.find('querySelectorAll("select[data-option-group]")')
require(dist_btn != -1, "dist has option-button handler")
if dist_btn != -1:
    body = dist[dist_btn:dist_select] if dist_select > dist_btn else dist[dist_btn:dist_btn + 4000]
    # closeSettings(false) minifies to closeSettings(!1); openSettings() is unchanged.
    require("closeSettings(!1)" not in body and "openSettings()" not in body, "dist option-button handler does not close/reopen settings")
    require('classList.toggle("active"' in body, "dist option buttons update active state in place")
require('qualityMetric("Score spread"' not in dist, "dist removes abstract score-spread dashboard row")

# internal_version is built from the current version dynamically (no pinned literal) -> stays version-agnostic.
require(project.get("internal_version", "").startswith(f"nostrodomus-v{project.get('version')}-"), "PROJECT.json internal_version matches current version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Scroll stability static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SCROLL STABILITY STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("SCROLL STABILITY STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
