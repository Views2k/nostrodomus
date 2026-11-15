#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/core/diagnostics.js'
APP = ROOT / 'src/app.js'
RUNTIME_ERROR_RUNTIME = ROOT / 'src/diagnostics/runtimeErrorRuntime.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/CORE_DIAGNOSTICS_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
runtime_error_runtime = RUNTIME_ERROR_RUNTIME.read_text(encoding='utf-8', errors='replace') if RUNTIME_ERROR_RUNTIME.exists() else ''
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("import { boundedRuntimeErrorString, safeRuntimeErrorDetail } from '../core/diagnostics.js';" in runtime_error_runtime, 'runtime error owner imports core diagnostics helpers directly')
require("from './core/diagnostics.js'" not in app, 'app.js does not import core diagnostics helpers itself')
require('boundedRuntimeErrorStringFromDiagnosticsModule' not in app, 'app.js has no aliased diagnostics import')
require('safeRuntimeErrorDetailFromDiagnosticsModule' not in app, 'app.js has no aliased diagnostics import')
require('function boundedRuntimeErrorString(value, max = 260)' not in app, 'app.js has no bounded formatter wrapper')
require('function safeRuntimeErrorDetail(detail)' not in app, 'app.js has no safe detail wrapper')
require('const text = String(value ?? "");\n    return text.length > max ? `${text.slice(0, max - 1)}…` : text;' not in app, 'app.js has no copy of the bounded formatter')
require('for (const [key, value] of Object.entries(detail).slice(0, 16))' not in app, 'app.js has no copy of the safe detail loop')
require('src/core/diagnostics.js' not in allowed, 'core diagnostics module is not on the unwired allowlist')

for token in [
    'export function boundedRuntimeErrorString',
    'export function safeRuntimeErrorDetail',
    'String(value ?? "")',
    'text.slice(0, max - 1)',
    'Object.entries(detail).slice(0, 16)',
    'value.slice(0, 8).map',
]:
    require(token in module, f'module token present: {token}')

for forbidden in ['window', 'document', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'MutationObserver', 'fetch(', 'sendBeacon', 'eval(', 'new Function']:
    require(forbidden not in module, f'forbidden runtime/browser token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Core diagnostics module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('CORE DIAGNOSTICS MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('CORE DIAGNOSTICS MODULE WIRING STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
