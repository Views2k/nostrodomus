#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
# Accepting a suggestion with the mouse and changing a setting keep the page and the panel
# where they are: the scroll and interaction guards in src/ui/settingsInteractionRuntime.js, the
# popup click insert in src/completion/popupRuntime.js and the option buttons in
# src/ui/settings/settingsPanelShell.js. Each fact is also checked in dist.
SETTINGS_INTERACTION = ROOT / "src/ui/settingsInteractionRuntime.js"
POPUP = ROOT / "src/completion/popupRuntime.js"
SETTINGS_PANEL = ROOT / "src/ui/settings/settingsPanelShell.js"
TELEMETRY = ROOT / "src/diagnostics/diagnosticsRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/SCROLL_STABILITY_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

settings_interaction = SETTINGS_INTERACTION.read_text(encoding="utf-8", errors="replace")
popup = POPUP.read_text(encoding="utf-8", errors="replace")
settings_panel = SETTINGS_PANEL.read_text(encoding="utf-8", errors="replace")
telemetry = TELEMETRY.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")

# --- Source ---
require("function captureScrollSnapshot()" in settings_interaction, "source captures page/editor scroll state")
require("function preserveScrollDuring(fn)" in settings_interaction, "source has shared scroll-preservation wrapper")
# popupRuntime.js wraps the click insertion in the scroll guard.
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
require('qualityMetric("Score spread"' not in telemetry, "source has no abstract score-spread dashboard row")

# --- Dist (minified forms where esbuild rewrites them) ---
require("function captureScrollSnapshot()" in dist, "dist captures page/editor scroll state")
require("function preserveScrollDuring(fn)" in dist, "dist has shared scroll-preservation wrapper")
# dist removes the spaces and may rename insertItem with a suffix.
require("preserveScrollDuring?.(()=>insertItem" in dist, "dist protects popup suggestion click insertion from page jumps")
require("applySettingChangePreservingInteraction" in dist, "dist uses shared settings mutation guard for option changes")
require("restoreSettingsInteractionSnapshot" in dist, "dist restores settings interaction state after option changes")
# In dist the option-button loop has no braces, so its handler is taken as the text between the
# button[data-option-group] loop and the select[data-option-group] loop that follows it.
dist_btn = dist.find('querySelectorAll("button[data-option-group]")')
dist_select = dist.find('querySelectorAll("select[data-option-group]")')
require(dist_btn != -1, "dist has option-button handler")
if dist_btn != -1:
    body = dist[dist_btn:dist_select] if dist_select > dist_btn else dist[dist_btn:dist_btn + 4000]
    # closeSettings(false) minifies to closeSettings(!1); openSettings() is unchanged.
    require("closeSettings(!1)" not in body and "openSettings()" not in body, "dist option-button handler does not close/reopen settings")
    require('classList.toggle("active"' in body, "dist option buttons update active state in place")
require('qualityMetric("Score spread"' not in dist, "dist has no abstract score-spread dashboard row")

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
