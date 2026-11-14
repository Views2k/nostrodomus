#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "main.legacy.js"
STYLE = ROOT / "src" / "ui" / "settingsStyle.js"
PANEL = ROOT / "src" / "ui" / "settingsPanelRuntime.js"
CODEBOX = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"
# Settings UI was extracted out of the monolith into per-owner modules during the
# module split; the Style tab/section title now live in the panel shell owner and
# the codebox-text-size default lives in the settings defaults owner. Include them so
# their exact source-spaced forms remain checkable (the minified dist strips the spaces
# and renames settingsTitle -> settingsTitle2).
PANEL_SHELL = ROOT / "src" / "ui" / "settings" / "settingsPanelShell.js"
SETTINGS_DEFAULTS = ROOT / "src" / "core" / "settings.js"
DIST = ROOT / "dist" / "nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/STYLE_CUSTOMIZATION_FOUNDATION_STATIC_TEST_REPORT.txt"

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
texts = {p.name: p.read_text(encoding="utf-8", errors="replace") for p in (SRC, STYLE, PANEL, CODEBOX, PANEL_SHELL, SETTINGS_DEFAULTS, DIST)}
combined = "\n".join(texts.values())

require(re.fullmatch(r"\d+\.\d+\.\d+", version) is not None, "PROJECT.json uses strict SemVer")
require(internal.startswith(f"nostrodomus-v{version}-"), "PROJECT.json internal_version records current style scope")
require("style_customization_policy" in json.dumps(project), "PROJECT.json documents style customization policy")
require(internal in texts[DIST.name], "dist carries current runtime version")
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
    'function applyTextColorPreset',
    'data-nostrodomus-text-preset',
    'group.includes(".")',
    'group.startsWith("style.")',
    'scheduleCodeboxStyleReapply("style-option-change")',
    'openSettings();',
]:
    require(token in combined, f"style foundation token remains owned: {token}")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Style customization foundation static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("STYLE CUSTOMIZATION FOUNDATION STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("STYLE CUSTOMIZATION FOUNDATION STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
