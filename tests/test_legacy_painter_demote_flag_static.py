from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SYNTAX = (ROOT / 'src' / 'syntax' / 'syntaxRuntime.js').read_text(encoding='utf-8')
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
        require(forbidden not in SYNTAX, f'legacy painter token deleted from syntax runtime: {forbidden}')


def test_legacy_recovery_state_and_metrics_are_deleted():
    for forbidden in [
        'syntaxRecoveryRaf',
        'syntaxRecoveryTimers',
        'syntaxRecoveryDelayTimers',
        'syntaxRecoveryTimerCoalesces',
        'syntaxRecoveryFanoutReductionCount',
        'syntax-recovery-timer-coalesced',
    ]:
        require(forbidden not in STATE, f'legacy recovery state deleted: {forbidden}')
        require(forbidden not in PERF, f'legacy recovery metric deleted: {forbidden}')


def test_source_class_fallback_owner_remains():
    for required in [
        'function applyDarkPlusSyntaxColoring(editor, settings)',
        'installCodeMirrorSourceClassSyntax(editor, settings, "apply-darkplus-syntax-coloring")',
        'function installSyntaxOwnerObserver(editor, reason = "syntax-owner")',
        'installCodeMirrorSourceClassSyntax(editor, effectiveStyleSettings(), `syntax-owner-${reason}`)',
    ]:
        require(required in SYNTAX, f'source-class syntax fallback remains: {required}')
