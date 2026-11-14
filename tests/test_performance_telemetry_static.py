#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/main.legacy.js"
FRAME_RUNTIME = ROOT / "src/ui/codeboxFrameRuntime.js"
STYLE_RUNTIME = ROOT / "src/ui/codeboxStyleRuntime.js"
# The style-root observer/scan owner (style-root-scan-scheduled / style-root-scan
# telemetry) was extracted out of the monolith into its own module; track it so the
# source-owner corpus still contains those events.
STYLE_ROOT_RUNTIME = ROOT / "src/ui/styleRootRuntime.js"
# The public console telemetry API surface moved into the dedicated public-API owner.
PUBLIC_API_RUNTIME = ROOT / "src/core/publicApiRuntime.js"
DIAG_RUNTIME = ROOT / "src/diagnostics/performanceTelemetryRuntime.js"
TELEMETRY_RUNTIME = ROOT / "src/diagnostics/telemetryRuntime.js"
COMPLETION_RUNTIME = ROOT / "src/completion/completionRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
VERSION_SRC = ROOT / "src/core/version.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/PERFORMANCE_TELEMETRY_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
version = str(project.get("version"))
internal = str(project.get("internal_version"))
source_owner ="\n".join(p.read_text(encoding="utf-8", errors="replace") for p in (MAIN, FRAME_RUNTIME, STYLE_RUNTIME, STYLE_ROOT_RUNTIME, PUBLIC_API_RUNTIME, DIAG_RUNTIME, TELEMETRY_RUNTIME, COMPLETION_RUNTIME, VERSION_SRC))

# The dist bundle is minified (spaces dropped around `=`/`:`, single quotes folded to
# double quotes). The same symbols/behaviors are shipped — these checks normalize the
# whitespace/quote style so they match both the source (spaced, single-quote) form and
# the minified dist form, without weakening WHAT is asserted.
def has_any(text, *forms):
    return any(form in text for form in forms)

for label, text in (("source-owner", source_owner), ("dist", DIST.read_text(encoding="utf-8", errors="replace"))):
    require(has_any(text, f'PROJECT_VERSION = "{version}"', f'PROJECT_VERSION="{version}"'), f"{label} PROJECT_VERSION matches PROJECT.json")
    require(has_any(text, f'VERSION = "{internal}"', f'VERSION="{internal}"'), f"{label} VERSION matches PROJECT.json internal_version")
    require('performanceTelemetry: {' in text or 'performanceTelemetry:{' in text or 'performanceTelemetrySnapshot' in text, f"{label} initializes local-only performance telemetry state")
    require(has_any(text, 'function recordPerformanceEvent(name, durationMs = 0, detail = "")', "function recordPerformanceEvent(name, durationMs = 0, detail = '')", 'function recordPerformanceEvent(name,durationMs=0,detail="")'), f"{label} has bounded event counter helper")
    require(has_any(text, 'function measurePerformanceEvent(name, detail, fn)', 'function measurePerformanceEvent(name,detail,fn)'), f"{label} has scoped timing helper")
    require('function performanceTelemetrySnapshot()' in text, f"{label} exposes telemetry snapshot helper")
    require('function resetPerformanceTelemetry()' in text, f"{label} exposes reset helper for before/after profiling")
    require(has_any(text, 'recordPerformanceEvent("style-root-mutation"', "recordPerformanceEvent('style-root-mutation'"), f"{label} counts style-root observer mutation pressure")
    # The style-root scan owner moved to src/ui/styleRootRuntime.js and is wired via an
    # options callback, so the event-name string is the stable, unique invariant.
    require(has_any(text, '"style-root-scan-scheduled"', "'style-root-scan-scheduled'"), f"{label} counts coalesced style-root scan scheduling")
    require(has_any(text, '"style-root-scan"', "'style-root-scan'"), f"{label} times root/shadow style scans")
    require(has_any(text, 'measurePerformanceEvent("codebox-style-apply"', "measurePerformanceEvent('codebox-style-apply'"), f"{label} times codebox style application")
    require('codebox-frame-sync' in text, f"{label} times external frame sync")
    require(has_any(text, 'measurePerformanceEvent("context-inspector-refresh"', "measurePerformanceEvent('context-inspector-refresh'"), f"{label} times Context Inspector live refresh")
    require(has_any(text, 'measurePerformanceEvent("suggestion-quality-refresh"', "measurePerformanceEvent('suggestion-quality-refresh'"), f"{label} times Suggestion Quality live refresh")
    require(has_any(text, 'measurePerformanceEvent("compute"', "measurePerformanceEvent('compute'"), f"{label} times completion/context compute")
    require(has_any(text, 'performanceTelemetry: performanceTelemetrySnapshot()', 'performanceTelemetry:performanceTelemetrySnapshot()'), f"{label} includes telemetry in debug/diagnostics/health payloads")
    # The public console telemetry API moved into the dedicated public-API owner, where
    # the property is wired off an apiMethods object.
    require(has_any(text, 'performanceTelemetry: performanceTelemetrySnapshot,', 'performanceTelemetry:performanceTelemetrySnapshot,', 'performanceTelemetry: apiMethods.performanceTelemetrySnapshot,', 'performanceTelemetry:apiMethods.performanceTelemetrySnapshot'), f"{label} exposes a public console telemetry API")
    require('sendBeacon' not in text and 'fetch(' not in text, f"{label} keeps telemetry local-only with no network reporting")

# Version is no longer pinned to the exact baseline that introduced this contract; the
# invariant is that PROJECT.json stays at or beyond that baseline (floor = the OLD pin),
# mirroring tests/test_visual_layer_baseline_contract_static.py and
# tests/test_codemirror_observer_containment_static.py.
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 13), "PROJECT.json remains at or beyond the v0.1.13 codebox frame owner baseline")
# internal_version is the canonical runtime string; the codebox-frame-owner marker must
# be present at the baseline release, or the version advanced past the baseline that
# introduced it (the release-specific suffix legitimately changes on later releases).
require("codebox-frame-owner" in internal or version_tuple > (0, 1, 13), "PROJECT.json internal_version records codebox frame owner (or version advanced beyond the baseline that introduced it)")
# The performance telemetry policy is documented as local-only with no network reporting.
# The legacy `performance_telemetry_policy` PROJECT.json key was a monolith-shrink process
# ledger (tied to the now-deleted MONOLITH.md) and was intentionally removed when
# PROJECT.json became a slim machine-read surface; the canonical, still-living statement of
# the no-telemetry/no-network policy is the threat-model ADR.
THREAT_MODEL = ROOT / "docs/adr/005-threat-model.md"
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
