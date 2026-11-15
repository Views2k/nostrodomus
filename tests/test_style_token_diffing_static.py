#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/app.js"
STYLE_RUNTIME = ROOT / "src/ui/codeboxStyleRuntime.js"
CODEBOX_STYLE = ROOT / "src/ui/codeboxStyle.js"
FRAME_RUNTIME = ROOT / "src/ui/codeboxFrameRuntime.js"
SETTINGS_RUNTIME = ROOT / "src/ui/settingsPanelRuntime.js"
# A style apply compares token signatures and takes a cheap path when nothing changed.
#   codeboxEditorCacheKey(): src/editor/activeEditorCacheRuntime.js
#   cache invalidation and the forced structural root scan: src/editor/editorLifecycleSentinel.js
#   the slider commit reapply ("style-range-change"): src/ui/codebox/codeboxStyleSettle.js
#   the slider and option call sites: src/ui/settings/settingsPanelShell.js
ACTIVE_EDITOR_CACHE_RUNTIME = ROOT / "src/editor/activeEditorCacheRuntime.js"
EDITOR_LIFECYCLE_SENTINEL = ROOT / "src/editor/editorLifecycleSentinel.js"
CODEBOX_STYLE_SETTLE = ROOT / "src/ui/codebox/codeboxStyleSettle.js"
SETTINGS_PANEL_SHELL = ROOT / "src/ui/settings/settingsPanelShell.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/STYLE_TOKEN_DIFFING_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

def any_in(text, *needles):
    # Accepts the source form or the dist form (esbuild removes spaces, writes `true` as `!0`,
    # drops braces around single statements and joins consecutive consts).
    return any(n in text for n in needles)

source_owner = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in (MAIN, STYLE_RUNTIME, CODEBOX_STYLE, FRAME_RUNTIME, SETTINGS_RUNTIME, ACTIVE_EDITOR_CACHE_RUNTIME, EDITOR_LIFECYCLE_SENTINEL, CODEBOX_STYLE_SETTLE, SETTINGS_PANEL_SHELL))

for label, text in (("source-owner", source_owner), ("dist", DIST.read_text(encoding="utf-8", errors="replace"))):
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
            f"{label} has the live slider update call site")
    require('scheduleCodeboxStyleReapply("style-option-change")' in text, f"{label} has the live option update call site")

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
