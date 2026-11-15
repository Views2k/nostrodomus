#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "src/app.js").read_text(encoding="utf-8", errors="replace")
frame = (ROOT / "src/ui/codeboxFrameRuntime.js").read_text(encoding="utf-8", errors="replace")
style_runtime = (ROOT / "src/ui/codeboxStyleRuntime.js").read_text(encoding="utf-8", errors="replace")
# Holds allowCodeboxFrameOverflow, the frame marker helper.
unclip = (ROOT / "src/ui/codebox/codeboxUnclip.js").read_text(encoding="utf-8", errors="replace")
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8", errors="replace")
source_owner = main + "\n" + frame + "\n" + style_runtime + "\n" + unclip

for label, text in (("source-owner", source_owner), ("dist", dist)):
    assert "function allowCodeboxFrameOverflow(editor)" in text, f"{label} keeps the frame marker helper"
    # esbuild removes the spaces around default arguments, so accept both forms.
    assert ('function syncCodeboxExternalFrame(editor, tokens, reason = "external-frame-disabled")' in text
            or 'function syncCodeboxExternalFrame(editor,tokens,reason="external-frame-disabled")' in text), f"{label} marks the frame host through the frame sync"
    assert "settingsViewportToPortalPosition" in text and "portal" in text, f"{label} preserves portal-local Settings drag conversion"
    assert "[data-nostrodomus-codebox-unclip-frame=\"1\"]" not in text, f"{label} has no broad unclip CSS selector"
    assert ".body.ha-scrollbar:has(ha-code-editor)" not in text, f"{label} does not depend on HA body overflow unclip selectors"

# The frame is drawn by the host's own stylesheet; a separate frame element is ruled out
# (docs/contracts/STYLE_OWNERSHIP_CONTRACT.md).
assert "createElement" not in frame, "codebox frame runtime creates no separate frame element"

# main destructures syncCodeboxExternalFrame from the frame runtime delegates.
assert 'const codeboxFrameDelegates = createCodeboxFrameRuntimeDelegates(() => codeboxFrameRuntime);' in main, "main builds the codebox frame runtime delegates"
assert 'syncCodeboxExternalFrame' in main and '} = codeboxFrameDelegates;' in main, "main keeps thin external frame delegate (destructured from codeboxFrameDelegates)"
assert 'export function createCodeboxFrameRuntime(ctx = {})' in frame, "codebox frame runtime owns frame behavior"
print("CODEBOX FRAME EXTERNAL OVERLAY STATIC TEST OK")
