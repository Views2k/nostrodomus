#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
LEGACY = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8", errors="replace")
DIST = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8", errors="replace")
VERSION = (ROOT / "src" / "core" / "version.js").read_text(encoding="utf-8", errors="replace")
SETTINGS_KEYS = (ROOT / "src" / "core" / "settingsStorageKeys.js").read_text(encoding="utf-8", errors="replace")
RUNTIME_CONSTANTS = (ROOT / "src" / "core" / "runtimeConstants.js").read_text(encoding="utf-8", errors="replace")
errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

version = str(PROJECT.get("version") or "")
internal = str(PROJECT.get("internal_version") or "")

require("from './core/version.js'" in LEGACY, "main.legacy imports src/core/version.js")
require("from './core/settingsStorageKeys.js'" in LEGACY, "main.legacy imports src/core/settingsStorageKeys.js")
require("from './core/runtimeConstants.js'" in LEGACY, "main.legacy imports src/core/runtimeConstants.js")
require("const VERSION =" not in LEGACY[:1200], "main.legacy no longer redeclares VERSION near the top")
require("const PROJECT_VERSION =" not in LEGACY[:1200], "main.legacy no longer redeclares PROJECT_VERSION near the top")
require("const SETTINGS_LEGACY_KEYS =" not in LEGACY[:1600], "main.legacy no longer redeclares SETTINGS_LEGACY_KEYS near the top")
require("const SETTINGS_READ_KEYS =" not in LEGACY[:1600], "main.legacy no longer redeclares SETTINGS_READ_KEYS near the top")
require("const SECURITY_LIMITS =" not in LEGACY[:2200], "main.legacy no longer redeclares SECURITY_LIMITS near the top")
require("const STATIC_PROVIDER_ID =" not in LEGACY[:2200], "main.legacy no longer redeclares provider IDs near the top")

require(f'export const VERSION = "{internal}";' in VERSION, "version module owns current internal version")
require(f'export const PROJECT_VERSION = "{version}";' in VERSION, "version module owns current project version")
# Current storage model: legacy keys are migrated once into SETTINGS_WRITE_KEY and
# deleted; there is no SETTINGS_READ_KEYS fallback list anymore.
require('export const SETTINGS_MIGRATION_LEGACY_KEYS = Object.freeze([' in SETTINGS_KEYS, "settings keys module owns the frozen legacy-key migration list")
for token in [
    'defaultProviderTimeoutMs: 8',
    'maxProviderTimeoutMs: 120',
    'maxProviderMalformedDiagnostics: 5',
    'export const STATIC_PROVIDER_ID = "static-library";',
    'export const SNIPPET_PROVIDER_ID = "snippet-templates";',
]:
    require(token in RUNTIME_CONSTANTS, f"runtime constants module includes {token}")

for forbidden in ["window", "document", "localStorage", "sessionStorage", "setTimeout", "setInterval", "addEventListener", "querySelector", "fetch("]:
    require(forbidden not in VERSION, f"version module stays pure: no {forbidden}")
    require(forbidden not in SETTINGS_KEYS, f"settings keys module stays pure: no {forbidden}")
    require(forbidden not in RUNTIME_CONSTANTS, f"runtime constants module stays pure: no {forbidden}")

# Dist is esbuild-minified (whitespace/comments stripped), so assert on bundled
# content, not module path comments or spacing.
require("var VERSION=" in DIST, "dist bundles version module")
require("var SETTINGS_MIGRATION_LEGACY_KEYS=" in DIST, "dist bundles settings storage keys module")
require("var SECURITY_LIMITS=" in DIST, "dist bundles runtime constants module")
require(internal in DIST and f'PROJECT_VERSION="{version}"' in DIST, "dist exposes current version truth from bundled modules")

if errors:
    print("RUNTIME CORE CONSTANTS WIRING STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    sys.exit(1)
print("RUNTIME CORE CONSTANTS WIRING STATIC TEST OK")
