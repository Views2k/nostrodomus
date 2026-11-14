#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "src/main.legacy.js"
VERSION_MODULE = ROOT / "src/core/version.js"
SETTINGS_KEYS_MODULE = ROOT / "src/core/settingsStorageKeys.js"
TELEMETRY_RUNTIME = ROOT / "src/diagnostics/telemetryRuntime.js"
SETTINGS_PANEL_RUNTIME = ROOT / "src/ui/settingsPanelRuntime.js"
# The settings panel was decomposed: the Help + Console API examples (e.g.
# window.__nostrodomus.settings()) moved out of the runtime into the extracted shell module.
SETTINGS_PANEL_SHELL = ROOT / "src/ui/settings/settingsPanelShell.js"
LOGGING_RUNTIME = ROOT / "src/core/loggingRuntime.js"
PUBLIC_API_RUNTIME = ROOT / "src/core/publicApiRuntime.js"
README = ROOT / "README.md"
HACS_DOC = ROOT / "docs/HACS_INSTALL.md"
HACS = ROOT / "hacs.json"
REPORT = ROOT / "reports/PUBLIC_IDENTITY_LOGGING_STATIC_TEST_REPORT.txt"

legacy = LEGACY.read_text(encoding="utf-8", errors="replace")
version_module = VERSION_MODULE.read_text(encoding="utf-8", errors="replace") if VERSION_MODULE.exists() else ""
settings_keys_module = SETTINGS_KEYS_MODULE.read_text(encoding="utf-8", errors="replace") if SETTINGS_KEYS_MODULE.exists() else ""
telemetry_runtime = TELEMETRY_RUNTIME.read_text(encoding="utf-8", errors="replace") if TELEMETRY_RUNTIME.exists() else ""
settings_panel_runtime = SETTINGS_PANEL_RUNTIME.read_text(encoding="utf-8", errors="replace") if SETTINGS_PANEL_RUNTIME.exists() else ""
settings_panel_shell = SETTINGS_PANEL_SHELL.read_text(encoding="utf-8", errors="replace") if SETTINGS_PANEL_SHELL.exists() else ""
logging_runtime = LOGGING_RUNTIME.read_text(encoding="utf-8", errors="replace") if LOGGING_RUNTIME.exists() else ""
public_api_runtime = PUBLIC_API_RUNTIME.read_text(encoding="utf-8", errors="replace") if PUBLIC_API_RUNTIME.exists() else ""
source_owner = legacy + "\n" + settings_panel_runtime + "\n" + settings_panel_shell + "\n" + logging_runtime + "\n" + public_api_runtime
readme = README.read_text(encoding="utf-8", errors="replace")
hacs_doc = HACS_DOC.read_text(encoding="utf-8", errors="replace")
hacs = HACS.read_text(encoding="utf-8", errors="replace")
errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

require('PRODUCT_NAME' in legacy and 'export const PRODUCT_NAME = "Nostrodomus"' in version_module, "runtime declares Nostrodomus product name through version module")
require('export function createLoggingRuntime' in logging_runtime, "logging runtime owns debug/perf logging factory")
require('export function createPublicApiRuntime' in public_api_runtime, "public API runtime owns alias/bootstrap factory")
require('LOG_PREFIX' in logging_runtime and 'export const LOG_PREFIX = `[${PRODUCT_NAME}]`' in version_module, "runtime centralizes log prefix through version module")
for token in ["function logDebug", "function logInfoOnce", "function logWarn", "function logWarnOnce", "function logErrorOnce"]:
    require(token in logging_runtime, f"logging runtime includes {token}")
require('W.__nostrodomus = api;' in public_api_runtime, "preferred window.__nostrodomus alias is installed")
require('legacyDeprecated: true' in telemetry_runtime, "diagnostics mark legacy aliases compatibility-only in telemetry runtime")
require('SETTINGS_WRITE_KEY' in legacy and 'SETTINGS_WRITE_KEY = "nostrodomus.settings"' in version_module, "runtime writes the Nostrodomus settings key through version module")
require("SETTINGS_MIGRATION_LEGACY_KEYS" in legacy and "SETTINGS_MIGRATION_LEGACY_KEYS" in settings_keys_module, "runtime references the settings storage keys module migration table (now empty, clean-break)")
require('window.__nostrodomus.settings()' in source_owner, "Help examples prefer window.__nostrodomus")

for stale in ["[nostrodomus-v30g]", "[nostrodomus-v30f]", "Nostrodomus - Stage 3B"]:
    require(stale not in legacy, f"active runtime removes stale prototype marker: {stale}")

require('Nostrodomus' in readme, "README uses public product name")
require('/config/www/nostrodomus-engine-v30g.js' not in readme, "README does not present old v30 live file as current")
require('Nostrodomus' in hacs_doc, "HACS install doc uses public product name")
require('"name": "Nostrodomus"' in hacs_doc, "HACS install doc shows current public metadata name")
require('Nostrodomus HACS/plugin layout' in hacs_doc, "HACS install doc title uses the current product layout name")
require('"name": "Nostrodomus"' in hacs, "hacs.json public name is Nostrodomus")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Public identity/logging static test report\n\n"
    "Results:\n" + "\n".join(notes) + "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PUBLIC IDENTITY LOGGING STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("PUBLIC IDENTITY LOGGING STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
