#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/diagnostics/diagnosticsHealth.js'
LEGACY = ROOT / 'src/main.legacy.js'
TELEMETRY_RUNTIME = ROOT / 'src/diagnostics/telemetryRuntime.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/DIAGNOSTICS_HEALTH_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
telemetry_runtime = TELEMETRY_RUNTIME.read_text(encoding='utf-8', errors='replace')
runtime_owner = legacy + '\n' + telemetry_runtime
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './diagnostics/diagnosticsHealth.js'" in legacy, 'runtime imports diagnostics health module')
# The runtime now namespace-imports the module (import * as diagnosticsHealth) and wires its
# health helper into the diagnostics runtime ctx as `health: diagnosticsHealth.health`. Same
# invariant (the module's health helper is the one the runtime uses), current import/wire form.
require('import * as diagnosticsHealth' in legacy and 'health: diagnosticsHealth.health' in legacy, 'runtime wires module health helper')
# runtimeSummary is now brought in via a direct named import from the module (instead of the old
# `as runtimeSummaryFromDiagnosticsHealthModule` alias) and handed to the diagnostics runtime ctx.
require("import { runtimeSummary } from './diagnostics/diagnosticsHealth.js'" in legacy, 'runtime imports module runtime summary helper')
require('function runtimeSummary()' not in legacy, 'legacy runtimeSummary wrapper removed after direct-call cleanup')
# The diagnostics runtime calls the module runtimeSummary directly (no local wrapper).
require('runtimeSummary(state)' in runtime_owner, 'runtime summary reads call module directly')
# The health() wrapper delegates to the module helper via the wired ctx (ctx.health is
# diagnosticsHealth.health), preserving the "wrapper delegates to module" invariant.
require('function health()' in runtime_owner and 'ctx.health(state, {' in runtime_owner, 'health wrapper delegates to module')
require('state.lastHealthCheck = result;' in runtime_owner, 'runtime still owns lastHealthCheck mutation')
require('const checks = [];' not in telemetry_runtime[telemetry_runtime.find('function health()'):telemetry_runtime.find('function exportDiagnostics')], 'legacy duplicate health check builder removed')
require('src/diagnostics/diagnosticsHealth.js' not in allowed, 'diagnostics health module removed from unwired allowlist')

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
