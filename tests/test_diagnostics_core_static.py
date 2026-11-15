#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/diagnostics/diagnosticsCore.js"
APP = ROOT / "src/app.js"
TELEMETRY_RUNTIME = ROOT / "src/diagnostics/diagnosticsRuntime.js"
REPORT = ROOT / "reports/DIAGNOSTICS_CORE_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
app = APP.read_text(errors="replace")
telemetry_runtime = TELEMETRY_RUNTIME.read_text(errors="replace") if TELEMETRY_RUNTIME.exists() else ""
source_owner = app + "\n" + telemetry_runtime

errors = []
notes = []

required = [
    "export function safeContextSummary",
    "export function diagnosticsReadoutString",
    "export function diagnosticsReadoutBool",
    "export function diagnosticsReadoutSafeWarnings",
    "export function diagnosticsReadoutSummary",
    "export function redactDiagnosticsUserText",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

required_behavior_tokens = [
    "diagnostics",
    "summary",
]

for token in required_behavior_tokens:
    if token not in module:
        errors.append(f"Expected behavior token missing from diagnostics core module: {token}")
    else:
        notes.append(f"PASS behavior token: {token}")

for token in [
    "safeContextSummary",
    "diagnosticsReadoutBundle",
]:
    if token not in source_owner:
        errors.append(f"Source owner is missing diagnostics core token: {token}")

for forbidden in [
    "showPopover",
    "hidePopover",
    ":popover-open",
    'setAttribute("popover"',
    "setAttribute('popover'",
    "onOverlayPointerCapture",
    "elementFromPoint",
    "fetch(",
    "sendBeacon",
    "eval(",
    "new Function",
    "localStorage",
    "document.",
    "window.",
    "innerHTML",
]:
    if forbidden in module:
        errors.append(f"Forbidden token in diagnostics core module: {forbidden}")

REPORT.write_text(
    "Diagnostics core static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("DIAGNOSTICS CORE STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("DIAGNOSTICS CORE STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
