#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/providers/providerRegistry.js"
LEGACY = ROOT / "src/main.legacy.js"
REPORT = ROOT / "reports/PROVIDER_REGISTRY_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function registerProvider",
    "export function providerCandidates",
    "export function providerSummary",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

invariant_tokens = [
    "registerProvider",
    "providerCandidates",
    "providerSummary",
]

for token in invariant_tokens:
    if token not in legacy:
        errors.append(f"Legacy lost provider registry token: {token}")

required_behavior_tokens = [
    "provider",
    "candidate",
    "row",
]

for token in required_behavior_tokens:
    if token not in module:
        errors.append(f"Expected behavior token missing from provider registry module: {token}")
    else:
        notes.append(f"PASS behavior token: {token}")

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
]:
    if forbidden in module:
        errors.append(f"Forbidden token in provider registry module: {forbidden}")

REPORT.write_text(
    "Provider registry static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("PROVIDER REGISTRY STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("PROVIDER REGISTRY STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
