#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/editor/activeEditor.js"
APP = ROOT / "src/app.js"
REPORT = ROOT / "reports/ACTIVE_EDITOR_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
app = APP.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function visible",
    "export function closestFromPath",
    "export function composedContains",
    "export function homeRoot",
    "export function activeEditDialog",
    "export function pathHasEditorSurface",
    "export function pathInsideActiveDialog",
    "export function isNostrodomusUiEvent",
    "export function isScopedEditorEvent",
    "export function looksLikeView",
    "export function isViewAllowed",
    "export function viewFromEvent",
    "export function rememberView",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

invariant_tokens = [
    "isScopedEditorEvent",
    "pathHasEditorSurface",
    "pathInsideActiveDialog",
    "isNostrodomusUiEvent",
    "rememberView",
]

for token in invariant_tokens:
    if token not in app:
        errors.append(f"app.js is missing active-editor invariant token: {token}")

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
        errors.append(f"Forbidden token in active editor module: {forbidden}")

REPORT.write_text(
    "Active editor static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("ACTIVE EDITOR STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("ACTIVE EDITOR STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
