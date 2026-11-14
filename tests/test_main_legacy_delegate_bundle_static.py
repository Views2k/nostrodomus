#!/usr/bin/env python3
"""Guard the v0.1.49 main.legacy delegate bundle.

The monolith may keep startup order, but repetitive pass-through wrappers should
live in explicit runtime delegate lists with the correct owner. This prevents
future cleanup from reintroducing the v0.1.48 style-owner bridge regression.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8", errors="replace")
BRIDGE = (ROOT / "src/composition/runtimeDelegateBridge.js").read_text(encoding="utf-8", errors="replace")
COMPLETION_FACTORY = (ROOT / "src/composition/mainLegacyCompletionRuntimeFactory.js").read_text(encoding="utf-8", errors="replace")


def _array_body(name: str) -> str:
    match = re.search(rf"const {name} = \[(.*?)\];", BRIDGE, re.S)
    assert match, f"missing {name}"
    return match.group(1)


def _require_bridge(name: str, *methods: str) -> None:
    body = _array_body(name)
    for method in methods:
        assert f'"{method}"' in body, f"{method} missing from {name}"


def test_delegate_bundles_exist_for_extracted_wrapper_groups() -> None:
    for creator in [
        "createRuntimeErrorRuntimeDelegates",
        "createPersistentListenersRuntimeDelegates",
        "createSourceClassBridgeRuntimeDelegates",
        "createSyntaxRuntimeDelegates",
        "createRuntimeContextRuntimeDelegates",
        "createSuggestionQualityRuntimeDelegates",
        "createScoringRuntimeDelegates",
        "createCompletionInsertionRuntimeDelegates",
        "createCompletionRuntimeDelegates",
    ]:
        assert f"export function {creator}" in BRIDGE
        owner_text = COMPLETION_FACTORY if creator in {"createSuggestionQualityRuntimeDelegates", "createScoringRuntimeDelegates", "createCompletionInsertionRuntimeDelegates", "createCompletionRuntimeDelegates"} else MAIN
        assert creator in owner_text


def test_method_owners_are_explicit_and_not_cross_routed() -> None:
    _require_bridge("SYNTAX_RUNTIME_METHODS", "installSyntaxOwnerObserver", "scheduleSourceClassSyntaxRefresh", "editorUsesCodeMirrorSourceClassSyntax")
    _require_bridge("COMPLETION_RUNTIME_METHODS", "open", "toggle", "onKeydown", "onPointer", "onFocusIn", "onFocusOut")
    _require_bridge("COMPLETION_INSERTION_METHODS", "clearSnippetSession", "insertItem", "updateSnippetSessionAfterDispatch")
    _require_bridge("SCORING_METHODS", "scoreItems", "camelMatch", "shouldSuppressStaticForFocusedContext")
    _require_bridge("SOURCE_CLASS_BRIDGE_METHODS", "cssEscapeSelectorPart", "bridgeActiveForStyleEditor", "codeMirrorSourceClassParts")

    assert "maybeSkipSourceClassSteadyStateStyleReapply" not in _array_body("CODEBOX_STYLE_METHODS")
    assert '"maybeSkipSourceClassSteadyStateStyleReapply"' in _array_body("STYLE_DOM_METHODS")


def test_removed_pass_through_wrappers_stay_out_of_main_legacy() -> None:
    forbidden_wrappers = [
        "function installSyntaxOwnerObserver(...args)",
        "function scheduleSourceClassSyntaxRefresh(...args)",
        "function scoreItems(ctx)",
        "function camelMatch(label, query)",
        "function clearSnippetSession()",
        "function insertItem(item)",
        "async function open(explicit = true)",
        "function onKeydown(ev)",
        "function cssEscapeSelectorPart(value)",
        "function addPersistentListener(target, type, handler",
    ]
    for wrapper in forbidden_wrappers:
        assert wrapper not in MAIN, f"wrapper returned to main.legacy.js: {wrapper}"

    assert "const { render, compute, refresh, requestLiveUpdate, open, toggle, onKeydown, onPointer, onFocusIn, onFocusOut } = completionRuntimeDelegates;" in COMPLETION_FACTORY
    assert "const { clearSnippetSession, moveSnippetPlaceholder, updateSnippetSessionAfterDispatch, insertItem } = createCompletionInsertionRuntimeDelegates" in COMPLETION_FACTORY
    assert "createMainLegacyCompletionRuntimeGroup" in MAIN
