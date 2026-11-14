#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8", errors="replace")
MODULE_PATH = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"
MODULE = MODULE_PATH.read_text(encoding="utf-8", errors="replace") if MODULE_PATH.exists() else ""
# UI_DECOMP P2 (v0.1.x): the slot/dialog-body unclip function bodies were extracted verbatim out of
# codeboxStyleRuntime.js into this seam, which the runtime owner (createCodeboxStyleRuntime) imports and
# wires via createCodeboxUnclip. The runtime is still the owner of the slot-unclip path; the bodies now
# live here. Assertions that checked the bodies/telemetry against MODULE re-point to UNCLIP (same fact,
# moved location).
UNCLIP_PATH = ROOT / "src" / "ui" / "codebox" / "codeboxUnclip.js"
UNCLIP = UNCLIP_PATH.read_text(encoding="utf-8", errors="replace") if UNCLIP_PATH.exists() else ""
PROJECT = (ROOT / "PROJECT.json").read_text(encoding="utf-8", errors="replace")
DIST = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8", errors="replace") if (ROOT / "dist" / "nostrodomus.js").exists() else ""
REPORT = ROOT / "reports" / "CODEBOX_SLOT_UNCLIP_RUNTIME_OWNER_STATIC_REPORT.txt"

errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append("PASS " + message)
    else:
        errors.append(message)

require('export function createCodeboxStyleRuntime(ctx = {})' in MODULE, "codebox style runtime factory remains owner")
# The runtime owner still owns the slot-unclip path: it imports and wires the extracted unclip seam
# (createCodeboxUnclip from ./codebox/codeboxUnclip.js) and re-exposes the slot-unclip methods.
require("import { createCodeboxUnclip } from './codebox/codeboxUnclip.js';" in MODULE, "codebox runtime imports the extracted slot-unclip seam")
require("const unclip = createCodeboxUnclip({" in MODULE, "codebox runtime wires createCodeboxUnclip into the owner factory")
# The slot-unclip telemetry literal now lives in the extracted seam (verbatim move).
require("codebox-slot-unclip" in UNCLIP, "codebox runtime owns slot-unclip telemetry path")

for token in [
    'function labelCodeboxUnclipTarget(node) {',
    'function rememberCodeboxUnclipOriginal(node) {',
    'function setImportantIfNeeded(node, prop, value) {',
    'function forceCodeboxUnclipTarget(node, reason = "slot-dialog-body") {',
    'function restoreCodeboxUnclipTarget(node, old) {',
    'function cleanupCodeboxSlotUnclip(reason = "cleanup") {',
    'function isCodeboxSlotUnclipTarget(node, stacked = false) {',
    'function attachCodeboxSlotUnclipObserver(node, reason) {',
    'function applyCodeboxSlotDialogBodyUnclip(editor, reason = "slot-dialog-body") {',
    'state.codeboxSlotUnclipOriginals.set(node, {',
    'state.codeboxSlotUnclipObservers.set(node, observer);',
    'recordPerformanceEvent("codebox-slot-unclip", 0, `${reason}:${targets.size}`);',
]:
    require(token in UNCLIP, f"codebox runtime owns slot-unclip body token: {token}")

# Same invariant, current form: main no longer hand-writes one pass-through wrapper per slot-unclip
# function. It binds them through the stable delegate bridge (createCodeboxStyleRuntimeDelegates, which
# proxies each call to the live codeboxStyleRuntime owner) and destructures them from codeboxStyleDelegates.
# That is still a thin delegation to the runtime owner, not a re-owned body in main. We assert both the
# delegate construction and that each function name is bound from the delegate object.
require(
    'const codeboxStyleDelegates = createCodeboxStyleRuntimeDelegates(() => codeboxStyleRuntime);' in MAIN,
    "main binds the codebox style runtime owner through the stable delegate bridge",
)
require('= codeboxStyleDelegates;' in MAIN, "main destructures slot-unclip functions from the runtime delegate object")
for name in [
    'labelCodeboxUnclipTarget',
    'cleanupCodeboxSlotUnclip',
    'applyCodeboxSlotDialogBodyUnclip',
]:
    require(name in MAIN, f"main keeps thin slot-unclip delegation: {name}")

require(
    'v31.6.394 codebox slot-unclip runtime owner extraction lineage tokens' not in MAIN,
    "main no longer preserves codebox slot-unclip lineage comment archaeology",
)

for forbidden in [
    'function applyCodeboxSlotDialogBodyUnclip(editor, reason = "slot-dialog-body") {\n    const frameHost = codeboxFrameHostForEditor(editor);',
    'function cleanupCodeboxSlotUnclip(reason = "cleanup") {\n    if (state.codeboxSlotUnclipObservers) {',
    'function rememberCodeboxUnclipOriginal(node) {\n    if (!node?.style || state.codeboxSlotUnclipOriginals?.has?.(node)) return;',
]:
    require(forbidden not in MAIN, f"main no longer owns slot-unclip body: {forbidden[:96]}")

# dist is minified (esbuild): source-spaced strings ("editor, reason = " / ", 0, ") collapse to the
# minified form (no spaces around `=`, no spaces after commas). Match the minified bytes — same fact.
for token in [
    'function applyCodeboxSlotDialogBodyUnclip(editor,reason="slot-dialog-body")',
    'recordPerformanceEvent("codebox-slot-unclip",0,`${reason}:${targets.size}`)',
]:
    require(token in DIST, f"dist bundles slot-unclip owner token: {token[:96]}")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Codebox slot-unclip runtime owner static report\n\nResults:\n"
    + "\n".join(notes)
    + "\n\nErrors:\n"
    + "\n".join(errors)
    + "\n",
    encoding="utf-8",
)

if errors:
    print("CODEBOX SLOT-UNCLIP RUNTIME OWNER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("CODEBOX SLOT-UNCLIP RUNTIME OWNER STATIC TEST OK")
print("Report:", REPORT)
