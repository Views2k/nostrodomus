#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "app.js"
TEXT = MAIN.read_text(encoding="utf-8")
ADAPTERS = (ROOT / "src" / "composition" / "appAdapters.js").read_text(encoding="utf-8")

# app.js has no hand-written one-line shims for these syntax runtime methods.
SHIMS_NOT_IN_MAIN = [
    "darkPlusColor",
    "darkPlusCssDepthDelta",
    "darkPlusCommitCssDepth",
    "darkPlusLooksCssSelector",
    "darkPlusLooksCssDeclaration",
    "darkPlusLooksCssContinuation",
    "darkPlusIsJinjaLine",
    "darkPlusIsJinjaKeyword",
    "darkPlusLineKind",
    "darkPlusTokenKind",
    "applyDarkPlusSyntaxColoring",
    "initialSyntaxPaintGateCss",
    "installInitialSyntaxPaintGateStyle",
    "initialSyntaxContentPainted",
    "editorForInitialSyntaxContent",
    "revealInitialSyntaxContent",
    "initialSyntaxPaintGateScopedEnabled",
    "initialSyntaxPaintGateRootLabel",
    "initialSyntaxPaintGateTargetedShadowTraversalEnabled",
    "initialSyntaxPaintGateShadowHosts",
    "initialSyntaxPaintGateTargets",
    "scanInitialSyntaxPaintGateRoot",
    "observeInitialSyntaxPaintGateRoot",
]

for name in SHIMS_NOT_IN_MAIN:
    token = f"function {name}(...args) {{ return syntaxRuntime.{name}(...args); }}"
    assert token not in TEXT, f"delegation shim in app.js: {name}"

assert ("return syntaxRuntime.applyDarkPlusSyntaxColoring(editor, settings);" in TEXT) or ("applyDarkPlusSyntaxColoring?.(editor, settings)" in ADAPTERS)
assert "createSyntaxRuntimeDelegates(() => syntaxRuntime)" in TEXT
assert "primeInitialSyntaxPaintGateForEditor," in TEXT
assert "    primeInitialSyntaxPaintGateForEditor," in TEXT
assert "from './syntax/darkPlusClassifiers.js'" not in TEXT
assert TEXT.count("(...args) { return ") <= 57

assert "scheduleInitialSyntaxPaintGate," in TEXT

print("SYNTAX PAINT GATE DARK PLUS OWNERSHIP STATIC TEST OK")
