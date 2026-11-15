#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The settings panel has five tabs and a toggle per provider; a disabled provider produces no rows.
#   - the tabs and the provider toggle handler: src/ui/settings/settingsPanelShell.js
#   - the checkbox renderer (dataset: { [datasetKey]: key }): src/ui/settings/settingsControls.js
#   - providerControlsMarkup() and the provider checkboxes: src/diagnostics/diagnosticsRuntime.js
#   - skipping disabled providers: src/providers/providerRegistry.js
#   - PROVIDER_SETTINGS_META and the provider ids: src/providers/providerRuntime.js,
#     src/core/runtimeConstants.js
SOURCE_MODULES = [
    "src/app.js",
    "src/ui/settings/settingsPanelShell.js",
    "src/ui/settings/settingsControls.js",
    "src/diagnostics/diagnosticsRuntime.js",
    "src/providers/providerRuntime.js",
    "src/providers/providerRegistry.js",
    "src/core/runtimeConstants.js",
]
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/SETTINGS_TABS_PROVIDER_TOGGLES_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

src = "\n".join((ROOT / rel).read_text(encoding="utf-8", errors="replace") for rel in SOURCE_MODULES)
dist = DIST.read_text(encoding="utf-8", errors="replace")

def text_has(text, *forms):
    # Accepts the source form or the dist form (esbuild removes the spaces).
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
        f"{text_name} has the five settings tabs",
    )
    require(text_has(text, 'tabButton("Suggestions", "suggestions")', 'tabButton("Suggestions","suggestions")') is False, f"{text_name} has no separate Suggestions tab")
    require(text_has(text, 'tabButton("General", "general")', 'tabButton("General","general")'), f"{text_name} has the General tab")
    require(text_has(text, 'tabButton("Behavior", "behavior")', 'tabButton("Behavior","behavior")') is False, f"{text_name} has no Behavior tab")
    require(text_has(text, 'tabButton("Popup", "popup")', 'tabButton("Popup","popup")') is False, f"{text_name} has no Popup tab")
    require(text_has(text, 'tabButton("Languages", "languages")', 'tabButton("Languages","languages")') is False, f"{text_name} has no Languages tab")
    require('function providerControlsMarkup()' in text, f"{text_name} has provider controls renderer")
    require(text_has(text, 'dataset: { [datasetKey]: key }', 'dataset:{[datasetKey]:key}') and '"provider"' in text, f"{text_name} reuses checkbox renderer for provider toggles")
    require('input[data-provider]' in text, f"{text_name} handles provider toggle changes")
    require(
        text_has(
            text,
            'if (!providerEnabled(provider.id))',
            'if (!providerEnabled(providerId, provider))',
            # esbuild joins the guard into a comma expression, so dist has no `if (`.
            '!providerEnabled(providerId,provider)',
        ),
        f"{text_name} skips disabled providers before generation",
    )
    require('PROVIDER_SETTINGS_META' in text, f"{text_name} documents real provider metadata")
    for provider_id in ("static-library", "snippet-templates", "lovelace-context", "ha-runtime-values"):
        require(provider_id in text, f"{text_name} references real provider {provider_id}")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Settings tabs and provider toggles static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SETTINGS TABS AND PROVIDER TOGGLES STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("SETTINGS TABS AND PROVIDER TOGGLES STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
