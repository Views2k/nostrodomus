from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OBSERVERS = (ROOT / 'src' / 'syntax' / 'syntaxContentObservers.js').read_text(encoding='utf-8')
CODEBOX_STYLE_RUNTIME = (ROOT / 'src' / 'ui' / 'codeboxStyleRuntime.js').read_text(encoding='utf-8')
COMPLETION_RUNTIME = (ROOT / 'src' / 'completion' / 'completionRuntime.js').read_text(encoding='utf-8')
DIST = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8')


def test_scoped_syntax_owner_observer_exists_in_source_and_dist():
    assert 'function installSyntaxOwnerObserver(editor, reason = "syntax-owner")' in OBSERVERS
    assert 'editor.querySelector?.(".cm-content")' in OBSERVERS
    assert 'api.installCodeMirrorSourceClassSyntax(editor, effectiveStyleSettings(), `syntax-owner-${reason}`)' in OBSERVERS
    assert 'legacyInlineDeleted: true' in OBSERVERS
    # esbuild removes whitespace and may rename local identifiers in dist.
    assert 'function installSyntaxOwnerObserver(editor,reason="syntax-owner")' in DIST
    assert '`syntax-owner-${reason}`' in DIST
    assert 'legacyInlineDeleted:!0' in DIST


def test_syntax_observer_is_installed_from_codebox_style_paths():
    assert 'installSyntaxOwnerObserver(editor, `codebox-style-${reason}`)' in CODEBOX_STYLE_RUNTIME
    assert 'installSyntaxOwnerObserver(editor, `codebox-style-fast-${reason}`)' in CODEBOX_STYLE_RUNTIME
    assert 'installSyntaxOwnerObserver(editor,`codebox-style-${reason}`)' in DIST
    assert 'installSyntaxOwnerObserver(editor,`codebox-style-fast-${reason}`)' in DIST


def test_blur_and_outside_click_have_late_settle_repaints():
    assert "scheduleCodeboxStyleReapply('outside-pointer-syntax-repaint')" in COMPLETION_RUNTIME
    assert "scheduleCodeboxStyleReapply('editor-focusout-syntax-repaint')" in COMPLETION_RUNTIME
    assert 'scheduleCodeboxStyleReapply("outside-pointer-syntax-repaint")' in DIST
    assert 'scheduleCodeboxStyleReapply("editor-focusout-syntax-repaint")' in DIST


if __name__ == '__main__':
    test_scoped_syntax_owner_observer_exists_in_source_and_dist()
    test_syntax_observer_is_installed_from_codebox_style_paths()
    test_blur_and_outside_click_have_late_settle_repaints()
    print('SYNTAX OWNER OBSERVER STATIC TEST OK')
