#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
DIST = ROOT / "dist/nostrodomus.js"
CLIENT_RUNTIME = ROOT / "src/diagnostics/clientCapabilitiesRuntime.js"
PERFORMANCE_RUNTIME = ROOT / "src/diagnostics/performanceTelemetryRuntime.js"
TELEMETRY_RUNTIME = ROOT / "src/diagnostics/telemetryRuntime.js"
STATE = ROOT / "src/core/state.js"
CODEBOX_RUNTIME = ROOT / "src/ui/codeboxStyleRuntime.js"
POPUP_RUNTIME = ROOT / "src/completion/popupRuntime.js"
REPORT = ROOT / "reports/PERFORMANCE_DIAGNOSTICS_HARDENING_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

# Tokens whose exact text survives identically in BOTH the source owner modules and the
# minified dist. The monolith was decomposed into src/diagnostics/* + src/core/* + src/ui/*
# + src/completion/* modules and the snapshot helpers gained ``reason``/``options`` params,
# so the old zero-arg signatures (``clientCapabilitySnapshot()``) and dotted metric-key string
# literals (``"observer.callbacks.count"``) no longer exist verbatim — each invariant is
# re-pointed to the SAME fact at its current location/form below.
required_tokens = [
    # Snapshot helpers gained a ``reason`` (and ``options``) param at decomposition; the
    # invariant is that the client-capability / GPU snapshot functions still exist.
    'function clientCapabilitySnapshot(reason',
    'function clientGpuSnapshot(reason',
    'WEBGL_debug_renderer_info',
    'webgpuAvailable',
    # The diagnostics stats snapshot still INVOKES the client-capability snapshot to embed it
    # (now passed a reason arg: clientCapabilities: clientCapabilitySnapshot(capabilityReason)).
    'clientCapabilitySnapshot(capabilityReason)',
    # ...and the snapshot fn is still EXPORTED from the runtime's return/delegate object.
    'clientCapabilitySnapshot,',
    # Metric keys read back via bracket access keep their double-quoted dotted form in both
    # owners (telemetryRuntime consumer) and the dist.
    '"completion.compute.ms"',
    '"popup.render.ms"',
    '"diagnostics.refresh.ms"',
    # The old dotted metric-key string literals were reorganized into nested snapshot object
    # keys; re-pointed to the current surfaced keys (same counters, current location).
    'observerStats.callbacks',          # was "observer.callbacks.count"
    'state.diagnosticsStats?.skippedClean',   # was "scheduler.skipped.clean"
    'state.diagnosticsStats?.skippedHidden',  # was "scheduler.skipped.hidden"
    'activeCache.hit',                  # was "activeEditor.cache.hit"
    'activeCache.miss',                 # was "activeEditor.cache.miss"
    'observerStats',
    'diagnosticsStats',
    'activeEditorCache',
    'recordPerformanceEvent("observer-callback"',
    'recordPerformanceEvent("scheduler-skipped-clean"',
    'recordPerformanceEvent("active-editor-cache-hit"',
]

# Metric-key / boolean tokens whose QUOTE or SPACING differs between the source modules (single
# quotes / spaced) and the minified dist (double quotes / packed) — esbuild re-quotes string
# literals and strips whitespace. Accept either form so the SAME fact is asserted in both,
# mirroring the (a or b or c) minification tolerance in
# tests/test_codemirror_observer_containment_static.py.
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
    "Performance diagnostics hardening static test\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PERFORMANCE DIAGNOSTICS HARDENING STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("PERFORMANCE DIAGNOSTICS HARDENING STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
