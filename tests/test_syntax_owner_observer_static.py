from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8')
DIST = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8')


def test_scoped_syntax_owner_observer_exists_in_source_and_dist():
    for text in (SRC, DIST):
        assert 'function installSyntaxOwnerObserver(editor, reason = "syntax-owner")' in text
        assert 'editor.querySelector?.(".cm-content")' in text
        assert 'installCodeMirrorSourceClassSyntax(editor, effectiveStyleSettings(), `syntax-owner-${reason}`)' in text
        assert 'legacyInlineDeleted: true' in text


def test_syntax_observer_is_installed_from_codebox_style_paths():
    for text in (SRC, DIST):
        assert 'installSyntaxOwnerObserver(editor, `codebox-style-${reason}`)' in text
        assert 'installSyntaxOwnerObserver(editor, `codebox-style-fast-${reason}`)' in text


def test_blur_and_outside_click_have_late_settle_repaints():
    for text in (SRC, DIST):
        assert 'scheduleCodeboxStyleReapply("outside-pointer-syntax-repaint")' in text
        assert 'scheduleCodeboxStyleReapply("editor-focusout-syntax-repaint")' in text
