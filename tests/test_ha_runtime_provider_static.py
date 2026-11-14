#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import re
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/providers/haRuntimeProvider.js"
LEGACY = ROOT / "src/main.legacy.js"
REPORT = ROOT / "reports/HA_RUNTIME_PROVIDER_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function findHass",
    "export function runtimeData",
    "export function yamlValueKind",
    "export function yamlBlockValueKeyKind",
    "export function runtimeRowsForKind",
    "export function haRuntimeValueProvider",
    "export function runtimeSummary",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

required_behavior_tokens = [
    "hass",
    "states",
    "services",
    "entity",
    "domain",
    "runtime",
    "provider",
    "row",
    "yamlFocusKind",
    "target-block",
    "style-block",
]

for token in required_behavior_tokens:
    if token not in module:
        errors.append(f"Expected behavior token missing from HA runtime provider module: {token}")
    else:
        notes.append(f"PASS behavior token: {token}")

for token in [
    "findHass",
    "runtimeData",
    "runtimeRowsForKind",
    "haRuntimeValueProvider",
    "runtimeSummary",
]:
    if token not in legacy:
        errors.append(f"Legacy lost HA runtime provider token: {token}")

# document access is allowed in this module only for findHass.
m = re.search(r'export function findHass\s*\([^)]*\)\s*\{[\s\S]*?\n  \}', module)
if "document." in module:
    if not m or "document." not in m.group(0):
        errors.append("document access exists outside detectable findHass block")
    remaining = module.replace(m.group(0), "") if m else module
    if "document." in remaining:
        errors.append("document access must be limited to findHass only")
    else:
        notes.append("PASS document access limited to findHass")

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
    "window.",
]:
    if forbidden in module:
        errors.append(f"Forbidden token in HA runtime provider module: {forbidden}")

for token in [
    "isAutomationScriptContext",
    "trigger-type",
    "condition-type",
    "automation-mode",
    "perform_action",
]:
    if token not in module:
        errors.append(f"Expected v31.2 coverage token missing: {token}")
    else:
        notes.append(f"PASS v31.2 token: {token}")

REPORT.write_text(
    "HA runtime provider static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("HA RUNTIME PROVIDER STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("HA RUNTIME PROVIDER STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
