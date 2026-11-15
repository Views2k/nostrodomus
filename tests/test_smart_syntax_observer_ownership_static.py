#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "app.js"
TEXT = MAIN.read_text(encoding="utf-8")

# app.js has no hand-written one-line shims for these syntax runtime methods.
SHIMS_NOT_IN_MAIN = [
    "installCodeMirrorSyntaxContentObserver",
    "smartSyntaxUpdateBlockContext",
    "smartSyntaxLineKindForMode",
    "smartSyntaxTokenKind",
    "appendSourceClassSmartSyntaxPendingReason",
    "suppressSourceClassSmartSyntaxScheduleForNativeHighlight",
    "suppressSourceClassSmartSyntaxObserverInstallForNativeHighlight",
    "suppressLegacyInlineSyntaxOwnerForNativeHighlight",
    "suppressSourceClassSyntaxRefreshForNativeHighlight",
    "promoteSourceClassFallbackForNativeUnavailable",
    "suppressSourceClassNativeProbeForNativeFallback",
    "installSourceClassSmartSyntaxObserver",
    "clearDarkPlusInlineSyntaxStyles",
    "refreshSourceClassSyntaxForOpenEditors",
    "appendSourceClassSyntaxRefreshReason",
]

for name in SHIMS_NOT_IN_MAIN:
    token = f"function {name}(...args) {{ return syntaxRuntime.{name}(...args); }}"
    assert token not in TEXT, f"delegation shim in app.js: {name}"

# These syntax methods reach app.js through the syntax runtime delegate list.
for token in [
    "scheduleInitialSyntaxPaintGate",
    "primeInitialSyntaxPaintGateForEditor",
    "installInitialSyntaxPaintGate",
    "cleanupInitialSyntaxPaintGate",
    "disconnectCodeMirrorSyntaxContentObserver",
    "installSyntaxOwnerObserver",
    "installCodeMirrorNativeHighlightSyntax",
    "scheduleNativeHighlightForActiveEditor",
    "buildCodeMirrorSourceClassSyntaxCss",
    "applySmartSyntaxRangeHighlights",
    "smartSyntaxDocumentContextForVisibleLines",
    "applyCodeMirrorSmartSyntaxClasses",
    "disconnectSourceClassSmartSyntaxObserver",
    "scheduleSourceClassSmartSyntax",
    "installCodeMirrorSourceClassSyntax",
    "scheduleSourceClassSyntaxRefresh",
    "editorUsesCodeMirrorSourceClassSyntax",
]:
    assert f'"{token}"' in (ROOT / "src" / "composition" / "runtimeDelegateBridge.js").read_text(encoding="utf-8"), f"protected delegate missing: {token}"
    assert token in TEXT, f"main delegate destructure missing: {token}"

assert TEXT.count("(...args) { return ") <= 17

print("SMART SYNTAX OBSERVER OWNERSHIP STATIC TEST OK")
