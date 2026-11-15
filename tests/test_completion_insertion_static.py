#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/completion/insertion.js"
APP = ROOT / "src/app.js"
FACTORY = ROOT / "src/composition/appCompletionRuntimeFactory.js"
RUNTIME = ROOT / "src/completion/insertionRuntime.js"
REPORT = ROOT / "reports/COMPLETION_INSERTION_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
app = APP.read_text(errors="replace")
factory = FACTORY.read_text(errors="replace")
runtime = RUNTIME.read_text(errors="replace")

errors = []
notes = []

required = [
    "export function parseSnippetTemplate",
    "export function hasSnippetPlaceholders",
    "export function clearSnippetSession",
    "export function selectSnippetPlaceholder",
    "export function startSnippetSession",
    "export function moveSnippetPlaceholder",
    "export function updateSnippetSessionAfterDispatch",
    "export function leadingWhitespace",
    "export function indentLinesAfterFirst",
    "export function itemKeyName",
    "export function branchableValueAccepted",
    "export function continuationForAcceptedItem",
    "export function prepareInsertText",
    "export function insertItem",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

runtime_delegate_tokens = [
    "insertItem(state, item",
    "clearSnippetSession(state)",
    "moveSnippetPlaceholder(state, direction",
    "updateSnippetSessionAfterDispatch(state, view, oldDocLength, oldSel",
]

for token in runtime_delegate_tokens:
    if token not in runtime:
        errors.append(f"Insertion runtime is missing insertion/snippet delegate token: {token}")
    else:
        notes.append(f"PASS runtime delegate token: {token}")

for token in ["createAppCompletionRuntimeGroup", "insertItem,", "updateSnippetSessionAfterDispatch,"]:
    if token not in app:
        errors.append(f"app.js is missing completion group adapter token: {token}")
    else:
        notes.append(f"PASS app.js completion group adapter token: {token}")

for token in ["createCompletionInsertionRuntime", "createCompletionInsertionRuntimeDelegates", "insertItem } = createCompletionInsertionRuntimeDelegates"]:
    if token not in factory:
        errors.append(f"Completion factory is missing insertion runtime owner token: {token}")
    else:
        notes.append(f"PASS completion factory runtime owner token: {token}")

local_copy_tokens = [
    "function prepareInsertText(rawInsert, ctx, item)",
    "function continuationForAcceptedItem(ctx, item)",
    "const ACTION_BRANCHES = Object.freeze",
]

for token in local_copy_tokens:
    if token in app:
        errors.append(f"app.js has its own copy of an insertion helper: {token}")
    else:
        notes.append(f"PASS app.js has no copy of: {token}")

required_behavior_tokens = [
    "dispatch",
    "selection",
    "snippet",
    "placeholder",
    "indent",
    "completion",
    "cursor",
]

for token in required_behavior_tokens:
    if token not in module:
        errors.append(f"Expected behavior token missing from insertion module: {token}")
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
        errors.append(f"Forbidden token in completion insertion module: {forbidden}")

REPORT.write_text(
    "Completion insertion static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("COMPLETION INSERTION STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("COMPLETION INSERTION STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
