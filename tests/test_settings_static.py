#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import re
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/core/settings.js"
APP = ROOT / "src/app.js"
VERSION_MODULE = ROOT / "src/core/version.js"
SETTINGS_KEYS_MODULE = ROOT / "src/core/settingsStorageKeys.js"
REPORT = ROOT / "reports/SETTINGS_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
app = APP.read_text(errors="replace")
version_module = VERSION_MODULE.read_text(errors="replace") if VERSION_MODULE.exists() else ""
settings_keys_module = SETTINGS_KEYS_MODULE.read_text(errors="replace") if SETTINGS_KEYS_MODULE.exists() else ""

errors = []
notes = []

# Tokens owned by src/core/settings.js. The legacy storage keys are listed in
# src/core/settingsStorageKeys.js (SETTINGS_MIGRATION_LEGACY_KEYS).
required = [
    "export { SECURITY_LIMITS };",
    "export const DEFAULT_SETTINGS",
    "export const SETTINGS_WRITE_KEY",
    "export function deepMerge",
    "export function cloneDefaultSettings",
]

for token in required:
    if token not in module:
        errors.append(f"Missing required token: {token}")
    else:
        notes.append(f"PASS token: {token}")

if "export const SETTINGS_MIGRATION_LEGACY_KEYS" not in settings_keys_module:
    errors.append("Missing required token: export const SETTINGS_MIGRATION_LEGACY_KEYS (settingsStorageKeys.js)")
else:
    notes.append("PASS token: export const SETTINGS_MIGRATION_LEGACY_KEYS")

for forbidden in [
    "document",
    "window",
    "addEventListener",
    "querySelector",
    "innerHTML",
    "showPopover",
    "hidePopover",
    "fetch(",
    "sendBeacon",
    "eval(",
    "new Function",
]:
    if forbidden in module:
        errors.append(f"Forbidden token in settings module: {forbidden}")

if 'export const SETTINGS_WRITE_KEY = "nostrodomus.settings";' not in module:
    errors.append("SETTINGS_WRITE_KEY must use the public Nostrodomus storage key")

# Every older settings storage key referenced in these files must be declared in
# settingsStorageKeys.js or version.js, and every declared key must be referenced.
referenced_keys = []
for k in re.findall(r'"(?:nostrodomus\.assist|nostrodomus\.completions\.v[0-9a-z]+)\.settings"', app + "\n" + version_module + "\n" + settings_keys_module + "\n" + module):
    if k not in referenced_keys:
        referenced_keys.append(k)

canonical_keys = []
for k in re.findall(r'"(?:nostrodomus\.assist|nostrodomus\.completions\.v[0-9a-z]+)\.settings"', settings_keys_module + "\n" + version_module):
    if k not in canonical_keys:
        canonical_keys.append(k)

if set(referenced_keys) != set(canonical_keys):
    errors.append(f"settings key set mismatch. referenced={referenced_keys} canonical={canonical_keys}")
else:
    notes.append(f"PASS settings key set count: {len(canonical_keys)}")

REPORT.write_text(
    "Settings static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("SETTINGS STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("SETTINGS STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
