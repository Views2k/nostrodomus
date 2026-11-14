#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8", errors="replace")
DIST = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8", errors="replace") if (ROOT / "dist/nostrodomus.js").exists() else ""
MOD = (ROOT / "src/ui/codeboxStyle.js").read_text(encoding="utf-8", errors="replace")
TEST = (ROOT / "tests/ui/codebox_style_module.test.mjs").read_text(encoding="utf-8", errors="replace")
# The settle/reapply scheduling owner moved out of main.legacy.js:
# main imports the pure decision helper from ui/codeboxStyle.js and threads it
# (via the runtime ctx) into the extracted settle seam, which now owns the
# routing, telemetry, side effects, settle cascade and reapply RAF verbatim.
RUNTIME = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
SETTLE = (ROOT / "src/ui/codebox/codeboxStyleSettle.js").read_text(encoding="utf-8", errors="replace")

errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

require("export function codeboxStyleSettleReasonCoalesceDecision" in MOD, "codebox style module owns settle reason coalesce decision helper")
require("codeboxStyleSettleReasonCoalesceDecision" in TEST, "module characterization covers settle reason coalesce decision")
# main imports the pure helper from ui/codeboxStyle.js (plain named import) and
# threads it through the codebox style runtime ctx into the settle owner.
require("from './ui/codeboxStyle.js'" in SRC and "  codeboxStyleSettleReasonCoalesceDecision," in SRC, "main imports settle coalesce helper from codebox style module")
require("codeboxStyleSettleReasonCoalesceDecision," in RUNTIME, "codebox style runtime threads settle coalesce helper to the settle owner")
require("codeboxStyleSettleReasonCoalesceDecision," in SETTLE, "settle owner receives settle coalesce helper")
require("const decision = codeboxStyleSettleReasonCoalesceDecision(" in SETTLE, "settle owner routes settle coalescing through module helper")
require('recordPerformanceEvent("codebox-style-settle-reason-coalesced", 0, decision.reason)' in SETTLE, "settle owner preserves settle coalescing telemetry with module decision reason")
require("state.codeboxStyleSettleReasonCoalesces = (state.codeboxStyleSettleReasonCoalesces || 0) + 1" in SETTLE, "settle owner preserves coalescing counter side effect")
require("state.codeboxStyleSettleReasonCount = decision.count" in SETTLE, "settle owner preserves coalesced count side effect from module decision")
require("state.lastCodeboxStyleSettleCoalescedReason = decision.reason" in SETTLE, "settle owner preserves last coalesced reason side effect from module decision")
require("for (const delay of [120, 420, 950])" in SETTLE, "settle owner preserves style settle delay ownership")
require("requestAnimationFrame(() => {" in SETTLE and "flushCodeboxStyleReapply(reason)" in SETTLE, "settle owner preserves style reapply RAF ownership")
if DIST:
    require("function codeboxStyleSettleReasonCoalesceDecision" in DIST, "dist includes module helper")
    # esbuild minifies `const decision = helper(` to `let decision=helper2(` (the
    # exported helper is renamed with a numeric suffix at the call site).
    require("decision=codeboxStyleSettleReasonCoalesceDecision2({reason" in DIST or "const decision = codeboxStyleSettleReasonCoalesceDecision" in DIST, "dist routes settle coalescing through helper")

if errors:
    print("CODEBOX STYLE SETTLE DECISION HELPER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("CODEBOX STYLE SETTLE DECISION HELPER STATIC TEST OK")
