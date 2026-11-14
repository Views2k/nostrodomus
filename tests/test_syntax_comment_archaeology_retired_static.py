#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "src" / "main.legacy.js"
VERSION = ROOT / "src" / "core" / "version.js"
PROJECT = ROOT / "PROJECT.json"

text = MAIN.read_text(encoding="utf-8")
version_text = VERSION.read_text(encoding="utf-8")
project_text = PROJECT.read_text(encoding="utf-8")

retired_comment_tokens = [
    "v31.6.386 syntax-runtime owner extraction full-verify lineage tokens",
    "syntax-runtime owner extraction lineage",
    "v31.6.387 syntax native/source-class runtime owner compatibility tokens",
    "function codeMirrorSyntaxContentMutationRelevant(records)",
    "function initialSyntaxPaintGateShadowHosts(root, reason = \"initial-syntax-shadow-scan\", depth = 0)",
    "Static v31.6.77 range/source syntax baseline carry-forward",
    "sourceClassSmartSyntaxObserver?.disconnect?.()",
]

for token in retired_comment_tokens:
    assert token not in text, f"retired syntax comment archaeology remains: {token}"

assert "nostrodomus-v0.1." in version_text
assert "nostrodomus-v0.1." in project_text
assert "remediation-performance-stage" not in version_text

print("SYNTAX COMMENT ARCHAEOLOGY RETIRED STATIC TEST OK")
