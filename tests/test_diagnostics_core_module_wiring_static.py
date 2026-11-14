#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/diagnostics/diagnosticsCore.js'
LEGACY = ROOT / 'src/main.legacy.js'
CONTEXT_RUNTIME = ROOT / 'src/diagnostics/contextDiagnosticsRuntime.js'
TELEMETRY_RUNTIME = ROOT / 'src/diagnostics/telemetryRuntime.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/DIAGNOSTICS_CORE_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
context_runtime = CONTEXT_RUNTIME.read_text(encoding='utf-8', errors='replace')
telemetry_runtime = TELEMETRY_RUNTIME.read_text(encoding='utf-8', errors='replace')
runtime_owner = legacy + '\n' + context_runtime + '\n' + telemetry_runtime
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './diagnostics/diagnosticsCore.js'" in legacy, 'runtime imports diagnostics core module')
for token in [
    'safeContextSummary',
    'diagnosticsReadoutBundle',
]:
    require(token in legacy, f'runtime aliases active diagnostics core helper: {token}')

for removed in [
    'diagnosticsReadoutString as diagnosticsReadoutStringFromDiagnosticsCore',
    'diagnosticsReadoutBool as diagnosticsReadoutBoolFromDiagnosticsCore',
    'diagnosticsReadoutSafeWarnings as diagnosticsReadoutSafeWarningsFromDiagnosticsCore',
    'diagnosticsReadoutSummary as diagnosticsReadoutSummaryFromDiagnosticsCore',
]:
    require(removed not in legacy, f'dead diagnostics core runtime alias removed: {removed}')

require('function safeContextSummary(' not in legacy, 'safeContextSummary pass-through wrapper removed from active runtime')
require('safeContextSummary(state.context)' in runtime_owner, 'diagnostics readouts call safeContextSummary module alias directly for state context')
require('const summary = safeContextSummary(ctx);' in runtime_owner, 'diagnostics summary helper calls safeContextSummary module alias directly for explicit context')
require('function diagnosticsReadoutBundle(legacyContext)' not in legacy, 'diagnosticsReadoutBundle pass-through wrapper removed from active runtime')
require('const diagnosticsReadout = diagnosticsReadoutBundle({ api: W.__nostrodomus?.contextDiagnostics, legacyContext: ctx });' in runtime_owner, 'diagnostics markup calls diagnostics core readout bundle alias directly')
for removed in [
]:
    require(removed not in legacy, f'dead diagnostics core legacy alias pruned from active runtime: {removed}')
for removed in [
    'return diagnosticsReadoutStringFromDiagnosticsCore(value, limit);',
    'return diagnosticsReadoutBoolFromDiagnosticsCore(value);',
    'return diagnosticsReadoutSafeWarningsFromDiagnosticsCore(warnings);',
    'return diagnosticsReadoutSummaryFromDiagnosticsCore(W.__nostrodomus?.contextDiagnostics);',
]:
    require(removed not in legacy, f'dead diagnostics core delegate body removed: {removed}')
require('src/diagnostics/diagnosticsCore.js' not in allowed, 'diagnostics core module removed from unwired allowlist')

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
