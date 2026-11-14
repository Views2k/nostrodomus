#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
FACTORY = ROOT / "src/composition/mainLegacyCompletionRuntimeFactory.js"
OWNER = ROOT / "src/completion/suggestionQualityRuntime.js"
SCORING = ROOT / "src/completion/scoring.js"
SETTINGS_PANEL = ROOT / "src/ui/settings/settingsPanelShell.js"
DIAGNOSTICS = ROOT / "src/diagnostics/telemetryRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/SUGGESTION_QUALITY_DASHBOARD_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

src = SRC.read_text(encoding="utf-8", errors="replace")
factory = FACTORY.read_text(encoding="utf-8", errors="replace")
owner = OWNER.read_text(encoding="utf-8", errors="replace")
scoring = SCORING.read_text(encoding="utf-8", errors="replace")
settings_panel = SETTINGS_PANEL.read_text(encoding="utf-8", errors="replace")
diagnostics = DIAGNOSTICS.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")
project = json.loads(PROJECT.read_text(encoding="utf-8"))

# Source ownership: the payload/record body belongs to the completion owner module;
# main.legacy.js is expected to keep only thin runtime delegates for compatibility.
require('createMainLegacyCompletionRuntimeGroup' in src, "source wires completion runtime group factory")
require('createSuggestionQualityRuntime' in factory, "completion factory wires suggestion-quality owner runtime")
require('suggestionQualityPayload' in factory and 'createSuggestionQualityRuntimeDelegates' in factory, "completion factory exposes suggestionQualityPayload delegate")
require('recordSuggestionQuality' in factory and 'suggestionQualityRuntime' in factory, "completion factory keeps recordSuggestionQuality delegate")
require('export function createSuggestionQualityRuntime' in owner, "owner module exports suggestion-quality runtime factory")
require('function suggestionQualityPayload(' in owner, "owner module builds a redacted suggestion quality payload")
require('function recordSuggestionQuality(' in owner, "owner module records quality after scoring")
require('providerMix: Object.fromEntries(providers)' in owner, "owner module owns provider mix accounting")
require('typeMix: Object.fromEntries(types)' in owner, "owner module owns type mix accounting")
require('duplicateLabels: duplicateLabels.slice(0, 8)' in owner, "owner module bounds duplicate-label reporting")

# Scoring remains the producer of fresh/cached suggestion quality events.
require('recordSuggestionQuality(ctx, items' in scoring, "scoring records fresh scored results")
require('recordSuggestionQuality(ctx, cached' in scoring, "scoring records cached results")

# UI/diagnostics consumers still show and copy the local-only report.
require('function suggestionQualityCard(' in diagnostics, "diagnostics renders a Suggestion Quality card")
require('function refreshSuggestionQualityPanel(' in diagnostics, "diagnostics has a live refresh hook for the Context section")
require('settingsTitle("Suggestion Quality")' in settings_panel, "settings panel places Suggestion Quality inside the Context category")
require('tabButton("Suggestion Quality"' not in settings_panel, "settings panel does not add another top-level settings tab")
context_idx = settings_panel.find('sectionPanel("context"')
quality_idx = settings_panel.find('settingsTitle("Suggestion Quality")')
require(context_idx != -1 and quality_idx != -1 and context_idx < quality_idx, "settings panel renders Suggestion Quality from the Context section")
require('dataset: { qualityCopy: "" }' in settings_panel, "settings panel exposes a Copy quality report button")
require('navigator.clipboard?.writeText' in settings_panel and 'suggestion quality' in settings_panel, "settings panel copies/logs the quality payload locally")
require('suggestionQuality: state.suggestionQuality || suggestionQualityPayload' in diagnostics, "diagnostics includes suggestionQuality in debug output")
require('fetch(' not in owner + scoring + settings_panel + diagnostics, "suggestion quality remains network-free")
require('qualityMetric("Visible suggestions"' in diagnostics, "diagnostics shows actionable visible suggestion count")
require('qualityMetric("Score spread"' not in diagnostics, "diagnostics does not show abstract score-spread metric")
require('qualityMetric("Cache"' not in diagnostics, "diagnostics does not show low-value cache-state metric")
require('qualityMetric("Duplicate labels"' not in diagnostics, "diagnostics does not show low-value duplicate-label metric by default")

# Bundle checks use relaxed token matching because esbuild may suffix imported helper names.
for text_name, text in (("dist", dist),):
    require('createSuggestionQualityRuntime' in text, f"{text_name} bundles suggestion-quality owner")
    require('function suggestionQualityPayload(' in text, f"{text_name} bundles redacted suggestion quality payload builder")
    require('function recordSuggestionQuality(' in text, f"{text_name} bundles quality recording")
    require('settingsTitle' in text and 'Suggestion Quality' in text, f"{text_name} places Suggestion Quality inside settings UI")
    require(('dataset: { qualityCopy: "" }' in text) or ('dataset:{qualityCopy:""}' in text), f"{text_name} exposes a Copy quality report button")
    require('clipboard?.writeText' in text and 'suggestion quality' in text, f"{text_name} copies/logs the quality payload locally")
    require(('suggestionQuality: state.suggestionQuality || suggestionQualityPayload' in text) or ('suggestionQuality:state.suggestionQuality||suggestionQualityPayload' in text), f"{text_name} includes suggestionQuality in diagnostics/debug output")
    require(('recordSuggestionQuality(ctx, items' in text) or ('recordSuggestionQuality(ctx,items' in text), f"{text_name} records fresh scored results")
    require(('recordSuggestionQuality(ctx, cached' in text) or ('recordSuggestionQuality(ctx,cached' in text), f"{text_name} records cached results")
    require('fetch(' not in text, f"{text_name} keeps quality dashboard network-free")
    require('qualityMetric("Visible suggestions"' in text, f"{text_name} shows actionable visible suggestion count")
    require('qualityMetric("Score spread"' not in text, f"{text_name} does not show abstract score-spread metric")
    require('qualityMetric("Cache"' not in text, f"{text_name} does not show low-value cache-state metric")
    require('qualityMetric("Duplicate labels"' not in text, f"{text_name} does not show low-value duplicate-label metric by default")

version = project.get("version", "")
require(project.get("internal_version", "").startswith(f"nostrodomus-v{version}-"), "PROJECT.json internal_version matches current version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Suggestion Quality Dashboard static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("SUGGESTION QUALITY DASHBOARD STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("SUGGESTION QUALITY DASHBOARD STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
