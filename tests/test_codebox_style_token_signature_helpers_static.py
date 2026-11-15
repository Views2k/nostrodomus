#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "src/app.js").read_text(encoding="utf-8", errors="replace")
DIST = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8", errors="replace") if (ROOT / "dist/nostrodomus.js").exists() else ""
MOD = (ROOT / "src/ui/codeboxStyle.js").read_text(encoding="utf-8", errors="replace")
TEST = (ROOT / "tests/ui/codebox_style_module.test.mjs").read_text(encoding="utf-8", errors="replace")
# codeboxStyleTokenMap and codeboxStyleSignature live in src/ui/codeboxStyle.js. app.js
# imports them and passes them to the runtimes that build the CSS variables and signatures.
STYLE_DOM = (ROOT / "src/ui/styleDomRuntime.js").read_text(encoding="utf-8", errors="replace")
CODEBOX_RUNTIME = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
SETTINGS_RUNTIME = (ROOT / "src/ui/settingsInteractionRuntime.js").read_text(encoding="utf-8", errors="replace")
MAIN_ADAPTERS = (ROOT / "src/composition/appAdapters.js").read_text(encoding="utf-8", errors="replace")
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
require("test('codeboxStyleTokenMap " in TEST, "module test covers token-map behavior")
require("test('codeboxStyleSignature " in TEST, "module test covers signature behavior")

require("function codeboxStyleTokenMap(tokens)" not in SRC, "main does not declare its own token-map helper")
require("function codeboxStyleSignature({ settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax })" not in SRC, "main does not declare its own signature helper")
require("  codeboxStyleTokenMap," in SRC and "from './ui/codeboxStyle.js';" in SRC, "main imports token-map helper from module")
require("  codeboxStyleSignature," in SRC and "from './ui/codeboxStyle.js';" in SRC, "main imports signature helper from module")
# The style DOM runtime builds the CSS variable map through the injected helper. `call` invokes
# a dependency and returns undefined when it is missing or throws.
require("const vars = call(codeboxStyleTokenMap, tokens) || {};" in STYLE_DOM, "style DOM runtime routes CSS variable map through module helper")
# The codebox style runtime, the settings interaction runtime and the app.js adapters
# all compute the style signature through the helper.
require(SIGNATURE_CALL_SITES >= 2, "style/settings runtimes route style signature call sites through module helper")
require("function scheduleCodeboxStyleReapply" in STYLE_SETTLE and "requestAnimationFrame(() => {" in STYLE_SETTLE, "codebox style settle module keeps style reapply RAF ownership")
require("for (const delay of [120, 420, 950])" in STYLE_SETTLE, "codebox style settle module keeps delayed settle timer ownership")

if DIST:
    require("function codeboxStyleTokenMap" in DIST, "dist includes token-map module helper")
    require("function codeboxStyleSignature" in DIST, "dist includes signature module helper")
    # esbuild may rename the imported binding with a numeric suffix (`call2(codeboxStyleTokenMap2,tokens)`).
    require(
        "codeboxStyleTokenMap2,tokens)" in DIST
        or "codeboxStyleTokenMap,tokens)" in DIST
        or "const vars = codeboxStyleTokenMap(tokens);" in DIST,
        "dist routes token-map call through bundled helper",
    )

if errors:
    print("CODEBOX STYLE TOKEN/SIGNATURE HELPERS STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("CODEBOX STYLE TOKEN/SIGNATURE HELPERS STATIC TEST OK")
