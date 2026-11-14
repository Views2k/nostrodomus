#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
# The monolith was split into src modules: the settings-architecture / provider-foundation
# invariants that once lived inline in src/main.legacy.js now live in extracted owner modules.
# Same facts, current locations:
#   - the consolidated five-tab shell + tab buttons + provider toggle wiring + the
#     "Entity/service sub-toggles are reserved" copy -> src/ui/settings/settingsPanelShell.js
#   - the checkbox renderer (dataset: { [datasetKey]: key }) -> src/ui/settings/settingsControls.js
#   - providerControlsMarkup() + the "provider" dataset-key checkbox call -> src/diagnostics/telemetryRuntime.js
#   - skip-disabled-providers-before-generation -> src/providers/providerRegistry.js
#   - PROVIDER_SETTINGS_META + the real provider ids -> src/providers/providerRuntime.js / src/core/runtimeConstants.js
# We read those modules and join them into one `source` blob so every fact is still asserted
# against the real, current source (not a stale monolith path).
SOURCE_MODULES = [
    "src/main.legacy.js",
    "src/ui/settings/settingsPanelShell.js",
    "src/ui/settings/settingsControls.js",
    "src/diagnostics/telemetryRuntime.js",
    "src/providers/providerRuntime.js",
    "src/providers/providerRegistry.js",
    "src/core/runtimeConstants.js",
]
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/SETTINGS_ARCHITECTURE_PROVIDER_FOUNDATION_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

src = "\n".join((ROOT / rel).read_text(encoding="utf-8", errors="replace") for rel in SOURCE_MODULES)
dist = DIST.read_text(encoding="utf-8", errors="replace")
project = json.loads(PROJECT.read_text(encoding="utf-8"))

def text_has(text, *forms):
    # Match against the source-spaced form OR a minified form (esbuild strips the spaces in
    # the bundled dist), preserving the original intent across dist fragility.
    return any(form in text for form in forms)

for text_name, text in (("source", src), ("dist", dist)):
    require(
        text_has(
            text,
            'const allowedTabs = new Set(["general", "context", "diagnostics", "style", "help"])',
            'const allowedTabs = /* @__PURE__ */ new Set(["general", "context", "diagnostics", "style", "help"])',
            'allowedTabs = new Set(["general", "context", "diagnostics", "style", "help"])',
            'allowedTabs = /* @__PURE__ */ new Set(["general", "context", "diagnostics", "style", "help"])',
            'allowedTabs=new Set(["general","context","diagnostics","style","help"])',
            'allowedTabs=/* @__PURE__ */new Set(["general","context","diagnostics","style","help"])',
        ),
        f"{text_name} uses consolidated five-category settings architecture",
    )
    require(text_has(text, 'tabButton("Suggestions", "suggestions")', 'tabButton("Suggestions","suggestions")') is False, f"{text_name} does not expose a separate Suggestions category")
    require(text_has(text, 'tabButton("General", "general")', 'tabButton("General","general")'), f"{text_name} exposes consolidated General category")
    require(text_has(text, 'tabButton("Behavior", "behavior")', 'tabButton("Behavior","behavior")') is False, f"{text_name} does not keep Behavior as a top-level category")
    require(text_has(text, 'tabButton("Popup", "popup")', 'tabButton("Popup","popup")') is False, f"{text_name} does not keep Popup as a top-level category")
    require(text_has(text, 'tabButton("Languages", "languages")', 'tabButton("Languages","languages")') is False, f"{text_name} does not keep Languages as a top-level category")
    require('function providerControlsMarkup()' in text, f"{text_name} has provider controls renderer")
    require(text_has(text, 'dataset: { [datasetKey]: key }', 'dataset:{[datasetKey]:key}') and '"provider"' in text, f"{text_name} reuses checkbox renderer for provider toggles")
    require('input[data-provider]' in text, f"{text_name} handles provider toggle changes")
    require(
        text_has(
            text,
            'if (!providerEnabled(provider.id))',
            'if (!providerEnabled(providerId, provider))',
            # esbuild fuses `stats.skipped=false; if (!providerEnabled(...))` into a comma
            # expression, dropping the literal `if (`; the negated guard survives verbatim.
            '!providerEnabled(providerId,provider)',
        ),
        f"{text_name} skips disabled providers before generation",
    )
    require('Entity/service sub-toggles are reserved' in text, f"{text_name} labels entity/service split as future architecture work")
    require('PROVIDER_SETTINGS_META' in text, f"{text_name} documents real provider metadata")
    for provider_id in ("static-library", "snippet-templates", "lovelace-context", "ha-runtime-values"):
        require(provider_id in text, f"{text_name} references real provider {provider_id}")

require(project.get("internal_version", "").startswith(f"nostrodomus-v{project.get('version')}-"), "PROJECT.json internal_version matches current PROJECT.json version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Settings architecture/provider foundation static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SETTINGS ARCHITECTURE PROVIDER FOUNDATION STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("SETTINGS ARCHITECTURE PROVIDER FOUNDATION STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
