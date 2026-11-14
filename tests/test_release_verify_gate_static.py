#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / "tools/verify.py"
BUILD = ROOT / "tools/build.py"
REPORT = ROOT / "reports/RELEASE_VERIFY_GATE_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

verify = VERIFY.read_text(encoding="utf-8", errors="replace")
build = BUILD.read_text(encoding="utf-8", errors="replace")

for token in [
    "--release",
    "RELEASE_MODE",
    "run_release_mode_checks()",
    "BUILD_LAST.txt not found; run tools/build.py first, then verify --release.",
    "BUILD_LAST project version must match PROJECT.json version",
    "BUILD_LAST dist SHA must match current dist",
    "Release verify forbids fallback build mode",
    "hacs.json public name must be Nostrodomus in release mode",
]:
    require(token in verify, f"verify.py contains release gate token: {token}")

for token in [
    "Project version:",
    "Package version:",
    "Internal version:",
    "Source SHA256:",
    "Dist SHA256:",
    "Fallback mode:",
    "Node version:",
    "esbuild version:",
]:
    require(token in build, f"build.py writes release metadata field: {token}")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Release verify gate static test\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("RELEASE VERIFY GATE STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("RELEASE VERIFY GATE STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
