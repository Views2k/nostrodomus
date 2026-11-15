#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/CONSOLE_LOG_GATING_STATIC_TEST_REPORT.txt"

# Routine console output is off unless the nostrodomusDebug flag is set.
#   - src/core/loggingRuntime.js: the debug flag, the startup badge and the gated log helpers
#   - src/diagnostics/diagnosticsRuntime.js: the console policy in the diagnostics payload
LOGGING_SRC = ROOT / "src/core/loggingRuntime.js"
TELEMETRY_SRC = ROOT / "src/diagnostics/diagnosticsRuntime.js"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

logging_src = LOGGING_SRC.read_text(encoding="utf-8", errors="replace")
telemetry_src = TELEMETRY_SRC.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")

# Each fact is checked in the source module and in dist (minified form).

# 1) The localStorage nostrodomusDebug flag is the single gate for routine logging.
require("nostrodomusDebug" in logging_src, "src uses localStorage nostrodomusDebug flag")
require("nostrodomusDebug" in dist, "dist uses localStorage nostrodomusDebug flag")

# 2) One startup badge helper (emitStartupBadge) is the only startup output.
require("function emitStartupBadge()" in logging_src, "src has single startup badge helper")
require("function emitStartupBadge()" in dist, "dist has single startup badge helper")

# 3) Ready/degraded badge strings. Source uses literal ✦/⚠; dist may carry them as ✦ and
#    ⚠ escapes. The badge helper (loggingRuntime) and the diagnostics payload
#    (telemetryRuntime) both carry the NOSTRODOMUS badge text.
require(("✦' : '⚠'} NOSTRODOMUS" in logging_src) or
        (("✦ NOSTRODOMUS" in telemetry_src) and ("⚠ NOSTRODOMUS" in telemetry_src)),
        "src has ready/degraded badge strings")
require(("✦ NOSTRODOMUS" in dist or "\\u2726 NOSTRODOMUS" in dist) and
        ("⚠ NOSTRODOMUS" in dist or "\\u26A0 NOSTRODOMUS" in dist),
        "dist has ready/degraded badge strings")

# 4) The diagnostics console-policy payload documents that there is no global console patching and
#    no suppression of unrelated HA cards (telemetryRuntime, minified to ...:!1 in dist).
require("globalConsolePatch: false" in telemetry_src, "src documents no global console patching")
require("globalConsolePatch: false" in dist or "globalConsolePatch:!1" in dist, "dist documents no global console patching")
require("unrelatedCardsSuppressed: false" in telemetry_src, "src documents unrelated cards are not suppressed")
require("unrelatedCardsSuppressed: false" in dist or "unrelatedCardsSuppressed:!1" in dist, "dist documents unrelated cards are not suppressed")

# 5) The explicit, documented debug-enable command (set the flag + reload).
require("debugEnableCommand" in telemetry_src and "location.reload();" in telemetry_src,
        "src exposes explicit debug enable command")
require("debugEnableCommand" in dist and "location.reload()" in dist,
        "dist exposes explicit debug enable command")

# 6) No unconditional uninstall log and no installed-object log.
require('console.info(LOG_PREFIX, "uninstalled")' not in logging_src and
        'console.info(LOG_PREFIX,"uninstalled")' not in dist,
        "no unconditional uninstall log")
require('logInfoOnce("installed"' not in logging_src and 'logInfoOnce("installed"' not in dist,
        "no installed object log")

# 7) Info logging is centralized inside one gated helper (logInfoOnce), so console.info routes
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
