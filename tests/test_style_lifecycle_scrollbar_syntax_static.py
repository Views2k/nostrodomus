#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/STYLE_LIFECYCLE_SCROLLBAR_SYNTAX_STATIC_TEST_REPORT.txt"

# Style sheets reach every document and shadow root before the first click in an editor, and
# the syntax theme dropdown and the scrollbar settings work with the v17 companion. Each fact is
# checked in the source modules below and in dist (fact() takes the dist form as a second
# argument where esbuild changes the text).
SOURCE_FILES = [
    "src/app.js",
    "src/core/version.js",
    "src/core/state.js",
    "src/ui/codeboxStyleRuntime.js",
    "src/ui/styleDomRuntime.js",
    "src/ui/styleRootRuntime.js",
    "src/ui/settingsPortalRuntime.js",
    "src/ui/settingsInteractionRuntime.js",
    "src/ui/settings/settingsPanelShell.js",
    "src/ui/settings/settingsControls.js",
]

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
source_owner = "\n".join((ROOT / f).read_text(encoding="utf-8", errors="replace") for f in SOURCE_FILES)
dist = DIST.read_text(encoding="utf-8", errors="replace")

for label, text in (("source", source_owner), ("dist", dist)):
    minified = label == "dist"

    def fact(src_form, dist_form=None):
        # dist has no spaces around "=" and ":" and writes `true` as `!0`.
        return (dist_form if (minified and dist_form is not None) else src_form) in text

    # Bounded active-editor discovery for Style (codeboxStyleRuntime).
    require(fact('function activeCodeboxStyleEditor()'), f"{label} has bounded active editor discovery for Style")
    require(fact('W.__nostrodomusEditorBridgeV1?.active?.()'), f"{label} uses the v17 bridge as a grounded style target source")
    # Settings mounts through the HA dialog/top-layer portal (settingsPortalRuntime).
    require(fact('function ensureSettingsPortalHost()'), f"{label} resolves the Settings dialog/top-layer portal host")
    require(fact('settingsPortalRoot()'), f"{label} mounts Settings through the portal root")
    require(fact('showPopover'), f"{label} promotes the Settings portal to the top layer")
    # Full root/shadow style sheets install before editor binding (codeboxStyleRuntime + styleDomRuntime).
    require(fact('applyCodeboxStyleTokensToStableRoots'), f"{label} applies style tokens to stable roots")
    require(fact('function ensureRootCodeboxStyle'), f"{label} installs full root/shadow style sheets")
    require(fact('rootStylesInstalled'), f"{label} tracks installed root style sheets before editor binding")
    require(fact('installRootStyleRegistry()'), f"{label} initializes style tokens at install time")
    # Root/shadow observers discover editors before first click (state + codeboxStyleRuntime).
    require(fact('styleRootObservers: new Map()', 'styleRootObservers:new Map'), f"{label} holds the style-root observer registry")
    require(fact('shadow-root-editor-discovered'), f"{label} observes discovered document/shadow roots without waiting for first click")
    require(fact('nostrodomusWalkOpenRoots(document', 'nostrodomusWalkOpenRoots(doc'), f"{label} can discover visible CodeMirror editors before focus/click")
    require('applyCodeboxStyleSettings("settings-live-style")' not in text, f"{label} does not run style reapply from the settings live timer")
    # Syntax theme dropdown (settingsPanelShell).
    require(fact('group === "style.syntaxTintPreset"', 'group==="style.syntaxTintPreset"'), f"{label} dropdown syntax theme selection targets the syntax preset group")
    require(fact('state.settings.style.syntaxTintEnabled = true', 'syntaxTintEnabled=!0'), f"{label} dropdown syntax theme selection enables scoped syntax coloring")
    require(fact('select[data-option-group]'), f"{label} dropdown syntax theme selection uses the option-group select control")
    require(fact('syntaxThemeSelect('), f"{label} uses the syntax theme dropdown control")
    require('styleColorBarControl("Custom syntax color"' not in text, f"{label} has no custom syntax color bars")
    require(fact('Each syntax role uses a distinct color inside every theme'), f"{label} explains distinct syntax-theme behavior in Settings")
    # The v17 companion editor, and the scrollbar thumb description in Settings.
    require(fact('nostrodomus-editor-v17'), f"{label} references the v17 companion editor")
    require(fact('Controls the codebox scroll thumb'), f"{label} describes the scrollbar thumb control in Settings")

require("root_style_registry" in json.dumps(project), "PROJECT.json records the root style registry policy")
require("v17" in json.dumps(project), "PROJECT.json records the v17 style ownership handoff policy")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Style lifecycle/root style registry static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("STYLE LIFECYCLE ROOT STYLE REGISTRY STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("STYLE LIFECYCLE ROOT STYLE REGISTRY STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
