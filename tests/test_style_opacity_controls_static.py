#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/app.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/STYLE_OPACITY_CONTROLS_STATIC_TEST_REPORT.txt"

# The Style opacity sliders show percentages, the host carries the scrollbar variables, and the
# frame border and glow are not drawn on the host.
STRING_MODULE = ROOT / "src/core/string.js"                     # percentLabel helper
SETTINGS_CONTROLS = ROOT / "src/ui/settings/settingsControls.js"  # styleRangeControl default formatter
SETTINGS_SHELL = ROOT / "src/ui/settings/settingsPanelShell.js"   # Scrollbar opacity control
CODEBOX_STYLE = ROOT / "src/ui/codeboxStyle.js"                   # host scrollbar variables / frame ownership
CODEBOX_UNCLIP = ROOT / "src/ui/codebox/codeboxUnclip.js"         # overflow guard helper

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

string_module = STRING_MODULE.read_text(encoding="utf-8", errors="replace")
settings_controls = SETTINGS_CONTROLS.read_text(encoding="utf-8", errors="replace")
settings_shell = SETTINGS_SHELL.read_text(encoding="utf-8", errors="replace")
codebox_style = CODEBOX_STYLE.read_text(encoding="utf-8", errors="replace")
codebox_unclip = CODEBOX_UNCLIP.read_text(encoding="utf-8", errors="replace")

for label, path in (("source", SRC), ("dist", DIST)):
    text = path.read_text(encoding="utf-8", errors="replace")
    if label == "source":
        # percentLabel (src/core/string.js) is styleRangeControl's default formatter.
        require("export function percentLabel(value)" in string_module, f"{label} defines the percentLabel helper used by Style opacity controls")
        require("percentLabel," in text, f"{label} imports the percentLabel helper")
        require("formatter = percentLabel" in settings_controls, f"{label} wires percentLabel as the Style range control formatter")
        require('styleRangeControl("Scrollbar opacity"' in settings_shell and 'percentLabel' in settings_shell, f"{label} opacity controls have a defined formatter")
        require(':host([data-nostrodomus-codebox-frame-host="1"])' in codebox_style and '--nostrodomus-codebox-scrollbar-thumb:' in codebox_style, f"{label} defines host scrollbar variables")
        require('border-color: var(--nostrodomus-codebox-frame-border) !important;\n        box-shadow:' not in codebox_style, f"{label} does not put frame border/glow box-shadow on host")
        require('function allowCodeboxFrameOverflow' in codebox_unclip, f"{label} has the overflow guard helper for editor wrappers")
    else:
        require('function percentLabel(value)' in text, f"{label} bundles percentLabel helper used by Style opacity controls")
        require('styleRangeControl("Scrollbar opacity"' in text and 'percentLabel' in text, f"{label} opacity controls have a defined formatter")
        require(':host([data-nostrodomus-codebox-frame-host="1"])' in text and '--nostrodomus-codebox-scrollbar-thumb:' in text, f"{label} defines host scrollbar variables")
        require('border-color: var(--nostrodomus-codebox-frame-border) !important;\n        box-shadow:' not in text, f"{label} does not put frame border/glow box-shadow on host")
        require('function allowCodeboxFrameOverflow' in text, f"{label} has the overflow guard helper for editor wrappers")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Style opacity controls static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("STYLE OPACITY CONTROLS STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("STYLE OPACITY CONTROLS STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
