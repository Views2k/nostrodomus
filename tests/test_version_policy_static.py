#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/VERSION_POLICY_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")

require(re.fullmatch(r"\d+\.\d+\.\d+", version) is not None, "PROJECT.json version is strict SemVer")
require(internal.startswith(f"nostrodomus-v{version}-"), "internal_version includes the current project version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Version policy static test report\n\n"
    f"Version: {version}\n"
    f"Internal version: {internal}\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("VERSION POLICY STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("VERSION POLICY STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
