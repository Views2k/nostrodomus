from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
# The dashboard-style-containment behavior was extracted out of src/main.legacy.js
# into dedicated owner modules during the monolith decomposition. Each invariant is
# re-pointed below to the module that now owns it; the single bundled dist still
# carries every fact, so the dist is checked as one combined text.
STYLE_DOM = ROOT / "src" / "ui" / "styleDomRuntime.js"           # removeCodeboxRootStylesFromAllRoots + discoverOpenStyleRoots guard
CODEBOX_STYLE_RUNTIME = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"  # no-active-editor cleanup call
CODEBOX_STYLE = ROOT / "src" / "ui" / "codeboxStyle.js"          # codebox CSS (cm-style scoping, unclip rule)
CODEBOX_PREFLIGHT = ROOT / "src" / "ui" / "codebox" / "codeboxPreflight.js"  # preflight codebox CSS (mirrors unclip rule)
FRAME_RUNTIME = ROOT / "src" / "ui" / "codeboxFrameRuntime.js"   # external frame portal host
DIST = ROOT / "dist" / "nostrodomus.js"
PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))

# Every source file that may carry codebox CSS — the negative "no global disable"
# invariants must hold across all of them (and the bundled dist).
CSS_BEARING = [
    ROOT / "src" / "main.legacy.js",
    CODEBOX_STYLE,
    CODEBOX_PREFLIGHT,
    STYLE_DOM,
    CODEBOX_STYLE_RUNTIME,
]


def assert_no_global_clip_or_mask_disable(text: str, label: str) -> None:
    """The invariant: codebox CSS must NEVER disable clip-path / mask-image on a
    broad/global selector (:host *, html/body/home-assistant roots). Disabling is
    only allowed scoped to the [data-nostrodomus-codebox-unclip] frame-escape
    rule. We preserve the original "must not globally disable" intent by proving
    (a) no broad host-star selector, (b) no global-HA-root block, and (c) every
    clip-path/mask-image disabling declaration lives inside an unclip-scoped rule."""
    assert ":host *" not in text, f"{label} must not contain broad :host * CSS"
    assert "html,\n      body,\n      home-assistant" not in text, f"{label} must not set codebox variables/scrollbars on global HA roots"
    # Neutralize JS template-literal interpolations (e.g. `visible ${bangPriority};`)
    # so the CSS-rule brace-walk below is not fooled by the `}` that closes `${...}`.
    # Same length per char keeps every offset stable; the placeholder carries no braces.
    css = re.sub(r"\$\{[^{}]*\}", lambda m: "_" * len(m.group(0)), text)
    for prop in ("clip-path: none !important", "mask-image: none !important", "-webkit-mask-image: none !important"):
        start = 0
        while True:
            idx = css.find(prop, start)
            if idx < 0:
                break
            # Walk back to the selector that introduces the enclosing CSS rule.
            brace = css.rfind("{", 0, idx)
            assert brace >= 0, f"{label} disables {prop} outside any CSS rule (global)"
            prev_close = css.rfind("}", 0, brace)
            prev_open = css.rfind("{", 0, brace)
            sel_start = max(prev_close, prev_open) + 1
            selector = css[sel_start:brace]
            assert "data-nostrodomus-codebox-unclip" in selector, (
                f"{label} disables {prop} on a non-unclip selector "
                f"(must stay scoped to [data-nostrodomus-codebox-unclip]): {selector.strip()[:120]!r}"
            )
            start = idx + len(prop)


def check_dist(text: str, label: str) -> None:
    """The dist bundles every owner module into one file, so all facts coexist here.
    Source-spaced strings that the minifier reshapes are matched in their dist form."""
    assert "function removeCodeboxRootStylesFromAllRoots" in text, f"{label} cleans stale injected codebox nodes"
    # `if (!editor) return roots;` collapses to `if(!editor)return roots` after minification.
    assert ("if (!editor) return roots;" in text or "if(!editor)return roots" in text), \
        f"{label} does not discover every dashboard root without an active editor"
    assert "removeCodeboxRootStylesFromAllRoots(`no-active-editor-${reason}`)" in text, \
        f"{label} removes codebox CSS when no editor is active"
    assert_no_global_clip_or_mask_disable(text, label)
    assert ".cm-editor[data-nostrodomus-codebox-style=\"1\"]" in text, f"{label} scopes CodeMirror CSS to marked editors"
    assert "nostrodomus-codebox-frame-portal-host-v1" in text, f"{label} still owns the external frame portal"


# --- Source: each invariant checked at its current owner module ---------------

style_dom = STYLE_DOM.read_text(encoding="utf-8", errors="replace")
assert "function removeCodeboxRootStylesFromAllRoots" in style_dom, \
    "styleDomRuntime cleans stale injected codebox nodes"
assert "if (!editor) return roots;" in style_dom, \
    "styleDomRuntime.discoverOpenStyleRoots does not discover every dashboard root without an active editor"
# The frame portal host id is still referenced by the cleanup selector list.
assert "nostrodomus-codebox-frame-portal-host-v1" in style_dom, \
    "styleDomRuntime cleanup still targets the external frame portal host"

codebox_style_runtime = CODEBOX_STYLE_RUNTIME.read_text(encoding="utf-8", errors="replace")
assert "removeCodeboxRootStylesFromAllRoots(`no-active-editor-${reason}`)" in codebox_style_runtime, \
    "codeboxStyleRuntime removes codebox CSS when no editor is active"

codebox_style = CODEBOX_STYLE.read_text(encoding="utf-8", errors="replace")
assert ".cm-editor[data-nostrodomus-codebox-style=\"1\"]" in codebox_style, \
    "codeboxStyle scopes CodeMirror CSS to marked editors"

frame_runtime = FRAME_RUNTIME.read_text(encoding="utf-8", errors="replace")
assert "nostrodomus-codebox-frame-portal-host-v1" in frame_runtime, \
    "codeboxFrameRuntime owns the external frame portal host"

# Negative "no global disable" invariants across every CSS-bearing source file.
for path in CSS_BEARING:
    assert_no_global_clip_or_mask_disable(path.read_text(encoding="utf-8", errors="replace"), f"source {path.name}")

# --- Dist: the single bundle carries every fact -------------------------------

if DIST.exists():
    check_dist(DIST.read_text(encoding="utf-8", errors="replace"), "dist")

# --- Version provenance ------------------------------------------------------
# Original pinned PROJECT.json internal_version == the one-time v31.6.41 release
# tag. Per the un-pin pattern (see test_visual_layer_baseline_contract_static.py /
# test_codemirror_observer_containment_static.py) this becomes a dynamic floor: the
# style-DOM containment owner was established in the 0.1.x SemVer line at v0.1.26.
version = str(PROJECT.get("version") or "")
internal = str(PROJECT.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
assert version_tuple >= (0, 1, 26), \
    "PROJECT.json remains at or beyond the v0.1.26 dashboard-style-containment owner baseline"
assert ("containment" in internal) or (version_tuple > (0, 1, 26)), \
    "internal_version records the containment owner (or version advanced beyond the baseline that introduced it)"

print("DASHBOARD STYLE CONTAINMENT STATIC TEST OK")
