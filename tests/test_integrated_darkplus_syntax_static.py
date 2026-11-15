#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist/nostrodomus.js"
# The Dark+ code is spread over several modules (darkPlusBridge.js, sourceClassLifecycle.js,
# styleDomRuntime.js, smartSyntaxLifecycle.js, codeboxStyle.js), so the source checks read the
# whole src/ tree.
SRC_TREE = "".join(p.read_text(encoding="utf-8", errors="replace") for p in sorted((ROOT / "src").rglob("*.js")))
REPORT = ROOT / "reports/INTEGRATED_DARKPLUS_SYNTAX_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

for label, text in (("src", SRC_TREE), ("dist", DIST.read_text(encoding="utf-8", errors="replace"))):
    is_src = label == "src"
    for token in [
        "DARKPLUS_SYNTAX_COLORS",
        "data-nostrodomus-darkplus-line-kind",
        "data-nostrodomus-darkplus-token-kind",
        # The value of DARKPLUS_STYLE_ID.
        "nostrodomus-integrated-darkplus-style-v1",
        # The diagnostics scope of the gate that holds the first paint until the colors are ready.
        "syntax.initial-paint-gate",
        "card_mod",
        "DARKPLUS_MAX_LINES_PER_PASS",
        "DARKPLUS_MAX_SPANS_PER_PASS",
    ]:
        require(token in text, f"{label} contains integrated Dark+ syntax token: {token}")
    # In dist the parameters are renamed and respaced, so only `function <name>(` is checked there.
    for full_sig, name_prefix in (
        ("function darkPlusLineKind(text, ctx)", "function darkPlusLineKind("),
        ("function darkPlusTokenKind(span, lineText, lineKind)", "function darkPlusTokenKind("),
        ("function applyDarkPlusSyntaxColoring(editor, settings)", "function applyDarkPlusSyntaxColoring("),
    ):
        if is_src:
            require(full_sig in text, f"{label} contains integrated Dark+ syntax token: {full_sig}")
        else:
            require(name_prefix in text, f"{label} contains integrated Dark+ classifier function: {name_prefix})")
    # The root codebox CSS, built by codeboxStyleBuildRootCss() in src/ui/codeboxStyle.js.
    start = text.find("function codeboxStyleBuildRootCss")
    end = text.find("function codeboxStyleSignature", start)
    scoped = text[start:end] if start != -1 and end != -1 else ""
    require('[data-nostrodomus-codebox-style="1"]' in scoped, f"{label} scopes Dark+ base CSS to active codebox marker")
    require(":host *" not in scoped, f"{label} has no broad :host * selector")
    require("\n      .cm-editor,\n" not in scoped, f"{label} does not use bare unscoped .cm-editor list selectors in root CSS")
    require("nostrodomus-cm6-vscode-darkplus-v1.js" not in text, f"{label} does not require the external DarkPlus resource")
    require("#nostrodomus-cm6-darkplus-v1-v5-style" in text, f"{label} removes leftover DarkPlus style nodes during cleanup")

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
