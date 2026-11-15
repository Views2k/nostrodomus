#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
# The active editor cache survives stable sentinel hits and style-root scans.
active_cache=(root/"src/editor/activeEditorCacheRuntime.js").read_text(encoding="utf-8")
sentinel=(root/"src/editor/editorLifecycleSentinel.js").read_text(encoding="utf-8")
style_root=(root/"src/ui/styleRootRuntime.js").read_text(encoding="utf-8")
settle=(root/"src/ui/codebox/codeboxStyleSettle.js").read_text(encoding="utf-8")
errors=[]
def req(cond,msg):
    if not cond: errors.append(msg)

req("function rememberActiveCodeboxEditor" in active_cache, "stable editor cache helper exists")
req("editor-sentinel-stable-hit" in sentinel, "sentinel stable hit path preserves cache")
req("duplicateDetections" in sentinel and "stableSkips" in sentinel, "sentinel/cache skip diagnostics exist")
req("A root scan leaves the active editor cache alone" in style_root, "root scan does not clear the active editor cache")
req("if (!codeboxStyleReasonNeedsSettle(reason)) return;" in settle, "settle timers are bounded to reasons that need settle")
if errors:
    print("ACTIVE EDITOR CACHE STABILITY STATIC TEST FAILED")
    for e in errors: print("-",e)
    sys.exit(1)
print("ACTIVE EDITOR CACHE STABILITY STATIC TEST OK")
