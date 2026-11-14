#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/main.legacy.js"
MODULE = ROOT / "src/editor/editorLifecycleSentinel.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/PERFORMANCE_SCHEDULER_STATIC_TEST_REPORT.txt"

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
main = MAIN.read_text(encoding="utf-8", errors="replace")
module = MODULE.read_text(encoding="utf-8", errors="replace")
codebox_style_runtime = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
codebox_frame_runtime = (ROOT / "src/ui/codeboxFrameRuntime.js").read_text(encoding="utf-8", errors="replace")
settings_panel_runtime = (ROOT / "src/ui/settingsPanelRuntime.js").read_text(encoding="utf-8", errors="replace")
state_source = (ROOT / "src/core/state.js").read_text(encoding="utf-8", errors="replace")
version_source = (ROOT / "src/core/version.js").read_text(encoding="utf-8", errors="replace")
# The coalesced style-settle scheduler (flush/clear/generation guard + the live style-range
# commit call site) was extracted out of src/main.legacy.js into src/ui/codebox/codeboxStyleSettle.js;
# the throttled style root-scan runner moved into src/ui/styleRootRuntime.js; and the settings
# style option/toggle live-update call sites moved into src/ui/settings/settingsPanelShell.js.
# Same invariants, current owner modules — read them so the source-side checks target real code.
codebox_style_settle = (ROOT / "src/ui/codebox/codeboxStyleSettle.js").read_text(encoding="utf-8", errors="replace")
style_root_runtime = (ROOT / "src/ui/styleRootRuntime.js").read_text(encoding="utf-8", errors="replace")
settings_panel_shell = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8", errors="replace")
src_all = "\n".join([main, module, codebox_style_runtime, codebox_frame_runtime, settings_panel_runtime, state_source, version_source, codebox_style_settle, style_root_runtime, settings_panel_shell])
dist = DIST.read_text(encoding="utf-8", errors="replace")

for label, text in (("source", src_all), ("dist", dist)):
    require(f'PROJECT_VERSION = "{version}"' in text or f'PROJECT_VERSION:"{version}"' in text or f'PROJECT_VERSION="{version}"' in text, f"{label} PROJECT_VERSION matches PROJECT.json")
    require(f'VERSION = "{internal}"' in text or internal in text, f"{label} VERSION matches PROJECT.json internal_version")
    require('function flushCodeboxStyleReapply(reason = "style-settle")' in text or 'function flushCodeboxStyleReapply(reason="style-settle")' in text, f"{label} has coalesced style flush helper")
    require('function clearCodeboxStyleSettleTimers()' in text, f"{label} clears trailing style timers on reschedule/uninstall")
    require(('codeboxStylePendingReasons: new Set()' in text or 'codeboxStylePendingReasons: /* @__PURE__ */ new Set()' in text or 'codeboxStylePendingReasons:new Set' in text), f"{label} tracks coalesced style reasons")
    require('codeboxStyleGeneration' in text and ('generation !== state.codeboxStyleGeneration' in text or 'generation===state.codeboxStyleGeneration' in text), f"{label} guards stale trailing style settles")
    require('function runScheduledStyleRootScan(reason = \'style-root-scan\')' in text or 'function runScheduledStyleRootScan(reason="style-root-scan")' in text, f"{label} has throttled root scan runner")
    require('styleRootScanLastAt' in text and 'styleRootScanTimer' in text, f"{label} tracks root scan throttle state")
    require('function codeboxFrameTokenKey(tokens)' in text, f"{label} can skip duplicate external-frame writes by style token signature")
    require('codeboxFrameLastRectKey' in text and 'codeboxFrameLastTokenKey' in text, f"{label} tracks duplicate frame overlay keys")
    require('syncCodeboxExternalFrame(editor, tokens, reason)' in text or 'syncCodeboxExternalFrame(editor,tokens,reason)' in text, f"{label} still performs immediate frame sync after style apply")
    # The live style-range (slider) update path was reworked from a direct
    # scheduleCodeboxStyleReapply("style-range-change") into the coalescing commit scheduler
    # scheduleStyleRangeCommitReapply(group = "style-range-change") (src/ui/codebox/codeboxStyleSettle.js),
    # which debounces and then calls scheduleCodeboxStyleReapply("style-range-commit"). Same
    # invariant — the live style-range update call site survives — at its current location.
    require('scheduleStyleRangeCommitReapply(group = "style-range-change")' in text or 'scheduleStyleRangeCommitReapply(group="style-range-change")' in text, f"{label} preserves live style slider update call site")
    require('scheduleCodeboxStyleReapply("style-option-change")' in text, f"{label} preserves live style option update call site")

require('function mutationRecordLooksEditorStructural(record)' in module, "editor lifecycle owner filters root observer mutations before scanning")
# main no longer calls the helper inline; the editor lifecycle owner exposes it through the
# delegate bridge (createEditorLifecycleSentinelRuntimeDelegates(() => editorLifecycleSentinelRuntime)),
# and main destructures mutationRecordLooksEditorStructural off that delegate bundle. Same
# invariant (main wires/preserves the structural mutation delegate) at its current location.
require('mutationRecordLooksEditorStructural' in main and 'createEditorLifecycleSentinelRuntimeDelegates(() => editorLifecycleSentinelRuntime)' in main, "main preserves structural mutation delegate")
require('function mutationRecordLooksEditorStructural' in dist, "dist includes structural mutation helper")
# The editor-lifecycle-owner work landed at v0.1.17; the invariant is that the project remains
# at or beyond that baseline (the release-specific internal_version suffix legitimately changes
# on later releases), so floor instead of pinning the exact literal.
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 17), "PROJECT.json remains at or beyond the v0.1.17 editor lifecycle owner baseline")
require("editor-lifecycle-owner" in internal or version_tuple > (0, 1, 17), "PROJECT.json internal_version records editor lifecycle owner (or version advanced beyond the baseline that introduced it)")
# The legacy `performance_telemetry_policy` PROJECT.json key was a monolith-shrink process
# ledger (tied to the now-deleted MONOLITH.md) and was intentionally removed (commit af6d7e2,
# "shipshape P2") when PROJECT.json became a slim machine-read surface. The canonical, still-living
# statement of the same no-telemetry/no-network performance policy is the threat-model ADR — mirror
# the re-pointing already used by tests/test_performance_telemetry_static.py.
THREAT_MODEL = ROOT / "docs/adr/005-threat-model.md"
threat_model = THREAT_MODEL.read_text(encoding="utf-8", errors="replace") if THREAT_MODEL.exists() else ""
require("no telemetry or external network access" in threat_model and "It must not add telemetry" in threat_model, "threat model documents the local-only / no-network performance policy")
require(internal in src_all and internal in dist, "source and dist both carry current runtime version")

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
