#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/completion/scoring.js"
LEGACY = ROOT / "src/main.legacy.js"
REPORT = ROOT / "reports/COMPLETION_SCORING_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function allowType",
    "export function runtimeDomainPriority",
    "export function contextualPenalty",
    "export function hasFocusedContextProviderItems",
    "export function itemMatchesYamlValueKind",
    "export function focusKindTypeBoost",
    "export function semanticItemRank",
    "export function modeRank",
    "export function shouldSuppressStaticForFocusedContext",
    "export function scoreItems",
    "export function camelMatch",
    "export function compute",
    "export function refresh",
    "export function requestLiveUpdate",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

invariant_tokens = [
    "allowType",
    "runtimeDomainPriority",
    "contextualPenalty",
    "hasFocusedContextProviderItems",
    "itemMatchesYamlValueKind",
    "focusKindTypeBoost",
    "semanticItemRank",
    "modeRank",
    "shouldSuppressStaticForFocusedContext",
    "scoreItems",
    "compute",
    "refresh",
    "requestLiveUpdate",
]

for token in invariant_tokens:
    if token not in legacy:
        errors.append(f"Legacy lost completion scoring token: {token}")

required_behavior_tokens = [
    "score",
    "rank",
    "context",
    "provider",
    "completion",
    "refresh",
    "focusKind",
    "valueKind",
]

for token in required_behavior_tokens:
    if token not in module:
        errors.append(f"Expected behavior token missing from scoring module: {token}")
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
]:
    if forbidden in module:
        errors.append(f"Forbidden token in completion scoring module: {forbidden}")

for token in [
    "trigger-block",
    "condition-block",
    "automation-mode",
    "boolean",
]:
    if token not in module:
        errors.append(f"Expected v31.2 coverage token missing: {token}")
    else:
        notes.append(f"PASS v31.2 token: {token}")

REPORT.write_text(
    "Completion scoring static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("COMPLETION SCORING STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("COMPLETION SCORING STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
