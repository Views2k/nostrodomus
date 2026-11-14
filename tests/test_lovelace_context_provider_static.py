#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/providers/lovelaceContextProvider.js"
LEGACY = ROOT / "src/main.legacy.js"
REPORT = ROOT / "reports/LOVELACE_CONTEXT_PROVIDER_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function contextRow",
    "export function rowSet",
    "export function yamlPathText",
    "export function recentYamlText",
    "export function looksLikeButtonCardContext",
    "export function lovelaceContextRows",
    "export function lovelaceContextProvider",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

required_behavior_tokens = [
    "lovelace",
    "context",
    "row",
    "provider",
    "yaml",
    "button-card",
]

for token in required_behavior_tokens:
    if token not in module:
        errors.append(f"Expected behavior token missing from Lovelace context provider module: {token}")
    else:
        notes.append(f"PASS behavior token: {token}")

if "export function contextRow(id, type, label, insert, aliases = [], meta = {}, options = {})" not in module:
    errors.append("contextRow signature with injectable options was not preserved")

if "return item" not in module:
    errors.append("contextRow behavior appears incomplete; missing return item")
else:
    notes.append("PASS contextRow complete")

for token in [
    "contextRow",
    "rowSet",
    "looksLikeButtonCardContext",
    "lovelaceContextRows",
    "lovelaceContextProvider",
]:
    if token not in legacy:
        errors.append(f"Legacy lost Lovelace context provider token: {token}")

if "export function detectContext" in module:
    errors.append("Lovelace context provider must not absorb detectContext")

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
        errors.append(f"Forbidden token in Lovelace context provider module: {forbidden}")

for token in [
    "automation-action",
    "trigger-block",
    "condition-block",
    "perform_action:",
    "wait_for_trigger:",
    "visibility:",
]:
    if token not in module:
        errors.append(f"Expected v31.2 coverage token missing: {token}")
    else:
        notes.append(f"PASS v31.2 token: {token}")

REPORT.write_text(
    "Lovelace context provider static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("LOVELACE CONTEXT PROVIDER STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("LOVELACE CONTEXT PROVIDER STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
