from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src/app.js").read_text(encoding="utf-8", errors="replace")
TOKENIZERS = (ROOT / "src/syntax/smartSyntaxTokenizers.js").read_text(encoding="utf-8", errors="replace")
STYLES = (ROOT / "src/syntax/smartSyntaxStyles.js").read_text(encoding="utf-8", errors="replace")
LIFECYCLE = (ROOT / "src/syntax/smartSyntaxLifecycle.js").read_text(encoding="utf-8", errors="replace")

# app.js must not wrap or alias the smart syntax helpers; the modules own them.
LOCAL_WRAPPERS_NOT_IN_MAIN = [
    "function smartSyntaxCssValueKeyword(",
    "function smartSyntaxIsCssContextLine(",
    "function smartSyntaxTokenizeJinjaSegment(",
    "function smartSyntaxTokenizeJinjaInsideCss(",
    "function smartSyntaxTokenizeCssLine(",
    "function smartSyntaxTokenizeYamlLine(",
    "function smartSyntaxLeadingSpaces(",
    "function smartSyntaxCssDeclarationInfo(",
    "function smartSyntaxOffsetInQuotedString(",
    "function smartSyntaxCssBlockScalarStart(",
    "function smartSyntaxBestDocumentStartIndex(",
    "function smartSyntaxScalarKind(",
    "function smartSyntaxCssFunctionName(",
    "function smartSyntaxCssNumericToken(",
    "function smartSyntaxCssDeclarationBounds(",
    "function smartSyntaxCssTokenKind(",
    "function smartSyntaxPushRange(",
    "function smartSyntaxClassName(",
    "function smartSyntaxLineClassName(",
    "function removeClassPrefix(",
    "function smartSyntaxLineTextNodeSlices(",
]

IMPORT_ALIASES_NOT_IN_MAIN = [
    "smartSyntaxCssValueKeywordFromSmartSyntaxTokenizersModule",
    "smartSyntaxIsCssContextLineFromSmartSyntaxTokenizersModule",
    "smartSyntaxTokenizeJinjaSegmentFromSmartSyntaxTokenizersModule",
    "smartSyntaxTokenizeJinjaInsideCssFromSmartSyntaxTokenizersModule",
    "smartSyntaxTokenizeCssLineFromSmartSyntaxTokenizersModule",
    "smartSyntaxTokenizeYamlLineFromSmartSyntaxTokenizersModule",
    "smartSyntaxLeadingSpacesFromSmartSyntaxTokenizersModule",
    "smartSyntaxCssDeclarationInfoFromSmartSyntaxTokenizersModule",
    "smartSyntaxOffsetInQuotedStringFromSmartSyntaxTokenizersModule",
    "smartSyntaxCssBlockScalarStartFromSmartSyntaxTokenizersModule",
    "smartSyntaxBestDocumentStartIndexFromSmartSyntaxTokenizersModule",
    "smartSyntaxScalarKindFromSmartSyntaxTokenizersModule",
    "smartSyntaxCssFunctionNameFromSmartSyntaxTokenizersModule",
    "smartSyntaxCssNumericTokenFromSmartSyntaxTokenizersModule",
    "smartSyntaxCssDeclarationBoundsFromSmartSyntaxTokenizersModule",
    "smartSyntaxCssTokenKindFromSmartSyntaxTokenizersModule",
    "smartSyntaxPushRangeFromSmartSyntaxTokenizersModule",
    "smartSyntaxClassNameFromSmartSyntaxStylesModule",
    "smartSyntaxLineClassNameFromSmartSyntaxStylesModule",
    "removeClassPrefixFromSmartSyntaxStylesModule",
    "smartSyntaxLineTextNodeSlicesFromSmartSyntaxStylesModule",
    "SMART_SOURCE_SYNTAX_CLASS_PREFIX_FROM_SMART_SYNTAX_STYLES_MODULE",
    "SMART_SOURCE_SYNTAX_LINE_CLASS_PREFIX_FROM_SMART_SYNTAX_STYLES_MODULE",
]

# The runtime wrappers that bind the helpers to the editor live in the smart syntax lifecycle.
LIFECYCLE_WRAPPERS = [
    "function smartSyntaxRangeTokensForLine(",
    "function smartSyntaxYamlLineInfo(",
    "function smartSyntaxDocLinesFromEditor(",
    "function smartSyntaxDocumentContextForVisibleLines(",
    "function smartSyntaxUpdateBlockContext(",
    "function smartSyntaxLineKindForMode(",
    "function smartSyntaxTokenKind(",
    "function smartSyntaxAddHighlightRange(",
    "function smartSyntaxCommitRangeHighlights(",
]


def test_main_has_no_local_smart_syntax_wrappers():
    for token in LOCAL_WRAPPERS_NOT_IN_MAIN:
        assert token not in APP, f"app.js must not define a local smart syntax wrapper: {token}"


def test_main_has_no_smart_syntax_import_aliases():
    for token in IMPORT_ALIASES_NOT_IN_MAIN:
        assert token not in APP, f"app.js must not import a smart syntax helper under an alias: {token}"


def test_smart_syntax_lifecycle_owns_runtime_wrappers():
    for token in LIFECYCLE_WRAPPERS:
        assert token in LIFECYCLE, f"smart syntax lifecycle is missing runtime wrapper: {token}"


def test_smart_syntax_helpers_stay_owned_by_modules():
    for name in [
        "smartSyntaxCssValueKeyword",
        "smartSyntaxTokenizeCssLine",
        "smartSyntaxBestDocumentStartIndex",
        "smartSyntaxScalarKind",
        "smartSyntaxCssTokenKind",
        "smartSyntaxPushRange",
        "smartSyntaxClassName",
        "smartSyntaxLineClassName",
        "removeClassPrefix",
        "smartSyntaxLineTextNodeSlices",
    ]:
        module_text = TOKENIZERS if name not in {"smartSyntaxClassName", "smartSyntaxLineClassName", "removeClassPrefix", "smartSyntaxLineTextNodeSlices"} else STYLES
        assert f"export function {name}(" in module_text, f"module owns {name}"


if __name__ == "__main__":
    test_main_has_no_local_smart_syntax_wrappers()
    test_main_has_no_smart_syntax_import_aliases()
    test_smart_syntax_lifecycle_owns_runtime_wrappers()
    test_smart_syntax_helpers_stay_owned_by_modules()
    print("SMART SYNTAX HELPER OWNERSHIP STATIC TEST OK")
