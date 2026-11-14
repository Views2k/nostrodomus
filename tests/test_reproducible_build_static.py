#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "verify_reproducible_build.py"
BUILD = ROOT / "tools" / "build.py"
CI = ROOT / ".github" / "workflows" / "ci.yml"
PACKAGE = ROOT / "package.json"

errors = []
for path in [TOOL, BUILD, CI, PACKAGE]:
    if not path.exists():
        errors.append(f"missing required file: {path.relative_to(ROOT)}")

if TOOL.exists():
    text = TOOL.read_text(encoding="utf-8", errors="replace")
    for token in ["TemporaryDirectory", "--require-esbuild", "--external:/local/*", "Committed dist SHA256", "Temp build SHA256", "build_esbuild_failure_hint", "Attempted:", "safe_write_report_text", "PermissionError", "REPRODUCIBLE BUILD WARN"]:
        if token not in text:
            errors.append(f"verify_reproducible_build.py missing token: {token}")

if BUILD.exists():
    build_text = BUILD.read_text(encoding="utf-8", errors="replace")
    if "--external:/local/*" not in build_text:
        errors.append("tools/build.py must keep /local external import protection")

if CI.exists():
    ci_text = CI.read_text(encoding="utf-8", errors="replace")
    if "npm run verify:reproducible" not in ci_text:
        errors.append("CI must run npm run verify:reproducible after npm ci")
    if "npm run check:modules" not in ci_text:
        errors.append("CI must run npm run check:modules")

if PACKAGE.exists():
    package_text = PACKAGE.read_text(encoding="utf-8", errors="replace")
    if '"verify:reproducible"' not in package_text:
        errors.append("package.json missing verify:reproducible script")
    if '"check:modules"' not in package_text:
        errors.append("package.json missing check:modules script")

# Run the reproducible build only when the dependency is already available. The
# CI path installs it with npm ci; HA shells may use this static test without a
# full node_modules tree.
local_esbuild = ROOT / "node_modules" / ".bin" / ("esbuild.cmd" if sys.platform.startswith("win") else "esbuild")
if TOOL.exists() and local_esbuild.exists():
    proc = subprocess.run([sys.executable, str(TOOL), "--require-esbuild"], cwd=str(ROOT), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
    if proc.returncode != 0:
        errors.append("reproducible build check failed:\n" + proc.stdout[-2000:])

if errors:
    print("REPRODUCIBLE BUILD STATIC TEST FAILED")
    for err in errors:
        print("ERROR:", err)
    raise SystemExit(1)

print("REPRODUCIBLE BUILD STATIC TEST OK")
