#!/usr/bin/env python3
from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
# The monolith was decomposed into src/ modules and the project moved from the 31.6.x
# line to the 0.1.x SemVer line. The active-editor-cache-stability invariants below are
# unchanged facts that simply MOVED out of src/main.legacy.js into their owner modules.
active_cache=(root/"src/editor/activeEditorCacheRuntime.js").read_text(encoding="utf-8")
sentinel=(root/"src/editor/editorLifecycleSentinel.js").read_text(encoding="utf-8")
style_root=(root/"src/ui/styleRootRuntime.js").read_text(encoding="utf-8")
settle=(root/"src/ui/codebox/codeboxStyleSettle.js").read_text(encoding="utf-8")
project=json.loads((root/"PROJECT.json").read_text(encoding="utf-8"))
errors=[]
def req(cond,msg):
    if not cond: errors.append(msg)

# (a) UN-PIN the exact-version assertions. This contract was originally pinned at
# v31.6.41; it carried forward across the 31.6.x -> 0.1.x SemVer reset. The invariant
# is the cache-stability code below, not a frozen version literal, so floor at the start
# of the current SemVer line.
version=str(project.get("version") or "")
internal=str(project.get("internal_version") or "")
version_tuple=tuple(int(part) for part in version.split(".") if part.isdigit())
req(version_tuple>=(0,1,0), "PROJECT.json remains at or beyond the active-editor-cache-stability baseline (SemVer line)")
# "editor-blur-preview-prepaint" is the legacy (v31.x) internal_version id retired at the
# SemVer reset; accept either that legacy id OR any version advanced past the floor.
req("editor-blur-preview-prepaint" in internal or version_tuple>(0,1,0), "internal_version records active editor cache stability (or version advanced past the baseline)")

# (b) RE-POINT each moved invariant to its current owner module.
# rememberActiveCodeboxEditor moved to src/editor/activeEditorCacheRuntime.js
req("function rememberActiveCodeboxEditor" in active_cache, "stable editor cache helper exists")
# the sentinel stable-hit path moved to src/editor/editorLifecycleSentinel.js
req("editor-sentinel-stable-hit" in sentinel, "sentinel stable hit path preserves cache")
# the sentinel/cache skip diagnostics moved to src/editor/editorLifecycleSentinel.js
req("duplicateDetections" in sentinel and "stableSkips" in sentinel, "sentinel/cache skip diagnostics exist")
# the root-scan-no-longer-clears-cache invariant moved to src/ui/styleRootRuntime.js
req("Root scans should not invalidate the active editor cache" in style_root, "root scan no longer clears active editor cache")
# the settle-reason bounding guard moved to src/ui/codebox/codeboxStyleSettle.js
req("if (!codeboxStyleReasonNeedsSettle(reason)) return;" in settle, "settle timers are bounded to reasons that need settle")
if errors:
    print("ACTIVE EDITOR CACHE STABILITY STATIC TEST FAILED")
    for e in errors: print("-",e)
    sys.exit(1)
print("ACTIVE EDITOR CACHE STABILITY STATIC TEST OK")
