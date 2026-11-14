#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/LIFECYCLE_OBSERVER_PRUNING_STATIC_TEST_REPORT.txt"

# The monolith was decomposed into src modules, so the lifecycle/observer-pruning and
# persistent-listener invariants that used to live inline in src/main.legacy.js now live in
# their extracted owner modules. The SAME facts are checked, just at their current locations:
#   - style-root observer pruning   -> src/ui/styleRootRuntime.js
#   - persistent listener lifecycle -> src/core/persistentListenersRuntime.js
#   - observer/listener diagnostics  -> src/diagnostics/telemetryRuntime.js
#   - state counters                 -> src/core/state.js
#   - public api wiring + teardown   -> src/core/publicApiRuntime.js
# The bundled dist still carries every fact in minified form (double-quoted, no spacing,
# true -> !0), so the dist side asserts the minified literal.
SRC_OWNERS = [
    ROOT / "src/ui/styleRootRuntime.js",
    ROOT / "src/core/persistentListenersRuntime.js",
    ROOT / "src/core/state.js",
    ROOT / "src/diagnostics/telemetryRuntime.js",
    ROOT / "src/core/publicApiRuntime.js",
]

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))

# Combined current source text across the extracted owner modules.
src_text = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in SRC_OWNERS)
dist_text = DIST.read_text(encoding="utf-8", errors="replace")

# (label, source-form token, dist minified-form token). src uses single quotes + spacing;
# dist normalizes to double quotes and strips spacing (and true -> !0). Both forms encode the
# same lifecycle/observer fact.
checks = [
    ("function pruneStyleRootObservers",
     "function pruneStyleRootObservers(reason = 'style-root-prune')",
     'function pruneStyleRootObservers(reason="style-root-prune")'),
    ("function isStyleRootObserverAlive",
     "function isStyleRootObserverAlive(root)",
     "function isStyleRootObserverAlive(root)"),
    ("observer takeRecords drain",
     "observer?.takeRecords?.()",
     "observer?.takeRecords?.()"),
    ("observer disconnect on prune",
     "observer?.disconnect?.()",
     "observer?.disconnect?.()"),
    ("prunedStyleRootObservers counter",
     "prunedStyleRootObservers",
     "prunedStyleRootObservers"),
    ("lastPruneReason counter",
     "lastPruneReason",
     "lastPruneReason"),
    ("lastPruneAt counter",
     "lastPruneAt",
     "lastPruneAt"),
    ("Observers pruned diagnostic",
     'diagnosticValue("Observers pruned"',
     'diagnosticValue("Observers pruned"'),
    ("function addPersistentListener",
     "function addPersistentListener(target, type, handler, options = {}, reason = 'persistent-listener')",
     "function addPersistentListener(target,type,handler,options={},reason=\"persistent-listener\")"),
    ("function removePersistentListeners",
     "function removePersistentListeners(reason = 'uninstall')",
     'function removePersistentListeners(reason="uninstall")'),
    ("persistentListeners state list",
     "persistentListeners",
     "persistentListeners"),
    ("listenerStats bookkeeping",
     "listenerStats",
     "listenerStats"),
    ("Persistent listeners diagnostic",
     'diagnosticValue("Persistent listeners"',
     'diagnosticValue("Persistent listeners"'),
    ("document pointerdown via persistent listener",
     "addPersistentListener?.(documentRef, 'pointerdown', apiMethods.onPointer, true, 'document-pointerdown')",
     'addPersistentListener?.(documentRef,"pointerdown",apiMethods.onPointer,!0,"document-pointerdown")'),
    ("uninstall via removePersistentListeners",
     "removePersistentListeners?.('uninstall')",
     'removePersistentListeners?.("uninstall")'),
    ("public window alias",
     "W.__nostrodomus = api",
     "W.__nostrodomus=api"),
    ("Browser window diagnostic",
     'diagnosticValue("Browser window"',
     'diagnosticValue("Browser window"'),
]

for label, src_form, dist_form in checks:
    require(src_form in src_text, f"src contains lifecycle/observer token: {label}")
    require(dist_form in dist_text, f"dist contains lifecycle/observer token: {label}")

# Persistent-listener teardown must go through removePersistentListeners (batch removal that
# clears state.persistentListeners), never a one-off document.removeEventListener for pointerdown.
require("document.removeEventListener('pointerdown', onPointer, true)" not in src_text and
        'document.removeEventListener("pointerdown", onPointer, true)' not in src_text,
        "src uses persistent-listener teardown instead of one-off pointerdown removal")
require('removeEventListener("pointerdown",onPointer,!0)' not in dist_text and
        "removeEventListener('pointerdown',onPointer,!0)" not in dist_text,
        "dist uses persistent-listener teardown instead of one-off pointerdown removal")

# Version pin un-pinned: the original v31.6.41 literal pin carried forward across the 31.6.x ->
# 0.1.x SemVer reset. The invariant is the lifecycle/observer ownership above, not a frozen
# version literal, so floor at the version where all extracted owners (style-root prune owner
# 0.1.19, persistent-listener owner 0.1.35) coexisted. Mirrors the dynamic-floor pattern in
# tests/test_visual_layer_baseline_contract_static.py and
# tests/test_codemirror_observer_containment_static.py.
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 35), "PROJECT.json remains at or beyond the lifecycle/observer owner baseline (SemVer line)")
# The legacy "editor-blur-preview-prepaint" identifier was an old-era (v31.x) internal_version
# name retired at the SemVer reset; accept either that legacy id OR any version advanced past
# the floor.
require("editor-blur-preview-prepaint" in internal or version_tuple > (0, 1, 35),
        "PROJECT.json internal_version records the lifecycle/observer owner (or version advanced past the baseline)")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Lifecycle observer pruning static test\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("LIFECYCLE OBSERVER PRUNING STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("LIFECYCLE OBSERVER PRUNING STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
