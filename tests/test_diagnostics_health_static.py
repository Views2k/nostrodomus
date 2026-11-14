#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/diagnostics/diagnosticsHealth.js"
LEGACY = ROOT / "src/main.legacy.js"
REPORT = ROOT / "reports/DIAGNOSTICS_HEALTH_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function runtimeSummary",
    "export function providerSummary",
    "export function health",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

required_behavior_tokens = [
    "runtime",
    "provider",
    "health",
    "hasHass",
    "services",
    "entities",
    "lastError",
    "ok",
]

for token in required_behavior_tokens:
    if token not in module:
        errors.append(f"Expected behavior token missing from diagnostics health module: {token}")
    else:
        notes.append(f"PASS behavior token: {token}")

if "export function itemSummary" in module:
    errors.append("diagnosticsHealth.js must not duplicate itemSummary; diagnosticsCore.js owns itemSummary")

for token in [
    "runtimeSummary",
    "providerSummary",
    "health",
]:
    if token not in legacy:
        errors.append(f"Legacy lost diagnostics health token: {token}")

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
        errors.append(f"Forbidden token in diagnostics health module: {forbidden}")

REPORT.write_text(
    "Diagnostics health static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("DIAGNOSTICS HEALTH STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("DIAGNOSTICS HEALTH STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
