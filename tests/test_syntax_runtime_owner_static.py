#!/usr/bin/env python3
"""The syntax runtime composes the syntax modules; app.js reaches it through delegates."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "app.js"
RUNTIME = ROOT / "src" / "syntax" / "syntaxRuntime.js"
# The modules that createSyntaxRuntime composes, which hold the syntax functions.
INITIAL_PAINT_GATE = ROOT / "src" / "syntax" / "initialSyntaxPaintGate.js"
SYNTAX_CONTENT_OBSERVERS = ROOT / "src" / "syntax" / "syntaxContentObservers.js"
DARKPLUS_BRIDGE = ROOT / "src" / "syntax" / "darkPlusBridge.js"
# createSyntaxRuntimeDelegates builds one delegate per entry of SYNTAX_RUNTIME_METHODS.
DELEGATE_BRIDGE = ROOT / "src" / "composition" / "runtimeDelegateBridge.js"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    main_src = MAIN.read_text(encoding="utf-8")
    runtime_src = RUNTIME.read_text(encoding="utf-8")
    initial_paint_gate_src = INITIAL_PAINT_GATE.read_text(encoding="utf-8")
    syntax_content_observers_src = SYNTAX_CONTENT_OBSERVERS.read_text(encoding="utf-8")
    darkplus_bridge_src = DARKPLUS_BRIDGE.read_text(encoding="utf-8")
    delegate_bridge_src = DELEGATE_BRIDGE.read_text(encoding="utf-8")

    require("import { createSyntaxRuntime } from './syntax/syntaxRuntime.js';" in main_src,
            "main imports syntax runtime owner")
    require("export function createSyntaxRuntime(ctx)" in runtime_src,
            "syntax runtime exports factory")
    require("syntaxRuntime = createSyntaxRuntime({" in main_src,
            "main creates syntax runtime with injected dependencies")

    for token in [
        "import { createInitialSyntaxPaintGate } from './initialSyntaxPaintGate.js';",
        "import { createSyntaxContentObservers } from './syntaxContentObservers.js';",
        "import { createDarkPlusBridge } from './darkPlusBridge.js';",
        "createInitialSyntaxPaintGate(deps)",
        "createSyntaxContentObservers(deps)",
        "createDarkPlusBridge(deps)",
    ]:
        require(token in runtime_src, f"syntax runtime composes syntax module {token}")

    for token, src, label in [
        ("function scheduleInitialSyntaxPaintGate(", initial_paint_gate_src, "initialSyntaxPaintGate.js"),
        ("function installInitialSyntaxPaintGate(", initial_paint_gate_src, "initialSyntaxPaintGate.js"),
        ("function installCodeMirrorSyntaxContentObserver(", syntax_content_observers_src, "syntaxContentObservers.js"),
        ("function installSyntaxOwnerObserver(", syntax_content_observers_src, "syntaxContentObservers.js"),
        ("function applyDarkPlusSyntaxColoring(editor, settings)", darkplus_bridge_src, "darkPlusBridge.js"),
    ]:
        require(token in src, f"runtime owns syntax path {token} in {label}")

    # The inline painter and its recovery must not exist in the runtime or its modules.
    syntax_runtime_surface = (
        runtime_src + initial_paint_gate_src + syntax_content_observers_src + darkplus_bridge_src
    )
    for forbidden in [
        "function paintDarkPlusLinesNow(",
        "function paintDarkPlusMutationNow(",
        "function scheduleSyntaxRecovery(...args)",
    ]:
        require(forbidden not in syntax_runtime_surface, f"legacy painter/recovery implementation in runtime: {forbidden}")
    for forbidden in [
        "function paintDarkPlusLinesNow(...args)",
        "function scheduleSyntaxRecovery(...args)",
        "paintDarkPlusMutationNow(editor, content, records, \"syntax-owner-content-change\")",
        "syntaxRecoveryFanoutReductionCount: 0",
        "function codeMirrorSyntaxContentMutationRelevant(records)",
        "initialSyntaxGateLegacyWildcardShadowTraversals",
    ]:
        require(forbidden not in main_src, f"legacy painter/recovery code in main: {forbidden}")

    # app.js gets its syntax delegates from createSyntaxRuntimeDelegates.
    require("createSyntaxRuntimeDelegates,\n} from './composition/runtimeDelegateBridge.js';" in main_src,
            "main imports the syntax runtime delegate factory from the delegate bridge")
    require("createSyntaxRuntimeDelegates(() => syntaxRuntime)" in main_src,
            "main wires thin syntax runtime delegates bound to the live syntaxRuntime")
    require("export function createSyntaxRuntimeDelegates(getRuntime)" in delegate_bridge_src,
            "delegate bridge exports the syntax runtime delegate factory")
    require("methods: SYNTAX_RUNTIME_METHODS" in delegate_bridge_src,
            "syntax runtime delegates are driven by SYNTAX_RUNTIME_METHODS")
    require("return method.apply(runtime, args);" in delegate_bridge_src,
            "delegate bridge forwards calls straight to the runtime method")
    for method in [
        "scheduleInitialSyntaxPaintGate",
        "installInitialSyntaxPaintGate",
        "installSyntaxOwnerObserver",
    ]:
        require(f'"{method}"' in delegate_bridge_src,
                f"SYNTAX_RUNTIME_METHODS keeps thin delegate for {method}")
        require(f"    {method},\n" in main_src,
                f"main destructures the thin {method} delegate from the syntax runtime delegates")

    print("SYNTAX RUNTIME OWNER STATIC TEST OK")


if __name__ == "__main__":
    main()
