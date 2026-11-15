#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/app.js"
CLIENT = ROOT / "src/diagnostics/clientCapabilitiesRuntime.js"
HA = ROOT / "src/providers/haRuntimeProvider.js"
# findHass and runtimeData are called through providerRuntime.js, which wraps the single
# haRuntimeProvider cache.
PROVIDER_RUNTIME = ROOT / "src/providers/providerRuntime.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/CLIENT_HA_RUNTIME_OWNER_STATIC_REPORT.txt"

main = MAIN.read_text(encoding="utf-8", errors="replace")
client = CLIENT.read_text(encoding="utf-8", errors="replace")
ha = HA.read_text(encoding="utf-8", errors="replace")
provider_runtime = PROVIDER_RUNTIME.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace") if DIST.exists() else ""
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append("PASS " + message)
    else:
        errors.append(message)

require("import { createClientCapabilitiesRuntime } from './diagnostics/clientCapabilitiesRuntime.js';" in main, "main imports client capability runtime owner")
require("clientCapabilitiesRuntime = createClientCapabilitiesRuntime({" in main, "main constructs client capability runtime owner")
# main does not reimplement the four client capability methods; it destructures them
# from delegates that forward to the owner runtime.
require("const clientCapabilitiesDelegates = createClientCapabilitiesRuntimeDelegates(() => clientCapabilitiesRuntime);" in main, "main builds the client capability delegates from the owner runtime")
client_capability_destructure = ""
for line in main.splitlines():
    if "= clientCapabilitiesDelegates;" in line and line.strip().startswith("const {"):
        client_capability_destructure = line
        break
for method in [
    "browserInfoSnapshot",
    "computeClientGpuSnapshot",
    "clientGpuSnapshot",
    "clientCapabilitySnapshot",
]:
    require(method in client_capability_destructure, f"main forwards client capability method through the owner delegates: {method}")
for token in [
    "export function createClientCapabilitiesRuntime",
    "function browserInfoSnapshot()",
    "function computeClientGpuSnapshot()",
    "function clientGpuSnapshot(reason = \"client-capability-snapshot\", options = {})",
    "function clientCapabilitySnapshot(reason = \"client-capability-snapshot\")",
    "WEBGL_debug_renderer_info",
    "client-gpu-snapshot-cache-hit",
    "client-gpu-snapshot-cache-miss",
    # The privacy note: GPU details are signals the browser exposes.
    "browser-exposed WebGL/WebGPU signals",
]:
    require(token in client, f"client capability module owns token: {token}")
# providerRuntime.js reads Home Assistant data through haRuntimeProvider instead of reading
# window or hass itself.
for token in [
    "import * as haRuntime from './haRuntimeProvider.js';",
    "return haRuntime.findHass({ windowRef, documentRef });",
    "return haRuntime.runtimeData({",
]:
    require(token in provider_runtime, f"provider runtime delegates HA runtime token: {token[:80]}")
for token in [
    "export function findHass(options = {})",
    "export function runtimeData(options = {})",
    # Built-in card types; custom cards register themselves and are read at runtime.
    "const NATIVE_CARDS = Object.freeze([",
    "const triggerTypes = [",
    "runtimeState.runtimeCache = cache",
]:
    require(token in ha, f"HA runtime provider owns discovery/cache token: {token}")
# esbuild removes the spaces inside parameter lists (and may rename a parameter), so the
# dist checks accept the source form or the bundled form.
require("function browserInfoSnapshot()" in dist, "dist bundles owner token: browserInfoSnapshot")
require("function computeClientGpuSnapshot()" in dist, "dist bundles owner token: computeClientGpuSnapshot")
require(
    "function clientGpuSnapshot()" in dist
    or 'function clientGpuSnapshot(reason = "client-capability-snapshot", options = {})' in dist
    or 'function clientGpuSnapshot(reason="client-capability-snapshot",options={})' in dist
    or 'function clientGpuSnapshot(reason="client-capability-snapshot",options2={})' in dist,
    "dist bundles owner token: clientGpuSnapshot",
)
require(
    "function clientCapabilitySnapshot()" in dist
    or 'function clientCapabilitySnapshot(reason = "client-capability-snapshot")' in dist
    or 'function clientCapabilitySnapshot(reason="client-capability-snapshot")' in dist,
    "dist bundles owner token: clientCapabilitySnapshot",
)
require(
    "function findHass(options = {})" in dist or "function findHass(options={}" in dist,
    "dist bundles owner token: findHass",
)
require(
    "function runtimeData(options = {})" in dist or "function runtimeData(options={}" in dist,
    "dist bundles owner token: runtimeData",
)
for forbidden in ["fetch(", "sendBeacon", "setInterval(() => clientCapabilitySnapshot"]:
    require(forbidden not in client, f"client capability owner remains local-only/no polling: {forbidden}")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Client + HA runtime owner static report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)
if errors:
    print("CLIENT + HA RUNTIME OWNER STATIC TEST FAILED")
    for err in errors:
        print("-", err)
    print("Report:", REPORT)
    sys.exit(1)
print("CLIENT + HA RUNTIME OWNER STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
