#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/LIFECYCLE_OBSERVER_PRUNING_STATIC_TEST_REPORT.txt"

# Style-root observers are pruned and persistent listeners are tracked and removed together:
#   - style-root observer pruning: src/ui/styleRootRuntime.js
#   - persistent listener lifecycle: src/core/persistentListenersRuntime.js
#   - observer and listener diagnostics: src/diagnostics/diagnosticsRuntime.js
#   - state counters: src/core/state.js
#   - public API wiring and teardown: src/core/publicApiRuntime.js
# dist writes double quotes, no spaces and !0 for true, so it is checked in that form.
SRC_OWNERS = [
    ROOT / "src/ui/styleRootRuntime.js",
    ROOT / "src/core/persistentListenersRuntime.js",
    ROOT / "src/core/state.js",
    ROOT / "src/diagnostics/diagnosticsRuntime.js",
    ROOT / "src/core/publicApiRuntime.js",
]

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

src_text = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in SRC_OWNERS)
dist_text = DIST.read_text(encoding="utf-8", errors="replace")

# (label, source form, dist form)
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
