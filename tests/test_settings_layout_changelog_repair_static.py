#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/SETTINGS_LAYOUT_CHANGELOG_REPAIR_STATIC_TEST_REPORT.txt"

# Decomposition re-point: the monolith was split into src modules. The
# settings-layout / changelog facts this test pins MOVED out of main.legacy.js
# into focused modules but the invariants are unchanged, only their location:
#   - version identity constants  -> src/core/version.js
#   - in-app CHANGELOG_SUMMARY     -> src/core/changelogSummary.js
#   - settings tabs/sections/reset/drag -> src/ui/settings/settingsPanelShell.js
#   - viewport<->portal geometry   -> src/ui/settings/settingsGeometry.js
# The "source" label below asserts against the combined current source modules;
# the "dist" label asserts against the bundled (minified) output. Where a check
# would be fooled by minification (spacing, renamed locals like settingsTitle2),
# each assertion accepts the source-spaced form OR its minified equivalent.
VERSION_MODULE = ROOT / "src/core/version.js"
CHANGELOG_MODULE = ROOT / "src/core/changelogSummary.js"
SETTINGS_SHELL_MODULE = ROOT / "src/ui/settings/settingsPanelShell.js"
SETTINGS_GEOMETRY_MODULE = ROOT / "src/ui/settings/settingsGeometry.js"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

def read(path):
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""

project = json.loads(PROJECT.read_text(encoding="utf-8"))
version = str(project.get("version"))
internal = str(project.get("internal_version"))
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())

SOURCE_COMBINED = "\n".join(
    read(p)
    for p in (SRC, VERSION_MODULE, CHANGELOG_MODULE, SETTINGS_SHELL_MODULE, SETTINGS_GEOMETRY_MODULE)
)
DIST_TEXT = read(DIST)

for label in ("source", "dist"):
    text = SOURCE_COMBINED if label == "source" else DIST_TEXT
    minified = label == "dist"

    # Version identity. Source declares the constants in src/core/version.js
    # (`export const PROJECT_VERSION = "0.1.x"`); the minified dist drops the
    # spaces around `=` (PROJECT_VERSION="0.1.x").
    require(
        f'const PROJECT_VERSION = "{version}"' in text or f'PROJECT_VERSION="{version}"' in text,
        f"{label} PROJECT_VERSION matches PROJECT.json",
    )
    require(
        f'const VERSION = "{internal}"' in text or f'VERSION="{internal}"' in text,
        f"{label} VERSION matches PROJECT.json internal_version",
    )
    # In-app CHANGELOG_SUMMARY (src/core/changelogSummary.js) advertises the
    # current version. Source: `version: "0.1.x"`; minified dist: `version:"0.1.x"`.
    require(
        f'version: "{version}"' in text or f'version:"{version}"' in text,
        f"{label} in-app CHANGELOG_SUMMARY includes current version",
    )

    # Consolidated settings model with a real Style tab (no separate Suggestions
    # tab/section). settingsPanelShell.js owns the tab set.
    require(
        ('const allowedTabs = new Set(["general", "context", "diagnostics", "style", "help"])' in text
         or 'const allowedTabs = /* @__PURE__ */ new Set(["general", "context", "diagnostics", "style", "help"])' in text
         or 'allowedTabs=new Set(["general","context","diagnostics","style","help"])' in text),
        f"{label} uses consolidated settings model with real Style tab",
    )
    require('tabButton("Suggestions", "suggestions")' not in text and 'tabButton("Suggestions","suggestions")' not in text,
            f"{label} does not expose separate Suggestions tab")
    require('sectionPanel("suggestions"' not in text, f"{label} does not render separate Suggestions section")
    require('tabButton("General", "general")' in text or 'tabButton("General","general")' in text,
            f"{label} keeps General tab")
    # Provider controls live in the consolidated General area. settingsTitle gets
    # renamed to settingsTitle2 in the bundle (collision-avoidance rename).
    require(
        ('settingsTitle("Providers")' in text or 'settingsTitle2("Providers")' in text)
        and 'providerControlsMarkup()' in text,
        f"{label} keeps provider controls in consolidated General area",
    )
    context_idx = text.find('sectionPanel("context"')
    quality_idx = text.find('settingsTitle("Suggestion Quality")')
    if quality_idx == -1:
        quality_idx = text.find('settingsTitle2("Suggestion Quality")')  # minified bundle form
    require(context_idx != -1 and quality_idx != -1 and context_idx < quality_idx,
            f"{label} moves Suggestion Quality into Context section")

    # Reset removed from the header; the guarded Reset lives under Help.
    header_start = text.find('const headerButtons = createSettingsElement')
    if header_start == -1:
        header_start = text.find('headerButtons=createSettingsElement')  # minified bundle form
    header_end = text.find('appendChildren(header', header_start)
    header_block = text[header_start:header_end]
    require('data-reset-pos' not in header_block and 'Reset' not in header_block,
            f"{label} removes Reset from settings header")
    require('dataset: { resetDefaults: "" }' in text or 'dataset:{resetDefaults:""}' in text,
            f"{label} adds guarded Reset to default control under Help")
    require('W.confirm?.("Reset Nostrodomus settings to defaults?' in text,
            f"{label} confirms before resetting defaults")

    # Viewport-saved -> portal-local coordinate conversion (settingsGeometry.js).
    # The minifier renames neither (function declarations keep their names) but
    # drops the parameter-spacing.
    require(
        'function settingsViewportToPortalPosition(pos)' in text
        and ('function applySettingsPanelViewportPosition(panel, pos)' in text
             or 'function applySettingsPanelViewportPosition(panel,pos)' in text),
        f"{label} converts viewport-saved settings positions to portal-local coordinates",
    )
    require('Math.hypot(nextX, nextY) < 4' in text or 'Math.hypot(nextX,nextY)<4' in text,
            f"{label} ignores title-bar clicks that do not cross the drag threshold")
    require('panel.style.transform = `translate3d(${dx}px, ${dy}px, 0)`' in text
            or '.style.transform=`translate3d(${dx}px, ${dy}px, 0)`' in text,
            f"{label} uses transform-based drag frames for smoother modal dragging")

# Version policy: the project crossed the 31.6.x -> 0.1.x SemVer reset.
# The invariant is "stays on the released SemVer line", not a frozen
# 31.6.x literal, so floor at the start of the SemVer line.
require(version_tuple >= (0, 1, 0), "PROJECT.json remains on the released SemVer line (at or beyond the reset baseline)")
require(internal.startswith(f"nostrodomus-v{version}-"), "PROJECT.json internal_version matches current version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Settings layout/changelog repair static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SETTINGS LAYOUT CHANGELOG REPAIR STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("SETTINGS LAYOUT CHANGELOG REPAIR STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
