from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The monolith was decomposed into src modules. The CodeMirror "mutation quiet mode"
# invariant this test pins moved out of src/main.legacy.js into the extracted owners:
#   * the style mutation GUARD (installCodeboxStyleMutationGuard) -> src/ui/styleDomRuntime.js
#   * the style-root OBSERVER (attachStyleRootObserver)           -> src/ui/codeboxStyleRuntime.js
#   * the CodeMirror-only record filter / internals check         -> src/editor/editorLifecycleSentinel.js
# Same facts, current locations. main.legacy.js now only re-exports these via delegate bridges,
# so checking it would silently pass while the real logic went unchecked.
STYLE_GUARD = (ROOT / "src" / "ui" / "styleDomRuntime.js").read_text(encoding="utf-8")
STYLE_OBSERVER = (ROOT / "src" / "ui" / "codeboxStyleRuntime.js").read_text(encoding="utf-8")
SENTINEL = (ROOT / "src" / "editor" / "editorLifecycleSentinel.js").read_text(encoding="utf-8")
PROJECT = __import__("json").loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))

def require(condition, message):
    if not condition:
        raise AssertionError(message)

# Version-identity owner: the original pin (v31.6.41 "editor-blur-preview-prepaint", which introduced
# this mutation-quiet-mode invariant) carried forward across the 31.6.x -> 0.1.x SemVer reset
# (CHANGELOG [0.1.0]). The invariant is the CodeMirror containment behavior below, not a frozen
# version literal, so floor at the start of the SemVer line via tuple comparison of the dotted ints.
version = str(PROJECT.get("version") or "")
internal = str(PROJECT.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 0), "PROJECT.json remains at or beyond the mutation-quiet-mode baseline (SemVer line)")
# Accept the legacy id that introduced this owner OR any version advanced past the floor.
require("editor-blur-preview-prepaint" in internal or version_tuple > (0, 1, 0), "internal_version records mutation quiet mode (or version advanced past the baseline)")

# The style mutation guard must not observe CodeMirror content surfaces. The old code shape was a
# target array that included ".cm-editor, .cm-scroller, .cm-content" and .filter(Boolean); that bad
# shape must stay absent, AND the current guard must positively exclude CodeMirror internals from its
# observe targets and only watch the style/class attributes (so CodeMirror content churn can never
# wake it).
require('".cm-editor, .cm-scroller, .cm-content")].filter(Boolean)' not in STYLE_GUARD, "style mutation guard must not observe CodeMirror content surfaces")
require('if (call(nodeLooksLikeCodeMirrorInternals, node)) return;' in STYLE_GUARD, "style mutation guard must exclude CodeMirror internals from observe targets")
require('attributeFilter: ["style", "class"]' in STYLE_GUARD, "style mutation guard observes only style/class attributes (never CodeMirror content)")

# Active style runtime must not observe characterData (which would turn typing into a mutation storm).
# This is scoped to the STYLE guard + STYLE-root observer path that absorbed main.legacy.js's
# observers; the deliberate childList/characterData syntax content observer in src/syntax/ is a
# separate, intentional path (see syntaxContentObservers.js) and is not what this invariant pins.
require('characterData: true' not in STYLE_GUARD, "active style guard must not observe characterData")
require('characterData: true' not in STYLE_OBSERVER, "active style-root observer must not observe characterData")

# CodeMirror-only records must not create mutation-noise events: the style-root observer short-circuits
# on CodeMirror-only records (mutationRecordsAreCodeMirrorOnly -> return) BEFORE it ever records a
# performance event, so CodeMirror churn never produces style-root-mutation / observer-callback noise.
require('recordPerformanceEvent("style-root-mutation", 0, `${count} codemirror ignored records`)' not in STYLE_OBSERVER, "CodeMirror ignored records must not create mutation-noise events")
require('recordPerformanceEvent("observer-callback", 0, `style-root-codemirror-ignored' not in STYLE_OBSERVER, "CodeMirror ignored callbacks must not create observer event-rate noise")
require('if (mutationRecordsAreCodeMirrorOnly(records)) {' in STYLE_OBSERVER, "style-root observer must short-circuit on CodeMirror-only records")
require(STYLE_OBSERVER.index('if (mutationRecordsAreCodeMirrorOnly(records)) {') < STYLE_OBSERVER.index('recordPerformanceEvent("style-root-mutation"'), "CodeMirror-only short-circuit must precede the style-root-mutation performance event")
require(STYLE_OBSERVER.index('if (mutationRecordsAreCodeMirrorOnly(records)) {') < STYLE_OBSERVER.index('recordPerformanceEvent("observer-callback"'), "CodeMirror-only short-circuit must precede the observer-callback performance event")

# Diagnostics must surface the containment counters: suppressed CodeMirror callbacks and the style
# mutation guard target count both live with the guard owner.
require('suppressedCodeMirrorCallbacks' in STYLE_GUARD, "diagnostics must count suppressed CodeMirror callbacks")
require('styleMutationGuardTargets' in STYLE_GUARD, "diagnostics must show style mutation guard target count")

# The CodeMirror-only record filter and internals check the above invariants depend on live in the
# editor lifecycle sentinel owner.
require('function mutationRecordsAreCodeMirrorOnly' in SENTINEL, "CodeMirror-only mutation record filter exists in its owner module")
require('function nodeLooksLikeCodeMirrorInternals' in SENTINEL, "CodeMirror internals check exists in its owner module")

print("CODEMIRROR MUTATION QUIET MODE STATIC TEST OK")
