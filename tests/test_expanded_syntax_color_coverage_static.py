#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The Dark+ classifier tracks CSS block depth and produces the cssValue and cssGlow line kinds.
#   * src/syntax/darkPlusBridge.js: the CSS depth classifier
#   * src/core/settings.js: the syntax theme saturation setting
#   * src/ui/codeboxStyle.js: codeboxStyleBuildRootCss, the root codebox CSS
# Each fact is also checked in dist, in its minified form.
SYNTAX_BRIDGE = ROOT / "src/syntax/darkPlusBridge.js"
SETTINGS = ROOT / "src/core/settings.js"
CODEBOX_STYLE = ROOT / "src/ui/codeboxStyle.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/EXPANDED_SYNTAX_COLOR_COVERAGE_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

dist_text = DIST.read_text(encoding="utf-8", errors="replace")

# (file, file text, source token, dist token). esbuild renames some identifiers with a numeric
# suffix (text2, darkPlusLooksCssContinuation2) and removes spaces.
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

# The syntax colors need no external DarkPlus resource.
require("nostrodomus-cm6-vscode-darkplus-v1.js" not in bridge_src, "src does not load the external DarkPlus resource")
require("nostrodomus-cm6-vscode-darkplus-v1.js" not in dist_text, "dist does not load the external DarkPlus resource")

# The root codebox CSS must not use a broad ":host *" selector (a clip or mask override there
# breaks SVG mini-graphs); clip-path removal stays scoped to [data-nostrodomus-codebox-unclip].
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
    require(":host *" not in scoped, f"{label} has no broad :host * root style selector")
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
