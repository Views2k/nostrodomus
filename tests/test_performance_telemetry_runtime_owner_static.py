#!/usr/bin/env python3
"""Static guard for v31.6.389 performance telemetry runtime owner extraction."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8", errors="replace")
RUNTIME_PATH = ROOT / "src" / "diagnostics" / "performanceTelemetryRuntime.js"
RUNTIME = RUNTIME_PATH.read_text(encoding="utf-8", errors="replace") if RUNTIME_PATH.exists() else ""
VERSION = (ROOT / "src" / "core" / "version.js").read_text(encoding="utf-8", errors="replace")
REPORT = ROOT / "reports" / "PERFORMANCE_TELEMETRY_RUNTIME_OWNER_STATIC_REPORT.txt"

errors: list[str] = []
notes: list[str] = []


def require(ok: bool, message: str) -> None:
    if ok:
        notes.append("PASS " + message)
    else:
        errors.append(message)


require(RUNTIME_PATH.exists(), "performance telemetry runtime owner module exists")
require("export function createPerformanceTelemetryRuntime(ctx = {})" in RUNTIME,
        "performance telemetry runtime exports factory")
require("import { createPerformanceTelemetryRuntime } from './diagnostics/performanceTelemetryRuntime.js';" in MAIN,
        "main imports performance telemetry runtime owner")
require("performanceTelemetryRuntime = createPerformanceTelemetryRuntime({" in MAIN,
        "main creates injected performance telemetry runtime")

for token in [
    "function recordPerformanceEvent(name, durationMs = 0, detail",
    "function measurePerformanceEvent(name, detail, fn) {",
    "function performanceTelemetrySnapshot() {",
    "function resetPerformanceTelemetry() {",
    "function performanceStatsSnapshot() {",
]:
    require(token in RUNTIME, f"runtime owns moved body: {token}")

for token in [
    "createPerformanceTelemetryRuntimeDelegates(() => performanceTelemetryRuntime)",
    "const { performanceTelemetryDiagnosticsActive, shouldRecordPerformanceTelemetry, noteSuppressedPerformanceEvent, recordPerformanceEvent",
    "measurePerformanceEvent, performanceTelemetrySnapshot, resetPerformanceTelemetry, performanceStatsSnapshot } = performanceTelemetryDelegates",
]:
    require(token in MAIN, f"main keeps performance telemetry delegate bridge: {token}")

for token in [
    "shouldQuietEditorDispatchTelemetryEvent,",
    "quietEditorDispatchTelemetryEvent,",
    "evaluatePerformanceBudgets,",
    "clientCapabilitySnapshot,",
    "activeContextDiagnosticsSection,",
    "editorLikelyOpeningWithoutMountedCodebox,",
]:
    require(token in MAIN, f"main injects required telemetry dependency: {token}")

for token in [
    "function performanceStatsSnapshot() {",
    "function resetPerformanceTelemetry() {",
    "function recordPerformanceEvent(name, durationMs = 0, detail",
]:
    require(token not in MAIN, f"main no longer owns performance telemetry body: {token[:72]}")

require("nostrodomus-v0.1." in VERSION,
        "version uses current short v0.1 runtime identity")
require("Performance telemetry owner compatibility tokens retained" not in MAIN,
        "main no longer preserves performance telemetry lineage comment archaeology")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Performance telemetry runtime owner static report\n\n"
    + "Results:\n" + "\n".join(notes)
    + "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PERFORMANCE TELEMETRY RUNTIME OWNER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("PERFORMANCE TELEMETRY RUNTIME OWNER STATIC TEST OK")
print("Report:", REPORT)
