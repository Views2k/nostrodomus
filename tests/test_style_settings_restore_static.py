#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/STYLE_SETTINGS_RESTORE_STATIC_TEST_REPORT.txt"

# The pre-decomposition monolith was split into modules; the
# style/settings-restore invariants this test pins moved out of
# src/main.legacy.js into their extracted owner modules (still bundled whole
# into dist/nostrodomus.js). Re-point each source-side check at the
# current owner module so it pins the SAME real fact at its new location.
STRING_MODULE = ROOT / "src/core/string.js"                     # percentLabel helper
SETTINGS_CONTROLS = ROOT / "src/ui/settings/settingsControls.js"  # styleRangeControl default formatter
SETTINGS_SHELL = ROOT / "src/ui/settings/settingsPanelShell.js"   # Scrollbar opacity control
CODEBOX_STYLE = ROOT / "src/ui/codeboxStyle.js"                   # host scrollbar variables / frame ownership
CODEBOX_UNCLIP = ROOT / "src/ui/codebox/codeboxUnclip.js"         # overflow guard helper
CHANGELOG_SUMMARY = ROOT / "src/core/changelogSummary.js"         # in-app rolling changelog window

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

# Source-side facts now live in extracted owner modules (post-decomposition);
# dist bundles them all. Each module text is read once; the source branch checks
# the owner module, the dist branch checks the bundle. Same invariants.
string_module = STRING_MODULE.read_text(encoding="utf-8", errors="replace")
settings_controls = SETTINGS_CONTROLS.read_text(encoding="utf-8", errors="replace")
settings_shell = SETTINGS_SHELL.read_text(encoding="utf-8", errors="replace")
codebox_style = CODEBOX_STYLE.read_text(encoding="utf-8", errors="replace")
codebox_unclip = CODEBOX_UNCLIP.read_text(encoding="utf-8", errors="replace")
changelog_summary = CHANGELOG_SUMMARY.read_text(encoding="utf-8", errors="replace")

for label, path in (("source", SRC), ("dist", DIST)):
    text = path.read_text(encoding="utf-8", errors="replace")
    if label == "source":
        require("from './core/version.js'" in text, f"{label} imports version truth from src/core/version.js")
        # In-app changelog summary is a rolling five-release window in
        # src/core/changelogSummary.js; pin the CURRENT release rather than the
        # long-retired pre-SemVer v31.6.5 literal (un-pinned exact version).
        require(f'version: "{version}"' in changelog_summary, f"{label} in-app changelog summary includes the current release")
        # percentLabel was extracted to src/core/string.js and is wired into the
        # Style opacity controls as styleRangeControl's default formatter.
        require("export function percentLabel(value)" in string_module, f"{label} defines extracted percentLabel helper used by Style opacity controls")
        require("percentLabel," in text and "from './core/version.js'" in text, f"{label} imports the extracted percentLabel helper")
        require("formatter = percentLabel" in settings_controls, f"{label} wires percentLabel as the Style range control formatter")
        require('styleRangeControl("Scrollbar opacity"' in settings_shell and 'percentLabel' in settings_shell, f"{label} opacity controls have a defined formatter")
        require(':host([data-nostrodomus-codebox-frame-host="1"])' in codebox_style and '--nostrodomus-codebox-scrollbar-thumb:' in codebox_style, f"{label} still defines host scrollbar variables")
        require('border-color: var(--nostrodomus-codebox-frame-border) !important;\n        box-shadow:' not in codebox_style, f"{label} does not put frame border/glow box-shadow on host")
        require('function allowCodeboxFrameOverflow' in codebox_unclip, f"{label} retains overflow guard helper for editor wrappers")
    else:
        # Minified dist: PROJECT_VERSION="x" (no spaces). Accept either spacing
        # and un-pin against the current PROJECT.json version.
        require((f'PROJECT_VERSION = "{version}"' in text or f'PROJECT_VERSION="{version}"' in text), f"{label} PROJECT_VERSION matches PROJECT.json")
        require(internal in text, f"{label} VERSION matches PROJECT.json internal_version")
        # Minified dist drops the space after the colon (version:"x").
        require((f'version: "{version}"' in text or f'version:"{version}"' in text), f"{label} in-app changelog summary includes the current release")
        require('function percentLabel(value)' in text, f"{label} bundles percentLabel helper used by Style opacity controls")
        require('styleRangeControl("Scrollbar opacity"' in text and 'percentLabel' in text, f"{label} opacity controls have a defined formatter")
        require(':host([data-nostrodomus-codebox-frame-host="1"])' in text and '--nostrodomus-codebox-scrollbar-thumb:' in text, f"{label} still defines host scrollbar variables")
        require('border-color: var(--nostrodomus-codebox-frame-border) !important;\n        box-shadow:' not in text, f"{label} does not put frame border/glow box-shadow on host")
        require('function allowCodeboxFrameOverflow' in text, f"{label} retains overflow guard helper for editor wrappers")

# v31.6.5 was the pre-SemVer style workstream; the project reset to 0.1.x SemVer,
# so un-pin the exact ^31.6.x^ match to a dynamic >= floor (tuple-compared dotted
# ints), keeping the internal_version identity check alongside it.
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 13), "PROJECT.json remains at or beyond the codebox-frame style workstream baseline (v31.6.x reset to 0.1.x SemVer)")
require(internal.startswith(f"nostrodomus-v{version}-") or version_tuple > (0, 1, 13), "PROJECT.json internal_version records current style scope")
require("from './core/version.js'" in SRC.read_text(encoding="utf-8", errors="replace") and internal in DIST.read_text(encoding="utf-8", errors="replace"), "source imports version truth and dist carries current runtime version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Style settings restore static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("STYLE SETTINGS RESTORE STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("STYLE SETTINGS RESTORE STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
