#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/app.js"
FRAME_RUNTIME = ROOT / "src/ui/codeboxFrameRuntime.js"
STYLE_RUNTIME = ROOT / "src/ui/codeboxStyleRuntime.js"
# Records the style-root-scan-scheduled and style-root-scan events.
STYLE_ROOT_RUNTIME = ROOT / "src/ui/styleRootRuntime.js"
# Exposes the public console telemetry API.
PUBLIC_API_RUNTIME = ROOT / "src/core/publicApiRuntime.js"
DIAG_RUNTIME = ROOT / "src/diagnostics/performanceTelemetryRuntime.js"
TELEMETRY_RUNTIME = ROOT / "src/diagnostics/diagnosticsRuntime.js"
COMPLETION_RUNTIME = ROOT / "src/completion/completionRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/PERFORMANCE_TELEMETRY_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

source_owner = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in (MAIN, FRAME_RUNTIME, STYLE_RUNTIME, STYLE_ROOT_RUNTIME, PUBLIC_API_RUNTIME, DIAG_RUNTIME, TELEMETRY_RUNTIME, COMPLETION_RUNTIME))

# dist has no spaces around "=" and ":" and uses double quotes, so each check accepts both forms.
def has_any(text, *forms):
    return any(form in text for form in forms)

for label, text in (("source-owner", source_owner), ("dist", DIST.read_text(encoding="utf-8", errors="replace"))):
    require('performanceTelemetry: {' in text or 'performanceTelemetry:{' in text or 'performanceTelemetrySnapshot' in text, f"{label} initializes local-only performance telemetry state")
    require(has_any(text, 'function recordPerformanceEvent(name, durationMs = 0, detail = "")', "function recordPerformanceEvent(name, durationMs = 0, detail = '')", 'function recordPerformanceEvent(name,durationMs=0,detail="")'), f"{label} has bounded event counter helper")
    require(has_any(text, 'function measurePerformanceEvent(name, detail, fn)', 'function measurePerformanceEvent(name,detail,fn)'), f"{label} has scoped timing helper")
    require('function performanceTelemetrySnapshot()' in text, f"{label} exposes telemetry snapshot helper")
    require('function resetPerformanceTelemetry()' in text, f"{label} exposes reset helper for before/after profiling")
    require(has_any(text, 'recordPerformanceEvent("style-root-mutation"', "recordPerformanceEvent('style-root-mutation'"), f"{label} counts style-root observer mutation pressure")
    # styleRootRuntime.js records these through an options callback, so the event name is checked.
    require(has_any(text, '"style-root-scan-scheduled"', "'style-root-scan-scheduled'"), f"{label} counts coalesced style-root scan scheduling")
    require(has_any(text, '"style-root-scan"', "'style-root-scan'"), f"{label} times root/shadow style scans")
    require(has_any(text, 'measurePerformanceEvent("codebox-style-apply"', "measurePerformanceEvent('codebox-style-apply'"), f"{label} times codebox style application")
    require('codebox-frame-sync' in text, f"{label} times external frame sync")
    require(has_any(text, 'measurePerformanceEvent("context-inspector-refresh"', "measurePerformanceEvent('context-inspector-refresh'"), f"{label} times Context Inspector live refresh")
    require(has_any(text, 'measurePerformanceEvent("suggestion-quality-refresh"', "measurePerformanceEvent('suggestion-quality-refresh'"), f"{label} times Suggestion Quality live refresh")
    require(has_any(text, 'measurePerformanceEvent("compute"', "measurePerformanceEvent('compute'"), f"{label} times completion/context compute")
    require(has_any(text, 'performanceTelemetry: performanceTelemetrySnapshot()', 'performanceTelemetry:performanceTelemetrySnapshot()'), f"{label} includes telemetry in debug/diagnostics/health payloads")
    require(has_any(text, 'performanceTelemetry: performanceTelemetrySnapshot,', 'performanceTelemetry:performanceTelemetrySnapshot,', 'performanceTelemetry: apiMethods.performanceTelemetrySnapshot,', 'performanceTelemetry:apiMethods.performanceTelemetrySnapshot'), f"{label} exposes a public console telemetry API")
    require('sendBeacon' not in text and 'fetch(' not in text, f"{label} keeps telemetry local-only with no network reporting")

# The threat model states that Nostrodomus adds no telemetry and no network access.
THREAT_MODEL = ROOT / "docs/THREAT_MODEL.md"
threat_model = THREAT_MODEL.read_text(encoding="utf-8", errors="replace") if THREAT_MODEL.exists() else ""
require("no telemetry or external network access" in threat_model and "It must not add telemetry" in threat_model, "threat model documents the local-only / no-network performance telemetry policy")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Performance telemetry static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PERFORMANCE TELEMETRY STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("PERFORMANCE TELEMETRY STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
