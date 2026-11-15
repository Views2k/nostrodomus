#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/app.js'
FACTORY = ROOT / 'src/composition/appCompletionRuntimeFactory.js'
MODULE = ROOT / 'src/completion/completionRuntime.js'
REPORT = ROOT / 'reports/COMPLETION_SESSION_RUNTIME_OWNER_STATIC_REPORT.txt'

app = APP.read_text(encoding='utf-8', errors='replace')
factory = FACTORY.read_text(encoding='utf-8', errors='replace')
module = MODULE.read_text(encoding='utf-8', errors='replace')
errors = []
notes = []

required_module_tokens = [
    'export function createCompletionRuntime',
    'export function completionLiveUpdateTriggerIsTyping',
    "function compute(triggerKind = 'typing')",
    "function refresh(triggerKind = 'typing')",
    'function requestLiveUpdate(triggerKind = \'typing\')',
    'async function open(explicit = true)',
    'function toggle()',
    'function onKeydown(ev)',
    'function onPointer(ev)',
    'function onFocusIn(ev)',
    'function onFocusOut(ev)',
    "recordRuntimeError('completion:compute'",
    "recordPerformanceEvent('completion-live-update-repeat-pressure-quieted'",
    "open(false)",
    "const selectedItem = state.items[state.selected];",
    "insertItem(selectedItem)",
    "acceptSnippetChoice(selectedItem)",
]

for token in required_module_tokens:
    if token not in module:
        errors.append(f'missing module owner token: {token}')
    else:
        notes.append(f'PASS module token: {token}')

required_legacy_tokens = [
    "import { createAppCompletionRuntimeGroup } from './composition/appCompletionRuntimeFactory.js';",
    '} = createAppCompletionRuntimeGroup({',
    'scoreItems,',
    'insertItem,',
]

for token in required_legacy_tokens:
    if token not in app:
        errors.append(f'missing legacy completion factory token: {token}')
    else:
        notes.append(f'PASS legacy completion factory: {token.splitlines()[0]}')

required_factory_tokens = [
    "import { createCompletionRuntime } from '../completion/completionRuntime.js';",
    'completionRuntime = createCompletionRuntime({',
    'createCompletionRuntimeDelegates(() => completionRuntime)',
    'const { render, compute, refresh, requestLiveUpdate, open, toggle, onKeydown, onPointer, onFocusIn, onFocusOut } = completionRuntimeDelegates;',
    'renderCompletionPopup,',
    'insertItem,',
]

for token in required_factory_tokens:
    if token not in factory:
        errors.append(f'missing completion factory owner token: {token}')
    else:
        notes.append(f'PASS completion factory owner: {token.splitlines()[0]}')

for local_copy in [
    'state.completionRepeatPressureLiveUpdateQuieted = (state.completionRepeatPressureLiveUpdateQuieted || 0) + 1;',
    'recordRuntimeError("completion:compute", err',
    'if (ev.ctrlKey && ev.code === "Space")',
    'insertItem(state.items[state.selected]);',
    'requestAnimationFrame(() => open(false));',
]:
    if local_copy in app:
        errors.append(f'app.js has its own completion session code: {local_copy}')
    else:
        notes.append(f'PASS app.js has no copy of: {local_copy}')

for forbidden in [
    'querySelectorAll("*")',
    "querySelectorAll('*')",
    'fetch(',
    'sendBeacon',
    'eval(',
    'new Function',
    'innerHTML',
    'outerHTML',
]:
    if forbidden in module:
        errors.append(f'forbidden token in completion session runtime: {forbidden}')
    else:
        notes.append(f'PASS forbidden absent: {forbidden}')

REPORT.write_text(
    'Completion session runtime owner static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('COMPLETION SESSION RUNTIME OWNER STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('COMPLETION SESSION RUNTIME OWNER STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
