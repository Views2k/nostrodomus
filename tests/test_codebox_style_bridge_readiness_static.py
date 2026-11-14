#!/usr/bin/env python3
"""Guard the v0.1.48 codebox style bridge readiness repair.

`maybeSkipSourceClassSteadyStateStyleReapply` is owned by styleDomRuntime, not
codeboxStyleRuntime. Passing the codeboxStyleRuntime delegate back into
createCodeboxStyleRuntime makes early style reapply calls throw in the browser.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = (ROOT / "src/composition/runtimeDelegateBridge.js").read_text(encoding="utf-8")
MAIN = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8")


def _array_body(name: str) -> str:
    match = re.search(rf"const {name} = \[(.*?)\];", BRIDGE, re.S)
    assert match, f"missing {name} array"
    return match.group(1)


def test_source_class_style_skip_belongs_to_style_dom_delegate() -> None:
    codebox_style_methods = _array_body("CODEBOX_STYLE_METHODS")
    style_dom_methods = _array_body("STYLE_DOM_METHODS")

    assert "maybeSkipSourceClassSteadyStateStyleReapply" not in codebox_style_methods
    assert '"maybeSkipSourceClassSteadyStateStyleReapply"' in style_dom_methods


def test_main_destructures_style_skip_from_style_dom_not_codebox_style() -> None:
    codebox_match = re.search(
        r"const \{(?P<body>.*?)\} = codeboxStyleDelegates;",
        MAIN,
        re.S,
    )
    style_dom_match = re.search(
        r"const \{(?P<body>.*?)\} = styleDomDelegates;",
        MAIN,
        re.S,
    )
    assert codebox_match, "missing codeboxStyleDelegates destructure"
    assert style_dom_match, "missing styleDomDelegates destructure"

    assert "maybeSkipSourceClassSteadyStateStyleReapply" not in codebox_match.group("body")
    assert "maybeSkipSourceClassSteadyStateStyleReapply" in style_dom_match.group("body")
