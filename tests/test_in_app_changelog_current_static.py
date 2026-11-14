#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
SRC_MAIN = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8", errors="replace")
CHANGELOG_MODULE_PATH = ROOT / "src" / "core" / "changelogSummary.js"
SRC_CHANGELOG = CHANGELOG_MODULE_PATH.read_text(encoding="utf-8", errors="replace") if CHANGELOG_MODULE_PATH.exists() else ""
SRC = SRC_MAIN + "\n" + SRC_CHANGELOG
DIST = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8", errors="replace")
version = str(PROJECT.get("version") or "")
internal = str(PROJECT.get("internal_version") or "")

def fail(message):
    print(message)
    raise SystemExit(1)

if not version or not internal:
    fail("PROJECT.json version/internal_version missing")

summary_match = re.search(r"const CHANGELOG_SUMMARY = Object\.freeze\(\[\s*\{\s*version: \"([^\"]+)\"", SRC, flags=re.S)
if not summary_match:
    fail("CHANGELOG_SUMMARY first entry not found in src/main.legacy.js or src/core/changelogSummary.js")
if summary_match.group(1) != version:
    fail(f"CHANGELOG_SUMMARY first entry {summary_match.group(1)} does not match PROJECT.json version {version}")

for label, text in [("src", SRC), ("dist", DIST)]:
    # dist is whitespace-minified; accept both spacings.
    if f'version: "{version}"' not in text and f'version:"{version}"' not in text:
        fail(f"{label} missing current version in in-app CHANGELOG_SUMMARY")
    # The five-release window legitimately rolls old release notes out; pin the
    # durable structure (summary data present) rather than a one-time note text.
    if "CHANGELOG_SUMMARY" not in text:
        fail(f"{label} missing in-app CHANGELOG_SUMMARY data")
    if label == "dist":
        if internal not in text:
            fail(f"{label} missing current internal version")
    else:
        version_module = (ROOT / "src" / "core" / "version.js").read_text(encoding="utf-8", errors="replace")
        if internal not in text and ("from './core/version.js'" not in SRC_MAIN or internal not in version_module):
            fail(f"{label} missing current internal version or wired version-module import")

print("IN-APP CHANGELOG CURRENT STATIC TEST OK")
