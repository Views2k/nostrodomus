#!/usr/bin/env python3
from pathlib import Path
import py_compile
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reports/VISUAL_LAYER_BASELINE_CONTRACT_STATIC_TEST_REPORT.txt"
errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

for rel in [
    "docs/contracts/VISUAL_LAYER_BASELINE_CONTRACT.md",
    "tools/visual_layer_doctor.py",
]:
    require((ROOT / rel).exists(), f"required visual guardrail file exists: {rel}")

# The host's ::before draws the border and glow, its ::after the frosted surface.
for rel in ["src/ui/codeboxStyle.js", "dist/nostrodomus.js"]:
    text = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
    require('ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::before' in text, f"{rel} keeps host-owned border/glow ::before")
    require('ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after' in text, f"{rel} keeps host-owned frosted surface ::after")
    require('backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;' in text, f"{rel} keeps backdrop-filter surface")
    require('-webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;' in text, f"{rel} keeps webkit backdrop-filter surface")
    require('--nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);' in text, f"{rel} keeps stable surface blur token")
    require('isolation: isolate !important;' in text, f"{rel} isolates codebox host stacking")
    require('[data-nostrodomus-codebox-external-frame="1"] {\n        display: none !important;' in text, f"{rel} keeps the measured external frame disabled")

for rel, tokens in {
    "docs/contracts/VISUAL_LAYER_BASELINE_CONTRACT.md": ["::before = border and glow owner", "::after  = frosted blurry surface/backdrop owner"],
}.items():
    text = (ROOT / rel).read_text(encoding="utf-8", errors="replace") if (ROOT / rel).exists() else ""
    for token in tokens:
        require(token in text, f"{rel} includes token: {token}")

try:
    py_compile.compile(str(ROOT / "tools/visual_layer_doctor.py"), doraise=True)
    notes.append("PASS tools/visual_layer_doctor.py compiles")
except Exception as exc:
    errors.append(f"tools/visual_layer_doctor.py does not compile: {exc}")

proc = subprocess.run([sys.executable, str(ROOT / "tools/visual_layer_doctor.py"), "--json"], cwd=str(ROOT), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
require(proc.returncode == 0, "visual_layer_doctor.py passes")
if proc.returncode != 0:
    errors.append(proc.stdout[-1200:])

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Visual layer baseline contract static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("VISUAL LAYER BASELINE CONTRACT STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("VISUAL LAYER BASELINE CONTRACT STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
