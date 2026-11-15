#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/diagnostics/diagnosticsCore.js'
APP = ROOT / 'src/app.js'
CONTEXT_RUNTIME = ROOT / 'src/diagnostics/contextDiagnosticsRuntime.js'
TELEMETRY_RUNTIME = ROOT / 'src/diagnostics/diagnosticsRuntime.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/DIAGNOSTICS_CORE_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
context_runtime = CONTEXT_RUNTIME.read_text(encoding='utf-8', errors='replace')
telemetry_runtime = TELEMETRY_RUNTIME.read_text(encoding='utf-8', errors='replace')
runtime_owner = app + '\n' + context_runtime + '\n' + telemetry_runtime
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './diagnostics/diagnosticsCore.js'" in app, 'runtime imports diagnostics core module')
for token in [
    'safeContextSummary',
    'diagnosticsReadoutBundle',
]:
    require(token in app, f'runtime uses diagnostics core helper: {token}')

for alias in [
    'diagnosticsReadoutString as diagnosticsReadoutStringFromDiagnosticsCore',
    'diagnosticsReadoutBool as diagnosticsReadoutBoolFromDiagnosticsCore',
    'diagnosticsReadoutSafeWarnings as diagnosticsReadoutSafeWarningsFromDiagnosticsCore',
    'diagnosticsReadoutSummary as diagnosticsReadoutSummaryFromDiagnosticsCore',
]:
    require(alias not in app, f'app.js has no aliased diagnostics core import: {alias}')

require('function safeContextSummary(' not in app, 'app.js has no safeContextSummary wrapper')
require('safeContextSummary(state.context)' in runtime_owner, 'diagnostics readouts call safeContextSummary directly for state context')
require('const summary = safeContextSummary(ctx);' in runtime_owner, 'diagnostics summary helper calls safeContextSummary directly for explicit context')
require('function diagnosticsReadoutBundle(legacyContext)' not in app, 'app.js has no diagnosticsReadoutBundle wrapper')
require('const diagnosticsReadout = diagnosticsReadoutBundle({ api: W.__nostrodomus?.contextDiagnostics, legacyContext: ctx });' in runtime_owner, 'diagnostics markup calls diagnosticsReadoutBundle directly')
for wrapper_body in [
    'return diagnosticsReadoutStringFromDiagnosticsCore(value, limit);',
    'return diagnosticsReadoutBoolFromDiagnosticsCore(value);',
    'return diagnosticsReadoutSafeWarningsFromDiagnosticsCore(warnings);',
    'return diagnosticsReadoutSummaryFromDiagnosticsCore(W.__nostrodomus?.contextDiagnostics);',
]:
    require(wrapper_body not in app, f'app.js has no diagnostics core wrapper body: {wrapper_body}')
require('src/diagnostics/diagnosticsCore.js' not in allowed, 'diagnostics core module is not on the unwired allowlist')

for token in [
    'export const DIAGNOSTICS_READOUT_MAX_TEXT = 240',
    'export const DIAGNOSTICS_READOUT_MAX_WARNINGS = 10',
    'export function safeContextSummary(ctx = null)',
    'export function diagnosticsReadoutString',
    'export function diagnosticsReadoutBool',
    'export function diagnosticsReadoutSafeWarnings',
    'export function diagnosticsReadoutSummary(api = null)',
    'export function diagnosticsReadoutBundle(options = {})',
]:
    require(token in module, f'module token present: {token}')

for forbidden in ['window.', 'document.', 'localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'eval(', 'new Function', 'innerHTML']:
    require(forbidden not in module, f'forbidden runtime/browser token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Diagnostics core module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('DIAGNOSTICS CORE MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('DIAGNOSTICS CORE MODULE WIRING STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
