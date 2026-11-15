#!/usr/bin/env python3
# Selector registry check.
#
# Selectors for Home Assistant elements that change between HA releases must live only in
# src/editor/haSelectors.js, so a renamed HA element is one edit in one file. This test scans
# the string literals in src/ and fails when such a selector appears anywhere else:
#   - any `hui-...` tag,
#   - any `ha-panel-...` tag,
#   - the exact `home-assistant` and `home-assistant-main` hosts,
#   - any `.cm-...` class outside .cm-editor, .cm-content, .cm-scroller and .cm-line, the stable
#     CodeMirror classes the editor and syntax code rely on.
# It does not flag `ha-code-editor`, `ha-dialog`, `wa-dialog`, those four `.cm-*` classes or
# `:modal`: they are stable or appear in generated CSS. The registry defines them anyway.
#
# Exempt files hold data, not DOM queries: the registry itself and the HACS catalog files,
# whose `home-assistant-core` slug and card-type names (`hui-card`, `hui-entities-card`) are
# values, not querySelector targets.

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
    # tag in a `capabilities: [...]` data array (these files have zero
    # querySelector/matches/closest/shadowRoot), not a DOM host selector.
    SRC / "providers" / "hacsCatalogProvider.js",
    SRC / "providers" / "snippetProvider.js",
}

CONTRACTED_CM = {"cm-editor", "cm-content", "cm-scroller", "cm-line"}
EXACT_HOME = {"home-assistant", "home-assistant-main"}

STRING_LITERAL = re.compile(r"""(['"])(.*?)\1""")
TOKEN_SPLIT = re.compile(r"[\s,>+~]+")


def selector_violation(token):
    """Return a reason string if a selector token must come from the registry, else None.

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
        # Comment lines are skipped: an HA name mentioned in a comment is not a selector.
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
