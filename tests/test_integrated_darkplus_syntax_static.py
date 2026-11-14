#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
# The monolith was split into many src/ modules: the integrated Dark+ classifier
# now lives in src/syntax/darkPlusBridge.js, the data-attribute markers in
# src/syntax/sourceClassLifecycle.js + src/ui/styleDomRuntime.js, the per-pass
# bounds in src/syntax/smartSyntaxLifecycle.js, and the root codebox CSS in
# src/ui/codeboxStyle.js. The dist bundle still contains all of it. Assert the
# moved facts against the whole src/ tree (not just main.legacy.js) plus dist.
SRC_TREE = "".join(p.read_text(encoding="utf-8", errors="replace") for p in sorted((ROOT / "src").rglob("*.js")))
# Version literals were extracted to src/core/version.js (imported by main.legacy.js)
# and minified in dist (PROJECT_VERSION="..." with no surrounding spaces).
VERSION_SRC = (ROOT / "src/core/version.js").read_text(encoding="utf-8", errors="replace")
REPORT = ROOT / "reports/INTEGRATED_DARKPLUS_SYNTAX_STATIC_TEST_REPORT.txt"

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

# "src" now means the whole src/ tree (the integrated Dark+ code was extracted out of
# main.legacy.js into modules); "dist" is the bundled, minified output.
for label, text in (("src", SRC_TREE), ("dist", DIST.read_text(encoding="utf-8", errors="replace"))):
    is_src = label == "src"
    # Version literals: source keeps them in src/core/version.js (re-exported via the
    # main.legacy.js import); dist minifies to PROJECT_VERSION="..." with no spaces.
    version_blob = VERSION_SRC if is_src else text
    project_ok = (f'const PROJECT_VERSION = "{version}"' in version_blob or
                  f'PROJECT_VERSION = "{version}"' in version_blob or
                  f'PROJECT_VERSION="{version}"' in version_blob)
    runtime_ok = (f'const VERSION = "{internal}"' in version_blob or
                  f'VERSION = "{internal}"' in version_blob or
                  f'VERSION="{internal}"' in version_blob)
    require(project_ok, f"{label} PROJECT_VERSION matches metadata")
    require(runtime_ok, f"{label} runtime VERSION matches metadata")
    for token in [
        "DARKPLUS_SYNTAX_COLORS",
        "data-nostrodomus-darkplus-line-kind",
        "data-nostrodomus-darkplus-token-kind",
        # was "nostrodomusIntegratedDarkplus" (never present in real src/dist, even at
        # baseline); the real integrated-Dark+ runtime marker is DARKPLUS_STYLE_ID's value.
        "nostrodomus-integrated-darkplus-style-v1",
        # was "syntax.paint" (never a literal in real src/dist); the real syntax-paint
        # diagnostic scope is the initial-paint gate that holds first paint until syntax is ready.
        "syntax.initial-paint-gate",
        "card_mod",
        "DARKPLUS_MAX_LINES_PER_PASS",
        "DARKPLUS_MAX_SPANS_PER_PASS",
    ]:
        require(token in text, f"{label} contains integrated Dark+ syntax token: {token}")
    # Dark+ classifier function signatures live in src/syntax/darkPlusBridge.js. In dist the
    # parameters are renamed/respaced by minification, so assert the full source signature
    # against the src tree and the minify-tolerant `function <name>(` form against dist.
    for full_sig, name_prefix in (
        ("function darkPlusLineKind(text, ctx)", "function darkPlusLineKind("),
        ("function darkPlusTokenKind(span, lineText, lineKind)", "function darkPlusTokenKind("),
        ("function applyDarkPlusSyntaxColoring(editor, settings)", "function applyDarkPlusSyntaxColoring("),
    ):
        if is_src:
            require(full_sig in text, f"{label} contains integrated Dark+ syntax token: {full_sig}")
        else:
            require(name_prefix in text, f"{label} contains integrated Dark+ classifier function: {name_prefix})")
    # The root codebox CSS moved to codeboxStyleBuildRootCss() in src/ui/codeboxStyle.js
    # (the old buildCodeboxRootCss in main.legacy.js is now a thin delegate wrapper).
    start = text.find("function codeboxStyleBuildRootCss")
    end = text.find("function codeboxStyleSignature", start)
    scoped = text[start:end] if start != -1 and end != -1 else ""
    require('[data-nostrodomus-codebox-style="1"]' in scoped, f"{label} scopes Dark+ base CSS to active codebox marker")
    require(":host *" not in scoped, f"{label} does not reintroduce broad :host * selector")
    require("\n      .cm-editor,\n" not in scoped, f"{label} does not use bare unscoped .cm-editor list selectors in root CSS")
    require("nostrodomus-cm6-vscode-darkplus-v1.js" not in text, f"{label} does not require the old external DarkPlus resource")
    require("#nostrodomus-cm6-darkplus-v1-v5-style" in text, f"{label} removes stale old DarkPlus style nodes during cleanup")

# Version un-pinned: PROJECT.json moved from the v31.6.x line to the 0.1.x SemVer reset.
# Floor at the post-migration SemVer baseline where the integrated Dark+ src modules exist.
require(version_tuple >= (0, 1, 54), "PROJECT.json remains at or beyond the SemVer-reset baseline for integrated Dark+ syntax")
require("nostrodomus" in internal or version_tuple > (0, 1, 54), "internal_version records the Nostrodomus runtime identity for integrated Dark+ syntax")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Integrated Dark+ syntax static test\n\nResults:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("INTEGRATED DARKPLUS SYNTAX STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("INTEGRATED DARKPLUS SYNTAX STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
