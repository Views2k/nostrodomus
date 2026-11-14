#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
# The monolith was split into focused src/ modules and the project moved to 0.1.x SemVer.
# The expanded syntax color coverage invariant (CSS-depth aware Dark+ classifier producing
# cssValue/cssGlow line kinds) still holds — it just MOVED:
#   * the CSS-depth classifier bridge lives in src/syntax/darkPlusBridge.js
#   * the syntax-theme-saturation default setting lives in src/core/settings.js
#   * the version constants live in src/core/version.js (imported by main.legacy.js)
#   * the root codebox CSS string is built by codeboxStyleBuildRootCss in src/ui/codeboxStyle.js
# The bundled dist still contains all of the above (minified), so each fact is asserted
# against the dist in its survives-minification form.
SYNTAX_BRIDGE = ROOT / "src/syntax/darkPlusBridge.js"
SETTINGS = ROOT / "src/core/settings.js"
VERSION_MODULE = ROOT / "src/core/version.js"
CODEBOX_STYLE = ROOT / "src/ui/codeboxStyle.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/EXPANDED_SYNTAX_COLOR_COVERAGE_STATIC_TEST_REPORT.txt"

# Dynamic floor: the project advanced to 0.1.x SemVer after this feature shipped; assert the
# version stays at or beyond the SemVer baseline rather than pinning an exact retired literal.
VERSION_FLOOR = (0, 1, 0)
INTERNAL_ID = "nostrodomus-v"

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
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())

require(version_tuple >= VERSION_FLOOR, "PROJECT.json remains at or beyond the SemVer baseline that carries expanded syntax color coverage")
require(INTERNAL_ID in internal or version_tuple > VERSION_FLOOR, "internal_version records the nostrodomus runtime identity (or version advanced beyond the baseline)")

# Version constants moved to src/core/version.js (main.legacy.js imports them); the bundled dist
# carries the minified literals with no spaces around '='.
version_module_text = VERSION_MODULE.read_text(encoding="utf-8", errors="replace")
require(f'export const PROJECT_VERSION = "{version}"' in version_module_text, "src PROJECT_VERSION matches metadata (src/core/version.js)")
require(f'export const VERSION = "{internal}"' in version_module_text, "src runtime VERSION matches metadata (src/core/version.js)")

dist_text = DIST.read_text(encoding="utf-8", errors="replace")
require(f'PROJECT_VERSION="{version}"' in dist_text, "dist PROJECT_VERSION matches metadata")
require(f'VERSION="{internal}"' in dist_text, "dist runtime VERSION matches metadata")

# Expanded syntax coverage tokens — the CSS-depth aware Dark+ classifier.
# (label, file_for_src_form, src_token, dist_token)  — dist_token captures the minified shape
# (parameter renamed text->text2, bridge wrapper Continuation->Continuation2, spaces stripped).
bridge_src = SYNTAX_BRIDGE.read_text(encoding="utf-8", errors="replace")
settings_src = SETTINGS.read_text(encoding="utf-8", errors="replace")

src_dist_tokens = [
    (SYNTAX_BRIDGE, bridge_src, "function darkPlusCssDepthDelta(text)", "function darkPlusCssDepthDelta(text2)"),
    (SYNTAX_BRIDGE, bridge_src, "function darkPlusCommitCssDepth(ctx, text)", "function darkPlusCommitCssDepth(ctx,text2)"),
    (SYNTAX_BRIDGE, bridge_src, "function darkPlusLooksCssSelector(text)", "function darkPlusLooksCssSelector(text2)"),
    (SYNTAX_BRIDGE, bridge_src, "function darkPlusLooksCssDeclaration(text)", "function darkPlusLooksCssDeclaration(text2)"),
    (SYNTAX_BRIDGE, bridge_src, "function darkPlusLooksCssContinuation(text)", "function darkPlusLooksCssContinuation(text2)"),
    (SYNTAX_BRIDGE, bridge_src, "ctx.cssBlockDepth", "ctx.cssBlockDepth"),
    (SYNTAX_BRIDGE, bridge_src, "cssDepth > 0 || darkPlusLooksCssContinuation(t)", "cssDepth>0||darkPlusLooksCssContinuation2(t)"),
    (SYNTAX_BRIDGE, bridge_src, 'lineKind === "cssValue"', 'lineKind==="cssValue"'),
    (SYNTAX_BRIDGE, bridge_src, 'lineKind === "cssGlow"', 'lineKind==="cssGlow"'),
    (SETTINGS, settings_src, "syntaxThemeSaturation", "syntaxThemeSaturation"),
]

for src_path, src_text, src_token, dist_token in src_dist_tokens:
    require(src_token in src_text, f"src contains expanded syntax coverage token ({src_path.name}): {src_token}")
    require(dist_token in dist_text, f"dist contains expanded syntax coverage token: {dist_token}")

# The old external DarkPlus resource dependency must stay retired everywhere.
require("nostrodomus-cm6-vscode-darkplus-v1.js" not in bridge_src, "src does not reintroduce old DarkPlus resource dependency")
require("nostrodomus-cm6-vscode-darkplus-v1.js" not in dist_text, "dist does not reintroduce old DarkPlus resource dependency")

# Root codebox CSS is now built by codeboxStyleBuildRootCss (src/ui/codeboxStyle.js); the dist
# carries the same template literal. Negative guards (the broad ":host *" clip/mask override
# was removed because it could break SVG mini-graphs):
#   * no broad ":host *" root selector
#   * no ROOT-WIDE clip-path removal — i.e. clip-path removal must stay scoped to the
#     [data-nostrodomus-codebox-unclip] attribute selector, never applied via ":host *".
codebox_style_src = CODEBOX_STYLE.read_text(encoding="utf-8", errors="replace")

def root_css_segment(text):
    start = text.find("function codeboxStyleBuildRootCss")
    if start == -1:
        return ""
    end = text.find("function ", start + 1)
    return text[start:end] if end != -1 else text[start:]

for label, text in (("src", codebox_style_src), ("dist", dist_text)):
    scoped = root_css_segment(text)
    require(scoped != "", f"{label} exposes codeboxStyleBuildRootCss root style builder")
    require(":host *" not in scoped, f"{label} does not reintroduce broad :host * root style selector")
    # clip-path removal stays scoped to the unclip attribute selector, never root-wide (":host *").
    require(":host * {" not in scoped and ":host *{" not in scoped, f"{label} does not apply root-wide clip-path removal via :host *")
    require("data-nostrodomus-codebox-unclip" in scoped, f"{label} keeps the codebox clip-path removal scoped to the unclip attribute selector")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Expanded syntax color coverage static test\n\nResults:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("EXPANDED SYNTAX COLOR COVERAGE STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("EXPANDED SYNTAX COLOR COVERAGE STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
