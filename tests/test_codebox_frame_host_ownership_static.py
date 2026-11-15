#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/app.js"
FRAME = ROOT / "src/ui/codeboxFrameRuntime.js"
STYLE = ROOT / "src/ui/codeboxStyle.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/CODEBOX_FRAME_HOST_OWNERSHIP_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))
main = MAIN.read_text(encoding="utf-8", errors="replace")
frame = FRAME.read_text(encoding="utf-8", errors="replace")
style = STYLE.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")
source_owner = main + "\n" + frame + "\n" + style

for label, text in (("source-owner", source_owner), ("dist", dist)):
    # dist has no spaces around "=" or after commas, so each check accepts both forms.
    require('function codeboxFrameHostForEditor(editor)' in text, f"{label} has a frame-host resolver")
    require('data-nostrodomus-codebox-frame-host' in text, f"{label} marks the frame host")
    require('data-nostrodomus-codebox-external-frame' in text, f"{label} styles the external codebox frame element so it stays hidden")
    require('function syncCodeboxExternalFrame(editor, tokens, reason = "external-frame-disabled")' in text or 'function syncCodeboxExternalFrame(editor,tokens,reason="external-frame-disabled")' in text, f"{label} syncs the external frame through the codebox frame owner")
    require('.cm-editor[data-nostrodomus-codebox-style="1"]' in text and 'box-shadow: none !important' in text, f"{label} keeps .cm-editor from owning the outer glow")
    frame_block_start = text.find('[data-nostrodomus-codebox-external-frame="1"]')
    cm_block_start = text.find('.cm-editor[data-nostrodomus-codebox-style="1"]')
    require(frame_block_start != -1 and cm_block_start != -1 and frame_block_start < cm_block_start, f"{label} declares external frame before cm-editor reset")
    bare_cm_editor_frame = '.cm-editor {\n        position: relative !important;\n        z-index: 2 !important;\n        border: 1px solid var(--nostrodomus-codebox-frame-border) !important;\n        box-shadow:'
    require(bare_cm_editor_frame not in text, f"{label} does not put the outer border/glow on bare .cm-editor")
    require(('syncCodeboxExternalFrame(editor, tokens' in text or 'syncCodeboxExternalFrame(editor,tokens' in text) and ('applyCodeboxStyleTokensToElement?.(frameHost, tokens' in text or 'applyCodeboxStyleTokensToElement?.(frameHost,tokens' in text), f"{label} applies the frame variables to the frame host it syncs")

require('import { createCodeboxFrameRuntime }' in main, "main imports the codebox frame runtime owner")
require('codeboxFrameRuntime = createCodeboxFrameRuntime({' in main, "main wires the codebox frame runtime owner")
# main gets the frame-host and keyboard-containment functions from delegates over the runtime.
require('const codeboxFrameDelegates = createCodeboxFrameRuntimeDelegates(() => codeboxFrameRuntime);' in main and 'codeboxFrameHostForEditor' in main, "main keeps a thin frame host delegate")
require('const codeboxFrameDelegates = createCodeboxFrameRuntimeDelegates(() => codeboxFrameRuntime);' in main and 'installCodeboxKeyboardContainment' in main, "main keeps a thin keyboard-containment delegate")
require("external frame" in json.dumps(project).lower() and ".cm-editor" in json.dumps(project), "PROJECT.json documents the external-frame ownership policy")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Codebox external frame ownership static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("CODEBOX EXTERNAL FRAME OWNERSHIP STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("CODEBOX EXTERNAL FRAME OWNERSHIP STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
