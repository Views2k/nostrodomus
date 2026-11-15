#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'src' / 'app.js').read_text(encoding='utf-8', errors='replace')
MODULE_PATH = ROOT / 'src' / 'diagnostics' / 'diagnosticsRuntime.js'
MODULE = MODULE_PATH.read_text(encoding='utf-8', errors='replace') if MODULE_PATH.exists() else ''
RUNTIME_OWNER = APP + '\n' + MODULE
REPORT = ROOT / 'reports' / 'DIAGNOSTICS_TELEMETRY_RUNTIME_OWNER_STATIC_REPORT.txt'

errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require(MODULE_PATH.exists(), 'diagnostics telemetry runtime owner module exists')
require('export function createDiagnosticsRuntime(ctx = {})' in MODULE, 'diagnostics runtime exports factory')
require("import { createDiagnosticsRuntime } from './diagnostics/diagnosticsRuntime.js';" in APP, 'legacy imports diagnostics runtime owner')
require('diagnosticsRuntime = createDiagnosticsRuntime({' in APP, 'legacy creates injected diagnostics runtime')

for token in [
    'function providerSummary() {',
    'function exportDiagnostics(options = {}) {',
    'function copyDiagnosticsToClipboard() {',
    'function performanceDiagnosticsCard() {',
    'function stopContextInspectorHeartbeat(reason = \"context-inspector-hidden\") {',
    'function diagnosticsMarkup() {',
    'function debug() {',
]:
    require(token in MODULE, f'diagnostics runtime owns body: {token}')

for token in [
    'createDiagnosticsRuntimeDelegates(() => diagnosticsRuntime)',
    'const { providerSummaryLegacy, providerSummary, itemSummary, debugSnapshot, health, embeddedLanguageDiagnostics',
    'exportDiagnostics, copyDiagnosticsToClipboard',
    'stopContextInspectorHeartbeat, startContextInspectorHeartbeat',
    'providerControlsMarkup, contextInspectorMarkup, changelogSummaryText, diagnosticsMarkup',
    'function debug() {',
    'return diagnosticsRuntime.debug();',
]:
    require(token in APP, f'legacy keeps diagnostics delegate bridge/wrapper: {token}')

for token in [
    'runtimeErrors: runtimeErrorReadout()',
    'diagnostics:export-active-editor',
    'diagnostics:clipboard-write',
    'ctx.providerSummary(state, {',
    'return providerSummaryLegacy();',
]:
    require(token in RUNTIME_OWNER, f'diagnostics runtime owner has contract token: {token}')

for forbidden in [
    'function exportDiagnostics(options = {}) {\n    const redact = options?.redact !== false;',
    'function performanceDiagnosticsCard() {\n    const stats = performanceStatsSnapshot();',
    'function diagnosticsMarkup() {\n    const ctx = safeContextSummary(state.context);',
    'function debug() {\n    return {\n      productName: PRODUCT_NAME,',
]:
    require(forbidden not in APP, f'app.js does not own diagnostics body: {forbidden[:72]}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Diagnostics telemetry runtime owner static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('DIAGNOSTICS TELEMETRY RUNTIME OWNER STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('DIAGNOSTICS TELEMETRY RUNTIME OWNER STATIC TEST OK')
print('Report:', REPORT)
