#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "src/app.js").read_text(encoding="utf-8", errors="replace")
DIST = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8", errors="replace") if (ROOT / "dist/nostrodomus.js").exists() else ""
MOD = (ROOT / "src/ui/codeboxStyle.js").read_text(encoding="utf-8", errors="replace")
TEST = (ROOT / "tests/ui/codebox_style_module.test.mjs").read_text(encoding="utf-8", errors="replace")
# The reason helpers live in src/ui/codeboxStyle.js. app.js imports them and passes
# them to the style runtime (reason routing, last-applied time) and the settle scheduler
# (RAF flush, 120/420/950 ms settle timers); it never declares its own copies.
RUNTIME = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
SETTLE = (ROOT / "src/ui/codebox/codeboxStyleSettle.js").read_text(encoding="utf-8", errors="replace")

errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

require("export function codeboxStyleReasonRequiresFullApply" in MOD, "codebox style module owns full-apply reason helper")
require("export function codeboxStyleReasonRequiresSyntaxPaint" in MOD, "codebox style module owns syntax-paint reason helper")
require("export function codeboxStyleReasonNeedsSettle" in MOD, "codebox style module owns settle-needed reason helper")
require("test('codeboxStyleReasonRequiresFullApply " in TEST, "module test covers full-apply reason helper")
require("test('codeboxStyleReasonRequiresSyntaxPaint " in TEST, "module test covers syntax-paint reason helper")
require("test('codeboxStyleReasonNeedsSettle " in TEST, "module test covers settle-needed helper")

require('function codeboxStyleReasonRequiresFullApply(reason = "")' not in SRC, "main does not declare its own full-apply reason helper")
require('function codeboxStyleReasonRequiresSyntaxPaint(reason = "")' not in SRC, "main does not declare its own syntax-paint reason helper")
require('function codeboxStyleReasonNeedsSettle(reason = "")' not in SRC, "main does not declare its own settle-needed reason helper")
require("codeboxStyleReasonRequiresFullApply," in SRC and "from './ui/codeboxStyle.js'" in SRC, "main imports full-apply helper from codebox style module")
require("codeboxStyleReasonRequiresSyntaxPaint," in SRC and "from './ui/codeboxStyle.js'" in SRC, "main imports syntax-paint helper from codebox style module")
require("codeboxStyleReasonNeedsSettle," in SRC and "from './ui/codeboxStyle.js'" in SRC, "main imports settle-needed helper from codebox style module")
require("export function codeboxStyleReasonRequiresFullApply(reason = \"\", options = {})" in MOD, "codebox style module owns the full-apply reason helper main imports")
require("const reasonOptions = { lastAppliedAt: state?.codeboxStyleLastAppliedAt, cacheInvalidated: state?.codeboxStyleCacheInvalidated };" in RUNTIME, "style runtime keeps state-backed reason options at style apply call site")
require("codeboxStyleReasonRequiresFullApply(reason, reasonOptions)" in RUNTIME, "style runtime routes full-apply decision directly through module helper")
require(RUNTIME.count("codeboxStyleReasonRequiresSyntaxPaint(reason, reasonOptions)") >= 2, "style runtime routes syntax-paint decisions directly through module helper")
require("codeboxStyleReasonNeedsSettle(reason)" in SETTLE, "settle scheduler routes settle-needed decision directly through module helper")
require("function scheduleCodeboxStyleReapply" in SETTLE and "requestAnimationFrame(() => {" in SETTLE, "settle scheduler keeps style reapply RAF ownership")
require("for (const delay of [120, 420, 950])" in SETTLE, "settle scheduler keeps delayed settle timer ownership")
require("state.codeboxStyleLastAppliedAt = Date.now();" in RUNTIME, "style runtime keeps style last-applied timestamp side effect")

if DIST:
    require("function codeboxStyleReasonRequiresFullApply" in DIST, "dist includes full-apply helper")
    require("function codeboxStyleReasonRequiresSyntaxPaint" in DIST, "dist includes syntax-paint helper")
    require("function codeboxStyleReasonNeedsSettle" in DIST, "dist includes settle-needed helper")
    # esbuild removes the space after the comma and may rename the helper with a numeric suffix.
    require("codeboxStyleReasonRequiresFullApply2(reason,reasonOptions)" in DIST or "codeboxStyleReasonRequiresFullApply(reason,reasonOptions)" in DIST or "codeboxStyleReasonRequiresFullApply2(reason, reasonOptions)" in DIST or "codeboxStyleReasonRequiresFullApply(reason, reasonOptions)" in DIST, "dist routes full-apply decision through bundled helper")

if errors:
    print("CODEBOX STYLE REASON HELPERS STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("CODEBOX STYLE REASON HELPERS STATIC TEST OK")
