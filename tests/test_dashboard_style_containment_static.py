from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
# Codebox styles stay on editor roots and never change the dashboard. Each fact is checked in
# the module that owns it and in dist, which carries all of them.
STYLE_DOM = ROOT / "src" / "ui" / "styleDomRuntime.js"           # removeCodeboxRootStylesFromAllRoots + discoverOpenStyleRoots guard
CODEBOX_STYLE_RUNTIME = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"  # no-active-editor cleanup call
CODEBOX_STYLE = ROOT / "src" / "ui" / "codeboxStyle.js"          # codebox CSS (cm-style scoping, unclip rule)
CODEBOX_PREFLIGHT = ROOT / "src" / "ui" / "codebox" / "codeboxPreflight.js"  # preflight codebox CSS (mirrors unclip rule)
DIST = ROOT / "dist" / "nostrodomus.js"

# Every source file that may carry codebox CSS — the negative "no global disable"
# invariants must hold across all of them (and the bundled dist).
CSS_BEARING = [
    ROOT / "src" / "app.js",
    CODEBOX_STYLE,
    CODEBOX_PREFLIGHT,
    STYLE_DOM,
    CODEBOX_STYLE_RUNTIME,
]


def assert_no_global_clip_or_mask_disable(text: str, label: str) -> None:
    """Codebox CSS must never disable clip-path or mask-image on a broad selector (:host *,
    the html/body/home-assistant roots). It may only do so in a rule scoped to
    [data-nostrodomus-codebox-unclip]. Checks: (a) no :host * selector, (b) no block for the
    global HA roots, (c) every clip-path or mask-image "none" sits in an unclip-scoped rule."""
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
    """dist bundles every owner module, so all facts are checked in one text, in dist form."""
    assert "function removeCodeboxRootStylesFromAllRoots" in text, f"{label} cleans stale injected codebox nodes"
    # `if (!editor) return roots;` collapses to `if(!editor)return roots` after minification.
    assert ("if (!editor) return roots;" in text or "if(!editor)return roots" in text), \
        f"{label} does not discover every dashboard root without an active editor"
    assert "removeCodeboxRootStylesFromAllRoots(`no-active-editor-${reason}`)" in text, \
        f"{label} removes codebox CSS when no editor is active"
    assert_no_global_clip_or_mask_disable(text, label)
    assert ".cm-editor[data-nostrodomus-codebox-style=\"1\"]" in text, f"{label} scopes CodeMirror CSS to marked editors"
    assert "nostrodomus-codebox-frame-portal-host-v1" in text, f"{label} cleanup targets the external frame portal host"


# --- Source: each invariant checked at its current owner module ---------------

style_dom = STYLE_DOM.read_text(encoding="utf-8", errors="replace")
assert "function removeCodeboxRootStylesFromAllRoots" in style_dom, \
    "styleDomRuntime cleans stale injected codebox nodes"
assert "if (!editor) return roots;" in style_dom, \
    "styleDomRuntime.discoverOpenStyleRoots does not discover every dashboard root without an active editor"
# The cleanup selector list includes the frame portal host id.
assert "nostrodomus-codebox-frame-portal-host-v1" in style_dom, \
    "styleDomRuntime cleanup targets the external frame portal host"

codebox_style_runtime = CODEBOX_STYLE_RUNTIME.read_text(encoding="utf-8", errors="replace")
assert "removeCodeboxRootStylesFromAllRoots(`no-active-editor-${reason}`)" in codebox_style_runtime, \
    "codeboxStyleRuntime removes codebox CSS when no editor is active"

codebox_style = CODEBOX_STYLE.read_text(encoding="utf-8", errors="replace")
assert ".cm-editor[data-nostrodomus-codebox-style=\"1\"]" in codebox_style, \
    "codeboxStyle scopes CodeMirror CSS to marked editors"

# Negative "no global disable" invariants across every CSS-bearing source file.
for path in CSS_BEARING:
    assert_no_global_clip_or_mask_disable(path.read_text(encoding="utf-8", errors="replace"), f"source {path.name}")

# --- Dist: the single bundle carries every fact -------------------------------

if DIST.exists():
    check_dist(DIST.read_text(encoding="utf-8", errors="replace"), "dist")

print("DASHBOARD STYLE CONTAINMENT STATIC TEST OK")
