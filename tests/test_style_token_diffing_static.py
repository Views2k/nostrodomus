#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/main.legacy.js"
STYLE_RUNTIME = ROOT / "src/ui/codeboxStyleRuntime.js"
CODEBOX_STYLE = ROOT / "src/ui/codeboxStyle.js"
FRAME_RUNTIME = ROOT / "src/ui/codeboxFrameRuntime.js"
SETTINGS_RUNTIME = ROOT / "src/ui/settingsPanelRuntime.js"
# Modularization (monolith -> modules) moved several style-token-diffing facts
# out of main.legacy.js into focused owner modules. Re-pointed to their CURRENT homes:
#   codeboxEditorCacheKey()            -> src/editor/activeEditorCacheRuntime.js
#   style-cache invalidation + forced  -> src/editor/editorLifecycleSentinel.js
#     structural root scan
#   live slider commit reapply default -> src/ui/codebox/codeboxStyleSettle.js
#     reason "style-range-change"
#   live slider/option call sites       -> src/ui/settings/settingsPanelShell.js
ACTIVE_EDITOR_CACHE_RUNTIME = ROOT / "src/editor/activeEditorCacheRuntime.js"
EDITOR_LIFECYCLE_SENTINEL = ROOT / "src/editor/editorLifecycleSentinel.js"
CODEBOX_STYLE_SETTLE = ROOT / "src/ui/codebox/codeboxStyleSettle.js"
SETTINGS_PANEL_SHELL = ROOT / "src/ui/settings/settingsPanelShell.js"
DIST = ROOT / "dist/nostrodomus.js"
VERSION_SRC = ROOT / "src/core/version.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/STYLE_TOKEN_DIFFING_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

def any_in(text, *needles):
    # Same invariant, two spellings: the readable SOURCE form and the minified DIST
    # form (esbuild strips spaces, rewrites `true`->`!0`, collapses single-statement
    # blocks, and chains consecutive `const` into a comma list). Matching either
    # preserves the checked fact across both the source-owner concat and the bundle.
    return any(n in text for n in needles)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
version = str(project.get("version"))
internal = str(project.get("internal_version"))
source_owner = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in (MAIN, STYLE_RUNTIME, CODEBOX_STYLE, FRAME_RUNTIME, SETTINGS_RUNTIME, ACTIVE_EDITOR_CACHE_RUNTIME, EDITOR_LIFECYCLE_SENTINEL, CODEBOX_STYLE_SETTLE, SETTINGS_PANEL_SHELL, VERSION_SRC))

for label, text in (("source-owner", source_owner), ("dist", DIST.read_text(encoding="utf-8", errors="replace"))):
    require(any_in(text, f'PROJECT_VERSION = "{version}"', f'PROJECT_VERSION="{version}"'), f"{label} PROJECT_VERSION matches PROJECT.json")
    require(any_in(text, f'VERSION = "{internal}"', f'VERSION="{internal}"'), f"{label} VERSION matches PROJECT.json internal_version")
    require(any_in(text,
                   'function codeboxStyleSignature({ settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax })',
                   'function codeboxStyleSignature({settings,tokens,size,syntaxFilter,thumbBorder,frameEnabled,syntax})'),
            f"{label} builds stable style-token signatures")
    require('function codeboxEditorCacheKey(editor)' in text, f"{label} tracks active editor ownership for style caching")
    require(any_in(text, 'function codeboxStyleReasonRequiresFullApply(reason = ""', 'function codeboxStyleReasonRequiresFullApply(reason=""'),
            f"{label} distinguishes structural/full style applies from cheap settles")
    require(any_in(text,
                   'const fullApply = styleChanged || editorChanged || rootCssChanged',
                   'fullApply=styleChanged||editorChanged||rootCssChanged') and 'forcedFullApply' in text,
            f"{label} computes a bounded full-apply decision")
    require(any_in(text, 'if (!fullApply) {', 'if(!fullApply)') and any_in(text, 'fastPath: true', 'fastPath:!0'),
            f"{label} has unchanged-token fast path")
    require(any_in(text,
                   'syncCodeboxExternalFrame(editor, tokens, `${reason}-fast-frame`)',
                   'syncCodeboxExternalFrame(editor,tokens,`${reason}-fast-frame`)'),
            f"{label} keeps external frame live during cheap style applies")
    require('codeboxStyleReasonRequiresSyntaxPaint(reason' in text and '!state.codeboxStyleLastSyntaxSignature' in text, f"{label} avoids repeated syntax span walks when tokens are unchanged except dirty editor/content reasons")
    require(any_in(text, 'state.codeboxStyleLastSignature = styleSignature', 'state.codeboxStyleLastSignature=styleSignature'),
            f"{label} records last applied style signature")
    require(any_in(text, 'state.codeboxStyleCacheInvalidated = true', 'state.codeboxStyleCacheInvalidated=!0'),
            f"{label} invalidates style cache on structural root scans")
    require(any_in(text,
                   'scheduleStyleRangeCommitReapply(group = "style-range-change")',
                   'scheduleStyleRangeCommitReapply(group="style-range-change")'),
            f"{label} preserves live slider update call site")
    require('scheduleCodeboxStyleReapply("style-option-change")' in text, f"{label} preserves live option update call site")

version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 13), "PROJECT.json remains at or beyond the 0.1.13 codebox frame owner baseline")
require("codebox-frame-owner" in internal or version_tuple > (0, 1, 13), "PROJECT.json internal_version records codebox frame owner (or version advanced beyond the baseline that introduced it)")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Style token diffing static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("STYLE TOKEN DIFFING STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("STYLE TOKEN DIFFING STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
