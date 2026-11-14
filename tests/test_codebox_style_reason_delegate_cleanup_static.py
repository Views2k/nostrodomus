#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8", errors="replace")
DIST = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8", errors="replace") if (ROOT / "dist/nostrodomus.js").exists() else ""
MOD = (ROOT / "src/ui/codeboxStyle.js").read_text(encoding="utf-8", errors="replace")
TEST = (ROOT / "tests/ui/codebox_style_module.test.mjs").read_text(encoding="utf-8", errors="replace")
# UI_DECOMP move: the reason-delegate cleanup invariant left main.legacy.js when the
# style-apply runtime was extracted. The reason-routing / last-applied side effect now
# lives in src/ui/codeboxStyleRuntime.js (RUNTIME); the raf flush + 120/420/950 settle
# cascade + scheduleCodeboxStyleReapply moved to src/ui/codebox/codeboxStyleSettle.js
# (SETTLE). main now only imports the helpers from the codebox style module and wires
# them through the runtime ctx; it never redeclares them locally.
RUNTIME = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
SETTLE = (ROOT / "src/ui/codebox/codeboxStyleSettle.js").read_text(encoding="utf-8", errors="replace")

errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

require("export function codeboxStyleReasonRequiresFullApply" in MOD, "codebox style module owns full-apply reason helper")
require("export function codeboxStyleReasonRequiresSyntaxPaint" in MOD, "codebox style module owns syntax-paint reason helper")
require("export function codeboxStyleReasonNeedsSettle" in MOD, "codebox style module owns settle-needed reason helper")
require("codeboxStyleReasonRequiresFullApply preserves legacy state and reason triggers" in TEST, "module characterization covers full-apply reason helper")
require("codeboxStyleReasonRequiresSyntaxPaint preserves legacy dirty-editor reason triggers" in TEST, "module characterization covers syntax-paint reason helper")
require("codeboxStyleReasonNeedsSettle preserves legacy bounded settle reasons" in TEST, "module characterization covers settle-needed helper")

require('function codeboxStyleReasonRequiresFullApply(reason = "")' not in SRC, "main no longer redeclares local full-apply reason delegate")
require('function codeboxStyleReasonRequiresSyntaxPaint(reason = "")' not in SRC, "main no longer redeclares local syntax-paint reason delegate")
require('function codeboxStyleReasonNeedsSettle(reason = "")' not in SRC, "main no longer redeclares local settle-needed reason delegate")
# The decomposition moved the reason helpers into src/ui/codeboxStyle.js; main imports
# the named helpers and forwards them into the style runtime ctx (it does not redeclare
# them). The aliased "...FromCodeboxStyleModule" form is gone; the live wiring is the
# named import + the runtime consuming the named helper.
require("codeboxStyleReasonRequiresFullApply," in SRC and "from './ui/codeboxStyle.js'" in SRC, "main imports full-apply helper from codebox style module")
require("codeboxStyleReasonRequiresSyntaxPaint," in SRC and "from './ui/codeboxStyle.js'" in SRC, "main imports syntax-paint helper from codebox style module")
require("codeboxStyleReasonNeedsSettle," in SRC and "from './ui/codeboxStyle.js'" in SRC, "main imports settle-needed helper from codebox style module")
require("export function codeboxStyleReasonRequiresFullApply(reason = \"\", options = {})" in MOD, "codebox style module owns the full-apply reason helper main imports")
# The style-apply call site moved into the extracted style runtime (codeboxStyleRuntime.js);
# the state-backed reason options object (now null-safe state?.) and the direct routing live there.
require("const reasonOptions = { lastAppliedAt: state?.codeboxStyleLastAppliedAt, cacheInvalidated: state?.codeboxStyleCacheInvalidated };" in RUNTIME, "style runtime preserves state-backed reason options at style apply call site")
require("codeboxStyleReasonRequiresFullApply(reason, reasonOptions)" in RUNTIME, "style runtime routes full-apply decision directly through module helper")
require(RUNTIME.count("codeboxStyleReasonRequiresSyntaxPaint(reason, reasonOptions)") >= 2, "style runtime routes syntax-paint decisions directly through module helper")
# The settle scheduler (scheduleCodeboxStyleReapply + raf flush + bounded settle cascade)
# moved to src/ui/codebox/codeboxStyleSettle.js, where the needs-settle gate is routed.
require("codeboxStyleReasonNeedsSettle(reason)" in SETTLE, "settle scheduler routes settle-needed decision directly through module helper")
require("function scheduleCodeboxStyleReapply" in SETTLE and "requestAnimationFrame(() => {" in SETTLE, "settle scheduler preserves style reapply RAF ownership")
require("for (const delay of [120, 420, 950])" in SETTLE, "settle scheduler preserves delayed settle timer ownership")
require("state.codeboxStyleLastAppliedAt = Date.now();" in RUNTIME, "style runtime preserves style last-applied timestamp side effect")

if DIST:
    require("function codeboxStyleReasonRequiresFullApply" in DIST, "dist includes full-apply helper")
    require("function codeboxStyleReasonRequiresSyntaxPaint" in DIST, "dist includes syntax-paint helper")
    require("function codeboxStyleReasonNeedsSettle" in DIST, "dist includes settle-needed helper")
    # Minification strips the argument-list space (reason, reasonOptions -> reason,reasonOptions)
    # and renames the bundled helper (codeboxStyleReasonRequiresFullApply2). Accept the minified
    # no-space form alongside the source-spaced forms so the routing intent is still asserted.
    require("codeboxStyleReasonRequiresFullApply2(reason,reasonOptions)" in DIST or "codeboxStyleReasonRequiresFullApply(reason,reasonOptions)" in DIST or "codeboxStyleReasonRequiresFullApply2(reason, reasonOptions)" in DIST or "codeboxStyleReasonRequiresFullApply(reason, reasonOptions)" in DIST, "dist routes full-apply decision through bundled helper")

if errors:
    print("CODEBOX STYLE REASON DELEGATE CLEANUP STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("CODEBOX STYLE REASON DELEGATE CLEANUP STATIC TEST OK")
