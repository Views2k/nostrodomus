#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8')
ADAPTERS = (ROOT / 'src' / 'composition' / 'mainLegacyAdapters.js').read_text(encoding='utf-8')
DISPATCH_RUNTIME = (ROOT / 'src' / 'editor' / 'editorDispatchRuntime.js').read_text(encoding='utf-8')
SYNTAX = '\n'.join((ROOT / 'src' / 'syntax' / name).read_text(encoding='utf-8') for name in ('syntaxRuntime.js', 'typingSessionLifecycle.js', 'nativeHighlightLifecycle.js', 'smartSyntaxLifecycle.js', 'sourceClassLifecycle.js', 'initialSyntaxPaintGate.js', 'syntaxContentObservers.js'))
STATE = (ROOT / 'src' / 'core' / 'state.js').read_text(encoding='utf-8')


def require(token: str, text: str, label: str) -> None:
    if token not in text:
        raise AssertionError(f'missing {label}: {token}')


def test_state_fields_exist():
    for token in [
        'typingSessionActive: false',
        'typingSessionLastChangeTs: 0',
        'typingSessionExitTimer: 0',
        'typingSessionSuppressed: Object.create(null)',
    ]:
        require(token, STATE, 'typing-session state field')


def test_dispatch_enters_session_before_editor_dispatch_scheduling():
    enter = DISPATCH_RUNTIME.index("enterTypingSession(view, 'editor-dispatch')")
    style = DISPATCH_RUNTIME.index("scheduleCodeboxStyleReapply('editor-dispatch')", enter)
    diagnostics = DISPATCH_RUNTIME.index("scheduleDiagnosticsRefresh('editor-dispatch')", style)
    live_update = DISPATCH_RUNTIME.index('requestLiveUpdate();', diagnostics)
    assert enter < style < diagnostics < live_update


def test_single_exit_timer_is_rearmed_and_exits_to_one_consolidated_pass():
    for token in [
        'const TYPING_SESSION_EXIT_MS = 150',
        'clearTimeout(state.typingSessionExitTimer)',
        'state.typingSessionExitTimer = setTimeout(() => finishTypingSession(view, `${reason}-quiet`), TYPING_SESSION_EXIT_MS)',
        'state.typingSessionActive = false',
        'scheduleSourceClassSmartSyntax(editor, "typing-session-exit")',
        'scheduleDiagnosticsRefresh("typing-session-exit")',
    ]:
        require(token, SYNTAX, 'typing-session exit behavior')
    require("enterTypingSession(view, 'editor-dispatch')", DISPATCH_RUNTIME, 'editor dispatch runtime typing-session dispatch call')


def test_editor_dispatch_diagnostics_are_gated_but_popup_update_remains_live():
    diagnostics_owner = MAIN + '\n' + ADAPTERS
    require("state?.typingSessionActive && cleanReason.startsWith('editor-dispatch')", diagnostics_owner, 'diagnostics editor-dispatch gate')
    require("syntaxRuntime?.noteTypingSessionSuppressed?.('diagnostics-refresh', cleanReason)", diagnostics_owner, 'diagnostics suppression counter')
    require("if (popupIsOpen() || state.settings?.keepOpen) {\n        requestLiveUpdate();\n      }", DISPATCH_RUNTIME, 'popup update remains live')


def test_syntax_runtime_suppresses_semantic_and_range_work():
    # The class painter is still suppressed during a typing session, but only when the browser
    # has no CSS Custom Highlight API. In range mode the ranges are the only color layer and are
    # rebuilt while typing (they write nothing to the DOM), so that suppression was removed.
    for token in (
        'if (state.typingSessionActive && !rangeMode) {',
        'recordPerformanceEvent("typing-session-suppressed"',
    ):
        require(token, SYNTAX, 'syntax typing-session suppression')
    assert 'noteTypingSessionSuppressed("range-highlight-rebuild", "typing-session-active")' not in SYNTAX,         'range rebuilds must not be suppressed during a typing session'


if __name__ == '__main__':
    test_state_fields_exist()
    test_dispatch_enters_session_before_editor_dispatch_scheduling()
    test_single_exit_timer_is_rearmed_and_exits_to_one_consolidated_pass()
    test_editor_dispatch_diagnostics_are_gated_but_popup_update_remains_live()
    test_syntax_runtime_suppresses_semantic_and_range_work()
    print('TYPING SESSION QUIET MODE STATIC TEST OK')
