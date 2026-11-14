#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
# The monolith was split into src/ modules: the version identity constants now live in
# src/core/version.js (imported by main.legacy.js), the host-owned codebox visual CSS now
# lives in src/ui/codeboxStyle.js, and the preflight host surface selector lives in
# src/ui/codebox/codeboxPreflight.js. The dist remains the single bundled/minified file.
VERSION_SRC = ROOT / "src/core/version.js"
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

version = str(PROJECT.get("version") or "")
internal = str(PROJECT.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
# UN-PIN: the original pinned PROJECT.json to the exact 31.6.90 frosted-surface repair
# release. The repair is permanent, so the invariant is "at or beyond the SemVer baseline
# that carries the host-owned frosted surface" (the migrated-from-HA baseline is 0.1.54,
# and codeboxStyle.js has shipped the ::after frosted layer since that first SemVer commit).
require(version_tuple >= (0, 1, 54), "PROJECT.json remains at or beyond the frosted-surface visual baseline")
# The descriptive internal_version identifier from the 31.6.x era
# ("runtime-layer-rollback-codebox-frosted-surface") was retired when SemVer introduced
# per-release kebab tags; the invariant is preserved by being at or beyond the baseline.
require("codebox-frosted-surface" in internal or version_tuple > (0, 1, 54),
        "internal_version records frosted surface layer repair (or version advanced beyond the baseline that introduced it)")

# Version identity facts: source constants live in src/core/version.js; the dist is minified
# so the declarations lose their spacing / keyword (esbuild emits PROJECT_VERSION="..." and
# var VERSION="..."). Match the real current form for each target while preserving intent.
version_src_text = VERSION_SRC.read_text(encoding="utf-8", errors="replace")
require(f'export const PROJECT_VERSION = "{version}"' in version_src_text,
        "source PROJECT_VERSION matches PROJECT.json")
require(f'export const VERSION = "{internal}"' in version_src_text,
        "source VERSION matches PROJECT.json internal_version")

dist_text = DIST.read_text(encoding="utf-8", errors="replace")
require(f'PROJECT_VERSION="{version}"' in dist_text or f'const PROJECT_VERSION = "{version}"' in dist_text,
        "dist PROJECT_VERSION matches PROJECT.json")
require(f'VERSION="{internal}"' in dist_text or f'const VERSION = "{internal}"' in dist_text,
        "dist VERSION matches PROJECT.json internal_version")

# The host surface selector for preflight roots lives in the preflight seam in source, and
# survives into the bundled dist. Check it at its current location for each target.
preflight_src_text = CODEBOX_PREFLIGHT_SRC.read_text(encoding="utf-8", errors="replace")
require("hostSurfaceSelector" in preflight_src_text,
        "source declares a host surface selector for preflight roots")
require("hostSurfaceSelector" in dist_text,
        "dist declares a host surface selector for preflight roots")

# Host-owned codebox visual CSS. In source these strings live in src/ui/codeboxStyle.js;
# they ride template literals so they survive minification verbatim in the dist (the dist
# strings are byte-identical to source, including the CSS whitespace).
codebox_style_text = CODEBOX_STYLE_SRC.read_text(encoding="utf-8", errors="replace")
for label, text in (("source", codebox_style_text), ("dist", dist_text)):
    require('ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after' in text, f"{label} installs a host-owned ::after frosted surface")
    require('backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;' in text, f"{label} applies backdrop-filter through the surface layer")
    require('-webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;' in text, f"{label} applies webkit backdrop-filter through the surface layer")
    require('--nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);' in text, f"{label} defines the surface blur token")
    require('background: transparent !important;\n        scrollbar-color: var(--nostrodomus-codebox-scrollbar-thumb)' in text, f"{label} keeps CodeMirror panes transparent so the host surface owns the background")
    require('isolation: isolate !important;' in text, f"{label} isolates host stacking so ::after stays behind CodeMirror and ::before stays above")
    require(':host([data-nostrodomus-codebox-frame-host="1"])::before' in text, f"{label} preserves host-owned border/glow ::before")
    require('[data-nostrodomus-codebox-external-frame="1"] {\n        display: none !important;' in text, f"{label} keeps failed JS measured external frame disabled")

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
