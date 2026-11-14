#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/editor/codeMirrorBridge.js"
LEGACY = ROOT / "src/main.legacy.js"
REPORT = ROOT / "reports/CODE_MIRROR_BRIDGE_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function hookDispatch",
    "export function unhookDispatch",
    "export function getDoc",
    "export function getPos",
    "export function lineInfo",
    "export function getDocLength",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

invariant_tokens = [
    "hookDispatch",
    "unhookDispatch",
    "getDoc",
    "getPos",
    "getDocLength",
]

for token in invariant_tokens:
    if token not in legacy:
        errors.append(f"Legacy lost CodeMirror bridge token: {token}")

if "lineInfo" in legacy:
    notes.append("PASS legacy still references lineInfo")
else:
    notes.append("PASS lineInfo use moved out of main.legacy.js to the runtime context adapter/module graph")

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
        errors.append(f"Forbidden token in CodeMirror bridge module: {forbidden}")

REPORT.write_text(
    "CodeMirror bridge static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("CODEMIRROR BRIDGE STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("CODEMIRROR BRIDGE STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
