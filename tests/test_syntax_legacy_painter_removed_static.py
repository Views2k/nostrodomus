from pathlib import Path

# Syntax coloring goes through the CodeMirror source classes only; the inline painter and its
# recovery timers are gone and must not come back.
ROOT = Path(__file__).resolve().parents[1]
SYNTAX = '\n'.join(
    path.read_text(encoding='utf-8') for path in sorted((ROOT / 'src' / 'syntax').glob('*.js'))
)
DARK_PLUS_BRIDGE = (ROOT / 'src' / 'syntax' / 'darkPlusBridge.js').read_text(encoding='utf-8')
CONTENT_OBSERVERS = (ROOT / 'src' / 'syntax' / 'syntaxContentObservers.js').read_text(encoding='utf-8')
STATE = (ROOT / 'src' / 'core' / 'state.js').read_text(encoding='utf-8')
PERF = (ROOT / 'src' / 'diagnostics' / 'performanceTelemetryRuntime.js').read_text(encoding='utf-8')


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def test_legacy_painter_entry_points_are_deleted():
    for forbidden in [
        'LEGACY_PAINTER_ENABLED',
        'function legacyPainterEnabled()',
        'function paintDarkPlusNode(',
        'function paintDarkPlusLinesNow(',
        'function paintDarkPlusMutationNow(',
        'function scheduleSyntaxRecovery(',
        'function runSyntaxRecoveryPass(',
        'syntax.legacy-painter.blocked',
    ]:
        require(forbidden not in SYNTAX, f'legacy painter token in src/syntax: {forbidden}')


def test_legacy_recovery_state_and_metrics_are_deleted():
    for forbidden in [
        'syntaxRecoveryRaf',
        'syntaxRecoveryTimers',
        'syntaxRecoveryDelayTimers',
        'syntaxRecoveryTimerCoalesces',
        'syntaxRecoveryFanoutReductionCount',
        'syntax-recovery-timer-coalesced',
    ]:
        require(forbidden not in STATE, f'legacy recovery state in src/core/state.js: {forbidden}')
        require(forbidden not in PERF, f'legacy recovery metric in performance telemetry: {forbidden}')


def test_source_class_fallback_owner_remains():
    for required in [
        'function applyDarkPlusSyntaxColoring(editor, settings)',
        'api.installCodeMirrorSourceClassSyntax(editor, settings, "apply-darkplus-syntax-coloring")',
    ]:
        require(required in DARK_PLUS_BRIDGE, f'source-class syntax fallback missing from darkPlusBridge.js: {required}')
    for required in [
        'function installSyntaxOwnerObserver(editor, reason = "syntax-owner")',
        'api.installCodeMirrorSourceClassSyntax(editor, effectiveStyleSettings(), `syntax-owner-${reason}`)',
    ]:
        require(required in CONTENT_OBSERVERS, f'source-class syntax fallback missing from syntaxContentObservers.js: {required}')


if __name__ == '__main__':
    test_legacy_painter_entry_points_are_deleted()
    test_legacy_recovery_state_and_metrics_are_deleted()
    test_source_class_fallback_owner_remains()
    print('SYNTAX LEGACY PAINTER REMOVED STATIC TEST OK')
