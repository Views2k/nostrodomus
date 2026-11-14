#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/editor/overlayRoot.js"
LEGACY = ROOT / "src/main.legacy.js"
# The literal CodeMirror-pane root selector ".cm-content, .cm-editor, .cm-scroller" was
# extracted out of overlayRoot.js into the shared selector constant CM_ROOT_CANDIDATES in
# src/editor/haSelectors.js. The overlay module imports and uses CM_ROOT_CANDIDATES, so the
# invariant (overlay-root selection scans the CodeMirror panes) is unchanged — only its
# canonical text moved. We assert the module uses the constant AND that the constant still
# resolves to the exact selector at its current home.
SELECTORS = ROOT / "src/editor/haSelectors.js"
REPORT = ROOT / "reports/OVERLAY_ROOT_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")
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
    "CM_ROOT_CANDIDATES",  # ".cm-content, .cm-editor, .cm-scroller" now lives in the shared selector constant
    '"pointer-events", "none"',
    '"z-index", "2147483647"',
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

# Verify the moved CodeMirror-pane root selector invariant still holds at its current home:
# CM_ROOT_CANDIDATES must resolve to the exact ".cm-content, .cm-editor, .cm-scroller" selector.
if '".cm-content, .cm-editor, .cm-scroller"' in selectors and "CM_ROOT_CANDIDATES" in selectors:
    notes.append("PASS CM_ROOT_CANDIDATES resolves to the .cm-content/.cm-editor/.cm-scroller selector")
else:
    errors.append("CM_ROOT_CANDIDATES no longer resolves to the CodeMirror-pane root selector in src/editor/haSelectors.js")

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

# The overlay host creation (with the literal id "nostrodomus-cm-root-overlay-host"
# and dataset purpose "cm-root-completions-overlay") was extracted out of src/main.legacy.js
# into src/editor/overlayRoot.js, wired through src/ui/settingsPortalRuntime.js delegates.
# Legacy still OWNS/wires the overlay: it imports from ./editor/overlayRoot.js and consumes the
# overlay-root delegates. Re-point: legacy must still wire the overlay owner symbols, and the
# literal id/purpose tokens must still live in the actual host-creation module (overlayRoot.js).
for token in [
    "nostrodomusCodeEditorOverlayRoot",
    "overlayRoot",
    "./editor/overlayRoot.js",
]:
    if token not in legacy:
        errors.append(f"Legacy lost overlay owner wiring: {token}")
    else:
        notes.append(f"PASS legacy wires overlay owner: {token}")

for token in [
    "nostrodomus-cm-root-overlay-host",
    "cm-root-completions-overlay",
]:
    if token not in module:
        errors.append(f"Overlay module lost overlay-host invariant token: {token}")
    else:
        notes.append(f"PASS overlay module owns host token: {token}")

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
