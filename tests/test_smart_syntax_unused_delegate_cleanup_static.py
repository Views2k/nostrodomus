from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8", errors="replace")
TOKENIZERS = (ROOT / "src/syntax/smartSyntaxTokenizers.js").read_text(encoding="utf-8", errors="replace")
STYLES = (ROOT / "src/syntax/smartSyntaxStyles.js").read_text(encoding="utf-8", errors="replace")

REMOVED_LOCAL_WRAPPERS = [
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

REMOVED_IMPORT_ALIASES = [
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

RETAINED_RUNTIME_WRAPPERS = [
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


def test_unused_smart_syntax_delegate_wrappers_removed_from_monolith():
    for token in REMOVED_LOCAL_WRAPPERS:
        assert token not in LEGACY, f"unused local delegate wrapper should be removed: {token}"


def test_unused_smart_syntax_import_aliases_removed_from_monolith():
    for token in REMOVED_IMPORT_ALIASES:
        assert token not in LEGACY, f"unused delegate import alias should be removed: {token}"


def test_runtime_smart_syntax_delegates_still_present():
    for token in RETAINED_RUNTIME_WRAPPERS:
        assert token in LEGACY, f"runtime smart syntax delegate should remain: {token}"


def test_extracted_smart_syntax_helpers_stay_owned_by_modules():
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
        assert f"export function {name}(" in module_text, f"module still owns {name}"
