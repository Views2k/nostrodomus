#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT_INTERNAL = json.loads((ROOT / 'PROJECT.json').read_text(encoding='utf-8')).get('internal_version') or ''
legacy = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8', errors='replace')
dist = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8', errors='replace')
version_module = (ROOT / 'src/core/version.js').read_text(encoding='utf-8', errors='replace') if (ROOT / 'src/core/version.js').exists() else ''
# UI Decomp Phase 2 group 3 (CHANGELOG v0.1.78) moved the stable style-node churn
# guard out of main.legacy.js: ensureStableStyleElement / STABLE_CODEBOX_STYLE_NODE_IDS
# now live in src/ui/styleDomRuntime.js, and the mutation-skip helper
# (mutationRecordIsNostrodomusStableStyleNode + the codebox preflight callsite) lives in
# src/ui/codebox/codeboxPreflight.js. Read the owner modules so the source label checks
# the invariant at its CURRENT location.
style_dom_runtime = (ROOT / 'src/ui/styleDomRuntime.js').read_text(encoding='utf-8', errors='replace')
codebox_preflight = (ROOT / 'src/ui/codebox/codeboxPreflight.js').read_text(encoding='utf-8', errors='replace')
source_text = '\n'.join([legacy, version_module, style_dom_runtime, codebox_preflight])

# Floor = v0.1.78, the SemVer release where these exact symbols settled into their
# current owner modules (the churn-guard INVARIANT itself predates the 0.1.x rebase,
# back to the old v31.6.80 lineage). Compare the runtime version token embedded in the
# shipped JS (mirrors tests/test_visual_layer_baseline_contract_static.py and
# tests/test_codemirror_observer_containment_static.py un-pinning pattern).
VERSION_FLOOR = (0, 1, 78)

def max_runtime_version(text):
    best = None
    for parts in re.findall(r'nostrodomus-v(\d+)\.(\d+)\.(\d+)-[a-z0-9-]+', text):
        tup = tuple(int(part) for part in parts)
        if best is None or tup > best:
            best = tup
    return best

errors = []

# Source label matches source-spaced strings; the minified dist preserves the SAME
# invariant with collapsed whitespace ("(root, id)" -> "(root,id)") and the minifier's
# semantic inversion of the early-continue guard into a negated AND on the scan branch
# (if (X) continue; if (childList...) scan  ->  if(!X && childList...) scan). Both forms
# encode the identical fact: nostrodomus stable style-node mutations never trigger a scan.
labels = [
    ('src/main.legacy.js', source_text, [
        'STABLE_CODEBOX_STYLE_NODE_IDS',
        'function ensureStableStyleElement(root, id)',
        'data-nostrodomus-codebox-stable-style-node',
        'function mutationRecordIsNostrodomusStableStyleNode(record)',
        'if (mutationRecordIsNostrodomusStableStyleNode(record)) continue;',
        'ensureStableStyleElement(root, "nostrodomus-codebox-preflight-style-v1")',
        'ensureStableStyleElement(root, "nostrodomus-codebox-root-style-v1")',
    ]),
    ('dist/nostrodomus.js', dist, [
        'STABLE_CODEBOX_STYLE_NODE_IDS',
        'function ensureStableStyleElement(root,id)',
        'data-nostrodomus-codebox-stable-style-node',
        'function mutationRecordIsNostrodomusStableStyleNode(record)',
        'if(!mutationRecordIsNostrodomusStableStyleNode(record)&&record.type===',
        'ensureStableStyleElement(root,"nostrodomus-codebox-preflight-style-v1")',
        'ensureStableStyleElement(root,"nostrodomus-codebox-root-style-v1")',
    ]),
]

for label, text, required in labels:
    runtime_version = max_runtime_version(text)
    internal = str(PROJECT_INTERNAL)
    lineage_ok = ('stable-style-node-churn-guard' in internal or 'stable-style-node-churn-guard' in text
                  or (runtime_version is not None and runtime_version > VERSION_FLOOR))
    if runtime_version is None or runtime_version < VERSION_FLOOR or not lineage_ok:
        errors.append(f'{label} missing current runtime version token (>= v{".".join(map(str, VERSION_FLOOR))}) preserving the stable style-node churn guard lineage')

    for token in required:
        if token not in text:
            errors.append(f'{label} missing stable style-node churn guard token: {token}')

    # The legacy ordering helper is still present for other roots, but the codebox
    # root/preflight style nodes must not use the remove-then-append path anymore.
    # Check both source-spaced and minified ("(root,\"...\")") forms so the negative
    # invariant has teeth against the minified dist too.
    for ident in ('nostrodomus-codebox-preflight-style-v1', 'nostrodomus-codebox-root-style-v1'):
        kind = 'preflight' if 'preflight' in ident else 'root'
        if (f'const style = ensureStyleElementAtEnd(root, "{ident}")' in text
                or f'ensureStyleElementAtEnd(root,"{ident}")' in text):
            errors.append(f'{label} still uses remove/reappend helper for codebox {kind} style')

if errors:
    print('STABLE STYLE NODE CHURN GUARD STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('STABLE STYLE NODE CHURN GUARD STATIC TEST OK')
