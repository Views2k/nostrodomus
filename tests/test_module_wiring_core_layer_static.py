#!/usr/bin/env python3
# tools/check_module_wiring.py reports every import from src/core/ into another directory of src/,
# and none between modules of src/core/. It is run against a small tree in a temporary directory.
from pathlib import Path
import importlib.util
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "check_module_wiring.py"

spec = importlib.util.spec_from_file_location("check_module_wiring_under_test", TOOL)
wiring = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wiring)

layers = sorted(p.name for p in (ROOT / "src").iterdir() if p.is_dir() and p.name != "core")
errors = []
if not layers:
    errors.append("src/ has no directory besides src/core/")

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp).resolve()
    core = root / "src" / "core"
    core.mkdir(parents=True)
    for name in layers:
        (root / "src" / name).mkdir()
        (root / "src" / name / "mod.js").write_text("export const value = 1;\n", encoding="utf-8")
    (core / "pure.js").write_text("export const pure = 1;\n", encoding="utf-8")
    imports = "".join(f"import {{ value as value{i} }} from '../{name}/mod.js';\n" for i, name in enumerate(layers))
    (core / "uses.js").write_text(imports + "import { pure } from './pure.js';\n", encoding="utf-8")

    wiring.ROOT = root
    wiring.SRC = root / "src"
    report = "\n".join(wiring.check_core_layer_purity())

for name in layers:
    if f"src/{name}/mod.js" not in report:
        errors.append(f"an import from src/core/ into src/{name}/ is not reported")
if "src/core/pure.js" in report:
    errors.append("an import between two modules of src/core/ is reported")

if errors:
    print("MODULE WIRING CORE LAYER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    sys.exit(1)
print("MODULE WIRING CORE LAYER STATIC TEST OK")
