#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/core/state.js'
APP = ROOT / 'src/app.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/CORE_STATE_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './core/state.js'" in app, 'runtime imports core state module')
require('createRuntimeState({ version: VERSION, settings: loadSettings() })' in app, 'runtime state construction delegates to module factory')
require('const state = {\n    installed: true,' not in app, 'app.js has no inline runtime state object')
require('src/core/state.js' not in allowed, 'core state module is not on the unwired allowlist')

for token in [
    'export function createRuntimeState',
    'runtimeErrors: []',
    'runtimeErrorStats: { total: 0, dropped: 0, byScope: Object.create(null), lastScope: "", lastAt: 0 }',
    'diagnosticsPendingReasons: new Set()',
    'editorSentinelObservers: new Map()',
    'initialSyntaxGateObservedRoots: new WeakSet()',
    'completionCache: new Map()',
    'codeboxStyleCacheInvalidated: true',
    'settings,',
    'startedAt,',
]:
    require(token in module, f'module token present: {token}')

for forbidden in ['document', 'window', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'new MutationObserver', 'fetch(', 'sendBeacon', 'eval(', 'new Function']:
    require(forbidden not in module, f'forbidden runtime/browser token absent: {forbidden}')

for visual_token in ['codeboxFrameEditor', 'sourceClassSmartSyntaxObserver', 'settingsPortalHost']:
    require(visual_token in module, f'visual lifecycle state field present: {visual_token}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Core state module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('CORE STATE MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('CORE STATE MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
