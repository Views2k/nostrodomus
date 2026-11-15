#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "app.js"
STYLE = ROOT / "src" / "ui" / "settingsStyle.js"
PANEL = ROOT / "src" / "ui" / "settingsPanelRuntime.js"
CODEBOX = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"
# The Style tab and section title, and the codebox text size default.
PANEL_SHELL = ROOT / "src" / "ui" / "settings" / "settingsPanelShell.js"
SETTINGS_DEFAULTS = ROOT / "src" / "core" / "settings.js"
DIST = ROOT / "dist" / "nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/STYLE_TAB_SETTINGS_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
texts = {p.name: p.read_text(encoding="utf-8", errors="replace") for p in (SRC, STYLE, PANEL, CODEBOX, PANEL_SHELL, SETTINGS_DEFAULTS, DIST)}
combined = "\n".join(texts.values())

require("style_customization_policy" in json.dumps(project), "PROJECT.json documents style customization policy")
require("VERSION," in texts[SRC.name] and "PROJECT_VERSION," in texts[SRC.name], "source imports runtime identity")

for token in [
    'tabButton("Style", "style")',
    'sectionPanel("style"',
    'settingsTitle("Style")',
    'nostrodomus-style-roadmap-card',
    'STYLE_TEXT_SIZE_PRESETS',
    'STYLE_HUE_DEFAULTS',
    'scrollbarHue',
    'codeboxGlowHue',
    'codeboxSurfaceHue',
    'syntaxTintHue',
    'style: {',
    'codeTextSize: "normal"',
    'function applyCodeboxStyleSettings',
    'applyTextColorPreset(editor, settings);',
    'data-nostrodomus-text-preset',
    'group.includes(".")',
    'group.startsWith("style.")',
    'scheduleCodeboxStyleReapply("style-option-change")',
    'openSettings();',
]:
    require(token in combined, f"Style tab token present: {token}")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Style tab settings static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("STYLE TAB SETTINGS STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("STYLE TAB SETTINGS STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
