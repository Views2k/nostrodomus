#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/app.js"
DIST = ROOT / "dist/nostrodomus.js"
CLIENT_RUNTIME = ROOT / "src/diagnostics/clientCapabilitiesRuntime.js"
PERFORMANCE_RUNTIME = ROOT / "src/diagnostics/performanceTelemetryRuntime.js"
TELEMETRY_RUNTIME = ROOT / "src/diagnostics/diagnosticsRuntime.js"
STATE = ROOT / "src/core/state.js"
CODEBOX_RUNTIME = ROOT / "src/ui/codeboxStyleRuntime.js"
POPUP_RUNTIME = ROOT / "src/completion/popupRuntime.js"
REPORT = ROOT / "reports/PERFORMANCE_DIAGNOSTICS_SNAPSHOT_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

# Tokens with the same text in the source modules and in dist.
required_tokens = [
    'function clientCapabilitySnapshot(reason',
    'function clientGpuSnapshot(reason',
    'WEBGL_debug_renderer_info',
    'webgpuAvailable',
    # The diagnostics stats snapshot embeds the client capability snapshot.
    'clientCapabilitySnapshot(capabilityReason)',
    'clientCapabilitySnapshot,',
    # Metric keys read with bracket access keep their double-quoted dotted form.
    '"completion.compute.ms"',
    '"popup.render.ms"',
    '"diagnostics.refresh.ms"',
    # Counters in the nested snapshot objects.
    'observerStats.callbacks',
    'state.diagnosticsStats?.skippedClean',
    'state.diagnosticsStats?.skippedHidden',
    'activeCache.hit',
    'activeCache.miss',
    'observerStats',
    'diagnosticsStats',
    'activeEditorCache',
    'recordPerformanceEvent("observer-callback"',
    'recordPerformanceEvent("scheduler-skipped-clean"',
    'recordPerformanceEvent("active-editor-cache-hit"',
]

# esbuild writes string literals with double quotes, so these are checked in either form.
quote_variant_tokens = [
    ("'style.apply.ms'", '"style.apply.ms"'),   # producer-side metric key (single in src, double in dist)
    ("'popup-render'", '"popup-render"'),        # popup render perf-event name
]

source_owner_text = "\n".join(
    path.read_text(encoding="utf-8", errors="replace")
    for path in [SRC, CLIENT_RUNTIME, PERFORMANCE_RUNTIME, TELEMETRY_RUNTIME, STATE, CODEBOX_RUNTIME, POPUP_RUNTIME]
)

for path, label in [(SRC, "src"), (DIST, "dist")]:
    text = path.read_text(encoding="utf-8", errors="replace")
    owner_text = source_owner_text if label == "src" else text
    for token in required_tokens:
        require(token in owner_text, f"{label} owner contains {token}")
    for src_form, dist_form in quote_variant_tokens:
        require(src_form in owner_text or dist_form in owner_text, f"{label} owner contains {src_form} (or minified {dist_form})")
    # esbuild minifies the boolean literal `false` to `!1`, so accept either form for the dist.
    require('networkReporting: false' in owner_text or 'networkReporting:!1' in owner_text, f"{label} remains local-only/no network reporting")
    require('sendBeacon' not in owner_text and 'fetch(' not in owner_text, f"{label} does not add network reporting APIs")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Performance diagnostics snapshot static test\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PERFORMANCE DIAGNOSTICS SNAPSHOT STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("PERFORMANCE DIAGNOSTICS SNAPSHOT STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
