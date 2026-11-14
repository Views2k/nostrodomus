from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_context_diagnostics_runtime_owner_extraction():
    main = read("src/main.legacy.js")
    runtime = read("src/diagnostics/contextDiagnosticsRuntime.js")
    version = read("src/core/version.js")

    assert "context-diagnostics-runtime-owner-extraction" in version
    assert "import { installContextDiagnosticsRuntime } from './diagnostics/contextDiagnosticsRuntime.js';" in main
    assert "installContextDiagnosticsRuntime({ window, document });" in main
    assert "export function installContextDiagnosticsRuntime" in runtime

    # Runtime ownership moved; main keeps lineage only.
    assert "function diagnosticsReadoutRead(" not in main
    assert "function diagnosticsReadoutRead(" in runtime
    assert "function shadowProbeRunDryRun(" not in main
    assert "function shadowProbeRunDryRun(" in runtime
    assert "function readCandidateQuality(" not in main
    assert "function readCandidateQuality(" in runtime

    # Browser-visible diagnostic APIs remain installed by the runtime owner.
    for token in [
        "__nostrodomusContextShadowProbe",
        "__nostrodomusContextProviderPilot",
        "__nostrodomusContextProviderCandidates",
        "__nostrodomusContextCandidateQuality",
        "__nostrodomusEmbeddedLanguageDetector",
        "__nostrodomusContextDiagnosticsReadout",
    ]:
        assert token in runtime
        assert token in main

    # The owner must remain diagnostics-only and not drive autocomplete.
    assert "drivesAutocomplete: false" in runtime
    assert "diagnosticsOnly: true" in runtime
