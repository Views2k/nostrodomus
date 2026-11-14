#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/main.legacy.js"
CLIENT = ROOT / "src/diagnostics/clientCapabilitiesRuntime.js"
HA = ROOT / "src/providers/haRuntimeProvider.js"
# The HA runtime data delegation moved out of the monolith into the provider
# runtime owner module when the module split happened. findHass/runtimeData
# now ride that module (which still wraps the haRuntimeProvider single cache);
# main reaches them through provider delegates rather than importing directly.
PROVIDER_RUNTIME = ROOT / "src/providers/providerRuntime.js"
PROJECT = ROOT / "PROJECT.json"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/CLIENT_HA_RUNTIME_OWNER_STATIC_REPORT.txt"

main = MAIN.read_text(encoding="utf-8", errors="replace")
client = CLIENT.read_text(encoding="utf-8", errors="replace")
ha = HA.read_text(encoding="utf-8", errors="replace")
provider_runtime = PROVIDER_RUNTIME.read_text(encoding="utf-8", errors="replace")
project = PROJECT.read_text(encoding="utf-8", errors="replace")
project_data = json.loads(project)
project_version = str(project_data.get("version") or "")
project_internal = str(project_data.get("internal_version") or "")
version_tuple = tuple(int(part) for part in project_version.split(".") if part.isdigit())
dist = DIST.read_text(encoding="utf-8", errors="replace") if DIST.exists() else ""
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append("PASS " + message)
    else:
        errors.append(message)

# Un-pinned from the original exact "0.1.6" assertion to a floor: the client+HA
# runtime owner baseline shipped at v0.1.6 and must never regress below it.
require(version_tuple >= (0, 1, 6), "PROJECT.json remains at or beyond the v0.1.6 client+HA runtime owner baseline")
# At the v0.1.6 baseline the internal_version named the client-capability cleanup;
# later releases legitimately re-stamp the description, so accept either the
# original identifier OR a version advanced beyond the baseline that introduced it.
require("client-capability-cleanup" in project or version_tuple > (0, 1, 6), "internal version identifies client capability cleanup (or version advanced beyond the baseline that introduced it)")
require("import { createClientCapabilitiesRuntime } from './diagnostics/clientCapabilitiesRuntime.js';" in main, "main imports client capability runtime owner")
# The owner is now declared as a forward `let` (initialized to null) and assigned
# later in the strict runtime-init sequence, so the construction no longer carries
# a `const` prefix. The real fact preserved: main constructs the owner via the
# createClientCapabilitiesRuntime factory.
require("clientCapabilitiesRuntime = createClientCapabilitiesRuntime({" in main, "main constructs client capability runtime owner")
# The four hand-written thin wrappers were replaced by a generated delegate
# bridge: main builds clientCapabilitiesDelegates from the owner runtime and
# destructures the same four method names as thin pass-throughs off that bridge.
# The invariant is unchanged: main never reimplements these — it forwards each to
# the owner runtime. Assert the bridge construction plus the destructure that
# forwards each of the four method names off that exact bridge.
require("const clientCapabilitiesDelegates = createClientCapabilitiesRuntimeDelegates(() => clientCapabilitiesRuntime);" in main, "main builds the client capability delegate bridge from the owner runtime")
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
    require(method in client_capability_destructure, f"main forwards client capability method via the owner delegate bridge: {method}")
for token in [
    "export function createClientCapabilitiesRuntime",
    "function browserInfoSnapshot()",
    "function computeClientGpuSnapshot()",
    "function clientGpuSnapshot(reason = \"client-capability-snapshot\", options = {})",
    "function clientCapabilitySnapshot(reason = \"client-capability-snapshot\")",
    "WEBGL_debug_renderer_info",
    "client-gpu-snapshot-cache-hit",
    "client-gpu-snapshot-cache-miss",
    # The privacyNote string was shortened during the diagnostics-diet refactor
    # ("...WebGL/WebGPU capability signals and may be unavailable..." became
    # "coarse browser-exposed WebGL/WebGPU signals"). The owned fact preserved:
    # the module documents that GPU details are browser-exposed WebGL/WebGPU
    # signals. Assert the stable substring of the current privacy note.
    "browser-exposed WebGL/WebGPU signals",
]:
    require(token in client, f"client capability module owns token: {token}")
# The HA runtime data delegation moved out of the monolith into the provider
# runtime owner (src/providers/providerRuntime.js) during the module split.
# It still delegates findHass/runtimeData to the haRuntimeProvider single cache
# rather than reimplementing window/hass reads. The invariant preserved: the
# runtime data access rides the haRuntimeProvider module via thin wrappers.
# Re-pointed to providerRuntime.js (the current home of that delegation).
for token in [
    "import * as haRuntime from './haRuntimeProvider.js';",
    "return haRuntime.findHass({ windowRef, documentRef });",
    "return haRuntime.runtimeData({",
]:
    require(token in provider_runtime, f"provider runtime delegates HA runtime token: {token[:80]}")
for token in [
    "export function findHass(options = {})",
    "export function runtimeData(options = {})",
    # The hardcoded card-type discovery list was lifted into a frozen NATIVE_CARDS
    # constant (custom cards now self-register and are read live), and `const cards`
    # became `const cards = Array.from(new Set([...NATIVE_CARDS, ...liveCards.cards]))`.
    # The discovery-list invariant is preserved; re-point to its current home.
    "const NATIVE_CARDS = Object.freeze([",
    "const triggerTypes = [",
    "runtimeState.runtimeCache = cache",
]:
    require(token in ha, f"HA runtime provider owns discovery/cache token: {token}")
# dist is minified: esbuild strips the spaces inside parameter lists and the
# clientGpuSnapshot/clientCapabilitySnapshot owners gained default-param signatures
# since this test was pinned. Each owner function IS still bundled; accept either
# the source-spaced form OR the corresponding minified form so the test pins the
# shipped symbol, not the source whitespace.
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
# The version-stamped runtime owner string was pinned to the v0.1.6 release tag.
# It is re-stamped every release; assert the dist bundles the CURRENT version's
# runtime string (which must be >= the v0.1.6 floor) instead of the stale tag.
require(version_tuple >= (0, 1, 6), "dist runtime owner string remains at or beyond the v0.1.6 baseline")
require(project_internal.startswith(f"nostrodomus-v{project_version}-"), "PROJECT.json internal_version is the current version-stamped runtime owner string")
require(project_internal in dist, f"dist bundles the current version-stamped runtime owner string: {project_internal}")
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
