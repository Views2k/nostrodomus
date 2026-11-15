#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/yaml/yamlScanner.js"
APP = ROOT / "src/app.js"
# The detectContext adapter, which imports the scanner functions from yamlScanner.js.
ADAPTER = ROOT / "src/yaml/runtimeContextAdapter.js"
REPORT = ROOT / "reports/YAML_SCANNER_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
app = APP.read_text(errors="replace")
adapter = ADAPTER.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function yamlPathText",
    "export function recentYamlText",
    "export function currentYamlPath",
    "export function yamlCursorRole",
    "export function yamlCurrentKey",
    "export function isCommentContext",
    "export function stripYamlComment",
    "export function directYamlKey",
    "export function yamlBranchState",
    "export function detectContext",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

# Scanner names that app.js uses itself (provider delegates and detectContext wiring).
legacy_tokens = [
    "yamlPathText",
    "recentYamlText",
    "yamlFocusKind",
    "detectContext",
]

for token in legacy_tokens:
    if token not in app:
        errors.append(f"app.js is missing YAML scanner token: {token}")
    else:
        notes.append(f"PASS app.js YAML scanner token: {token}")

# The detectContext adapter classifies the role, key and comment state of each keystroke with
# these scanner helpers.
for token in [
    "yamlCursorRole",
    "yamlCurrentKey",
    "isCommentContext",
]:
    if token not in adapter:
        errors.append(f"Runtime context adapter is missing YAML scanner token: {token}")
    else:
        notes.append(f"PASS adapter YAML scanner token: {token}")

# The runtime context adapter uses currentYamlPath from the scanner; app.js imports
# dashboardActionBranchState from the adapter and uses it as the runtime's yamlBranchState.
wiring_checks = [
    (adapter, "currentYamlPath", "src/yaml/runtimeContextAdapter.js uses the scanner YAML-path helper (currentYamlPath)"),
    (app, "import { dashboardActionBranchState } from './yaml/runtimeContextAdapter.js';",
     "app.js imports the runtime-context branch-state helper (dashboardActionBranchState)"),
    (app, "yamlBranchState: dashboardActionBranchState",
     "app.js wires dashboardActionBranchState as the runtime yamlBranchState"),
]
for haystack, token, label in wiring_checks:
    if token not in haystack:
        errors.append(f"Missing YAML helper wiring: {label}")
    else:
        notes.append(f"PASS YAML helper wiring: {label}")

# The detectContext result carries focusKind and pathText: yamlScanner.js builds that shape and
# the runtime context adapter fills it for each request.
for token in ["focusKind", "pathText"]:
    if token not in module:
        errors.append(f"Expected context token missing from YAML scanner module: {token}")
    elif token not in adapter:
        errors.append(f"Expected context token missing from runtime context adapter: {token}")
    else:
        notes.append(f"PASS context token: {token}")

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
        errors.append(f"Forbidden token in YAML scanner module: {forbidden}")

REPORT.write_text(
    "YAML scanner static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("YAML SCANNER STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("YAML SCANNER STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
