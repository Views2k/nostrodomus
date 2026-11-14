#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
STYLE = ROOT / "src/ui/settingsStyle.js"
PANEL = ROOT / "src/ui/settingsPanelRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/SYNTAX_THEME_DROPDOWN_PALETTES_STATIC_TEST_REPORT.txt"

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
src_text = SRC.read_text(encoding="utf-8", errors="replace")
style_text = STYLE.read_text(encoding="utf-8", errors="replace")
panel_text = PANEL.read_text(encoding="utf-8", errors="replace")
dist_text = DIST.read_text(encoding="utf-8", errors="replace")

require(re.fullmatch(r"\d+\.\d+\.\d+", version) is not None, "PROJECT.json uses SemVer")
require(internal.startswith(f"nostrodomus-v{version}-"), "internal_version records current runtime identity")
require("PROJECT_VERSION," in src_text and "VERSION," in src_text, "source imports runtime identity from version module")
dist_project_version_ok = (f'PROJECT_VERSION = "{version}"' in dist_text or
                           f'PROJECT_VERSION="{version}"' in dist_text)
require(dist_project_version_ok and internal in dist_text, "dist carries current runtime identity")

for token in [
    "export const STYLE_SYNTAX_PRESETS = Object.freeze({",
    "export const DARKPLUS_SYNTAX_COLORS = Object.freeze({",
    "export function syntaxThemePalette(theme, saturationMultiplier = 1)",
    "export function ensureDistinctSyntaxPalette(palette, theme)",
    "export function resolveSyntaxTintSettings(settings = {}, defaultStyle = {})",
    "export function syntaxColorWithOpacity(color, opacity = 1)",
]:
    require(token in style_text, f"settingsStyle owns syntax theme token: {token}")

for token in [
    "function syntaxThemeSelect(current)",
    "nostrodomus-syntax-theme-dropdown",
    "nostrodomus-syntax-theme-option",
    "Each syntax role uses a distinct color inside every theme",
]:
    require(token in panel_text or token in src_text or token in dist_text, f"settings panel keeps syntax dropdown token: {token}")

for theme in [
    "vscodeDarkPlus", "crimson", "coral", "mocha", "amber", "goldenrod", "lime",
    "green", "emerald", "jade", "cyan", "azure", "indigo", "violet", "magenta",
    "orchid", "rose", "parchment",
]:
    require(theme in style_text and theme in dist_text, f"style owner and dist include syntax theme option: {theme}")

match = re.search(r"export const STYLE_SYNTAX_PRESETS = Object\.freeze\(\{(.*?)\n\}\);", style_text, re.S)
if match:
    count = len(re.findall(r"^\s{2}[A-Za-z0-9_]+:\s*\{", match.group(1), re.M))
    require(count >= 16, f"STYLE_SYNTAX_PRESETS contains at least 16 themes, found {count}")
else:
    require(False, "STYLE_SYNTAX_PRESETS block found in settingsStyle owner module")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Syntax theme dropdown palettes static test\n\nResults:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SYNTAX THEME DROPDOWN PALETTES STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("SYNTAX THEME DROPDOWN PALETTES STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
