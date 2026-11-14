#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/core/security.js'
LEGACY = ROOT / 'src/main.legacy.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/CORE_SECURITY_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("import { escapeHtml } from './core/security.js';" in legacy, 'runtime imports core security helper directly')
require('escapeHtml as escapeHtmlFromSecurityModule' not in legacy, 'runtime no longer uses security FromModule alias')
require('function escapeHtml(s)' not in legacy and 'return escapeHtmlFromSecurityModule(s);' not in legacy, 'runtime escapeHtml pass-through wrapper removed')
require('function escapeHtml(s) {\n    return String(s)\n      .replaceAll("&", "&amp;")' not in legacy, 'legacy duplicate escapeHtml body removed')
require('src/core/security.js' not in allowed, 'core security module removed from unwired allowlist')

for token in [
    'export function escapeHtml',
    'String(value)',
    '.replaceAll("&", "&amp;")',
    '.replaceAll("<", "&lt;")',
    '.replaceAll(">", "&gt;")',
    '.replaceAll(\'"\', "&quot;")',
]:
    require(token in module, f'module token present: {token}')

for forbidden in ['window', 'document', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'MutationObserver', 'fetch(', 'sendBeacon', 'eval(', 'new Function']:
    require(forbidden not in module, f'forbidden runtime/browser token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Core security module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('CORE SECURITY MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('CORE SECURITY MODULE WIRING STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
