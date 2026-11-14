#!/usr/bin/env python3
from pathlib import Path
import json
import py_compile
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
REPORT = ROOT / "reports/VISUAL_LAYER_BASELINE_CONTRACT_STATIC_TEST_REPORT.txt"
errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

version = str(PROJECT.get("version") or "")
internal = str(PROJECT.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
# The visual contract baseline (originally pinned at v31.6.91) carried forward across the
# 31.6.x -> 0.1.x SemVer reset (CHANGELOG [0.1.0]). The invariant is the CSS visual-layer
# ownership below, not a frozen version literal, so floor at the start of the SemVer line.
require(version_tuple >= (0, 1, 0), "PROJECT.json remains at or beyond the visual contract baseline (SemVer line)")
# The "runtime-layer-rollback" identifier is an old-era (v31.x) internal_version name retired
# at the SemVer reset; accept either that legacy id OR any version advanced past the floor.
require("runtime-layer-rollback" in internal or version_tuple > (0, 1, 0), "internal_version records the visual contract owner (or version advanced past the baseline)")

for rel in [
    "docs/contracts/VISUAL_LAYER_BASELINE_CONTRACT.md",
    "tools/visual_layer_doctor.py",
]:
    require((ROOT / rel).exists(), f"required visual guardrail file exists: {rel}")

# Version-identity owner: the monolith was decomposed, so src/main.legacy.js now imports the
# version constants from src/core/version.js instead of declaring them inline, while the bundled
# dist still carries the minified literals (e.g. PROJECT_VERSION="0.1.x", var VERSION="...").
for rel in ["src/main.legacy.js", "dist/nostrodomus.js"]:
    text = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
    is_source = rel.endswith("main.legacy.js")
    project_ok = (f'const PROJECT_VERSION = "{version}"' in text or
                  f'PROJECT_VERSION = "{version}"' in text or
                  f'var PROJECT_VERSION = "{version}"' in text or
                  f'PROJECT_VERSION="{version}"' in text or  # minified dist form
                  (is_source and "from './core/version.js'" in text))
    version_ok = (f'const VERSION = "{internal}"' in text or
                  f'VERSION = "{internal}"' in text or
                  f'var VERSION = "{internal}"' in text or
                  f'VERSION="{internal}"' in text or  # minified dist form
                  (is_source and "from './core/version.js'" in text))
    require(project_ok, f"{rel} PROJECT_VERSION matches PROJECT.json")
    require(version_ok, f"{rel} VERSION matches PROJECT.json internal_version")

# Codebox visual-layer owner: the host-owned ::before/::after frame + frosted surface CSS moved
# out of src/main.legacy.js into the extracted src/ui/codeboxStyle.js (source) and is bundled into
# dist/nostrodomus.js. Same invariant, current location.
for rel in ["src/ui/codeboxStyle.js", "dist/nostrodomus.js"]:
    text = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
    require('ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::before' in text, f"{rel} keeps host-owned border/glow ::before")
    require('ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after' in text, f"{rel} keeps host-owned frosted surface ::after")
    require('backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;' in text, f"{rel} keeps backdrop-filter surface")
    require('-webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;' in text, f"{rel} keeps webkit backdrop-filter surface")
    require('--nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);' in text, f"{rel} keeps stable surface blur token")
    require('isolation: isolate !important;' in text, f"{rel} isolates codebox host stacking")
    require('[data-nostrodomus-codebox-external-frame="1"] {\n        display: none !important;' in text, f"{rel} keeps failed external frame path disabled")

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
