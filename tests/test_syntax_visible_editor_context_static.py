from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "app.js"
SYNTAX_RUNTIME = ROOT / "src" / "syntax" / "syntaxRuntime.js"
NATIVE_HIGHLIGHT = ROOT / "src" / "syntax" / "nativeHighlightLifecycle.js"
ACTIVE_EDITOR_CACHE = ROOT / "src" / "editor" / "activeEditorCacheRuntime.js"


def test_syntax_runtime_receives_visible_editor_candidate_dependency():
    main = MAIN.read_text(encoding="utf-8")
    runtime = SYNTAX_RUNTIME.read_text(encoding="utf-8")
    native_highlight = NATIVE_HIGHLIGHT.read_text(encoding="utf-8")
    active_editor_cache = ACTIVE_EDITOR_CACHE.read_text(encoding="utf-8")

    assert "export function createSyntaxRuntime(ctx)" in runtime
    # The native highlight lifecycle checks that the editor is still visible before it installs.
    assert "visibleStyleEditorCandidate," in native_highlight
    assert "visibleStyleEditorCandidate(editor)" in native_highlight

    call_start = main.index("syntaxRuntime = createSyntaxRuntime({")
    call_end = main.index("  });", call_start)
    call = main[call_start:call_end]

    assert "visibleStyleEditorCandidate," in call
    assert "styleEditorFromNode," in call
    assert "nostrodomusWalkOpenRoots," in call
    assert "syntaxColorWithOpacity," in call

    assert "function visibleStyleEditorCandidate(editor)" in active_editor_cache
    # app.js takes it from the active editor cache delegates.
    destructure = next((line for line in main.splitlines() if line.strip().endswith("} = activeEditorCacheDelegates;")), "")
    assert "visibleStyleEditorCandidate," in destructure


if __name__ == "__main__":
    test_syntax_runtime_receives_visible_editor_candidate_dependency()
    print("SYNTAX VISIBLE EDITOR CONTEXT STATIC TEST OK")
