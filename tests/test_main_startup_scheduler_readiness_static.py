#!/usr/bin/env python3
"""Guard startup-safe diagnostics scheduler wiring.

The main runtime passes scheduleDiagnosticsRefresh into syntax/settings/editor
runtimes before diagnosticsRuntime itself is constructed. The symbol must remain
function-hoisted and backed by a lazy adapter that exists before those runtime
constructors run; a const destructure after syntaxRuntime creation creates a TDZ
browser crash and prevents Ctrl+Space/codebox styling from installing.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8")
ADAPTERS = (ROOT / "src/composition/mainLegacyAdapters.js").read_text(encoding="utf-8")


def index(token: str) -> int:
    pos = MAIN.find(token)
    assert pos >= 0, f"missing token: {token}"
    return pos


def test_diagnostics_scheduler_adapter_exists_before_runtime_constructors() -> None:
    adapter_pos = index("const diagnosticsSchedulerAdapters = createMainLegacyDiagnosticsSchedulerAdapters({")
    function_pos = index("function scheduleDiagnosticsRefresh(reason = 'diagnostics-refresh')")
    syntax_pos = index("syntaxRuntime = createSyntaxRuntime({")
    settings_pos = index("settingsPanelRuntime = createMainLegacySettingsPanelRuntime({")
    editor_pos = index("editorDispatchRuntime = createEditorDispatchRuntime({")

    assert adapter_pos < function_pos < syntax_pos < settings_pos < editor_pos


def test_schedule_diagnostics_refresh_is_not_const_destructured_after_use() -> None:
    assert "const { scheduleDiagnosticsRefresh } = diagnosticsSchedulerAdapters" not in MAIN
    assert "const {\n    scheduleDiagnosticsRefresh" not in MAIN


def test_scheduler_adapter_uses_lazy_runtime_getters() -> None:
    for token in [
        "getSyntaxRuntime?.()",
        "getDiagnosticsRuntime?.()?.scheduleDiagnosticsRefresh?.(reason) || false",
        "state?.typingSessionActive && cleanReason.startsWith('editor-dispatch')",
    ]:
        assert token in ADAPTERS, f"missing lazy diagnostics scheduler behavior: {token}"


def _wiring_block(start_token: str) -> str:
    start = index(start_token)
    end = MAIN.index("});", start)
    return MAIN[start:end]


def test_request_live_update_bare_shorthand_is_forbidden() -> None:
    # The bare shorthand resolves against whatever `requestLiveUpdate` symbol the
    # bundled scope provides; before the v0.1.59 rename it bound the completion
    # group const ahead of its declaration and crashed startup with a TDZ
    # ReferenceError. Wiring must always name requestCompletionLiveUpdate.
    assert "\n    requestLiveUpdate,\n" not in MAIN, (
        "bare requestLiveUpdate shorthand is TDZ-prone in the bundled scope; "
        "pass requestLiveUpdate: requestCompletionLiveUpdate explicitly"
    )


def test_settings_wiring_defers_completion_live_update_read() -> None:
    settings_pos = index("settingsInteractionRuntime = createSettingsInteractionRuntime({")
    group_pos = index("} = createMainLegacyCompletionRuntimeGroup({")
    # The settings interaction runtime is constructed before the completion
    # runtime group destructure declares requestCompletionLiveUpdate, so the
    # settings wiring must read the symbol lazily (inside a callback), never
    # eagerly at object-literal evaluation time.
    assert settings_pos < group_pos
    block = _wiring_block("settingsInteractionRuntime = createSettingsInteractionRuntime({")
    assert "requestLiveUpdate: reason => requestCompletionLiveUpdate(reason)" in block, (
        "settings wiring must defer its requestCompletionLiveUpdate read behind a callback"
    )


def test_editor_dispatch_wiring_passes_completion_live_update_explicitly() -> None:
    block = _wiring_block("editorDispatchRuntime = createEditorDispatchRuntime({")
    assert "requestLiveUpdate: requestCompletionLiveUpdate" in block, (
        "editor dispatch wiring must pass requestLiveUpdate: requestCompletionLiveUpdate explicitly"
    )


def test_completion_group_destructure_renames_request_live_update() -> None:
    assert "requestLiveUpdate: requestCompletionLiveUpdate,\n" in MAIN, (
        "completion runtime group destructure must bind requestLiveUpdate as "
        "requestCompletionLiveUpdate"
    )


if __name__ == "__main__":
    test_diagnostics_scheduler_adapter_exists_before_runtime_constructors()
    test_schedule_diagnostics_refresh_is_not_const_destructured_after_use()
    test_scheduler_adapter_uses_lazy_runtime_getters()
    test_request_live_update_bare_shorthand_is_forbidden()
    test_settings_wiring_defers_completion_live_update_read()
    test_editor_dispatch_wiring_passes_completion_live_update_explicitly()
    test_completion_group_destructure_renames_request_live_update()
    print("MAIN STARTUP SCHEDULER READINESS STATIC TEST OK")
