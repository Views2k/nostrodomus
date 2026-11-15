#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "app.js"
TEXT = MAIN.read_text(encoding="utf-8")

# app.js has no hand-written one-line shims for these syntax runtime methods.
SHIMS_NOT_IN_MAIN = [
    "codeMirrorSyntaxContentMutationRelevant",
    "resetCodeMirrorSyntaxContentObserverAliases",
    "suppressSyntaxOwnerSourceClassInstallForNativeFallback",
    "buildCodeMirrorNativeHighlightBaseCss",
    "installCodeMirrorNativeHighlightBaseStyle",
    "cancelSyntaxRecoveryTimersForNativeHighlight",
    "suppressLegacySyntaxRecoveryForNativeHighlight",
    "editorUsesCodeMirrorNativeHighlightSyntax",
    "nativeHighlightSyntaxContentPainted",
    "codeMirrorClassNamesForTag",
    "codeMirrorSpecialTag",
    "addCodeMirrorSourceClassRule",
    "smartSyntaxKind",
    "setSmartSyntaxKind",
    "clearSmartSyntaxKind",
    "buildSmartSyntaxClassCss",
    "smartSyntaxHighlightName",
    "smartSyntaxRangeHighlightSupported",
    "smartSyntaxClearRangeHighlights",
    "smartSyntaxCommitRangeHighlights",
    "smartSyntaxAddHighlightRange",
    "smartSyntaxRangeTokensForLine",
    "smartSyntaxYamlLineInfo",
    "smartSyntaxTextOffset",
    "smartSyntaxDocLinesFromEditor",
]

for name in SHIMS_NOT_IN_MAIN:
    token = f"function {name}(...args) {{ return syntaxRuntime.{name}(...args); }}"
    assert token not in TEXT, f"delegation shim in app.js: {name}"

# test_smart_syntax_observer_ownership_static.py checks that the syntax runtime delegates reach
# app.js and bounds the number of one-line shims there.

print("NATIVE HIGHLIGHT SOURCE CLASS OWNERSHIP STATIC TEST OK")
