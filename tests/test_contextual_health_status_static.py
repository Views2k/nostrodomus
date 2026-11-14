#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
# The monolith was decomposed: the contextual health surface (health()/add()/addContextual,
# requiredOk/warningCount/severity, the contextual check names) moved out of src/main.legacy.js
# into the extracted owner module src/diagnostics/diagnosticsHealth.js (runtime-wired into
# main.legacy.js as `diagnosticsHealth.health`). Same invariant, current source location; the
# bundled dist still carries the (minified) forms.
SRC = ROOT / "src/diagnostics/diagnosticsHealth.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/CONTEXTUAL_HEALTH_STATUS_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))

# Each entry is a tuple of accepted forms for the SAME invariant: the spaced source form
# (verified against src/diagnostics/diagnosticsHealth.js) and, where esbuild minification
# rewrites the spacing/operators, the minified form (verified against dist). A token passes
# when ANY accepted form is present, so the spaced form is matched in source and the minified
# form survives in dist — same fact, current location/spacing.
for path, label in [(SRC, "src"), (DIST, "dist")]:
    text = path.read_text(encoding="utf-8", errors="replace")
    for forms in [
        ('contextualChecks',),
        ('"edit-dialog-active"',),
        ('"editor-scoped"',),
        ('const addContextual = (name, ok, detail = "") => add(name, ok, detail, "contextual")',
         'addContextual=(name,ok,detail="")=>add(name,ok,detail,"contextual")'),
        ('addContextual("editor-detected"',),
        ('addContextual("edit-dialog-active"',),
        ('addContextual("editor-scoped"',),
        ('addContextual("runtime-hass"',),
        ('requiredOk',),
        ('severity !== "required"', 'severity!=="required"'),
        ('const status = requiredOk ? warningCount > 0 ? "warning" : "ok" : "error"',
         'status=requiredOk?warningCount>0?"warning":"ok":"error"'),
        ('ok: requiredOk', 'ok:requiredOk'),
        ('requiredOk,',),
        ('warningCount,',),
        ('severity,',),
        ('status: passed ? "ok" : severity === "required" ? "fail" : "warning"',
         'status:passed?"ok":severity==="required"?"fail":"warning"'),
    ]:
        require(any(form in text for form in forms), f"{label} contains contextual health token: {forms[0]}")
    require('const ok = checks.every(c => c.ok || c.name === "editor-detected" || c.name === "runtime-hass")' not in text, f"{label} removed old partial health exception list")

# The contextual health surface predates the 31.6.x -> 0.1.x SemVer reset (the [0.1.0] baseline);
# the invariant is the contextual health code surface above, not a frozen version literal. Un-pin
# to a dynamic floor at the start of the SemVer line (mirrors the visual/observer static tests).
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
require(version_tuple >= (0, 1, 0), "PROJECT.json remains at or beyond the contextual health baseline (SemVer line)")
# The "editor-blur-preview-prepaint" identifier is the old-era (v31.6.41) internal_version name
# retired at the SemVer reset; accept either that legacy id OR any version advanced past the floor.
require("editor-blur-preview-prepaint" in internal or version_tuple > (0, 1, 0), "PROJECT.json internal_version records the contextual health owner (or version advanced past the baseline)")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Dashboard style containment static test\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("CONTEXTUAL HEALTH STATUS STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    sys.exit(1)

print("CONTEXTUAL HEALTH STATUS STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
