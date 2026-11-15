#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/app.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/SETTINGS_LAYOUT_STATIC_TEST_REPORT.txt"

# Where the settings sections sit: providers under General, Suggestion Quality under Context and
# the guarded reset under Help, not in the header. The sections are built in
# src/ui/settings/settingsPanelShell.js. Each check accepts the dist form too, where esbuild
# removes spaces and renames some locals (settingsTitle2). The tab set, the changelog version and
# the drag behavior are checked by test_settings_tabs_provider_toggles_static.py,
# test_in_app_changelog_current_static.py and test_settings_drag_frame_stability_static.py.
SETTINGS_SHELL_MODULE = ROOT / "src/ui/settings/settingsPanelShell.js"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

def read(path):
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""

SOURCE_COMBINED = "\n".join(read(p) for p in (SRC, SETTINGS_SHELL_MODULE))
DIST_TEXT = read(DIST)

for label in ("source", "dist"):
    text = SOURCE_COMBINED if label == "source" else DIST_TEXT

    require('sectionPanel("suggestions"' not in text, f"{label} does not render separate Suggestions section")
    require(
        ('settingsTitle("Providers")' in text or 'settingsTitle2("Providers")' in text)
        and 'providerControlsMarkup()' in text,
        f"{label} keeps provider controls in the General tab",
    )
    context_idx = text.find('sectionPanel("context"')
    quality_idx = text.find('settingsTitle("Suggestion Quality")')
    if quality_idx == -1:
        quality_idx = text.find('settingsTitle2("Suggestion Quality")')  # minified bundle form
    require(context_idx != -1 and quality_idx != -1 and context_idx < quality_idx,
            f"{label} shows Suggestion Quality in the Context section")

    # The header has no Reset; the guarded Reset is under Help.
    header_start = text.find('const headerButtons = createSettingsElement')
    if header_start == -1:
        header_start = text.find('headerButtons=createSettingsElement')  # minified bundle form
    header_end = text.find('appendChildren(header', header_start)
    header_block = text[header_start:header_end]
    require('data-reset-pos' not in header_block and 'Reset' not in header_block,
            f"{label} has no Reset in the settings header")
    require('dataset: { resetDefaults: "" }' in text or 'dataset:{resetDefaults:""}' in text,
            f"{label} has a guarded Reset to defaults control under Help")
    require('W.confirm?.("Reset Nostrodomus settings to defaults?' in text,
            f"{label} confirms before resetting defaults")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Settings layout static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SETTINGS LAYOUT STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("SETTINGS LAYOUT STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
