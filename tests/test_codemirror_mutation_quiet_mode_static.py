from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# CodeMirror's own DOM changes must not wake Nostrodomus's style observers:
#   * the style mutation guard (installCodeboxStyleMutationGuard) in src/ui/styleDomRuntime.js
#   * the style-root observer (attachStyleRootObserver) in src/ui/codeboxStyleRuntime.js
#   * the CodeMirror-only record filter and internals check in src/editor/editorLifecycleSentinel.js
STYLE_GUARD = (ROOT / "src" / "ui" / "styleDomRuntime.js").read_text(encoding="utf-8")
STYLE_OBSERVER = (ROOT / "src" / "ui" / "codeboxStyleRuntime.js").read_text(encoding="utf-8")
SENTINEL = (ROOT / "src" / "editor" / "editorLifecycleSentinel.js").read_text(encoding="utf-8")

def require(condition, message):
    if not condition:
        raise AssertionError(message)

# The style mutation guard skips CodeMirror internals and watches only the style and class
# attributes, so CodeMirror content changes never wake it.
require('".cm-editor, .cm-scroller, .cm-content")].filter(Boolean)' not in STYLE_GUARD, "style mutation guard must not observe CodeMirror content surfaces")
require('if (call(nodeLooksLikeCodeMirrorInternals, node)) return;' in STYLE_GUARD, "style mutation guard must exclude CodeMirror internals from observe targets")
require('attributeFilter: ["style", "class"]' in STYLE_GUARD, "style mutation guard observes only style/class attributes (never CodeMirror content)")

# The style observers must not watch characterData, which would turn typing into a stream of
# mutations. The syntax content observer in src/syntax/syntaxContentObservers.js does watch
# characterData on purpose and is not covered here.
require('characterData: true' not in STYLE_GUARD, "active style guard must not observe characterData")
require('characterData: true' not in STYLE_OBSERVER, "active style-root observer must not observe characterData")

# The style-root observer returns on CodeMirror-only records before it records any performance event.
require('recordPerformanceEvent("style-root-mutation", 0, `${count} codemirror ignored records`)' not in STYLE_OBSERVER, "CodeMirror ignored records must not create mutation-noise events")
require('recordPerformanceEvent("observer-callback", 0, `style-root-codemirror-ignored' not in STYLE_OBSERVER, "CodeMirror ignored callbacks must not create observer event-rate noise")
require('if (mutationRecordsAreCodeMirrorOnly(records)) {' in STYLE_OBSERVER, "style-root observer must short-circuit on CodeMirror-only records")
require(STYLE_OBSERVER.index('if (mutationRecordsAreCodeMirrorOnly(records)) {') < STYLE_OBSERVER.index('recordPerformanceEvent("style-root-mutation"'), "CodeMirror-only short-circuit must precede the style-root-mutation performance event")
require(STYLE_OBSERVER.index('if (mutationRecordsAreCodeMirrorOnly(records)) {') < STYLE_OBSERVER.index('recordPerformanceEvent("observer-callback"'), "CodeMirror-only short-circuit must precede the observer-callback performance event")

require('suppressedCodeMirrorCallbacks' in STYLE_GUARD, "diagnostics must count suppressed CodeMirror callbacks")
require('styleMutationGuardTargets' in STYLE_GUARD, "diagnostics must show style mutation guard target count")

require('function mutationRecordsAreCodeMirrorOnly' in SENTINEL, "CodeMirror-only mutation record filter exists in its owner module")
require('function nodeLooksLikeCodeMirrorInternals' in SENTINEL, "CodeMirror internals check exists in its owner module")

print("CODEMIRROR MUTATION QUIET MODE STATIC TEST OK")
