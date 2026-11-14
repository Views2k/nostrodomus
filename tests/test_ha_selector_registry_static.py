#!/usr/bin/env python3
# HARNESS P3 selector-registry guard.
#
# Treadmill-coupled HA element selectors must live only in the registry
# (src/editor/haSelectors.js), so an HA DOM rename is one edit in one file.
# This guard scans RUNTIME src/ and fails if a treadmill-coupled selector
# literal appears anywhere else.
#
# It polices runtime COUPLING, not prose: the flagged set is exactly the
# element patterns that churn with HA releases —
#   - any `hui-...` tag,
#   - any `ha-panel-...` tag,
#   - the exact `home-assistant` / `home-assistant-main` hosts,
#   - any `.cm-...` class OUTSIDE the contracted CodeMirror set
#     (.cm-editor / .cm-content / .cm-scroller / .cm-line, the stable CM6
#     surface the editor/syntax contracts already depend on).
# It deliberately does NOT flag `ha-code-editor`, `ha-dialog`, `wa-dialog`,
# the contracted `.cm-*` classes, or `:modal` — those are either stable or
# appear in CSS-generation prose; centralizing them is good practice (the
# registry does) but is not enforced here, to keep the guard off the
# treadmill itself.
#
# Exemptions (data, not DOM coupling): the registry itself, and HACS catalog
# data files whose `home-assistant-core` slug / card-type names
# (`hui-card`, `hui-entities-card`) are values, not querySelector targets.

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
REPORT = ROOT / "reports" / "HA_SELECTOR_REGISTRY_STATIC_REPORT.txt"

REGISTRY = SRC / "editor" / "haSelectors.js"
EXEMPT_FILES = {
    REGISTRY,
    # HACS catalog data: `home-assistant-core` (integration slug) and the
    # card-type names in nestedKeys are values, not DOM-query coupling.
    SRC / "providers" / "hacsProviderCatalog.js",
    # Provider capability declarations: `home-assistant` here is a capability
    # TAG in a `capabilities: [...]` data array (these files have zero
    # querySelector/matches/closest/shadowRoot), not a DOM host selector.
    SRC / "providers" / "hacsCatalogProvider.js",
    SRC / "providers" / "snippetProvider.js",
}

CONTRACTED_CM = {"cm-editor", "cm-content", "cm-scroller", "cm-line"}
EXACT_HOME = {"home-assistant", "home-assistant-main"}

STRING_LITERAL = re.compile(r"""(['"])(.*?)\1""")
TOKEN_SPLIT = re.compile(r"[\s,>+~]+")


def selector_violation(token):
    """Return a reason string if a selector token is treadmill-coupled, else None.

    The token is normalized to its base element/class first: attribute
    filters (`[...]`) and pseudo-classes (`:hover`, `::before`) are stripped,
    so a contracted class with a Nostrodomus data-attribute filter
    (`.cm-content[data-...]`) is still recognized as the contracted class.
    """
    t = token.strip()
    if not t:
        return None
    # Strip attribute filters and pseudo-classes down to the base selector.
    base = re.split(r"[\[:]", t, maxsplit=1)[0]
    if base in EXACT_HOME:
        return f"HA host '{base}'"
    if base.startswith("hui-"):
        return f"hui-* tag '{base}'"
    if base.startswith("ha-panel-"):
        return f"ha-panel-* tag '{base}'"
    if base.startswith(".cm-"):
        cls = base[1:]
        if cls not in CONTRACTED_CM:
            return f"non-contracted CodeMirror class '{base}'"
    return None


errors = []
scanned = 0

for path in sorted(SRC.rglob("*.js")):
    if path in EXEMPT_FILES:
        continue
    scanned += 1
    text = path.read_text(errors="replace")
    for lineno, line in enumerate(text.splitlines(), start=1):
        # Skip pure comment lines — the guard polices runtime coupling, not
        # prose, so an HA name discussed in a comment is not a violation.
        if line.lstrip().startswith(("//", "*", "/*")):
            continue
        for _, literal in STRING_LITERAL.findall(line):
            for token in TOKEN_SPLIT.split(literal):
                reason = selector_violation(token)
                if reason:
                    rel = path.relative_to(ROOT)
                    errors.append(f"{rel}:{lineno}: {reason} must come from src/editor/haSelectors.js")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "HA selector registry static test report\n\n"
    f"Scanned {scanned} runtime modules (exempt: registry + HACS catalog data).\n\n"
    "Errors:\n" + ("\n".join(errors) if errors else "(none)") + "\n"
)

if errors:
    print("HA SELECTOR REGISTRY STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print(f"HA SELECTOR REGISTRY STATIC TEST OK ({scanned} modules clean; registry is the single source)")
print("Report:", REPORT)
