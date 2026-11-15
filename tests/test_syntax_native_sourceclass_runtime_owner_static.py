#!/usr/bin/env python3
"""The syntax runtime modules own the native-highlight and source-class functions; app.js only delegates."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "app.js"
RUNTIME_FILES = [
    ROOT / "src" / "syntax" / "syntaxRuntime.js",
    ROOT / "src" / "syntax" / "nativeHighlightLifecycle.js",
    ROOT / "src" / "syntax" / "smartSyntaxLifecycle.js",
    ROOT / "src" / "syntax" / "sourceClassLifecycle.js",
    ROOT / "src" / "syntax" / "syntaxContentObservers.js",
    ROOT / "src" / "syntax" / "sourceClassCssBuilder.js",
    ROOT / "src" / "syntax" / "initialSyntaxPaintGate.js",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    main_src = MAIN.read_text(encoding="utf-8")
    runtime_src = "\n".join(path.read_text(encoding="utf-8") for path in RUNTIME_FILES)

    require("export function createSyntaxRuntime(ctx)" in runtime_src,
            "syntax runtime factory is exported")
    require("syntaxRuntime = createSyntaxRuntime({" in main_src,
            "main creates syntax runtime")

    runtime_tokens = [
        "function installCodeMirrorNativeHighlightSyntax(editor, settings, reason = \"native-highlight-syntax\") {",
        "function scheduleNativeHighlightForActiveEditor(editor, reason = \"active-editor-native-highlight\") {",
        "function buildCodeMirrorSourceClassSyntaxCss(parts, syntax) {",
        "function applyCodeMirrorSmartSyntaxClasses(editor, settings, reason = \"smart-source-syntax\") {",
        "function scheduleSourceClassSmartSyntax(editor, reason = \"smart-source-syntax\") {",
        "function installCodeMirrorSourceClassSyntax(editor, settings, reason = \"source-class-syntax\") {",
        "function scheduleSourceClassSyntaxRefresh(reason = \"source-class-refresh\") {",
    ]
    for token in runtime_tokens:
        require(token in runtime_src, f"runtime owns {token}")

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
        "function codeMirrorSyntaxContentMutationRelevant(records)",
        "function initialSyntaxPaintGateShadowHosts(root, reason = \"initial-syntax-shadow-scan\", depth = 0)",
        "recordPerformanceEvent(\"syntax.native-highlight\"",
        "sourceClassSmartSyntaxObserver?.disconnect?.()",
    ]
    for token in forbidden_main_bodies:
        require(token not in main_src, f"main does not own body {token[:80]}")

    print("SYNTAX NATIVE/SOURCE-CLASS RUNTIME OWNER STATIC TEST OK")


if __name__ == "__main__":
    main()
