#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
# Health checks that depend on an open editor are "contextual": they produce warnings, and only
# required checks can fail the health status.
SRC = ROOT / "src/diagnostics/diagnosticsHealth.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/CONTEXTUAL_HEALTH_STATUS_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

# Each entry lists the source form and, where esbuild removes spaces, the dist form.
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
    require('const ok = checks.every(c => c.ok || c.name === "editor-detected" || c.name === "runtime-hass")' not in text, f"{label} has no hard-coded list of checks allowed to fail")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Contextual health status static test\n\n"
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
