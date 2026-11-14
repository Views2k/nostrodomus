#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "main.legacy.js"
TEXT = MAIN.read_text(encoding="utf-8")

REMOVED_SHIMS = [
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

for name in REMOVED_SHIMS:
    token = f"function {name}(...args) {{ return syntaxRuntime.{name}(...args); }}"
    assert token not in TEXT, f"delegation shim still present: {name}"

# Current HA full verify still protects these seams in main. Keep them until the
# corresponding static gates are intentionally retired in their own patch.
# Current full verify protects these syntax seams through the v0.1.49 delegate bundle.
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
