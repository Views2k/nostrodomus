#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
# The codebox root and preflight style elements are created once and kept in place, and their
# mutations never trigger a style-root scan. ensureStableStyleElement and
# STABLE_CODEBOX_STYLE_NODE_IDS are in src/ui/styleDomRuntime.js; the mutation filter and the
# preflight call site are in src/ui/codebox/codeboxPreflight.js.
app = (ROOT / 'src' / 'app.js').read_text(encoding='utf-8', errors='replace')
dist = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8', errors='replace')
style_dom_runtime = (ROOT / 'src/ui/styleDomRuntime.js').read_text(encoding='utf-8', errors='replace')
codebox_preflight = (ROOT / 'src/ui/codebox/codeboxPreflight.js').read_text(encoding='utf-8', errors='replace')
source_text = '\n'.join([app, style_dom_runtime, codebox_preflight])

errors = []

# In dist esbuild removes spaces and turns `if (X) continue; if (record.type === ...)` into
# `if(!X&&record.type===...)`; both mean that a stable style-node mutation never triggers a scan.
labels = [
    ('source', source_text, [
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
    for token in required:
        if token not in text:
            errors.append(f'{label} missing stable style-node churn guard token: {token}')

    # ensureStyleElementAtEnd (remove, then append) is used for other style nodes, but not for
    # the codebox root and preflight styles. Both the source and the dist form are checked.
    for ident in ('nostrodomus-codebox-preflight-style-v1', 'nostrodomus-codebox-root-style-v1'):
        kind = 'preflight' if 'preflight' in ident else 'root'
        if (f'const style = ensureStyleElementAtEnd(root, "{ident}")' in text
                or f'ensureStyleElementAtEnd(root,"{ident}")' in text):
            errors.append(f'{label} uses the remove/reappend helper for codebox {kind} style')

if errors:
    print('STABLE STYLE NODE CHURN GUARD STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('STABLE STYLE NODE CHURN GUARD STATIC TEST OK')
