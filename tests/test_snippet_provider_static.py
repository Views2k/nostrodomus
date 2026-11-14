#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8")
dist = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8")
provider = (ROOT / "src" / "providers" / "snippetProvider.js").read_text(encoding="utf-8")
runtime = (ROOT / "src" / "providers" / "providerRuntime.js").read_text(encoding="utf-8")
errors = []

required_runtime = [
    "from './snippetProvider.js'",
    "snippets.snippetRowsForContext(ctx)",
    "snippets.snippetProvider()",
    "staticLibrary.buildIndex({",
]
for token in required_runtime:
    if token not in runtime:
        errors.append(f"provider runtime missing {token}")

required_main = [
    "from './providers/providerRuntime.js'",
    "createProviderRuntimeDelegates(() => providerRuntime)",
    "snippetRowsForContext, snippetProvider, buildIndex",
    "snippetRowsForContext, snippetProvider, buildIndex",
]
for token in required_main:
    if token not in main:
        errors.append(f"runtime missing thin provider runtime delegate {token}")

if 'const SNIPPET_PROVIDER_ID = "snippet-templates"' not in main and "from './core/runtimeConstants.js'" not in main:
    errors.append('runtime missing SNIPPET_PROVIDER_ID local const or core runtime constants import')

for token in ["SNIPPET_PROVIDER_ID", "snippetRow", "snippetProvider", "snippetRowsForContext", "activeSnippetContextKinds"]:
    if token not in provider:
        errors.append(f"snippet provider module missing {token}")

for token in ["dashboard-action", "automation-trigger", "automation-condition", "automation-action", "card-mod-css", "quickSnippet"]:
    if token not in provider and token not in dist:
        errors.append(f"snippet family/metadata token missing from provider/dist: {token}")

if 'add("snip.dashboard.action' in main:
    errors.append("runtime still contains old hardcoded dashboard action snippet rows")

if errors:
    raise SystemExit("SNIPPET PROVIDER STATIC TEST FAILED: " + "; ".join(errors))
print('SNIPPET PROVIDER STATIC TEST OK')
for token in required_runtime:
    print('PASS provider runtime token:', token)
for token in required_main:
    print('PASS main delegate token:', token)
print('PASS runtime obtains SNIPPET_PROVIDER_ID from local const or core constants module')
print('PASS runtime delegates snippets to provider runtime and extracted provider module')
