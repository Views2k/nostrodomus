#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8", errors="replace")
DIST = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8", errors="replace") if (ROOT / "dist/nostrodomus.js").exists() else ""
MOD = (ROOT / "src/ui/codeboxStyle.js").read_text(encoding="utf-8", errors="replace")
TEST = (ROOT / "tests/ui/codebox_style_module.test.mjs").read_text(encoding="utf-8", errors="replace")
# The token-map call site, signature call sites, and the RAF/settle-timer ownership were
# extracted out of main.legacy.js into dedicated runtime modules; main.legacy.js now imports
# both helpers from the single owner (src/ui/codeboxStyle.js) and injects them into those
# runtimes. Re-pointed reads below check the SAME single-owner routing invariant at its
# current location.
STYLE_DOM = (ROOT / "src/ui/styleDomRuntime.js").read_text(encoding="utf-8", errors="replace")
CODEBOX_RUNTIME = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
SETTINGS_RUNTIME = (ROOT / "src/ui/settingsInteractionRuntime.js").read_text(encoding="utf-8", errors="replace")
MAIN_ADAPTERS = (ROOT / "src/composition/mainLegacyAdapters.js").read_text(encoding="utf-8", errors="replace")
STYLE_SETTLE = (ROOT / "src/ui/codebox/codeboxStyleSettle.js").read_text(encoding="utf-8", errors="replace")
SIGNATURE_CALL = "codeboxStyleSignature({ settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax })"
SIGNATURE_CALL_SITES = (
    CODEBOX_RUNTIME.count("const styleSignature = " + SIGNATURE_CALL + ";")
    + SETTINGS_RUNTIME.count("return " + SIGNATURE_CALL + ";")
    + MAIN_ADAPTERS.count("return " + SIGNATURE_CALL + ";")
)

errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

require("export function codeboxStyleTokenMap" in MOD, "codebox style module owns token-map helper")
require("export function codeboxStyleSignature" in MOD, "codebox style module owns signature helper")
require("codeboxStyleTokenMap preserves legacy CSS variable mapping" in TEST, "module test covers token-map behavior")
require("codeboxStyleSignature preserves legacy stable JSON shape" in TEST, "module test covers signature behavior")

require("function codeboxStyleTokenMap(tokens)" not in SRC, "main no longer redeclares local token-map delegate")
require("function codeboxStyleSignature({ settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax })" not in SRC, "main no longer redeclares local signature delegate")
# main.legacy.js imports both helpers directly (no longer aliased) from the single owner
# module and injects them into the extracted runtimes (the import block is `from './ui/codeboxStyle.js'`).
require("  codeboxStyleTokenMap," in SRC and "from './ui/codeboxStyle.js';" in SRC, "main imports token-map helper from module")
require("  codeboxStyleSignature," in SRC and "from './ui/codeboxStyle.js';" in SRC, "main imports signature helper from module")
# The CSS variable map is built by the extracted style DOM runtime, which calls the injected
# single-owner token-map helper. (`call(...)` is the runtime's fail-dark invoke wrapper.)
require("const vars = call(codeboxStyleTokenMap, tokens) || {};" in STYLE_DOM, "style DOM runtime routes CSS variable map through module helper")
# The style signature is computed at multiple call sites, every one routed through the single
# owner helper (codebox style runtime, settings interaction runtime, main legacy adapters).
require(SIGNATURE_CALL_SITES >= 2, "style/settings runtimes route style signature call sites through module helper")
require("function scheduleCodeboxStyleReapply" in STYLE_SETTLE and "requestAnimationFrame(() => {" in STYLE_SETTLE, "codebox style settle module preserves style reapply RAF ownership")
require("for (const delay of [120, 420, 950])" in STYLE_SETTLE, "codebox style settle module preserves delayed settle timer ownership")

if DIST:
    require("function codeboxStyleTokenMap" in DIST, "dist includes token-map module helper")
    require("function codeboxStyleSignature" in DIST, "dist includes signature module helper")
    # esbuild keeps the top-level helper name but renames the imported binding/invoke wrapper
    # (e.g. `vars=call2(codeboxStyleTokenMap2,tokens)`); match the minified routing form, which
    # tolerates the build's rename suffix while still proving the call routes through the helper.
    require(
        "codeboxStyleTokenMap2,tokens)" in DIST
        or "codeboxStyleTokenMap,tokens)" in DIST
        or "const vars = codeboxStyleTokenMap(tokens);" in DIST,
        "dist routes token-map call through bundled helper",
    )

if errors:
    print("CODEBOX STYLE TOKEN/SIGNATURE DELEGATE CLEANUP STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("CODEBOX STYLE TOKEN/SIGNATURE DELEGATE CLEANUP STATIC TEST OK")
