#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/main.legacy.js"
DIAGNOSTICS_RUNTIME = ROOT / "src/diagnostics/telemetryRuntime.js"
STATE = ROOT / "src/core/state.js"
VERSION_MODULE = ROOT / "src/core/version.js"
EDITOR_DISPATCH_RUNTIME = ROOT / "src/editor/editorDispatchRuntime.js"
# The scheduleDiagnosticsRefresh("settings-open") call moved out of the former
# src/ui/settingsPanelRuntime.js into the extracted settings shell owner.
SETTINGS_PANEL_RUNTIME = ROOT / "src/ui/settings/settingsPanelShell.js"
DELEGATE_BRIDGE = ROOT / "src/composition/runtimeDelegateBridge.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/IDLE_AWARE_DIAGNOSTICS_SCHEDULER_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
version = str(project.get("version"))
internal = str(project.get("internal_version"))
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())

for label, path in (("source", SRC), ("dist", DIST)):
    text = path.read_text(encoding="utf-8", errors="replace")
    if label == "source":
        text += "\n" + DIAGNOSTICS_RUNTIME.read_text(encoding="utf-8", errors="replace")
        text += "\n" + STATE.read_text(encoding="utf-8", errors="replace")
        text += "\n" + VERSION_MODULE.read_text(encoding="utf-8", errors="replace")
        text += "\n" + EDITOR_DISPATCH_RUNTIME.read_text(encoding="utf-8", errors="replace")
        text += "\n" + SETTINGS_PANEL_RUNTIME.read_text(encoding="utf-8", errors="replace")
        text += "\n" + DELEGATE_BRIDGE.read_text(encoding="utf-8", errors="replace")
    if label == "source":
        require(f'const PROJECT_VERSION = "{version}"' in text, f"{label} PROJECT_VERSION matches PROJECT.json")
        require(f'const VERSION = "{internal}"' in text, f"{label} VERSION matches PROJECT.json internal_version")
    else:
        require(version in text, f"{label} PROJECT_VERSION matches PROJECT.json")
        require(internal in text, f"{label} VERSION matches PROJECT.json internal_version")
    require('function activeContextDiagnosticsSection()' in text, f"{label} scopes diagnostics refreshes to the active Context section")
    require('function diagnosticsSnapshotSignature()' in text, f"{label} has a dirty-state signature for diagnostics")
    # dist minifies "reason = ..." default args to "reason=..." (no spaces around =).
    require(('function shouldFlushDiagnosticsRefresh(reason = "context-inspector-live")' in text or 'function shouldFlushDiagnosticsRefresh(reason="context-inspector-live")' in text), f"{label} can skip unchanged idle diagnostics heartbeats")
    require(('function flushDiagnosticsRefresh(reason = "context-inspector-live")' in text or 'function flushDiagnosticsRefresh(reason="context-inspector-live")' in text), f"{label} has a coalesced diagnostics flush")
    require(('function scheduleDiagnosticsRefresh(reason = "context-inspector-live")' in text or 'function scheduleDiagnosticsRefresh(reason="context-inspector-live")' in text), f"{label} schedules diagnostics refreshes through one rAF")
    # dist drops the colon space and the empty () after new Set: "diagnosticsPendingReasons:new Set".
    require(('diagnosticsPendingReasons: new Set()' in text or 'diagnosticsPendingReasons: /* @__PURE__ */ new Set()' in text or 'diagnosticsPendingReasons:new Set' in text), f"{label} coalesces diagnostics refresh reasons")
    require(('diagnosticsHeartbeatMs: 1200' in text or 'diagnosticsHeartbeatMs:1200' in text), f"{label} slows the idle heartbeat without removing it")
    require(('scheduleDiagnosticsRefresh("editor-dispatch")' in text or "scheduleDiagnosticsRefresh('editor-dispatch')" in text), f"{label} keeps diagnostics live on editor changes")
    require('scheduleDiagnosticsRefresh("settings-open")' in text, f"{label} refreshes diagnostics when Settings opens")
    require('refreshContextInspectorPanel("context-inspector-live")' in text, f"{label} preserves the existing live Context Inspector call token")
    require('refreshSuggestionQualityPanel("suggestion-quality-live")' in text, f"{label} preserves the live Suggestion Quality refresh hook")
    # dist strips the operator spaces: "Date.now()-(state.diagnosticsLastComputeAt||0)<120".
    require(('Date.now() - (state.diagnosticsLastComputeAt || 0) < 120' in text or 'Date.now()-(state.diagnosticsLastComputeAt||0)<120' in text), f"{label} avoids duplicate compute when Context refresh just ran")
    require('querySelector?.(\'[data-section="context"]\')' in text, f"{label} updates Suggestion Quality from the Context section")
    require('fetch(' not in text, f"{label} stays local-only/network-free")

# The idle-aware diagnostics scheduler + delegate bridge bundle landed at v0.1.42; the
# invariant is that PROJECT.json is at or beyond that baseline, not a frozen literal.
require(version_tuple >= (0, 1, 42), "PROJECT.json remains at or beyond the delegate bridge bundle baseline (v0.1.42)")
# Accept the original "delegate-bridge-bundle" internal_version id OR any version advanced past it.
require("delegate-bridge-bundle" in internal or version_tuple > (0, 1, 42), "PROJECT.json records the delegate bridge bundle (or version advanced past the baseline)")
source_identity = SRC.read_text(encoding="utf-8", errors="replace") + "\n" + VERSION_MODULE.read_text(encoding="utf-8", errors="replace")
require(internal in source_identity and internal in DIST.read_text(encoding="utf-8", errors="replace"), "source and dist both carry current runtime version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Idle-aware diagnostics scheduler static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("IDLE-AWARE DIAGNOSTICS SCHEDULER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("IDLE-AWARE DIAGNOSTICS SCHEDULER STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
