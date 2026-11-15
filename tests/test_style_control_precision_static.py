#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "app.js"
STYLE = ROOT / "src" / "ui" / "settingsStyle.js"
PANEL = ROOT / "src" / "ui" / "settingsPanelRuntime.js"
CODEBOX = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"
# The panel sections (with the "Ctrl+Space popup" title) and the slider commit.
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
texts = {p.name: p.read_text(encoding="utf-8", errors="replace") for p in (SRC, STYLE, PANEL, CODEBOX, PANEL_SHELL, CODEBOX_SETTLE, DIST)}
combined = "\n".join(texts.values())

require("frame_model" in json.dumps(project), "PROJECT.json documents integrated frame model policy")

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
    'function allowCodeboxFrameOverflow',
    ':host([data-nostrodomus-codebox-frame-host="1"])',
    '--nostrodomus-codebox-scrollbar-thumb:',
]:
    require(token in combined, f"style precision token present: {token}")

# The popup size controls are not in the General section.
panel = texts[PANEL_SHELL.name]
general_start = panel.find('sectionPanel("general"')
context_start = panel.find('sectionPanel("context"')
# Both boundaries must exist, so the General block is not an empty match.
require(general_start != -1 and context_start != -1, "General/Context section panels are present")
general_block = panel[general_start:context_start] if general_start != -1 and context_start != -1 else panel
require('settingsTitle("Ctrl+Space popup")' not in general_block and 's.popupSize' not in general_block, "popup sizing stays out of General")
# A slider commit goes through scheduleStyleRangeCommitReapply (default group
# "style-range-change"), which reapplies the styles in place without reopening the panel.
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
    "Style control precision static test report\n\n"
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
