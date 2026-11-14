#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
STYLE = ROOT / "src/ui/settingsStyle.js"
PANEL = ROOT / "src/ui/settingsPanelRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
REPORT = ROOT / "reports/SYNTAX_DROPDOWN_STYLE_SATURATION_STATIC_TEST_REPORT.txt"
errors=[]
notes=[]

def require(ok,msg):
    (notes if ok else errors).append(("PASS " if ok else "") + msg)

version = str(PROJECT.get("version", ""))
internal = str(PROJECT.get("internal_version", ""))
src = SRC.read_text(encoding="utf-8", errors="replace")
style = STYLE.read_text(encoding="utf-8", errors="replace")
panel = PANEL.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")
combined = "\n".join([src, style, panel, dist])

require(version.count(".") == 2, "PROJECT.json uses SemVer")
require(internal.startswith(f"nostrodomus-v{version}-"), "internal_version records current runtime identity")
for token in [
    "nostrodomus-syntax-theme-dropdown",
    "nostrodomus-syntax-theme-options",
    "nostrodomus-syntax-theme-option",
    "style.syntaxThemeSaturation",
    "Syntax theme saturation",
    "syntaxColorWithSaturation",
    "export function syntaxThemePalette(theme, saturationMultiplier = 1)",
]:
    require(token in combined, f"runtime/style owner contains token: {token}")
require("Custom syntax color" not in combined, "does not restore custom syntax color bar")
REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text("Syntax dropdown saturation static test\n\nResults:\n" + "\n".join(notes) + "\n\nErrors:\n" + "\n".join(errors) + "\n", encoding="utf-8")
if errors:
    print("SYNTAX DROPDOWN STYLE SATURATION STATIC TEST FAILED")
    for e in errors: print("-", e)
    print("Report:", REPORT)
    raise SystemExit(1)
print("SYNTAX DROPDOWN STYLE SATURATION STATIC TEST OK")
print("Report:", REPORT)
