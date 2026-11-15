#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/app.js"
MODULE = ROOT / "src/editor/editorLifecycleSentinel.js"
# Installs and uninstalls the sentinel.
PUBLIC_API = ROOT / "src/core/publicApiRuntime.js"
DELEGATE_BRIDGE = ROOT / "src/composition/runtimeDelegateBridge.js"
# Holds the guard that keeps codebox styles while an editor is opening.
CODEBOX_STYLE_RUNTIME = ROOT / "src/ui/codeboxStyleRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/PERSISTENT_EDITOR_LIFECYCLE_SENTINEL_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

main = MAIN.read_text(encoding="utf-8", errors="replace")
module = MODULE.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")
public_api = PUBLIC_API.read_text(encoding="utf-8", errors="replace")
delegate_bridge = DELEGATE_BRIDGE.read_text(encoding="utf-8", errors="replace")
codebox_style_runtime = CODEBOX_STYLE_RUNTIME.read_text(encoding="utf-8", errors="replace")

require(MODULE.exists(), "editor lifecycle sentinel owner module exists")
require("createEditorLifecycleSentinelRuntime" in main, "main wires editor lifecycle sentinel runtime owner")

for token in [
    "function installEditorLifecycleSentinel(",
    "function uninstallEditorLifecycleSentinel(",
    "function scheduleEditorPresenceProbe(",
    "function runEditorPresenceProbe(",
    "function handleEditorSentinelDetected(",
    "function editorLikelyOpeningWithoutMountedCodebox(",
    "scheduleCodeboxStyleReapply(`editor-sentinel-new-${reason}`)",
    "forceStyleRootScanNextFrame(`editor-sentinel-new-${reason}`)",
    "editor-sentinel-stable-hit",
    "editorSentinelObservers",
]:
    require(token in module, f"module owns sentinel token: {token}")

for token in [
    "installEditorLifecycleSentinel?.('install')",
    "uninstallEditorLifecycleSentinel?.('uninstall')",
]:
    require(token in public_api, f"public API runtime calls: {token}")

# app.js reaches install and uninstall through the sentinel runtime delegates.
require("createEditorLifecycleSentinelRuntimeDelegates" in main and
        "editorLifecycleSentinelRuntime = createEditorLifecycleSentinelRuntime(" in main,
        "main wires the editorLifecycleSentinelRuntime and its delegates")
require('label: "editorLifecycleSentinelRuntime"' in delegate_bridge,
        "delegate bridge labels the editorLifecycleSentinelRuntime delegates")
for token in [
    '"installEditorLifecycleSentinel"',
    '"uninstallEditorLifecycleSentinel"',
]:
    require(token in delegate_bridge, f"delegate bridge wires runtime-object method: {token}")

require('querySelectorAll?.("*")' not in module, "module sentinel observer does not recursively walk arbitrary dashboard shadows")
require('querySelectorAll?.(\'*\')' not in module, "module sentinel observer does not recursively walk arbitrary dashboard shadows single-quoted")
# While an editor is opening and not mounted yet, the no-editor path keeps the codebox styles.
require("const removed = opening ? 0 : removeCodeboxRootStylesFromAllRoots" in codebox_style_runtime,
        "source no-editor opening path does not aggressively remove codebox styles")
require("removed=opening?0:removeCodeboxRootStylesFromAllRoots" in dist,
        "dist no-editor opening path does not aggressively remove codebox styles (minified)")
for label, text in (("module", module), ("dist", dist)):
    require("mutationRecordsAreCodeMirrorOnly" in text, f"{label} keeps CodeMirror-only mutation containment available")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Persistent editor lifecycle sentinel static test\n\nResults:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("PERSISTENT EDITOR LIFECYCLE SENTINEL STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("PERSISTENT EDITOR LIFECYCLE SENTINEL STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
