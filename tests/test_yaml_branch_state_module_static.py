#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src' / 'yaml' / 'yamlBranchState.js'
CONTEXT = ROOT / 'src' / 'yaml' / 'yamlCompletionContext.js'
SCANNER = ROOT / 'src' / 'yaml' / 'yamlScanner.js'
ADAPTER = ROOT / 'src' / 'yaml' / 'runtimeContextAdapter.js'
ALLOWLIST = ROOT / 'docs' / 'contracts' / 'MODULE_WIRING_ALLOWLIST.json'
EXEC_TEST = ROOT / 'tests' / 'context' / 'yaml_branch_state_module.test.mjs'
REPORT = ROOT / 'reports' / 'YAML_BRANCH_STATE_MODULE_STATIC_TEST_REPORT.txt'

errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

module = MODULE.read_text(encoding='utf-8', errors='replace') if MODULE.exists() else ''
context = CONTEXT.read_text(encoding='utf-8', errors='replace') if CONTEXT.exists() else ''
scanner = SCANNER.read_text(encoding='utf-8', errors='replace') if SCANNER.exists() else ''
adapter = ADAPTER.read_text(encoding='utf-8', errors='replace') if ADAPTER.exists() else ''
allow = json.loads(ALLOWLIST.read_text(encoding='utf-8')) if ALLOWLIST.exists() else {}
exec_test = EXEC_TEST.read_text(encoding='utf-8', errors='replace') if EXEC_TEST.exists() else ''

require(MODULE.exists(), 'src/yaml/yamlBranchState.js exists')
require('export function yamlBranchState' in module, 'yamlBranchState module exports yamlBranchState')
require('ACTION_PARENT_KEYS' in module, 'yamlBranchState module owns action parent key set')
require('splitRecentLines' in module and 'recentLinesBeforeCursor' in module, 'yamlBranchState module scans the shared bounded line window')
require('yamlBranchState' in context, 'yamlCompletionContext imports yamlBranchState module')
require(re.search(r'export function yamlBranchState\(sourceText, cursorPosition\) \{\s*return branchState.yamlBranchState\(sourceText, cursorPosition\);\s*\}', context, flags=re.S) is not None, 'yamlCompletionContext preserves wrapper export')
require('src/yaml/yamlBranchState.js' not in (allow.get('allowed_unwired_modules') or {}), 'yamlBranchState removed from unwired allowlist')
require('yamlBranchState as contextYamlBranchState' in scanner, 'yamlScanner keeps compatibility through yamlCompletionContext')
require('yamlBranchState' in adapter, 'runtimeContextAdapter keeps compatibility through yamlCompletionContext')
require('branchState.yamlBranchState' in exec_test and 'describeYamlCompletionContext uses the wired YAML branch-state module' in exec_test, 'executed branch-state wiring test exists')

for forbidden in ['window', 'document', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'fetch(', 'sendBeacon', 'setTimeout', 'eval(', 'new Function']:
    require(forbidden not in module, f'yamlBranchState module avoids {forbidden}')

REPORT.parent.mkdir(exist_ok=True)
REPORT.write_text(
    'YAML branch-state module static test report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('YAML BRANCH-STATE MODULE STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    raise SystemExit(1)

print('YAML BRANCH-STATE MODULE STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
