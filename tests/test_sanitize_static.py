#!/usr/bin/env python3
# src/core/sanitize.js: the text helpers are exported and pure (no DOM, window, storage, events,
# network or eval), and leadingWhitespace has the same logic as its copy in
# src/completion/insertion.js. tests/sanitize.test.mjs checks their behavior.
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "src/core/sanitize.js"
INSERTION = ROOT / "src/completion/insertion.js"
REPORT = ROOT / "reports/SANITIZE_STATIC_TEST_REPORT.txt"

TARGETS = [
    "leadingWhitespace",
    "indentLinesAfterFirst",
    "sanitizeInlineDocumentation",
]

FORBIDDEN = [
    "document",
    "window",
    "localStorage",
    "state.",
    "state[",
    "addEventListener",
    "querySelector",
    "innerHTML",
    "showPopover",
    "hidePopover",
    "fetch(",
    "sendBeacon",
    "eval(",
    "new Function",
]


def extract_function(src: str, name: str) -> str:
    m = re.search(r'(^[ \t]*export\s+function\s+' + re.escape(name) + r'\s*\([^)]*\)\s*\{)', src, re.M)
    if not m:
        raise AssertionError(f"Missing exported function: {name}")
    depth = 0
    i = src.find("{", m.start())
    in_str = None
    esc = False
    while i < len(src):
        ch = src[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
        elif ch in ("'", '"', "`"):
            in_str = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[m.start():i + 1]
        i += 1
    raise AssertionError(f"Could not find the end of function: {name}")


def logic_normalize(src: str) -> str:
    # Two copies compare equal despite different indentation and quote style.
    src = re.sub(r'^[ \t]*export\s+function\s+', 'function ', src, count=1, flags=re.M)
    lines = [ln.strip() for ln in src.strip().splitlines()]
    return "\n".join(lines).replace('"', "'")


module = MODULE.read_text(errors="replace")
errors = []
notes = []

if not re.search(r'import\s*\{\s*safeString\s*\}\s*from\s*["\']\./string\.js["\']', module):
    errors.append("sanitize.js must take safeString from ./string.js instead of keeping a copy")
else:
    notes.append("PASS safeString comes from string.js")

for name in TARGETS:
    try:
        body = extract_function(module, name)
        for bad in FORBIDDEN:
            if bad in body:
                errors.append(f"{name}: forbidden token in sanitize.js: {bad}")
        notes.append(f"PASS {name} is exported and pure")
    except AssertionError as e:
        errors.append(str(e))

# insertion.js keeps its own leadingWhitespace; the two must not drift apart.
try:
    ours = logic_normalize(extract_function(module, "leadingWhitespace"))
    theirs = logic_normalize(extract_function(INSERTION.read_text(errors="replace"), "leadingWhitespace"))
    if ours != theirs:
        errors.append("leadingWhitespace: sanitize.js and src/completion/insertion.js differ")
    else:
        notes.append("PASS leadingWhitespace matches src/completion/insertion.js")
except AssertionError as e:
    errors.append(str(e))

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Sanitize static test report\n"
    f"Module: {MODULE}\n\n"
    "Results:\n" + "\n".join(notes) + "\n\n"
    "Errors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("SANITIZE STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("SANITIZE STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
