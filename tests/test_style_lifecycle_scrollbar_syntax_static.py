#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
VERSION_SRC = ROOT / "src/core/version.js"
REPORT = ROOT / "reports/STYLE_LIFECYCLE_SCROLLBAR_SYNTAX_STATIC_TEST_REPORT.txt"

# The style-lifecycle / root-style-registry runtime was extracted out of the
# pre-decomposition monolith into wired modules during the module decomposition.
# Assert each invariant at its CURRENT source home (the owner modules concatenated)
# for the "source" label, and against the minified bundle for the "dist" label —
# matching the source-spaced form in source and the minified form in dist (the
# fact(src_form, dist_form) helper), so the SAME real invariant is verified on both.
SOURCE_FILES = [
    "src/main.legacy.js",
    "src/core/version.js",
    "src/core/changelogSummary.js",
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
version = str(project.get("version"))
internal = str(project.get("internal_version"))
version_src = VERSION_SRC.read_text(encoding="utf-8", errors="replace")
source_owner = "\n".join((ROOT / f).read_text(encoding="utf-8", errors="replace") for f in SOURCE_FILES)
dist = DIST.read_text(encoding="utf-8", errors="replace")

for label, text in (("source", source_owner), ("dist", dist)):
    minified = label == "dist"

    def fact(src_form, dist_form=None):
        # The minified dist strips spaces around "=" / ":" and lowers `true` -> `!0`;
        # match the minified form on dist and the source-spaced form on source.
        return (dist_form if (minified and dist_form is not None) else src_form) in text

    # Version truth (source-of-truth literals live in src/core/version.js + changelogSummary.js).
    require(fact(f'const PROJECT_VERSION = "{version}"', f'PROJECT_VERSION="{version}"'), f"{label} PROJECT_VERSION matches PROJECT.json")
    require(fact(f'const VERSION = "{internal}"', f'VERSION="{internal}"'), f"{label} VERSION matches PROJECT.json internal_version")
    require(fact(f'version: "{version}"', f'version:"{version}"'), f"{label} in-app changelog summary carries the current version")
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
    require('styleColorBarControl("Custom syntax color"' not in text, f"{label} removes custom syntax color bars")
    require(fact('Each syntax role uses a distinct color inside every theme'), f"{label} explains distinct syntax-theme behavior in Settings")
    # v17 maroon override handoff — "maroon scrollbar" (old wording) is now documented as the
    # "maroon thumb" override in the Settings scrollbar-thumb description (settingsPanelShell.js).
    require(fact('nostrodomus-editor-v17'), f"{label} references the v17 companion editor")
    require(fact('maroon thumb'), f"{label} documents the v17 maroon thumb override (the v31 scrollbar handoff)")

version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 54), "PROJECT.json is at or beyond the SemVer migration baseline carrying the root-style registry")
require(internal.startswith(f"nostrodomus-v{version}-"), "PROJECT.json internal_version is the canonical runtime-identity string for the current version")
require("root_style_registry" in json.dumps(project), "PROJECT.json records the root style registry policy")
require("v17" in json.dumps(project), "PROJECT.json records the v17 style ownership handoff policy")
require(internal in version_src, "version.js (source of truth) carries the current runtime version")
require(internal in dist, "dist carries the current runtime version")

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
