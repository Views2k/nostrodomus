#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/completion/insertion.js'
APP = ROOT / 'src/app.js'
FACTORY = ROOT / 'src/composition/appCompletionRuntimeFactory.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/COMPLETION_INSERTION_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
factory = FACTORY.read_text(encoding='utf-8', errors='replace')
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

required_module_tokens = [
    'snippets.parseSnippetTemplate',
    'snippets.hasSnippetPlaceholders',
    'export function parseSnippetTemplate',
    'export function hasSnippetPlaceholders',
    'export const YAML_ACTION_BRANCHES',
    'export function leadingWhitespace',
    'export function indentLinesAfterFirst',
    'export function itemKeyName',
    'export function isActionParentContext',
    'export function itemNeedsYamlValue',
    'export function itemOpensYamlBlock',
    'export function branchableValueAccepted',
    'export function continuationForAcceptedItem',
    'export function prepareInsertText',
    'export function startSnippetSession',
    'export function moveSnippetPlaceholder',
    'export function updateSnippetSessionAfterDispatch',
]
for token in required_module_tokens:
    if token not in module:
        errors.append(f'missing module token: {token}')
    else:
        notes.append(f'PASS module token: {token}')

for forbidden in [
    'window', 'document', 'localStorage', 'sessionStorage', 'fetch(', 'sendBeacon',
    'eval(', 'new Function', 'querySelector', 'MutationObserver', 'requestAnimationFrame',
    'state.', 'W.', 'ensureOverlay', 'placeAtCursor', 'render()', 'open(true)', 'close()',
]:
    if forbidden in module:
        errors.append(f'forbidden runtime/DOM token in insertion module: {forbidden}')
    else:
        notes.append(f'PASS forbidden absent: {forbidden}')

if "from '../completion/insertionRuntime.js'" not in factory:
    errors.append('completion factory must import completion insertion runtime owner')
else:
    notes.append('PASS completion factory imports completion insertion runtime owner')

if 'createAppCompletionRuntimeGroup' not in app:
    errors.append('main runtime must wire completion runtime group factory')
else:
    notes.append('PASS main runtime wires completion runtime group factory')

runtime_owner = (ROOT / 'src/completion/insertionRuntime.js').read_text(encoding='utf-8', errors='replace')
if 'insertItem(state, item' not in runtime_owner:
    errors.append('completion insertion runtime must delegate accepted rows to insertion module owner')
else:
    notes.append('PASS insertion runtime delegates accepted rows to insertion module owner')

for local_copy in [
    'function prepareInsertText(rawInsert, ctx, item)',
    'function continuationForAcceptedItem(ctx, item)',
    'const ACTION_BRANCHES = Object.freeze',
]:
    if local_copy in app:
        errors.append(f'app.js has its own copy of an insertion helper: {local_copy}')
    else:
        notes.append(f'PASS app.js has no copy of: {local_copy}')

for token in [
    'clearSnippetSession(state)',
    'moveSnippetPlaceholder(state, direction',
    'updateSnippetSessionAfterDispatch(state, view, oldDocLength, oldSel',
]:
    if token not in runtime_owner:
        errors.append(f'insertion runtime missing module snippet-session delegate: {token}')
    else:
        notes.append(f'PASS snippet-session delegate wired: {token}')

if 'src/completion/insertion.js' in allowed:
    errors.append('src/completion/insertion.js must not be in MODULE_WIRING_ALLOWLIST.json')
else:
    notes.append('PASS insertion module is not on the allowlist')

REPORT.write_text(
    'Completion insertion module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('COMPLETION INSERTION MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('COMPLETION INSERTION MODULE WIRING STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
