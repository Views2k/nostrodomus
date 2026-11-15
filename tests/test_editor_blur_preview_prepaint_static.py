#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
# Leaving the editor repaints the syntax colors, and the companion clips the card preview before
# it paints.
MAIN = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
COMPLETION = (ROOT / "src" / "completion" / "completionRuntime.js").read_text(encoding="utf-8")
PUBLIC_API = (ROOT / "src" / "core" / "publicApiRuntime.js").read_text(encoding="utf-8")
COMP = (ROOT / "reference/companions" / "nostrodomus_editor_v17_2_learned_reapply.js").read_text(encoding="utf-8")

# The focusout handler schedules a style pass that repaints the syntax colors. There is no inline
# painter; tests/syntax/legacy_painter_removed.test.mjs and
# tests/test_syntax_legacy_painter_removed_static.py check that.
assert "scheduleCodeboxStyleReapply('editor-focusout-syntax-repaint')" in COMPLETION
assert "function onFocusOut(ev)" in COMPLETION
assert "addPersistentListener?.(documentRef, 'focusout', apiMethods.onFocusOut, true, 'document-focusout')" in PUBLIC_API
# app.js composes notifyEditorReadyFromCompanion; the public API exposes it as
# notifyEditorReady, the name the companion calls.
assert "notifyEditorReadyFromCompanion" in MAIN
assert "notifyEditorReady: apiMethods.notifyEditorReadyFromCompanion," in PUBLIC_API
# The reference companion notifies editor-ready and clips the preview pane before it paints.
assert "window.__nostrodomus?.notifyEditorReady" in COMP
assert 'preview.style.setProperty("overflow", "hidden"' in COMP
assert "function primeNostrodomusEditorPrepaint" in COMP
assert "companion-prepaint-" in COMP
assert "nostrodomus-editor-v17.2.65-runtime-coordinator" in COMP
print("EDITOR BLUR / PREVIEW PREPAINT STATIC TEST OK")
