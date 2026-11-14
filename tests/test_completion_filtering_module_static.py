#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILTERING = ROOT / 'src' / 'completion' / 'filtering.js'
SCORING = ROOT / 'src' / 'completion' / 'scoring.js'
ALLOWLIST = ROOT / 'docs' / 'contracts' / 'MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist' / 'nostrodomus.js'

errors = []
for path in [FILTERING, SCORING, ALLOWLIST, DIST]:
    if not path.exists():
        errors.append(f'missing file: {path.relative_to(ROOT)}')

if FILTERING.exists():
    text = FILTERING.read_text(encoding='utf-8', errors='replace')
    for token in [
        'export const DEFAULT_SCORING_SETTINGS',
        'export function normalizeScoringSettings',
        'export function normalizeCompletionItem',
        'export function hasEnabledLanguage',
        'export function cacheGet',
        'export function cachePut',
        'export function camelMatch',
    ]:
        if token not in text:
            errors.append(f'filtering module missing token: {token}')
    for forbidden in ['window', 'document', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'fetch(', 'sendBeacon', 'state.']:
        if forbidden in text:
            errors.append(f'filtering module must remain pure and not reference {forbidden}')

if SCORING.exists():
    scoring = SCORING.read_text(encoding='utf-8', errors='replace')
    if "from './filtering.js'" not in scoring:
        errors.append('scoring module must import filtering helpers')
    if 'export function camelMatch' not in scoring:
        errors.append('scoring module must keep camelMatch compatibility export')

if ALLOWLIST.exists() and 'src/completion/filtering.js' in ALLOWLIST.read_text(encoding='utf-8', errors='replace'):
    errors.append('src/completion/filtering.js must not remain in the unwired-module allowlist')

if DIST.exists():
    dist_text = DIST.read_text(encoding='utf-8', errors='replace')
    if 'camelMatch' not in dist_text or 'normalizeScoringSettings' not in dist_text:
        errors.append('dist must include bundled filtering helper tokens')

if errors:
    print('COMPLETION FILTERING MODULE STATIC TEST FAILED')
    for error in errors:
        print('ERROR:', error)
    raise SystemExit(1)

print('COMPLETION FILTERING MODULE STATIC TEST OK')
