#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
LEGACY = (ROOT / 'src/main.legacy.js').read_text(encoding='utf-8', errors='replace')
CONTEXT_RUNTIME = (ROOT / 'src/diagnostics/contextDiagnosticsRuntime.js').read_text(encoding='utf-8', errors='replace')
PERF_RUNTIME = (ROOT / 'src/diagnostics/performanceTelemetryRuntime.js').read_text(encoding='utf-8', errors='replace')
TELEMETRY_RUNTIME = (ROOT / 'src/diagnostics/telemetryRuntime.js').read_text(encoding='utf-8', errors='replace')
LOGGING_RUNTIME = (ROOT / 'src/core/loggingRuntime.js').read_text(encoding='utf-8', errors='replace')
RUNTIME_ERROR_RUNTIME = (ROOT / 'src/diagnostics/runtimeErrorRuntime.js').read_text(encoding='utf-8', errors='replace')
RUNTIME_OWNER = LEGACY + '\n' + CONTEXT_RUNTIME + '\n' + PERF_RUNTIME + '\n' + TELEMETRY_RUNTIME + '\n' + LOGGING_RUNTIME + '\n' + RUNTIME_ERROR_RUNTIME
MODULE = (ROOT / 'src/diagnostics/diagnosticsFastLaneHelpers.js').read_text(encoding='utf-8', errors='replace')
REPORT = ROOT / 'reports/DIAGNOSTICS_FAST_LANE_HELPER_EXTRACTION_STATIC_REPORT.txt'

errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

for token in [
    'shouldRecordPerformanceTelemetryDecision',
    'formatPerformanceEventMetric',
    'measurePerformanceEventWithCallbacks',
    'runActiveEditorDiagnosticsReadoutWithCallbacks',
    'diagnosticsReasonIsInteractive',
    'missingActiveEditorReadoutPayload',
]:
    require(token in RUNTIME_OWNER, f'runtime owner imports fast-lane diagnostics helper: {token}')

# Phase 2: loggingRuntime no longer imports diagnostics; the startup-badge helper is
# injected into its factory from the composition root (main.legacy.js), keeping core/ pure.
require("import { startupBadgeStatusFromHealth }" not in LOGGING_RUNTIME, 'logging owner no longer imports the startup badge helper (injected instead)')
require("createLoggingRuntime({ W, health, startupBadgeStatusFromHealth, debugModeEnabled }" in LOGGING_RUNTIME, 'logging owner accepts startupBadgeStatusFromHealth as an injected factory param')
require("startupBadgeStatusFromHealth: fastLaneHelpers.startupBadgeStatusFromHealth" in LEGACY, 'composition root injects the startup badge helper into the logging runtime')
require("import { diagnosticsRuntimeErrorFallbackPayload } from './diagnosticsFastLaneHelpers.js';" in RUNTIME_ERROR_RUNTIME, 'runtime error owner imports diagnostics fallback payload helper')

for token in [
    'export function startupBadgeStatusFromHealth',
    'export function diagnosticsRuntimeErrorFallbackPayload',
    'export function shouldRecordPerformanceTelemetryDecision',
    'export function formatPerformanceEventMetric',
    'export function measurePerformanceEventWithCallbacks',
    'export function runActiveEditorDiagnosticsReadoutWithCallbacks',
    'export function diagnosticsReasonIsInteractive',
    'export function missingActiveEditorReadoutPayload',
    'export function activeEditorDiagnosticsReadoutEnvelopePayload',
]:
    require(token in MODULE, f'module exports helper: {token}')

for removed in [
    'function startupBadgeStatus() {',
    'const report = health?.();',
    'return `${event.perMinute || 0}/min avg ${event.avgMs || 0}ms max ${event.maxMs || 0}ms`;',
    'const start = performance?.now?.() || Date.now();',
    ': { ok: false, dryRunOnly: true, snapshot: null, warnings: ["missing-adapter"] };',
    'return /editor-dispatch|typing|explicit|keepopen|settings-open|tab-switch|diagnostics-refresh|copy|reset/.test(String(reason || ""));',
    'warnings: ["missing-readout-module"]',
    'warning: "missing-active-editor-readout-module"',
    'activeEditor: activeReadout,',
    'const activeEditorReadout = payload.activeEditorReadout || diagnosticsReadoutReadActiveEditor();',
]:
    require(removed not in LEGACY, f'legacy no longer owns helper body: {removed}')

for kept in [
    "const status = startupBadgeStatusFromHealth?.(health) || 'ready';",
    'return diagnosticsRuntimeErrorFallbackPayload(err, extra, boundedRuntimeErrorString);',
    'return shouldRecordPerformanceTelemetryDecision({',
    'return ctx.formatPerformanceEventMetric(event);',
    'return measurePerformanceEventWithCallbacks({',
    'return ctx.diagnosticsReasonIsInteractive(reason);',
    'missingActiveEditorReadoutPayload()',
    'readActiveEditor: () => runActiveEditorDiagnosticsReadoutWithCallbacks({',
]:
    require(kept in RUNTIME_OWNER, f'runtime owner delegates active behavior: {kept}')


for preserved in [
    'const runtimeReader = W.__nostrodomus?.embeddedLanguageDiagnostics;',
    'if (typeof runtimeReader === "function")',
    'return runtimeReader({ ...payload });',
    'const reader = W.__nostrodomus?.embeddedLanguageDetector?.read || W.__nostrodomus?.embeddedLanguageDiagnostics;',
]:
    require(preserved in RUNTIME_OWNER, f'embedded-language Stage C4 runtime token preserved in runtime owner: {preserved}')

for forbidden in ['window.', 'document.', 'localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'eval(', 'new Function', 'innerHTML']:
    require(forbidden not in MODULE, f'fast-lane helper avoids browser/runtime token: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Diagnostics fast-lane helper extraction static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('DIAGNOSTICS FAST-LANE HELPER EXTRACTION STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('DIAGNOSTICS FAST-LANE HELPER EXTRACTION STATIC TEST OK')
print('Report:', REPORT)
