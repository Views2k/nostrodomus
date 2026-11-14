#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "PROJECT.json"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/CONSOLE_LOG_GATING_STATIC_TEST_REPORT.txt"

# Console-log-gating invariant owners after the monolith was decomposed into modules.
# Same facts, current locations:
#   - runtime identity constants (VERSION / PROJECT_VERSION) -> src/core/version.js
#   - the nostrodomusDebug flag, the single startup badge helper, the centralized gated
#     info/warn/error logging helpers -> src/core/loggingRuntime.js
#   - the diagnostics console-policy payload (globalConsolePatch / unrelatedCardsSuppressed /
#     debugEnableCommand + the ready/degraded badge output strings) -> src/diagnostics/telemetryRuntime.js
VERSION_SRC = ROOT / "src/core/version.js"
LOGGING_SRC = ROOT / "src/core/loggingRuntime.js"
TELEMETRY_SRC = ROOT / "src/diagnostics/telemetryRuntime.js"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())

version_src = VERSION_SRC.read_text(encoding="utf-8", errors="replace")
logging_src = LOGGING_SRC.read_text(encoding="utf-8", errors="replace")
telemetry_src = TELEMETRY_SRC.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")

# --- Version identity (UN-PINNED from the old exact v31.6.41 literal). The console-log-gating
# invariant is the gated-logging behavior below, not a frozen version literal; it was introduced
# at v31.6.29 and carried forward across the 31.6.x -> 0.1.x SemVer reset.
# Floor at the start of the SemVer line and verify the current literals are actually present. ---
require(version_tuple >= (0, 1, 0), "PROJECT.json remains at or beyond the SemVer baseline that carries console log gating")
require("console-log-gating" in internal or version_tuple > (0, 1, 0),
        "internal_version records console log gating (or version advanced past the baseline that introduced it)")

# The version identity moved out of src/main.legacy.js into the wired src/core/version.js (source)
# while the bundled dist still carries the minified literals (VERSION="...", PROJECT_VERSION="...").
require(f'export const VERSION = "{internal}"' in version_src or f'const VERSION = "{internal}"' in version_src,
        "src/core/version.js VERSION matches project internal_version")
require(f'export const PROJECT_VERSION = "{version}"' in version_src or f'const PROJECT_VERSION = "{version}"' in version_src,
        "src/core/version.js PROJECT_VERSION matches project version")
require(f'VERSION="{internal}"' in dist, "dist VERSION matches project internal_version")
require(f'PROJECT_VERSION="{version}"' in dist, "dist PROJECT_VERSION matches project version")

# --- Console-log-gating behavior. Each fact is checked against (a) the SOURCE module that now owns
# it and (b) the bundled dist (minified form). Same invariant, current location/form. ---

# 1) The localStorage nostrodomusDebug flag is the single gate for routine logging.
require("nostrodomusDebug" in logging_src, "src uses localStorage nostrodomusDebug flag")
require("nostrodomusDebug" in dist, "dist uses localStorage nostrodomusDebug flag")

# 2) One startup badge helper (emitStartupBadge) replaces normal startup logging.
require("function emitStartupBadge()" in logging_src, "src has single startup badge helper")
require("function emitStartupBadge()" in dist, "dist has single startup badge helper")

# 3) Ready/degraded badge strings. Source uses literal ✦/⚠; esbuild escapes them in dist as
#    ✦ / ⚠. Both the gated badge helper (loggingRuntime) and the diagnostics payload
#    (telemetryRuntime) carry the NOSTRODOMUS badge text.
require(("✦' : '⚠'} NOSTRODOMUS" in logging_src) or
        (("✦ NOSTRODOMUS" in telemetry_src) and ("⚠ NOSTRODOMUS" in telemetry_src)),
        "src has ready/degraded badge strings")
require(("✦ NOSTRODOMUS" in dist or "\\u2726 NOSTRODOMUS" in dist) and
        ("⚠ NOSTRODOMUS" in dist or "\\u26A0 NOSTRODOMUS" in dist),
        "dist has ready/degraded badge strings")

# 4) The diagnostics console-policy payload documents that there is NO global console patching and
#    NO suppression of unrelated HA cards (telemetryRuntime, minified to ...:!1 in dist).
require("globalConsolePatch: false" in telemetry_src, "src documents no global console patching")
require("globalConsolePatch: false" in dist or "globalConsolePatch:!1" in dist, "dist documents no global console patching")
require("unrelatedCardsSuppressed: false" in telemetry_src, "src documents unrelated cards are not suppressed")
require("unrelatedCardsSuppressed: false" in dist or "unrelatedCardsSuppressed:!1" in dist, "dist documents unrelated cards are not suppressed")

# 5) The explicit, documented debug-enable command (set the flag + reload).
require("debugEnableCommand" in telemetry_src and "location.reload();" in telemetry_src,
        "src exposes explicit debug enable command")
require("debugEnableCommand" in dist and "location.reload()" in dist,
        "dist exposes explicit debug enable command")

# 6) The old unconditional uninstall log and the old installed-object log stay removed everywhere.
require('console.info(LOG_PREFIX, "uninstalled")' not in logging_src and
        'console.info(LOG_PREFIX,"uninstalled")' not in dist,
        "removed unconditional uninstall log")
require('logInfoOnce("installed"' not in logging_src and 'logInfoOnce("installed"' not in dist,
        "removed old installed object log")

# 7) Info logging is centralized inside ONE gated helper (logInfoOnce), so console.info routes
#    through the LOG_PREFIX call there. Dist minifies the spread call to no inner space.
require("console.info(LOG_PREFIX, ...args)" in logging_src, "src keeps info logging centralized inside gated helper")
require("console.info(LOG_PREFIX, ...args)" in dist or "console.info(LOG_PREFIX,...args)" in dist,
        "dist keeps info logging centralized inside gated helper")

# 8) Routine info/warn/error logging is gated behind the debug flag (early-return guard). Dist
#    minifies the guard to (!debugLoggingEnabled())return.
require("if (!debugLoggingEnabled()) return;" in logging_src, "src gates routine info/warn/error logs behind debug flag")
require("if (!debugLoggingEnabled()) return;" in dist or "(!debugLoggingEnabled())return" in dist,
        "dist gates routine info/warn/error logs behind debug flag")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Console log gating static test\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("CONSOLE LOG GATING STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("CONSOLE LOG GATING STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
