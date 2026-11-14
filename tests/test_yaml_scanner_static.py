#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/yaml/yamlScanner.js"
LEGACY = ROOT / "src/main.legacy.js"
# The monolith was decomposed: the active runtime's YAML-scanner consumption moved out of
# src/main.legacy.js into the extracted src/yaml/runtimeContextAdapter.js (the pure detectContext
# adapter, which imports the scanner functions from yamlScanner.js). The invariant — the runtime
# wires the YAML scanner machinery — now lives there, so this test checks the current owner.
ADAPTER = ROOT / "src/yaml/runtimeContextAdapter.js"
REPORT = ROOT / "reports/YAML_SCANNER_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")
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

# Tokens the legacy composition root still references directly (provider-delegate surface +
# detectContext wiring): the runtime still consumes these YAML scanner symbols here.
legacy_tokens = [
    "yamlPathText",
    "recentYamlText",
    "yamlFocusKind",
    "detectContext",
]

for token in legacy_tokens:
    if token not in legacy:
        errors.append(f"Legacy lost YAML scanner token: {token}")
    else:
        notes.append(f"PASS legacy YAML scanner token: {token}")

# Decomposition: yamlCursorRole/yamlCurrentKey/isCommentContext are no longer consumed inline in
# main.legacy.js — the active runtime's per-keystroke YAML role/key/comment classification moved
# into the extracted detectContext adapter (src/yaml/runtimeContextAdapter.js), which imports them
# from the scanner and calls them. Same invariant (the runtime wires these scanner helpers),
# current location.
for token in [
    "yamlCursorRole",
    "yamlCurrentKey",
    "isCommentContext",
]:
    if token not in adapter:
        errors.append(f"Runtime context adapter lost YAML scanner token: {token}")
    else:
        notes.append(f"PASS adapter YAML scanner token: {token}")

# v31.6.370: currentYamlPath/yamlBranchState are no longer runtime-local bodies; the runtime calls
# the extracted scanner/runtime-context helpers directly. The "...FromYamlScannerModule" /
# "...FromRuntimeContextAdapterModule" import aliases were the original wiring form; commit e509f8f
# ("kill FromModule import-alias ceremony") renamed them to plain identifiers. The wiring invariant
# is unchanged — only the alias spelling moved — so check the current real wiring:
#   * currentYamlPath: imported from the scanner into the runtime-context adapter, which the legacy
#     runtime drives (the extracted YAML-path helper is wired through runtimeContextAdapter.js).
#   * dashboardActionBranchState: imported by main.legacy.js from runtimeContextAdapter.js and wired
#     as the runtime's yamlBranchState.
wiring_checks = [
    (adapter, "currentYamlPath", "src/yaml/runtimeContextAdapter.js wires extracted scanner YAML-path helper (currentYamlPath)"),
    (legacy, "import { dashboardActionBranchState } from './yaml/runtimeContextAdapter.js';",
     "legacy imports extracted runtime-context branch-state helper (dashboardActionBranchState)"),
    (legacy, "yamlBranchState: dashboardActionBranchState",
     "legacy wires dashboardActionBranchState as the runtime yamlBranchState"),
]
for haystack, token, label in wiring_checks:
    if token not in haystack:
        errors.append(f"Lost extracted YAML helper wiring: {label}")
    else:
        notes.append(f"PASS extracted YAML helper wiring: {label}")

# v31.1 context-shape tokens: the detectContext result carries focusKind + pathText. The scanner
# module owns the result shape (yamlScanner.js builds {..., pathText, focusKind}); the runtime
# consumption of that shape moved out of main.legacy.js into the extracted detectContext adapter
# (runtimeContextAdapter.js, which derives focusKind/pathText per request). Same invariant — the
# context object exposes focusKind + pathText — checked at both current owners.
for token in ["focusKind", "pathText"]:
    if token not in module:
        errors.append(f"Expected v31.1 context token missing from YAML scanner module: {token}")
    elif token not in adapter:
        errors.append(f"Expected v31.1 context token missing from runtime context adapter: {token}")
    else:
        notes.append(f"PASS v31.1 context token: {token}")

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
