#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src/main.legacy.js"
FRAME = ROOT / "src/ui/codeboxFrameRuntime.js"
STYLE = ROOT / "src/ui/codeboxStyle.js"
DIST = ROOT / "dist/nostrodomus.js"
VERSION_SRC = ROOT / "src/core/version.js"
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
version = str(project.get("version"))
internal = str(project.get("internal_version"))
main = MAIN.read_text(encoding="utf-8", errors="replace")
frame = FRAME.read_text(encoding="utf-8", errors="replace")
style = STYLE.read_text(encoding="utf-8", errors="replace")
dist = DIST.read_text(encoding="utf-8", errors="replace")
version_src = VERSION_SRC.read_text(encoding="utf-8", errors="replace")
source_owner = main + "\n" + frame + "\n" + style + "\n" + version_src

for label, text in (("source-owner", source_owner), ("dist", dist)):
    # The minified dist strips spaces around "=" and after commas; match either the
    # source-spaced form or the minified form so the SAME version literal is verified.
    require(f'PROJECT_VERSION = "{version}"' in text or f'PROJECT_VERSION="{version}"' in text, f"{label} PROJECT_VERSION matches PROJECT.json")
    require(f'VERSION = "{internal}"' in text or f'VERSION="{internal}"' in text, f"{label} VERSION matches PROJECT.json internal_version")
    require('function codeboxFrameHostForEditor(editor)' in text, f"{label} has a frame-host resolver")
    require('data-nostrodomus-codebox-frame-host' in text, f"{label} marks the frame host")
    require('data-nostrodomus-codebox-external-frame' in text, f"{label} creates/styles a dedicated external codebox frame")
    require('function syncCodeboxExternalFrame(editor, tokens, reason = "external-frame-disabled")' in text or 'function syncCodeboxExternalFrame(editor,tokens,reason="external-frame-disabled")' in text, f"{label} syncs the external frame through the codebox frame owner")
    require('.cm-editor[data-nostrodomus-codebox-style="1"]' in text and 'box-shadow: none !important' in text, f"{label} keeps .cm-editor from owning the outer glow")
    frame_block_start = text.find('[data-nostrodomus-codebox-external-frame="1"]')
    cm_block_start = text.find('.cm-editor[data-nostrodomus-codebox-style="1"]')
    require(frame_block_start != -1 and cm_block_start != -1 and frame_block_start < cm_block_start, f"{label} declares external frame before cm-editor reset")
    old_bad = '.cm-editor {\n        position: relative !important;\n        z-index: 2 !important;\n        border: 1px solid var(--nostrodomus-codebox-frame-border) !important;\n        box-shadow:'
    require(old_bad not in text, f"{label} does not put the outer border/glow on bare .cm-editor")
    require(('syncCodeboxExternalFrame(editor, tokens' in text or 'syncCodeboxExternalFrame(editor,tokens' in text) and 'ensureCodeboxExternalFrame(tokens)' in text, f"{label} applies frame variables to and syncs the external frame")

require('import { createCodeboxFrameRuntime }' in main, "main imports the codebox frame runtime owner")
# The runtime is created into a deferred `let` (declared null, assigned later), so the
# wiring literal lost its `const`; assert the real assignment site.
require('codeboxFrameRuntime = createCodeboxFrameRuntime({' in main, "main wires the codebox frame runtime owner")
# Thin delegates moved from hand-written `function x() { return runtime.x(); }` bodies
# to the generated delegate bridge: main builds the bridge over the same runtime and
# destructures the same frame-host / keyboard-containment methods off it.
require('const codeboxFrameDelegates = createCodeboxFrameRuntimeDelegates(() => codeboxFrameRuntime);' in main and 'codeboxFrameHostForEditor' in main, "main keeps a thin frame host delegate")
require('const codeboxFrameDelegates = createCodeboxFrameRuntimeDelegates(() => codeboxFrameRuntime);' in main and 'installCodeboxKeyboardContainment' in main, "main keeps a thin keyboard-containment delegate")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 13), "PROJECT.json remains at or beyond the v0.1.13 codebox frame owner baseline")
require("codebox-frame-owner" in internal or version_tuple > (0, 1, 13), "PROJECT.json internal_version records codebox frame owner (or version advanced beyond the baseline that introduced it)")
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
