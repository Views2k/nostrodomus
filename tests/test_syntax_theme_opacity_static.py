#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
STYLE = ROOT / "src/ui/settingsStyle.js"
PANEL = ROOT / "src/ui/settingsPanelRuntime.js"
# Monolith split: the syntax-opacity invariant now lives across extracted owner
# modules — defaults in core/settings.js, the panel slider in
# settings/settingsPanelShell.js, the legacy hue/saturation custom path in
# settingsInteractionRuntime.js, and the syntax theme-opacity wiring in
# syntax/sourceClassLifecycle.js. They are folded into `combined` below so each
# assertion still checks the same real source-spaced fact at its current home.
SETTINGS_DEFAULTS = ROOT / "src/core/settings.js"
PANEL_SHELL = ROOT / "src/ui/settings/settingsPanelShell.js"
INTERACTION = ROOT / "src/ui/settingsInteractionRuntime.js"
SYNTAX_LIFECYCLE = ROOT / "src/syntax/sourceClassLifecycle.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/SYNTAX_THEME_OPACITY_STATIC_TEST_REPORT.txt"

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
combined = "\n".join(path.read_text(encoding="utf-8", errors="replace") for path in (SRC, STYLE, PANEL, SETTINGS_DEFAULTS, PANEL_SHELL, INTERACTION, SYNTAX_LIFECYCLE, DIST))

require(version.count(".") == 2, "PROJECT.json uses SemVer")
require(internal.startswith(f"nostrodomus-v{version}-"), "internal_version records current runtime identity")

for token in [
    "syntaxThemeOpacity: 1",
    "export function syntaxColorWithOpacity(color, opacity = 1)",
    "themeOpacity: clampNumber(settings.syntaxThemeOpacity",
    "styleRangeControl(\"Syntax theme opacity\", \"style.syntaxThemeOpacity\"",
    "Opacity and saturation apply to every palette",
    "themeOpacity: syntax.themeOpacity",
]:
    require(token in combined, f"runtime/style owner contains syntax opacity token: {token}")
require('group === "style.syntaxTintOpacity"' not in combined, "opacity slider does not force old custom syntax preset path")
require('style.syntaxThemeOpacity' in combined and "style.syntaxTintPreset = 'custom'" in combined, "keeps old custom path for legacy hue/saturation while adding theme opacity")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Syntax theme opacity static test\n\nResults:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SYNTAX THEME OPACITY STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("SYNTAX THEME OPACITY STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
