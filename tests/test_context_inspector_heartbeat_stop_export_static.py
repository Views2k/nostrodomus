from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_diagnostics_runtime_exports_context_heartbeat_stop_method():
    src = (ROOT / "src/diagnostics/telemetryRuntime.js").read_text()
    assert "function stopContextInspectorHeartbeat" in src
    assert "stopContextInspectorHeartbeat," in src


def test_legacy_wrapper_calls_exported_context_heartbeat_stop_method():
    src = (ROOT / "src/main.legacy.js").read_text()
    assert "function stopContextInspectorHeartbeat(reason = \"context-inspector-hidden\")" in src
    assert "diagnosticsRuntime.stopContextInspectorHeartbeat(reason)" in src
