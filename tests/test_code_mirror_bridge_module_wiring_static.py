#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/editor/codeMirrorBridge.js'
APP = ROOT / 'src/app.js'
DISPATCH_RUNTIME = ROOT / 'src/editor/editorDispatchRuntime.js'
BRIDGE = ROOT / 'src/composition/runtimeDelegateBridge.js'
ADAPTERS = ROOT / 'src/composition/appAdapters.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/CODE_MIRROR_BRIDGE_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
dispatch_runtime = DISPATCH_RUNTIME.read_text(encoding='utf-8', errors='replace')
bridge = BRIDGE.read_text(encoding='utf-8', errors='replace')
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

require("from '../editor/codeMirrorBridge.js'" in adapters, 'app adapters import CodeMirror bridge module')
require('codeMirrorBridge.getDocLength(view)' in adapters, 'app adapters delegate helper: codeMirrorBridge.getDocLength(view)')
require('lineInfoFromCodeMirrorBridgeModule(doc, pos)' not in app, 'app.js does not call lineInfo; the runtime context adapter does')

require('src/editor/codeMirrorBridge.js' not in allowed, 'CodeMirror bridge module is not on the unwired allowlist')

for token in [
    'export function getDoc',
    'export function getPos',
    'export function getDocLength',
]:
    require(token in module, f'module export present: {token}')

# The editor dispatch runtime owns the dispatch hook lifecycle.
require("from './editor/editorDispatchRuntime.js'" in app, 'main imports editor dispatch runtime owner')
for token in [
    'export function createEditorDispatchRuntime',
    'function hookDispatch(view)',
    'function unhookDispatch()',
    'updateSnippetSessionAfterDispatch(view, oldDocLength, oldSel);',
    "scheduleCodeboxStyleReapply('editor-dispatch');",
    "scheduleDiagnosticsRefresh('editor-dispatch');",
    'requestLiveUpdate();',
]:
    require(token in dispatch_runtime, f'editor dispatch runtime owns dispatch lifecycle token: {token}')
for token in [
    '"hookDispatch"',
    '"unhookDispatch"',
]:
    require(token in bridge, f'delegate bridge keeps thin dispatch delegate method: {token}')

for forbidden in [
    'showPopover',
    'hidePopover',
    ':popover-open',
    'setAttribute("popover"',
    "setAttribute('popover'",
    'onOverlayPointerCapture',
    'elementFromPoint',
    'fetch(',
    'sendBeacon',
    'eval(',
    'new Function',
]:
    require(forbidden not in module, f'forbidden CodeMirror bridge token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'CodeMirror bridge module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('CODEMIRROR BRIDGE MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('CODEMIRROR BRIDGE MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
