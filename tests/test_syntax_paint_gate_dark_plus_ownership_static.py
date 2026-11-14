#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "main.legacy.js"
TEXT = MAIN.read_text(encoding="utf-8")
ADAPTERS = (ROOT / "src" / "composition" / "mainLegacyAdapters.js").read_text(encoding="utf-8")

REMOVED_SHIMS = [
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

for name in REMOVED_SHIMS:
    token = f"function {name}(...args) {{ return syntaxRuntime.{name}(...args); }}"
    assert token not in TEXT, f"delegation shim still present: {name}"

assert ("return syntaxRuntime.applyDarkPlusSyntaxColoring(editor, settings);" in TEXT) or ("applyDarkPlusSyntaxColoring?.(editor, settings)" in ADAPTERS)
assert "createSyntaxRuntimeDelegates(() => syntaxRuntime)" in TEXT
assert "primeInitialSyntaxPaintGateForEditor," in TEXT
assert "    primeInitialSyntaxPaintGateForEditor," in TEXT
assert "from './syntax/darkPlusClassifiers.js'" not in TEXT
assert TEXT.count("(...args) { return ") <= 57

assert "scheduleInitialSyntaxPaintGate," in TEXT

print("SYNTAX PAINT GATE DARK PLUS OWNERSHIP STATIC TEST OK")
