#!/usr/bin/env python3
# HACS and the Home Assistant Marketplace install the plugin from hacs.json and show the README.
#
# 0.1.279 named the plugin file with its path and set content_in_root, so both installers
# downloaded nothing. On the repository page they also do not rewrite relative paths inside HTML
# or in the link target of a linked badge, so those showed as broken. This test keeps both fixed.

from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
HACS = ROOT / "hacs.json"
PROJECT = ROOT / "PROJECT.json"
README = ROOT / "README.md"

errors = []
hacs = json.loads(HACS.read_text(encoding="utf-8"))
project = json.loads(PROJECT.read_text(encoding="utf-8"))
readme = README.read_text(encoding="utf-8")

filename = str(hacs.get("filename") or "")
if filename != Path(project["dist_entry"]).name:
    errors.append(f"hacs.json filename {filename!r} must be the file name of dist_entry {project['dist_entry']!r}")
if "/" in filename:
    errors.append("hacs.json filename must not contain a path")
if hacs.get("content_in_root"):
    errors.append("hacs.json must not set content_in_root")
if not (ROOT / "dist" / filename).exists():
    errors.append(f"dist/{filename} must exist")

for src in re.findall(r'<img\s[^>]*src="([^"]+)"', readme):
    if not src.startswith("https://"):
        errors.append(f"README <img> src must be an absolute https URL, found {src!r}")
for target in re.findall(r"\[!\[[^\]]*\]\([^)]*\)\]\(([^)]+)\)", readme):
    if not target.startswith("https://"):
        errors.append(f"README badge link target must be an absolute https URL, found {target!r}")

if errors:
    print("HACS LAYOUT STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    sys.exit(1)
print("HACS LAYOUT STATIC TEST OK")
