#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/app.js"
MODULE = ROOT / "src/editor/editorLifecycleSentinel.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/PERFORMANCE_SCHEDULER_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

main = MAIN.read_text(encoding="utf-8", errors="replace")
module = MODULE.read_text(encoding="utf-8", errors="replace")
codebox_style_runtime = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
codebox_frame_runtime = (ROOT / "src/ui/codeboxFrameRuntime.js").read_text(encoding="utf-8", errors="replace")
settings_panel_runtime = (ROOT / "src/ui/settingsPanelRuntime.js").read_text(encoding="utf-8", errors="replace")
state_source = (ROOT / "src/core/state.js").read_text(encoding="utf-8", errors="replace")
# The style settle scheduler, the throttled style root scan and the settings call sites.
codebox_style_settle = (ROOT / "src/ui/codebox/codeboxStyleSettle.js").read_text(encoding="utf-8", errors="replace")
style_root_runtime = (ROOT / "src/ui/styleRootRuntime.js").read_text(encoding="utf-8", errors="replace")
settings_panel_shell = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8", errors="replace")
src_all = "\n".join([main, module, codebox_style_runtime, codebox_frame_runtime, settings_panel_runtime, state_source, codebox_style_settle, style_root_runtime, settings_panel_shell])
dist = DIST.read_text(encoding="utf-8", errors="replace")

for label, text in (("source", src_all), ("dist", dist)):
    require('function flushCodeboxStyleReapply(reason = "style-settle")' in text or 'function flushCodeboxStyleReapply(reason="style-settle")' in text, f"{label} has coalesced style flush helper")
    require('function clearCodeboxStyleSettleTimers()' in text, f"{label} clears trailing style timers on reschedule/uninstall")
    require(('codeboxStylePendingReasons: new Set()' in text or 'codeboxStylePendingReasons: /* @__PURE__ */ new Set()' in text or 'codeboxStylePendingReasons:new Set' in text), f"{label} tracks coalesced style reasons")
    require('codeboxStyleGeneration' in text and ('generation !== state.codeboxStyleGeneration' in text or 'generation===state.codeboxStyleGeneration' in text), f"{label} guards stale trailing style settles")
    require('function runScheduledStyleRootScan(reason = \'style-root-scan\')' in text or 'function runScheduledStyleRootScan(reason="style-root-scan")' in text, f"{label} has throttled root scan runner")
    require('styleRootScanLastAt' in text and 'styleRootScanTimer' in text, f"{label} tracks root scan throttle state")
    require('codeboxFrameLastRectKey' in text and 'codeboxFrameLastTokenKey' in text, f"{label} tracks duplicate frame overlay keys")
    require('syncCodeboxExternalFrame(editor, tokens, reason)' in text or 'syncCodeboxExternalFrame(editor,tokens,reason)' in text, f"{label} performs an immediate frame sync after style apply")
    # Slider changes go through scheduleStyleRangeCommitReapply, which debounces and then calls
    # scheduleCodeboxStyleReapply("style-range-commit").
    require('scheduleStyleRangeCommitReapply(group = "style-range-change")' in text or 'scheduleStyleRangeCommitReapply(group="style-range-change")' in text, f"{label} has the live style slider update call site")
    require('scheduleCodeboxStyleReapply("style-option-change")' in text, f"{label} has the live style option update call site")

require('function mutationRecordLooksEditorStructural(record)' in module, "editor lifecycle owner filters root observer mutations before scanning")
# app.js gets the helper from the editor lifecycle sentinel delegates.
require('mutationRecordLooksEditorStructural' in main and 'createEditorLifecycleSentinelRuntimeDelegates(() => editorLifecycleSentinelRuntime)' in main, "main wires the structural mutation delegate")
require('function mutationRecordLooksEditorStructural' in dist, "dist includes structural mutation helper")
# The threat model states that Nostrodomus adds no telemetry and no network access.
THREAT_MODEL = ROOT / "docs/THREAT_MODEL.md"
threat_model = THREAT_MODEL.read_text(encoding="utf-8", errors="replace") if THREAT_MODEL.exists() else ""
require("no telemetry or external network access" in threat_model and "It must not add telemetry" in threat_model, "threat model documents the local-only / no-network performance policy")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Performance scheduler static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PERFORMANCE SCHEDULER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("PERFORMANCE SCHEDULER STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
