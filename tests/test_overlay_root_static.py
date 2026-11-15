#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/editor/overlayRoot.js"
APP = ROOT / "src/app.js"
# Defines CM_ROOT_CANDIDATES, the CodeMirror panes the overlay module scans for the root.
SELECTORS = ROOT / "src/editor/haSelectors.js"
REPORT = ROOT / "reports/OVERLAY_ROOT_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
app = APP.read_text(errors="replace")
selectors = SELECTORS.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function nostrodomusWalkOpenRoots",
    "export function nostrodomusFindActiveCodeEditorRoot",
    "export function nostrodomusCodeEditorOverlayRoot",
    "export function overlayRoot",
    "nostrodomus-cm-root-overlay-host",
    "cm-root-completions-overlay",
    "CM_ROOT_CANDIDATES",
    '"pointer-events", "none"',
    '"z-index", "2147483647"',
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

if '".cm-content, .cm-editor, .cm-scroller"' in selectors and "CM_ROOT_CANDIDATES" in selectors:
    notes.append("PASS CM_ROOT_CANDIDATES resolves to the .cm-content/.cm-editor/.cm-scroller selector")
else:
    errors.append("CM_ROOT_CANDIDATES in src/editor/haSelectors.js must be the .cm-content, .cm-editor, .cm-scroller selector")

for forbidden in [
    "showPopover",
    "hidePopover",
    ":popover-open",
    'setAttribute("popover"',
    "setAttribute('popover'",
    "onOverlayPointerCapture",
    "elementFromPoint",
]:
    if forbidden in module:
        errors.append(f"Forbidden token in overlay module: {forbidden}")

# app.js imports the overlay-root module and uses its delegates.
for token in [
    "nostrodomusCodeEditorOverlayRoot",
    "overlayRoot",
    "./editor/overlayRoot.js",
]:
    if token not in app:
        errors.append(f"app.js is missing overlay owner wiring: {token}")
    else:
        notes.append(f"PASS app.js wires overlay owner: {token}")

REPORT.write_text(
    "Overlay root static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("OVERLAY ROOT STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("OVERLAY ROOT STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
