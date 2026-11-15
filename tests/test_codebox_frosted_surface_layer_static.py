#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODEBOX_STYLE_SRC = ROOT / "src/ui/codeboxStyle.js"
CODEBOX_PREFLIGHT_SRC = ROOT / "src/ui/codebox/codeboxPreflight.js"
DIST = ROOT / "dist/nostrodomus.js"
REPORT = ROOT / "reports/CODEBOX_FROSTED_SURFACE_LAYER_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

dist_text = DIST.read_text(encoding="utf-8", errors="replace")

preflight_src_text = CODEBOX_PREFLIGHT_SRC.read_text(encoding="utf-8", errors="replace")
require("hostSurfaceSelector" in preflight_src_text,
        "source declares a host surface selector for preflight roots")
require("hostSurfaceSelector" in dist_text,
        "dist declares a host surface selector for preflight roots")

# The codebox CSS is in template literals, so dist carries it with the same whitespace.
codebox_style_text = CODEBOX_STYLE_SRC.read_text(encoding="utf-8", errors="replace")
for label, text in (("source", codebox_style_text), ("dist", dist_text)):
    require('ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after' in text, f"{label} installs a host-owned ::after frosted surface")
    require('backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;' in text, f"{label} applies backdrop-filter through the surface layer")
    require('-webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;' in text, f"{label} applies webkit backdrop-filter through the surface layer")
    require('--nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);' in text, f"{label} defines the surface blur token")
    require('background: transparent !important;\n        scrollbar-color: var(--nostrodomus-codebox-scrollbar-thumb)' in text, f"{label} keeps CodeMirror panes transparent so the host surface owns the background")
    require('isolation: isolate !important;' in text, f"{label} isolates host stacking so ::after stays behind CodeMirror and ::before stays above")
    require(':host([data-nostrodomus-codebox-frame-host="1"])::before' in text, f"{label} preserves host-owned border/glow ::before")
    require('[data-nostrodomus-codebox-external-frame="1"] {\n        display: none !important;' in text, f"{label} keeps the measured external frame disabled")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Codebox frosted surface layer static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("CODEBOX FROSTED SURFACE LAYER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("CODEBOX FROSTED SURFACE LAYER STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
