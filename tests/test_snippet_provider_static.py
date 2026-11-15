#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
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
]
for token in required_main:
    if token not in main:
        errors.append(f"runtime missing thin provider runtime delegate {token}")

if "from './core/runtimeConstants.js'" not in main:
    errors.append('runtime must import SNIPPET_PROVIDER_ID from the core runtime constants module')

for token in ["SNIPPET_PROVIDER_ID", "snippetRow", "snippetProvider", "snippetRowsForContext", "activeSnippetContextKinds"]:
    if token not in provider:
        errors.append(f"snippet provider module missing {token}")

for token in ["dashboard-action", "automation-trigger", "automation-condition", "automation-action", "card-mod-css", "quickSnippet"]:
    if token not in provider and token not in dist:
        errors.append(f"snippet family/metadata token missing from provider/dist: {token}")

if 'add("snip.dashboard.action' in main:
    errors.append("app.js must not hard-code dashboard action snippet rows")

if errors:
    raise SystemExit("SNIPPET PROVIDER STATIC TEST FAILED: " + "; ".join(errors))
print('SNIPPET PROVIDER STATIC TEST OK')
for token in required_runtime:
    print('PASS provider runtime token:', token)
for token in required_main:
    print('PASS main delegate token:', token)
print('PASS runtime imports SNIPPET_PROVIDER_ID from the core constants module')
print('PASS runtime delegates snippets to the provider runtime and the snippet provider module')
