#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
SRC_MAIN = (ROOT / "src" / "app.js").read_text(encoding="utf-8", errors="replace")
CHANGELOG_MODULE_PATH = ROOT / "src" / "core" / "changelogSummary.js"
SRC_CHANGELOG = CHANGELOG_MODULE_PATH.read_text(encoding="utf-8", errors="replace") if CHANGELOG_MODULE_PATH.exists() else ""
SRC = SRC_MAIN + "\n" + SRC_CHANGELOG
DIST = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8", errors="replace")
version = str(PROJECT.get("version") or "")

def fail(message):
    print(message)
    raise SystemExit(1)

if not version:
    fail("PROJECT.json version missing")

summary_match = re.search(r"const CHANGELOG_SUMMARY = Object\.freeze\(\[\s*\{\s*version: \"([^\"]+)\"", SRC, flags=re.S)
if not summary_match:
    fail("CHANGELOG_SUMMARY first entry not found in src/app.js or src/core/changelogSummary.js")
if summary_match.group(1) != version:
    fail(f"CHANGELOG_SUMMARY first entry {summary_match.group(1)} does not match PROJECT.json version {version}")

for label, text in [("src", SRC), ("dist", DIST)]:
    # dist is whitespace-minified; accept both spacings.
    if f'version: "{version}"' not in text and f'version:"{version}"' not in text:
        fail(f"{label} missing current version in in-app CHANGELOG_SUMMARY")
    # Only the last releases are kept, so the test checks the data is there, not a note text.
    if "CHANGELOG_SUMMARY" not in text:
        fail(f"{label} missing in-app CHANGELOG_SUMMARY data")

print("IN-APP CHANGELOG CURRENT STATIC TEST OK")
