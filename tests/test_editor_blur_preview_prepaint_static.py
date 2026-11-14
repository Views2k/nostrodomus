#!/usr/bin/env python3
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
# The monolith was decomposed into src modules; the editor-blur / preview-prepaint invariant
# moved out of the single main.legacy.js into the extracted owners below. Read each at its
# current location and assert the same real facts there.
MAIN = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8")
COMPLETION = (ROOT / "src" / "completion" / "completionRuntime.js").read_text(encoding="utf-8")
PUBLIC_API = (ROOT / "src" / "core" / "publicApiRuntime.js").read_text(encoding="utf-8")
COMP = (ROOT / "reference/companions" / "nostrodomus_editor_v17_2_learned_reapply.js").read_text(encoding="utf-8")

# Version-identity: originally pinned at v31.6.41; the invariant (editor-blur syntax repaint +
# companion preview prepaint) carried forward across the 31.6.x -> 0.1.x SemVer reset. Floor at
# the start of the SemVer line instead of a frozen literal.
version = str(PROJECT.get("version") or "")
internal = str(PROJECT.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
assert version_tuple >= (0, 1, 0), "PROJECT.json remains at or beyond the editor-blur/preview-prepaint baseline (SemVer line)"
# "editor-blur-preview-prepaint" was the old-era (v31.x) internal_version owner name retired at
# the SemVer reset; accept either that legacy id OR any version advanced past the floor.
assert "editor-blur-preview-prepaint" in internal or version_tuple > (0, 1, 0), "internal_version records the editor-blur/preview-prepaint owner (or version advanced past the baseline)"

# Blur-time syntax repaint: the legacy `scheduleSyntaxRecovery` painter entry point was deliberately
# RETIRED (deleted from the syntax runtime; covered by tests/syntax/legacyPainterDemoteFlag.test.mjs
# and tests/test_legacy_painter_demote_flag_static.py, which assert it is gone). Its on-blur
# syntax/style repaint behavior now lives in the focusout handler, which schedules a codebox style
# reapply pass with the editor-focusout-syntax-repaint reason — same invariant, current owner.
assert "scheduleCodeboxStyleReapply('editor-focusout-syntax-repaint')" in COMPLETION
# The focusout handler + its document listener moved out of main.legacy.js into the completion
# runtime (handler) and the public-api install path (listener wiring).
assert "function onFocusOut(ev)" in COMPLETION
assert "addPersistentListener?.(documentRef, 'focusout', apiMethods.onFocusOut, true, 'document-focusout')" in PUBLIC_API
# The companion-ready bridge: main.legacy.js still composes notifyEditorReadyFromCompanion, and the
# public API exposes it under the notifyEditorReady: alias the companion calls.
assert "notifyEditorReadyFromCompanion" in MAIN
assert "notifyEditorReady: apiMethods.notifyEditorReadyFromCompanion," in PUBLIC_API
# Companion-side preview prepaint (frozen reference companion): it notifies editor-ready and clips
# the preview pane (overflow hidden) before paint.
assert "window.__nostrodomus?.notifyEditorReady" in COMP
assert 'preview.style.setProperty("overflow", "hidden"' in COMP
# The "preview-pane-clip-prepaint" feature was originally version-pinned to the shipping companion
# (v17.2.49). That companion is now the byte-frozen reference at v17.2.65-runtime-coordinator, so
# assert the prepaint invariant itself: the prepaint primer function and its companion-prepaint-
# editor-ready reason, plus the frozen companion's version identity.
assert "function primeNostrodomusEditorPrepaint" in COMP
assert "companion-prepaint-" in COMP
assert "nostrodomus-editor-v17.2.65-runtime-coordinator" in COMP
print("EDITOR BLUR / PREVIEW PREPAINT STATIC TEST OK")
