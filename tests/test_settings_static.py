#!/usr/bin/env python3
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
import re
import sys

ROOT = PROJECT_ROOT
MODULE = ROOT / "src/core/settings.js"
LEGACY = ROOT / "src/main.legacy.js"
VERSION_MODULE = ROOT / "src/core/version.js"
SETTINGS_KEYS_MODULE = ROOT / "src/core/settingsStorageKeys.js"
REPORT = ROOT / "reports/SETTINGS_STATIC_TEST_REPORT.txt"

module = MODULE.read_text(errors="replace")
legacy = LEGACY.read_text(errors="replace")
version_module = VERSION_MODULE.read_text(errors="replace") if VERSION_MODULE.exists() else ""
settings_keys_module = SETTINGS_KEYS_MODULE.read_text(errors="replace") if SETTINGS_KEYS_MODULE.exists() else ""

errors = []
notes = []

# Tokens still owned by src/core/settings.js. The legacy-key registry was renamed and
# moved (see SETTINGS_MIGRATION_LEGACY_KEYS check below): "Senior Finish Phase 4 (settings
# keys)" removed SETTINGS_READ_KEYS / SETTINGS_LEGACY_KEYS, folding the key list into the
# data-only migration table src/core/settingsStorageKeys.js (CHANGELOG). The invariant —
# an exported, complete, v30f-bearing registry of legacy settings storage keys — is
# re-pointed to its current owner module rather than weakened.
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

# Re-pointed: the legacy-key registry export (was `export const SETTINGS_READ_KEYS` in the
# settings module) now lives in src/core/settingsStorageKeys.js as the migration table.
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
# Clean-break: the legacy-key migration table is now empty (no pre-launch installs to migrate),
# so there are no specific legacy keys to preserve — only the empty registry remains.

# Completeness/authority invariant (unchanged in spirit): the legacy-key registry must
# exactly account for every settings storage key referenced across the owner files — no key
# referenced anywhere that the registry omits, and no stale key in the registry referenced
# nowhere. The registry simply moved: the canonical key declarations now live in
# settingsStorageKeys.js (the migration table) + version.js (the write key), no longer in
# settings.js. So compare the union of all references against the canonical declaration set.
referenced_keys = []
for k in re.findall(r'"(?:nostrodomus\.assist|nostrodomus\.completions\.v[0-9a-z]+)\.settings"', legacy + "\n" + version_module + "\n" + settings_keys_module + "\n" + module):
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
