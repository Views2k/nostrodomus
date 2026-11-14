#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/main.legacy.js"
MODULE = ROOT / "src/editor/editorLifecycleSentinel.js"
# The runtime install/uninstall call seam moved out of the monolith into the public
# API runtime owner; the runtime-object delegate seam moved into the delegate bridge.
PUBLIC_API = ROOT / "src/core/publicApiRuntime.js"
DELEGATE_BRIDGE = ROOT / "src/composition/runtimeDelegateBridge.js"
# The "no-active-editor opening path must NOT aggressively remove codebox styles" guard
# moved out of the sentinel module into the codebox style runtime owner.
CODEBOX_STYLE_RUNTIME = ROOT / "src/ui/codeboxStyleRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/PERSISTENT_EDITOR_LIFECYCLE_SENTINEL_STATIC_TEST_REPORT.txt"

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
main = MAIN.read_text(encoding="utf-8", errors="replace")
module = MODULE.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")
public_api = PUBLIC_API.read_text(encoding="utf-8", errors="replace")
delegate_bridge = DELEGATE_BRIDGE.read_text(encoding="utf-8", errors="replace")
codebox_style_runtime = CODEBOX_STYLE_RUNTIME.read_text(encoding="utf-8", errors="replace")

# The editor lifecycle sentinel owner landed at v0.1.17; the invariant is the owner
# module + seam below, not a frozen version literal. Floor at the baseline that
# introduced it and accept later versions.
require(version_tuple >= (0, 1, 17), "PROJECT.json remains at or beyond the v0.1.17 editor lifecycle owner baseline")
# The "editor-lifecycle-owner" identifier is the v0.1.17-era internal_version name;
# accept either that id OR any version advanced past the baseline that introduced it.
require("editor-lifecycle-owner" in internal or version_tuple > (0, 1, 17), "internal_version records editor lifecycle owner (or version advanced past the baseline)")
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

# Call seam: the runtime install/uninstall invocation with its reason string moved out
# of the monolith into the public API runtime owner (src/core/publicApiRuntime.js), where
# it now uses single-quote + optional-chaining form on the lifecycle delegate.
for token in [
    "installEditorLifecycleSentinel?.('install')",
    "uninstallEditorLifecycleSentinel?.('uninstall')",
]:
    require(token in public_api, f"public API runtime preserves call seam: {token}")

# Delegate seam: the runtime-object property access (editorLifecycleSentinelRuntime.install/
# uninstallEditorLifecycleSentinel) is now wired through the named delegate bridge — main
# constructs the bridge via createEditorLifecycleSentinelRuntimeDelegates(() => runtime), and
# the bridge labels it "editorLifecycleSentinelRuntime" and lists both methods so each call
# delegates to runtime.installEditorLifecycleSentinel / runtime.uninstallEditorLifecycleSentinel.
require("createEditorLifecycleSentinelRuntimeDelegates" in main and
        "editorLifecycleSentinelRuntime = createEditorLifecycleSentinelRuntime(" in main,
        "main wires the editorLifecycleSentinelRuntime + its delegate bridge")
require('label: "editorLifecycleSentinelRuntime"' in delegate_bridge,
        "delegate bridge labels the editorLifecycleSentinelRuntime seam")
for token in [
    '"installEditorLifecycleSentinel"',
    '"uninstallEditorLifecycleSentinel"',
]:
    require(token in delegate_bridge, f"delegate bridge wires runtime-object method: {token}")

require('querySelectorAll?.("*")' not in module, "module sentinel observer does not recursively walk arbitrary dashboard shadows")
require('querySelectorAll?.(\'*\')' not in module, "module sentinel observer does not recursively walk arbitrary dashboard shadows single-quoted")
# No-editor opening path does not aggressively remove codebox styles: the guard moved to
# the codebox style runtime owner (source keeps the spaced `const removed = opening ? 0 : ...`
# form; the minified dist preserves the intent as `removed=opening?0:removeCodeboxRootStylesFromAllRoots`).
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
