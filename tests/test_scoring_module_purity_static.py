#!/usr/bin/env python3
from pathlib import Path
import re
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE = PROJECT_ROOT / "src/completion/scoring.js"
REPORT = PROJECT_ROOT / "reports/SCORING_MODULE_PURITY_STATIC_TEST_REPORT.txt"
text = MODULE.read_text(encoding="utf-8", errors="replace")

errors = []
notes = []

for token in [
    "export function scoreItems",
    "export function allowType",
    "export function contextualPenalty",
    "export function itemMatchesYamlValueKind",
    "export function camelMatch",
    "DEFAULT_SCORING_SETTINGS",
]:
    if token not in text:
        errors.append(f"Missing scoring token: {token}")
    else:
        notes.append(f"PASS token: {token}")

for forbidden in ["state", "document", "window"]:
    if re.search(rf"\b{forbidden}\b", text):
        errors.append(f"scoring.js must not reference runtime/global token: {forbidden}")
    else:
        notes.append(f"PASS no token: {forbidden}")

for forbidden in ["querySelector", "addEventListener", "localStorage", "sessionStorage", "fetch(", "sendBeacon", "eval(", "new Function"]:
    if forbidden in text:
        errors.append(f"Forbidden side-effect token in scoring.js: {forbidden}")
    else:
        notes.append(f"PASS no side-effect token: {forbidden}")

REPORT.write_text(
    "Scoring module purity static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SCORING MODULE PURITY STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("SCORING MODULE PURITY STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
