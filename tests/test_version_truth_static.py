#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "PROJECT.json"
PACKAGE = ROOT / "package.json"
PACKAGE_LOCK = ROOT / "package-lock.json"
LEGACY = ROOT / "src/main.legacy.js"
VERSION_MODULE = ROOT / "src/core/version.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/VERSION_TRUTH_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
package = json.loads(PACKAGE.read_text(encoding="utf-8"))
lock = json.loads(PACKAGE_LOCK.read_text(encoding="utf-8"))
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")
legacy = LEGACY.read_text(encoding="utf-8", errors="replace")
version_module = VERSION_MODULE.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")
sha = hashlib.sha256(DIST.read_bytes()).hexdigest()

require(re.fullmatch(r"\d+\.\d+\.\d+", version) is not None, "PROJECT.json version uses strict SemVer")
require(str(package.get("version") or "") == version, "package.json version matches PROJECT.json version")
require(str(lock.get("version") or "") == version, "package-lock.json top-level version matches PROJECT.json version")
require(str(((lock.get("packages") or {}).get("") or {}).get("version") or "") == version, "package-lock.json root package version matches PROJECT.json version")
require(re.search(r'\bPROJECT_VERSION\s*=\s*"' + re.escape(version) + r'"', dist) is not None, "dist PROJECT_VERSION matches PROJECT.json version")
require(internal.startswith(f"nostrodomus-v{version}-"), "internal_version starts with nostrodomus-v<version>-")
require(internal in version_module and "VERSION," in legacy, "src/main.legacy.js imports VERSION from version module matching PROJECT.json internal_version")
require(internal in dist, "dist VERSION matches PROJECT.json internal_version")
require(project.get("release_state") in {"unreleased-workstream", "released"}, "PROJECT.json release_state is explicit")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Version truth static test report\n\n"
    f"Version: {version}\n"
    f"Internal version: {internal}\n"
    f"Dist SHA256: {sha}\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("VERSION TRUTH STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("VERSION TRUTH STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
