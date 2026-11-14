#!/usr/bin/env python3
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ALLOWLIST = ROOT / "docs" / "contracts" / "MODULE_WIRING_ALLOWLIST.json"
TOOL = ROOT / "tools" / "check_module_wiring.py"

errors = []
for path in [ALLOWLIST, TOOL]:
    if not path.exists():
        errors.append(f"missing required file: {path.relative_to(ROOT)}")

if ALLOWLIST.exists():
    data = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
    allowed = data.get("allowed_unwired_modules")
    if not isinstance(allowed, dict):
        errors.append("allowed_unwired_modules must be an object")
    else:
        for rel, reason in allowed.items():
            if not str(rel).startswith("src/") or not str(rel).endswith(".js"):
                errors.append(f"allowlist path must be src/**/*.js: {rel}")
            if not str(reason).strip():
                errors.append(f"allowlist entry needs rationale: {rel}")
            if not (ROOT / rel).exists():
                errors.append(f"allowlisted module does not exist: {rel}")

if TOOL.exists():
    proc = subprocess.run([sys.executable, str(TOOL)], cwd=str(ROOT), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
    if proc.returncode != 0:
        errors.append("tools/check_module_wiring.py failed:\n" + proc.stdout[-2000:])

if errors:
    print("MODULE WIRING GUARD STATIC TEST FAILED")
    for err in errors:
        print("ERROR:", err)
    raise SystemExit(1)

print("MODULE WIRING GUARD STATIC TEST OK")
