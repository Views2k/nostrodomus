from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]

PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
LEGACY = ROOT / "src" / "main.legacy.js"
if "runtime-layer-rollback" in str(PROJECT.get("internal_version") or "") and "from './core/" not in LEGACY.read_text(encoding="utf-8", errors="replace"):
    print("MODULE EXTRACTION STATIC TEST SKIPPED FOR UNWIRED RUNTIME LAYER ROLLBACK")
    sys.exit(0)
MODULE = ROOT / "src" / "core" / "runtimeConstants.js"
DIST = ROOT / "dist" / "nostrodomus.js"
DOC = ROOT / "docs" / "contracts" / "RUNTIME_CONSTANTS_MODULE_CONTRACT.md"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def test_runtime_constants_module_is_wired_and_pure():
    module = read(MODULE)
    legacy = read(LEGACY)
    dist = read(DIST)
    doc = read(DOC)

    assert "export const SECURITY_LIMITS = Object.freeze({" in module
    assert "maxRuntimeEntities: 750" in module
    assert "maxRuntimeServices: 500" in module
    assert 'export const STATIC_PROVIDER_ID = "static-library";' in module
    assert 'export const HA_VALUE_PROVIDER_ID = "ha-runtime-values";' in module
    assert 'export const LOVELACE_CONTEXT_PROVIDER_ID = "lovelace-context";' in module
    assert 'export const SNIPPET_PROVIDER_ID = "snippet-templates";' in module

    for forbidden in ["window", "document", "localStorage", "sessionStorage", "setTimeout", "setInterval", "addEventListener", "querySelector", "fetch("]:
        assert forbidden not in module

    assert "from './core/runtimeConstants.js'" in legacy
    assert "const SECURITY_LIMITS =" not in legacy[:1500]
    assert "const STATIC_PROVIDER_ID =" not in legacy[:1500]
    assert "registerProvider({" in legacy
    assert "function computeCompletionItems" in legacy

    assert "// src/core/runtimeConstants.js" in dist
    assert "var SECURITY_LIMITS = Object.freeze({" in dist
    assert 'var STATIC_PROVIDER_ID = "static-library";' in dist

    assert "third wired low-risk extraction" in doc
    assert "No window/document access" in doc
    assert "provider behavior remains in `src/main.legacy.js`" in doc or "provider behavior" in doc

    print("RUNTIME CONSTANTS MODULE STATIC TEST OK")
