#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/core/dom.js'
APP = ROOT / 'src/app.js'
POPUP_RUNTIME = ROOT / 'src/completion/popupRuntime.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/CORE_DOM_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
popup_runtime = POPUP_RUNTIME.read_text(encoding='utf-8', errors='replace')
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from '../core/dom.js'" in popup_runtime, 'popup runtime imports core DOM module')
require('clearElement(box)' in popup_runtime, 'popup runtime uses module clearElement helper')
require('function clearElement(el)' not in app, 'app.js has no clearElement wrapper')
require('while (el.firstChild) el.removeChild(el.firstChild);' not in app, 'app.js has no copy of the clearElement loop')
require('src/core/dom.js' not in allowed, 'core DOM module is not on the unwired allowlist')

for token in [
    'export function createElement',
    'export function setText',
    'export function setAttr',
    'export function setStyle',
    'export function appendChildren',
    'export function clearElement',
    'export function replaceChildrenSafe',
]:
    require(token in module, f'module token present: {token}')

for forbidden in ['.innerHTML', '.outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']:
    require(forbidden not in module, f'forbidden DOM helper token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Core DOM module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('CORE DOM MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('CORE DOM MODULE WIRING STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
