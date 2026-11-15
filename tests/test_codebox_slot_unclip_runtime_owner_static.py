#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "src/app.js").read_text(encoding="utf-8", errors="replace")
MODULE_PATH = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"
MODULE = MODULE_PATH.read_text(encoding="utf-8", errors="replace") if MODULE_PATH.exists() else ""
# The slot and dialog-body unclip functions; createCodeboxStyleRuntime wires them through
# createCodeboxUnclip.
UNCLIP_PATH = ROOT / "src" / "ui" / "codebox" / "codeboxUnclip.js"
UNCLIP = UNCLIP_PATH.read_text(encoding="utf-8", errors="replace") if UNCLIP_PATH.exists() else ""
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
require("import { createCodeboxUnclip } from './codebox/codeboxUnclip.js';" in MODULE, "codebox runtime imports the slot-unclip module")
require("const unclip = createCodeboxUnclip({" in MODULE, "codebox runtime wires createCodeboxUnclip into the owner factory")
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

# app.js has no slot-unclip wrappers of its own; it destructures them from delegates that
# call the live codebox style runtime.
require(
    'const codeboxStyleDelegates = createCodeboxStyleRuntimeDelegates(() => codeboxStyleRuntime);' in MAIN,
    "main binds the codebox style runtime owner through the delegate bridge",
)
require('= codeboxStyleDelegates;' in MAIN, "main destructures slot-unclip functions from the runtime delegate object")
for name in [
    'labelCodeboxUnclipTarget',
    'cleanupCodeboxSlotUnclip',
    'applyCodeboxSlotDialogBodyUnclip',
]:
    require(name in MAIN, f"main keeps thin slot-unclip delegation: {name}")

for forbidden in [
    'function applyCodeboxSlotDialogBodyUnclip(editor, reason = "slot-dialog-body") {\n    const frameHost = codeboxFrameHostForEditor(editor);',
    'function cleanupCodeboxSlotUnclip(reason = "cleanup") {\n    if (state.codeboxSlotUnclipObservers) {',
    'function rememberCodeboxUnclipOriginal(node) {\n    if (!node?.style || state.codeboxSlotUnclipOriginals?.has?.(node)) return;',
]:
    require(forbidden not in MAIN, f"main does not own slot-unclip body: {forbidden[:96]}")

# esbuild removes the spaces around `=` and after commas.
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
