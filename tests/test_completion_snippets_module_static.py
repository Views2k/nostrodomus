#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src' / 'completion' / 'snippets.js'
APP = ROOT / 'src' / 'app.js'
INSERTION = ROOT / 'src' / 'completion' / 'insertion.js'
ALLOWLIST = ROOT / 'docs' / 'contracts' / 'MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist' / 'nostrodomus.js'

errors = []
for path in [MODULE, APP, INSERTION, ALLOWLIST, DIST]:
    if not path.exists():
        errors.append(f'missing file: {path.relative_to(ROOT)}')

if MODULE.exists():
    text = MODULE.read_text(encoding='utf-8', errors='replace')
    for token in [
        'export function parseSnippetTemplate',
        'export function hasSnippetPlaceholders',
        'Keep this module pure',
    ]:
        if token not in text:
            errors.append(f'snippets module missing token: {token}')
    for forbidden in ['window', 'document', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'fetch(', 'sendBeacon', 'state.']:
        if forbidden in text:
            errors.append(f'snippets module must remain pure and not reference {forbidden}')

if APP.exists():
    app = APP.read_text(encoding='utf-8', errors='replace')
    if 'function parseSnippetTemplate(template)' in app:
        errors.append('main runtime must not declare its own parseSnippetTemplate')
    if 'function hasSnippetPlaceholders(value)' in app:
        errors.append('main runtime must not declare its own hasSnippetPlaceholders')

if INSERTION.exists():
    insertion = INSERTION.read_text(encoding='utf-8', errors='replace')
    if "from './snippets.js'" not in insertion:
        errors.append('completion insertion owner must import completion snippet helpers from module')
    for token in ['parseSnippetTemplate(rawInsert)', 'hasSnippetPlaceholders(rawInsert)']:
        if token not in insertion:
            errors.append(f'completion insertion owner must use snippet helper: {token}')

if ALLOWLIST.exists() and 'src/completion/snippets.js' in ALLOWLIST.read_text(encoding='utf-8', errors='replace'):
    errors.append('src/completion/snippets.js must not remain in the unwired-module allowlist')

if DIST.exists():
    dist_text = DIST.read_text(encoding='utf-8', errors='replace')
    if 'parseSnippetTemplate' not in dist_text or 'hasSnippetPlaceholders' not in dist_text:
        errors.append('dist must include bundled completion snippet helper tokens')

if errors:
    print('COMPLETION SNIPPETS MODULE STATIC TEST FAILED')
    for error in errors:
        print('ERROR:', error)
    raise SystemExit(1)

print('COMPLETION SNIPPETS MODULE STATIC TEST OK')
