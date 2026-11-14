#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8", errors="replace")
frame = (ROOT / "src/ui/codeboxFrameRuntime.js").read_text(encoding="utf-8", errors="replace")
style_runtime = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
# allowCodeboxFrameOverflow (the compatibility frame marker helper) was extracted out of
# main.legacy.js into its dedicated codebox unclip owner module; include it so the
# source-owner blob still proves the helper exists at its current location.
unclip = (ROOT / "src/ui/codebox/codeboxUnclip.js").read_text(encoding="utf-8", errors="replace")
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8", errors="replace")
project = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
source_owner = main + "\n" + frame + "\n" + style_runtime + "\n" + unclip

for label, text in (("source-owner", source_owner), ("dist", dist)):
    assert "function allowCodeboxFrameOverflow(editor)" in text, f"{label} keeps the compatibility frame marker helper"
    assert "function ensureCodeboxExternalFrame(tokens)" in text, f"{label} creates a dedicated external frame"
    # The minifier collapses default-arg whitespace, so accept the source-spaced form
    # OR the equivalent minified form (dist-fragility — same syncCodeboxExternalFrame signature).
    assert ('function syncCodeboxExternalFrame(editor, tokens, reason = "external-frame-disabled")' in text
            or 'function syncCodeboxExternalFrame(editor,tokens,reason="external-frame-disabled")' in text), f"{label} syncs frame geometry from ha-code-editor"
    # Source sets the marker via the dataset API (camelCased: nostrodomusCodeboxExternalFrame);
    # the minified DOM/CSS form carries the kebab attribute. Accept either — same data marker.
    assert ("data-nostrodomus-codebox-external-frame" in text
            or "nostrodomusCodeboxExternalFrame" in text), f"{label} has an external-frame data marker"
    assert "pointer-events" in text, f"{label} keeps the external frame pointer-transparent"
    assert "activeTopLayerDialog" in text and "top-layer-dialog" in text, f"{label} preserves native modal portal ownership"
    assert "settingsViewportToPortalPosition" in text and "portal" in text, f"{label} preserves portal-local Settings drag conversion"
    assert "[data-nostrodomus-codebox-unclip-frame=\"1\"]" not in text, f"{label} does not keep the failed broad unclip CSS selector"
    assert ".body.ha-scrollbar:has(ha-code-editor)" not in text, f"{label} does not depend on HA body overflow unclip selectors"

# The hand-written thin wrapper was replaced by the generic runtime delegate bridge: main
# builds codeboxFrameDelegates from codeboxFrameRuntime and exposes ensureCodeboxExternalFrame
# by destructuring it from that bridge (same thin-delegate invariant — no inline reimplementation).
assert 'const codeboxFrameDelegates = createCodeboxFrameRuntimeDelegates(() => codeboxFrameRuntime);' in main, "main builds the codebox frame runtime delegate bridge"
assert 'ensureCodeboxExternalFrame' in main and '} = codeboxFrameDelegates;' in main, "main keeps thin external frame delegate (destructured from codeboxFrameDelegates)"
assert 'export function createCodeboxFrameRuntime(ctx = {})' in frame, "codebox frame runtime owns frame behavior"
version = str(project.get("version") or "")
internal_version = str(project.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
assert version_tuple >= (0, 1, 13), "PROJECT.json remains at or beyond the v0.1.13 codebox frame owner baseline"
assert "codebox-frame-owner" in internal_version or version_tuple > (0, 1, 13), "internal_version records codebox frame owner (or version advanced beyond the baseline that introduced it)"
assert project.get("internal_version") in (ROOT / "src/core/version.js").read_text(encoding="utf-8", errors="replace") and project.get("internal_version") in dist, "source and dist both carry current runtime version"
print("CODEBOX FRAME EXTERNAL OVERLAY STATIC TEST OK")
