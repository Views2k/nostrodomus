#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "main.legacy.js"
STYLE = ROOT / "src" / "ui" / "settingsStyle.js"
PANEL = ROOT / "src" / "ui" / "settingsPanelRuntime.js"
CODEBOX = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"
# Settings panel rendering + slider commit wiring extracted out of
# settingsPanelRuntime.js into these owner modules (the "Ctrl+Space popup"
# section title and the style-range apply-in-place commit now live here).
PANEL_SHELL = ROOT / "src" / "ui" / "settings" / "settingsPanelShell.js"
CODEBOX_SETTLE = ROOT / "src" / "ui" / "codebox" / "codeboxStyleSettle.js"
DIST = ROOT / "dist" / "nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/STYLE_CONTROL_PRECISION_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
version = str(project.get("version"))
internal = str(project.get("internal_version"))
texts = {p.name: p.read_text(encoding="utf-8", errors="replace") for p in (SRC, STYLE, PANEL, CODEBOX, PANEL_SHELL, CODEBOX_SETTLE, DIST)}
combined = "\n".join(texts.values())

require(re.fullmatch(r"\d+\.\d+\.\d+", version) is not None, "PROJECT.json uses strict SemVer")
require(internal.startswith(f"nostrodomus-v{version}-"), "PROJECT.json internal_version records current style scope")
require("frame_model" in json.dumps(project), "PROJECT.json documents integrated frame model policy")
require(internal in texts[DIST.name], "dist carries current runtime version")

for token in [
    'STYLE_HUE_DEFAULTS',
    'scrollbarHue',
    'codeboxBorderHue',
    'codeboxGlowHue',
    'codeboxSurfaceHue',
    'scrollbarStyleEnabled',
    'codeboxFrameEnabled',
    'codeboxSurfaceEnabled',
    'syntaxTintEnabled',
    'scrollbarOpacity',
    'codeboxBorderOpacity',
    'codeboxGlowOpacity',
    'codeboxSurfaceOpacity',
    'scrollbarSaturation',
    'codeboxBorderSaturation',
    'codeboxGlowSaturation',
    'codeboxSurfaceSaturation',
    'syntaxTintSaturation',
    'function styleColorBarControl',
    'nostrodomus-color-bar',
    'function styleToggle',
    'data-style-toggle',
    'function styleRangeControl',
    'data-style-range',
    'settingsTitle("Ctrl+Space popup")',
    'syntaxTintEnabled',
    'hue-rotate(${Math.round',
    '0 20px 64px rgba(0,0,0,.32)',
    'function allowCodeboxFrameOverflow',
    ':host([data-nostrodomus-codebox-frame-host="1"])',
    '--nostrodomus-codebox-scrollbar-thumb:',
]:
    require(token in combined, f"style precision token remains owned: {token}")

# sectionPanel("general"/"context") rendering moved from settingsPanelRuntime.js
# into settingsPanelShell.js; the popup section title is now "Ctrl+Space popup".
panel = texts[PANEL_SHELL.name]
general_start = panel.find('sectionPanel("general"')
context_start = panel.find('sectionPanel("context"')
# Boundaries MUST exist so the General block is real (never a vacuous empty match).
require(general_start != -1 and context_start != -1, "General/Context section panels remain present")
general_block = panel[general_start:context_start] if general_start != -1 and context_start != -1 else panel
require('settingsTitle("Ctrl+Space popup")' not in general_block and 's.popupSize' not in general_block, "popup sizing stays out of General")
# Slider commit now flows through scheduleStyleRangeCommitReapply (default group
# "style-range-change"), which reapplies styling in place via
# scheduleCodeboxStyleReapply/applyCodeboxStyleSettings — no panel close/reopen.
shell = texts[PANEL_SHELL.name]
settle = texts[CODEBOX_SETTLE.name]
slider_commits_in_place = (
    'scheduleStyleRangeCommitReapply(group)' in shell
    and '"style-range-change"' in settle
    and ('scheduleCodeboxStyleReapply(' in settle or 'applyCodeboxStyleSettings(' in settle)
)
require(slider_commits_in_place, "slider changes apply in place")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Style color bars + frame fix static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("STYLE CONTROL PRECISION STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("STYLE CONTROL PRECISION STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
