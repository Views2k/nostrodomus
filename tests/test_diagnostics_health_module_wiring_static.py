#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/diagnostics/diagnosticsHealth.js'
APP = ROOT / 'src/app.js'
TELEMETRY_RUNTIME = ROOT / 'src/diagnostics/diagnosticsRuntime.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/DIAGNOSTICS_HEALTH_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
telemetry_runtime = TELEMETRY_RUNTIME.read_text(encoding='utf-8', errors='replace')
runtime_owner = app + '\n' + telemetry_runtime
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './diagnostics/diagnosticsHealth.js'" in app, 'runtime imports diagnostics health module')
# The diagnostics runtime gets the module's health helper as `health: diagnosticsHealth.health`.
require('import * as diagnosticsHealth' in app and 'health: diagnosticsHealth.health' in app, 'runtime wires module health helper')
require("import { runtimeSummary } from './diagnostics/diagnosticsHealth.js'" in app, 'runtime imports module runtime summary helper')
require('function runtimeSummary()' not in app, 'app.js has no runtimeSummary wrapper')
require('runtimeSummary(state)' in runtime_owner, 'runtime summary reads call module directly')
# health() in the diagnostics runtime calls ctx.health, which is diagnosticsHealth.health.
require('function health()' in runtime_owner and 'ctx.health(state, {' in runtime_owner, 'health wrapper delegates to module')
require('state.lastHealthCheck = result;' in runtime_owner, 'runtime owns lastHealthCheck mutation')
require('const checks = [];' not in telemetry_runtime[telemetry_runtime.find('function health()'):telemetry_runtime.find('function exportDiagnostics')], 'diagnostics runtime health() does not build its own check list')
require('src/diagnostics/diagnosticsHealth.js' not in allowed, 'diagnostics health module is not on the unwired allowlist')

for token in [
    'export function runtimeSummary',
    'export function providerSummary',
    'export function health',
    'const contextualChecks = new Set',
    'addContextual("runtime-hass"',
    'performanceTelemetry',
    'performanceStats',
    'warningCount',
]:
    require(token in module, f'module token present: {token}')

for forbidden in ['window', 'document', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'MutationObserver', 'fetch(', 'sendBeacon', 'eval(', 'new Function', 'state.lastHealthCheck']:
    require(forbidden not in module, f'forbidden runtime/browser token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Diagnostics health module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('DIAGNOSTICS HEALTH MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('DIAGNOSTICS HEALTH MODULE WIRING STATIC TEST OK')
for note in notes:
    print(note)
print('Report:', REPORT)
