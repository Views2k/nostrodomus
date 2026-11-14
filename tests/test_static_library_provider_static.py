#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/providers/staticLibraryProvider.js"
LEGACY = ROOT / "src/main.legacy.js"
REPORT = ROOT / "reports/STATIC_LIBRARY_PROVIDER_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")

errors = []
notes = []

required = [
    "export async function loadLibrary",
    "export function sanitizeLibraryRow",
    "export function normalizeItem",
    "export function clearCompletionCache",
    "export function cacheSet",
    "export function staticLibraryProvider",
    "export function buildIndex",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

required_behavior_tokens = [
    "library",
    "row",
    "normalize",
    "cache",
    "provider",
    "static",
]

for token in required_behavior_tokens:
    if token not in module:
        errors.append(f"Expected behavior token missing from static library provider module: {token}")
    else:
        notes.append(f"PASS behavior token: {token}")

for token in [
    "loadLibrary",
    "sanitizeLibraryRow",
    "normalizeItem",
    "staticLibraryProvider",
    "buildIndex",
]:
    if token not in legacy:
        errors.append(f"Legacy lost static provider token: {token}")


for token in [
    "export const BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1",
    "export const BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1",
    "nostrodomus-library-bundled",
]:
    if token not in module:
        errors.append(f"Bundled static library ownership missing from module: {token}")
    else:
        notes.append(f"PASS bundled library ownership token: {token}")

for token in [
    "const BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1",
    "const BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1",
]:
    if token in legacy:
        errors.append(f"Legacy still owns bundled static library catalog token: {token}")
    else:
        notes.append(f"PASS legacy no longer owns bundled catalog token: {token}")

if "export function loadLibrary()" in module:
    errors.append("loadLibrary lost async modifier in extracted source")

if "export async function loadLibrary()" not in module:
    errors.append("loadLibrary must remain async in extracted source")

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
    "document.",
    "window.",
]:
    if forbidden in module:
        errors.append(f"Forbidden token in static library provider module: {forbidden}")

REPORT.write_text(
    "Static library provider static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("STATIC LIBRARY PROVIDER STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("STATIC LIBRARY PROVIDER STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
