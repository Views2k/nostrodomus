#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
DIST = ROOT / "dist/nostrodomus.js"
PERF_RUNTIME = ROOT / "src/diagnostics/performanceTelemetryRuntime.js"
TELEMETRY_RUNTIME = ROOT / "src/diagnostics/telemetryRuntime.js"
# Decomposition: the budget evaluator extracted to src/diagnostics/performanceMetrics.js and the
# public-API table extracted to src/core/publicApiRuntime.js. Same owners, current source homes.
PERF_METRICS = ROOT / "src/diagnostics/performanceMetrics.js"
PUBLIC_API = ROOT / "src/core/publicApiRuntime.js"
REPORT = ROOT / "reports/PERFORMANCE_DIAGNOSTICS_REPORT_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

perf_runtime_text = PERF_RUNTIME.read_text(encoding="utf-8", errors="replace") if PERF_RUNTIME.exists() else ""
telemetry_runtime_text = TELEMETRY_RUNTIME.read_text(encoding="utf-8", errors="replace") if TELEMETRY_RUNTIME.exists() else ""
perf_metrics_text = PERF_METRICS.read_text(encoding="utf-8", errors="replace") if PERF_METRICS.exists() else ""
public_api_text = PUBLIC_API.read_text(encoding="utf-8", errors="replace") if PUBLIC_API.exists() else ""

for path, label in [(SRC, "src"), (DIST, "dist")]:
    text = path.read_text(encoding="utf-8", errors="replace")
    owner_text = text if label == "dist" else "\n".join(
        [text, perf_runtime_text, telemetry_runtime_text, perf_metrics_text, public_api_text]
    )
    require('function performanceStatsSnapshot()' in owner_text, f"{label} defines performanceStatsSnapshot")
    require('function evaluatePerformanceBudgets(' in owner_text, f"{label} defines performance budget evaluation")
    require('function performanceDiagnosticsCard()' in owner_text, f"{label} renders Performance Stats diagnostics card")
    # Report inclusion: telemetry reports embed performanceStats: performanceStatsSnapshot()
    # (minification drops the space after the colon).
    require('performanceStats: performanceStatsSnapshot()' in owner_text or
            'performanceStats:performanceStatsSnapshot()' in owner_text,
            f"{label} includes performanceStats in reports")
    # Public API table moved to src/core/publicApiRuntime.js and now points at
    # apiMethods.performanceStatsSnapshot (dist minifies the space away); accept either form.
    require('performanceStats: apiMethods.performanceStatsSnapshot,' in owner_text or
            'performanceStats:apiMethods.performanceStatsSnapshot' in owner_text or
            'performanceStats: performanceStatsSnapshot,' in owner_text or
            'performanceStats:performanceStatsSnapshot,' in owner_text,
            f"{label} exposes public performanceStats API")
    require('"Performance Stats"' in owner_text, f"{label} diagnostics UI labels Performance Stats")
    # local-only marker: src writes networkReporting: false; dist minifies false -> !1.
    require('networkReporting: false' in owner_text or 'networkReporting:!1' in owner_text,
            f"{label} marks performance stats as local-only/no network reporting")
    require('codebox-style-apply' in owner_text and 'codebox-frame-sync' in owner_text and 'style-root-scan' in owner_text, f"{label} budgets known hot paths")
    require('scheduler' in owner_text and 'cache' in owner_text, f"{label} reports scheduler/cache state")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Performance diagnostics report static test\n\n" +
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PERFORMANCE DIAGNOSTICS REPORT STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("PERFORMANCE DIAGNOSTICS REPORT STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
