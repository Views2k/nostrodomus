from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "main.legacy.js"
MODULE = ROOT / "src" / "context" / "contextSnapshotRuntimeAdapter.js"
CONTEXT_RUNTIME = ROOT / "src" / "diagnostics" / "contextDiagnosticsRuntime.js"
DIST = ROOT / "dist" / "nostrodomus.js"
TEST = ROOT / "tests" / "context" / "context_snapshot_runtime_adapter_module.test.mjs"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def test_context_snapshot_runtime_adapter_module_wired_and_covered():
    main = MAIN.read_text(encoding="utf-8")
    context_runtime = CONTEXT_RUNTIME.read_text(encoding="utf-8")
    runtime_owner = main + "\n" + context_runtime
    module = MODULE.read_text(encoding="utf-8")
    test_text = TEST.read_text(encoding="utf-8")

    require("./context/contextSnapshotRuntimeAdapter.js" in runtime_owner, "runtime owner imports the extracted ContextSnapshot runtime adapter")
    require("contextSnapshotAdapter.collectContextSnapshotDryRun" in runtime_owner, "runtime owner delegates to the extracted dry-run helper")
    require("function collectContextSnapshotDryRun" not in main, "legacy dry-run implementation body is removed from main.legacy.js")
    require("function createContextSnapshotContract" not in main, "legacy contract factory body is removed from main.legacy.js")
    require("contextAdapterYamlKey" in runtime_owner, "runtime owner preserves YAML-key helper alias for older runtime parity gates")
    require("import { contextAdapterYamlKey } from '../yaml/runtimeContextAdapter.js';" in context_runtime, "runtime owner imports the YAML-key helper from the runtime adapter")
    require("contextAdapterYamlKey(cursor.line)" in runtime_owner, "dry-run wrapper preserves the legacy YAML-key call shape")

    require("export function collectContextSnapshotDryRun" in module, "module exports collectContextSnapshotDryRun")
    require("export function createContextSnapshotContract" in module, "module exports createContextSnapshotContract")
    require("NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_STAGE = '1D-dry-run-only'" in module, "module preserves Stage 1D stage label")
    require("contextAdapterYamlKey" in module and "../yaml/runtimeContextAdapter.js" in module, "module reuses the existing YAML key helper")

    require("collectContextSnapshotDryRun is local-only" in test_text, "node tests cover dry-run safety contract")
    require("legacy numeric contract" in test_text, "node tests pin legacy clamp behavior")


def test_context_snapshot_runtime_adapter_bundled_dist_output():
    dist = DIST.read_text(encoding="utf-8")
    require("1D-dry-run-only" in dist, "dist includes the Stage 1D dry-run adapter")
    require("runtime-adapter-dry-run-only" in dist, "dist includes the dry-run idle reason")

if __name__ == "__main__":
    test_context_snapshot_runtime_adapter_module_wired_and_covered()
    test_context_snapshot_runtime_adapter_bundled_dist_output()
    print("CONTEXT SNAPSHOT RUNTIME ADAPTER MODULE WIRING STATIC TEST OK")
