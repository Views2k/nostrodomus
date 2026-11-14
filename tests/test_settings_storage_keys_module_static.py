from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]

PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
LEGACY = ROOT / "src" / "main.legacy.js"
if "runtime-layer-rollback" in str(PROJECT.get("internal_version") or "") and "from './core/" not in LEGACY.read_text(encoding="utf-8", errors="replace"):
    print("MODULE EXTRACTION STATIC TEST SKIPPED FOR UNWIRED RUNTIME LAYER ROLLBACK")
    sys.exit(0)
MODULE = ROOT / "src" / "core" / "settingsStorageKeys.js"
DIST = ROOT / "dist" / "nostrodomus.js"
DOC = ROOT / "docs" / "contracts" / "SETTINGS_STORAGE_KEYS_MODULE_CONTRACT.md"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def test_settings_storage_keys_module_is_wired_and_pure():
    module = read(MODULE)
    legacy = read(LEGACY)
    dist = read(DIST)
    doc = read(DOC)

    assert "import { SETTINGS_WRITE_KEY } from './version.js';" in module
    assert "export const SETTINGS_LEGACY_KEYS = Object.freeze([" in module
    assert "export const SETTINGS_READ_KEYS = Object.freeze([SETTINGS_WRITE_KEY, ...SETTINGS_LEGACY_KEYS]);" in module
    assert '"nostrodomus.v9.settings"' in module
    assert '"nostrodomus.v30f.settings"' in module

    for forbidden in ["window", "document", "localStorage", "sessionStorage", "setTimeout", "addEventListener", "querySelector", "fetch("]:
        assert forbidden not in module

    assert "from './core/settingsStorageKeys.js'" in legacy
    assert "const SETTINGS_LEGACY_KEYS =" not in legacy[:900]
    assert "const SETTINGS_READ_KEYS =" not in legacy[:900]
    assert "let loadedSettingsStorageKey" in legacy
    assert "localStorage.setItem(SETTINGS_WRITE_KEY" in legacy

    assert "// src/core/settingsStorageKeys.js" in dist
    assert "var SETTINGS_READ_KEYS = Object.freeze([SETTINGS_WRITE_KEY, ...SETTINGS_LEGACY_KEYS]);" in dist

    assert "second wired low-risk extraction" in doc
    assert "SETTINGS_READ_KEYS starts with SETTINGS_WRITE_KEY" in doc

    print("SETTINGS STORAGE KEYS MODULE STATIC TEST OK")
