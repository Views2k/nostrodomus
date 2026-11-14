#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
required_files = [
    "docs/SNIPPET_SCHEMA.md",
    "data/snippets.json",
    "tools/validate_snippets.py",
    "tests/snippets/snippet_data_provider.test.mjs",
]
missing = [rel for rel in required_files if not (ROOT / rel).exists()]
if missing:
    raise SystemExit("SNIPPET SCHEMA STATIC TEST FAILED missing: " + ", ".join(missing))
texts = {
    "schema": (ROOT / "docs/SNIPPET_SCHEMA.md").read_text(encoding="utf-8"),
    "provider": (ROOT / "src/providers/snippetProvider.js").read_text(encoding="utf-8"),
    "catalog": (ROOT / "src/snippets/catalog.js").read_text(encoding="utf-8"),
    "validator": (ROOT / "tools/validate_snippets.py").read_text(encoding="utf-8"),
    "data": (ROOT / "data/snippets.json").read_text(encoding="utf-8"),
}
required_tokens = {
    "schema": ["Snippet Schema", "id", "family", "contextKind", "triggers", "tools/validate_snippets.py"],
    "provider": ["activeSnippetContextKinds", "snippetRowsForContext", "snippetProvider", "data/snippets.json"],
    "catalog": ["NOSTRODOMUS_SNIPPET_CATALOG", "NOSTRODOMUS_SNIPPET_FAMILIES", "NOSTRODOMUS_SNIPPET_CONTEXT_KIND_SET"],
    "validator": ["ALLOWED_FAMILIES", "ALLOWED_CONTEXT_KINDS", "PLACEHOLDER_RE", "SNIPPET VALIDATION OK"],
    "data": ["snip.dashboard.action.perform_action", "snip.sequence.service", "snip.card_mod.ha_card"],
}
for name, tokens in required_tokens.items():
    for token in tokens:
        if token not in texts[name]:
            raise SystemExit(f"SNIPPET SCHEMA STATIC TEST FAILED {name} missing token: {token}")
print("SNIPPET SCHEMA STATIC TEST OK")
for rel in required_files:
    print("PASS file:", rel)
