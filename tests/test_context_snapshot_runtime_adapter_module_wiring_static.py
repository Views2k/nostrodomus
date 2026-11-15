from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "app.js"
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

    require("./context/contextSnapshotRuntimeAdapter.js" in runtime_owner, "runtime owner imports the ContextSnapshot runtime adapter")
    require("contextSnapshotAdapter.collectContextSnapshotDryRun" in runtime_owner, "runtime owner delegates to the dry-run helper")
    require("function collectContextSnapshotDryRun" not in main, "app.js has no dry-run implementation of its own")
    require("function createContextSnapshotContract" not in main, "app.js has no contract factory of its own")
    require("contextAdapterYamlKey" in runtime_owner, "runtime owner uses the YAML-key helper")
    require("import { contextAdapterYamlKey } from '../yaml/runtimeContextAdapter.js';" in context_runtime, "runtime owner imports the YAML-key helper from the runtime adapter")
    require("contextAdapterYamlKey(cursor.line)" in runtime_owner, "dry-run wrapper reads the YAML key of the cursor line")

    require("export function collectContextSnapshotDryRun" in module, "module exports collectContextSnapshotDryRun")
    require("export function createContextSnapshotContract" in module, "module exports createContextSnapshotContract")
    require("NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_STAGE = 'context-snapshot-dry-run'" in module, "module names the dry-run stage")
    require("contextAdapterYamlKey" in module and "../yaml/runtimeContextAdapter.js" in module, "module reuses the existing YAML key helper")

    require("collectContextSnapshotDryRun is local-only" in test_text, "node tests cover dry-run safety contract")
    require("ContextSnapshot runtime adapter clamps positions" in test_text, "node tests cover position clamping")


def test_context_snapshot_runtime_adapter_bundled_dist_output():
    dist = DIST.read_text(encoding="utf-8")
    require("context-snapshot-dry-run" in dist, "dist includes the dry-run adapter stage")
    require("runtime-adapter-dry-run-only" in dist, "dist includes the dry-run idle reason")

if __name__ == "__main__":
    test_context_snapshot_runtime_adapter_module_wired_and_covered()
    test_context_snapshot_runtime_adapter_bundled_dist_output()
    print("CONTEXT SNAPSHOT RUNTIME ADAPTER MODULE WIRING STATIC TEST OK")
