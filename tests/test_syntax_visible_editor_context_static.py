from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "main.legacy.js"
SYNTAX_RUNTIME = ROOT / "src" / "syntax" / "syntaxRuntime.js"
VERSION = ROOT / "src" / "core" / "version.js"


def test_syntax_runtime_receives_visible_editor_candidate_dependency():
    main = MAIN.read_text()
    runtime = SYNTAX_RUNTIME.read_text()
    version = VERSION.read_text()

    assert "syntax-visible-editor-context-hotfix" in version
    assert "export function createSyntaxRuntime(ctx)" in runtime
    assert "visibleStyleEditorCandidate," in runtime

    call_start = main.index("const syntaxRuntime = createSyntaxRuntime({")
    call_end = main.index("  });", call_start)
    call = main[call_start:call_end]

    assert "visibleStyleEditorCandidate," in call
    assert "styleEditorFromNode," in call
    assert "nostrodomusWalkOpenRoots," in call
    assert "syntaxColorWithOpacity," in call

    assert "function visibleStyleEditorCandidate(editor)" in main
    assert "scheduleNativeHighlightForActiveEditor" in runtime
    assert "scheduleNativeHighlightForActiveEditor" in runtime
