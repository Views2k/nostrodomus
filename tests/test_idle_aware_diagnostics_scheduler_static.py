#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/app.js"
DIAGNOSTICS_RUNTIME = ROOT / "src/diagnostics/diagnosticsRuntime.js"
STATE = ROOT / "src/core/state.js"
EDITOR_DISPATCH_RUNTIME = ROOT / "src/editor/editorDispatchRuntime.js"
# Holds the scheduleDiagnosticsRefresh("settings-open") call.
SETTINGS_PANEL_SHELL = ROOT / "src/ui/settings/settingsPanelShell.js"
DELEGATE_BRIDGE = ROOT / "src/composition/runtimeDelegateBridge.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/IDLE_AWARE_DIAGNOSTICS_SCHEDULER_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

for label, path in (("source", SRC), ("dist", DIST)):
    text = path.read_text(encoding="utf-8", errors="replace")
    if label == "source":
        text += "\n" + DIAGNOSTICS_RUNTIME.read_text(encoding="utf-8", errors="replace")
        text += "\n" + STATE.read_text(encoding="utf-8", errors="replace")
        text += "\n" + EDITOR_DISPATCH_RUNTIME.read_text(encoding="utf-8", errors="replace")
        text += "\n" + SETTINGS_PANEL_SHELL.read_text(encoding="utf-8", errors="replace")
        text += "\n" + DELEGATE_BRIDGE.read_text(encoding="utf-8", errors="replace")
    require('function activeContextDiagnosticsSection()' in text, f"{label} scopes diagnostics refreshes to the active Context section")
    require('function diagnosticsSnapshotSignature()' in text, f"{label} has a dirty-state signature for diagnostics")
    # dist writes default arguments without spaces around "=".
    require(('function shouldFlushDiagnosticsRefresh(reason = "context-inspector-live")' in text or 'function shouldFlushDiagnosticsRefresh(reason="context-inspector-live")' in text), f"{label} can skip unchanged idle diagnostics heartbeats")
    require(('function flushDiagnosticsRefresh(reason = "context-inspector-live")' in text or 'function flushDiagnosticsRefresh(reason="context-inspector-live")' in text), f"{label} has a coalesced diagnostics flush")
    require(('function scheduleDiagnosticsRefresh(reason = "context-inspector-live")' in text or 'function scheduleDiagnosticsRefresh(reason="context-inspector-live")' in text), f"{label} schedules diagnostics refreshes through one rAF")
    # dist drops the colon space and the empty () after new Set: "diagnosticsPendingReasons:new Set".
    require(('diagnosticsPendingReasons: new Set()' in text or 'diagnosticsPendingReasons: /* @__PURE__ */ new Set()' in text or 'diagnosticsPendingReasons:new Set' in text), f"{label} coalesces diagnostics refresh reasons")
    require(('diagnosticsHeartbeatMs: 1200' in text or 'diagnosticsHeartbeatMs:1200' in text), f"{label} slows the idle heartbeat without removing it")
    require(('scheduleDiagnosticsRefresh("editor-dispatch")' in text or "scheduleDiagnosticsRefresh('editor-dispatch')" in text), f"{label} keeps diagnostics live on editor changes")
    require('scheduleDiagnosticsRefresh("settings-open")' in text, f"{label} refreshes diagnostics when Settings opens")
    require('refreshContextInspectorPanel("context-inspector-live")' in text, f"{label} refreshes the Context Inspector live")
    require('refreshSuggestionQualityPanel("suggestion-quality-live")' in text, f"{label} refreshes Suggestion Quality live")
    # dist strips the operator spaces: "Date.now()-(state.diagnosticsLastComputeAt||0)<120".
    require(('Date.now() - (state.diagnosticsLastComputeAt || 0) < 120' in text or 'Date.now()-(state.diagnosticsLastComputeAt||0)<120' in text), f"{label} avoids duplicate compute when Context refresh just ran")
    require('querySelector?.(\'[data-section="context"]\')' in text, f"{label} updates Suggestion Quality from the Context section")
    require('fetch(' not in text, f"{label} stays local-only/network-free")

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
