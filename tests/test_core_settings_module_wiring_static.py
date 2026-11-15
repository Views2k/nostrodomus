#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/core/settings.js'
APP = ROOT / 'src/app.js'
ADAPTERS = ROOT / 'src/composition/appAdapters.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/CORE_SETTINGS_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
adapters = ADAPTERS.read_text(encoding='utf-8', errors='replace')
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './core/settings.js'" in app, 'runtime imports core settings module')
require('DEFAULT_SETTINGS' in app, 'runtime uses module DEFAULT_SETTINGS')
require("import { DEFAULT_SETTINGS } from './core/settings.js';" in app, 'runtime default settings come from module')
require('settingsRuntime.cloneDefaultSettings()' in adapters and 'coreSettings.cloneDefaultSettings' in app, 'runtime clone path delegates through settings runtime/module helper')
require('settingsRuntime.deepMerge(base, patch)' in adapters and 'coreSettings.deepMerge' in app, 'runtime deepMerge path delegates through settings runtime/module helper')
require('const DEFAULT_SETTINGS = {\n' not in app, 'app.js has no copy of DEFAULT_SETTINGS')
require('structuredClone(DEFAULT_SETTINGS)' not in app, 'app.js clones settings only through the module helper')
require('src/core/settings.js' not in allowed, 'core settings module is not on the unwired allowlist')

for token in [
    'export const DEFAULT_SETTINGS',
    'export function cloneDefaultSettings',
    'export function deepMerge',
    'STATIC_PROVIDER_ID',
    'SNIPPET_PROVIDER_ID',
    'LOVELACE_CONTEXT_PROVIDER_ID',
    'HA_VALUE_PROVIDER_ID',
    'syntaxTintPreset: "vscodeDarkPlus"',
    'codeboxGlowSize: -100',
]:
    require(token in module, f'module token present: {token}')

for forbidden in ['document', 'window', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'MutationObserver', 'fetch(', 'sendBeacon', 'eval(', 'new Function']:
    require(forbidden not in module, f'forbidden runtime/browser token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Core settings module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('CORE SETTINGS MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('CORE SETTINGS MODULE WIRING STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
