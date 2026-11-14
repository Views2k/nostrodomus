#!/usr/bin/env python3
"""Static guard for current syntax native/source-class owner extraction."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "main.legacy.js"
RUNTIME_FILES = [
    ROOT / "src" / "syntax" / "syntaxRuntime.js",
    ROOT / "src" / "syntax" / "nativeHighlightLifecycle.js",
    ROOT / "src" / "syntax" / "smartSyntaxLifecycle.js",
    ROOT / "src" / "syntax" / "sourceClassLifecycle.js",
    ROOT / "src" / "syntax" / "syntaxContentObservers.js",
    ROOT / "src" / "syntax" / "sourceClassCssBuilder.js",
    ROOT / "src" / "syntax" / "initialSyntaxPaintGate.js",
]
VERSION = ROOT / "src" / "core" / "version.js"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    main_src = MAIN.read_text(encoding="utf-8")
    runtime_src = "\n".join(path.read_text(encoding="utf-8") for path in RUNTIME_FILES)
    version_src = VERSION.read_text(encoding="utf-8")

    require("export function createSyntaxRuntime(ctx)" in runtime_src,
            "syntax runtime factory remains exported")
    require("syntaxRuntime = createSyntaxRuntime({" in main_src,
            "main still creates syntax runtime")

    moved_tokens = [
        "function installCodeMirrorNativeHighlightSyntax(editor, settings, reason = \"native-highlight-syntax\") {",
        "function scheduleNativeHighlightForActiveEditor(editor, reason = \"active-editor-native-highlight\") {",
        "function buildCodeMirrorSourceClassSyntaxCss(parts, syntax) {",
        "function applyCodeMirrorSmartSyntaxClasses(editor, settings, reason = \"smart-source-syntax\") {",
        "function scheduleSourceClassSmartSyntax(editor, reason = \"smart-source-syntax\") {",
        "function installCodeMirrorSourceClassSyntax(editor, settings, reason = \"source-class-syntax\") {",
        "function scheduleSourceClassSyntaxRefresh(reason = \"source-class-refresh\") {",
    ]
    for token in moved_tokens:
        require(token in runtime_src, f"runtime owns {token}")

    delegate_tokens = [
        "function installCodeMirrorNativeHighlightSyntax(...args) { return syntaxRuntime.installCodeMirrorNativeHighlightSyntax(...args); }",
        "function scheduleNativeHighlightForActiveEditor(...args) { return syntaxRuntime.scheduleNativeHighlightForActiveEditor(...args); }",
        "function buildCodeMirrorSourceClassSyntaxCss(...args) { return syntaxRuntime.buildCodeMirrorSourceClassSyntaxCss(...args); }",
        "function applyCodeMirrorSmartSyntaxClasses(...args) { return syntaxRuntime.applyCodeMirrorSmartSyntaxClasses(...args); }",
        "function scheduleSourceClassSmartSyntax(...args) { return syntaxRuntime.scheduleSourceClassSmartSyntax(...args); }",
        "function installCodeMirrorSourceClassSyntax(...args) { return syntaxRuntime.installCodeMirrorSourceClassSyntax(...args); }",
        "function scheduleSourceClassSyntaxRefresh(...args) { return syntaxRuntime.scheduleSourceClassSyntaxRefresh(...args); }",
    ]
    require("createSyntaxRuntimeDelegates(() => syntaxRuntime)" in main_src, "main creates syntax runtime delegate bundle")
    for token in [
        "installCodeMirrorNativeHighlightSyntax",
        "scheduleNativeHighlightForActiveEditor",
        "buildCodeMirrorSourceClassSyntaxCss",
        "applyCodeMirrorSmartSyntaxClasses",
        "scheduleSourceClassSmartSyntax",
        "installCodeMirrorSourceClassSyntax",
        "scheduleSourceClassSyntaxRefresh",
    ]:
        require(token in main_src, f"main keeps syntax delegate name {token}")

    forbidden_main_bodies = [
        "function installCodeMirrorSourceClassSyntax(editor, settings, reason = \"source-class-syntax\") {\n    const parts = codeMirrorSourceClassParts(editor);",
        "function scheduleNativeHighlightForActiveEditor(editor, reason = \"active-editor-native-highlight\") {\n    const hasEditor = !!editor?.querySelector;",
        "function applyCodeMirrorSmartSyntaxClasses(editor, settings, reason = \"smart-source-syntax\") {\n    if (!editor?.querySelectorAll)",
    ]
    for token in forbidden_main_bodies:
        require(token not in main_src, f"main no longer owns body {token[:80]}")

    for retired in [
        "syntax native/source-class runtime owner compatibility tokens",
        "Static v31.6.77 range/source syntax baseline carry-forward",
        "recordPerformanceEvent(\"syntax.native-highlight\"",
        "sourceClassSmartSyntaxObserver?.disconnect?.()",
    ]:
        require(retired not in main_src, f"stale native/source-class lineage comment removed from main: {retired}")

    require("nostrodomus-v0.1." in version_src and "remediation-performance-stage" not in version_src,
            "version identifies current short v0.1.x cleanup identity")

    print("SYNTAX NATIVE/SOURCE-CLASS RUNTIME OWNER STATIC TEST OK")


if __name__ == "__main__":
    main()
