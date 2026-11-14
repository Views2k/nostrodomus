#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DOM = ROOT / "src" / "core" / "dom.js"

text = DOM.read_text(encoding="utf-8")

required_tokens = [
    "export function createElement",
    "export function setText",
    "export function setAttr",
    "export function setStyle",
    "export function appendChildren",
    "export function clearElement",
    "export function replaceChildrenSafe",
    "textContent",
    "document.createElement",
    "document.createTextNode",
    "appendChild",
    "removeChild",
    "setAttribute",
    "removeAttribute",
]

for token in required_tokens:
    if token not in text:
        print(f"FAIL missing token: {token}")
        sys.exit(1)
    print(f"PASS token: {token}")

for forbidden in [
    ".innerHTML",
    ".outerHTML",
    "insertAdjacentHTML",
    "document.write",
    "eval(",
    "new Function",
]:
    if forbidden in text:
        print(f"FAIL forbidden token in DOM helper: {forbidden}")
        sys.exit(1)
    print(f"PASS forbidden token absent: {forbidden}")

checks = {
    "event handler attribute rejection": r"\^on",
    "javascript URL rejection": r"javascript:",
    "srcdoc rejection": r"srcdoc",
    "tag allowlist": r"SAFE_TAG_NAMES",
    "URL attribute allowlist": r"URL_ATTR_NAMES",
    "style name validation": r"\^\[a-zA-Z\]",
}

for label, pattern in checks.items():
    if not re.search(pattern, text):
        print(f"FAIL missing behavior: {label}")
        sys.exit(1)
    print(f"PASS behavior: {label}")

print("DOM STATIC TEST OK")
