import assert from 'node:assert/strict';
import {
  activeEditorDiagnosticsReadoutEnvelopePayload,
  diagnosticsReasonIsInteractive,
  diagnosticsRuntimeErrorFallbackPayload,
  formatPerformanceEventMetric,
  measurePerformanceEventWithCallbacks,
  missingActiveEditorReadoutPayload,
  runActiveEditorDiagnosticsReadoutWithCallbacks,
  shouldRecordPerformanceTelemetryDecision,
  startupBadgeStatusFromHealth,
} from '../../src/diagnostics/diagnosticsFastLaneHelpers.js';

assert.equal(startupBadgeStatusFromHealth(() => ({ ok: true, requiredOk: true })), 'ready');
assert.equal(startupBadgeStatusFromHealth(() => ({ ok: false, requiredOk: true })), 'degraded');
assert.equal(startupBadgeStatusFromHealth(() => { throw new Error('boom'); }), 'degraded');

assert.equal(shouldRecordPerformanceTelemetryDecision({ name: '' }), false);
assert.equal(shouldRecordPerformanceTelemetryDecision({ name: 'x', perfMode: 'legacy' }), true);
assert.equal(shouldRecordPerformanceTelemetryDecision({ name: 'x', debugLoggingEnabled: true }), true);
assert.equal(shouldRecordPerformanceTelemetryDecision({ name: 'x', diagnosticsActive: true }), true);
assert.equal(shouldRecordPerformanceTelemetryDecision({ name: 'x' }), false);

assert.equal(formatPerformanceEventMetric(null), 'none');
assert.equal(formatPerformanceEventMetric({ perMinute: 2, avgMs: 3.4, maxMs: 8.9 }), '2/min avg 3.4ms max 8.9ms');
assert.equal(formatPerformanceEventMetric({}), '0/min avg 0ms max 0ms');

let suppressedName = null;
const suppressedResult = measurePerformanceEventWithCallbacks({
  name: 'suppressed-event',
  shouldRecord: false,
  run: () => 'suppressed-ok',
  onSuppressed: (name) => { suppressedName = name; },
});
assert.equal(suppressedResult, 'suppressed-ok');
assert.equal(suppressedName, 'suppressed-event');

let recorded = null;
let tick = 10;
const measuredResult = measurePerformanceEventWithCallbacks({
  name: 'measured-event',
  detail: 'detail-a',
  shouldRecord: true,
  run: () => 'measured-ok',
  now: () => { tick += 5; return tick; },
  record: (name, durationMs, detail) => { recorded = { name, durationMs, detail }; },
});
assert.equal(measuredResult, 'measured-ok');
assert.deepEqual(recorded, { name: 'measured-event', durationMs: 5, detail: 'detail-a' });

assert.equal(diagnosticsReasonIsInteractive('editor-dispatch'), true);
assert.equal(diagnosticsReasonIsInteractive('settings-open'), true);
assert.equal(diagnosticsReasonIsInteractive('background-refresh'), false);

const payload = diagnosticsRuntimeErrorFallbackPayload(new Error('example failure'), { phase: 'test' }, (value, limit) => String(value).slice(0, limit));
assert.deepEqual(payload, { ok: false, error: 'example failure', phase: 'test' });

assert.deepEqual(
  activeEditorDiagnosticsReadoutEnvelopePayload({ activeReadout: { ok: false, warning: 'missing' }, enabled: false, defaultEnabled: false }),
  {
    ok: false,
    stage: '2C-active-editor-snapshot-readout',
    enabled: false,
    defaultEnabled: false,
    consoleOnly: true,
    localOnly: true,
    redacted: true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    writesDom: false,
    networkAccess: false,
    activeEditor: { ok: false, warning: 'missing' },
  }
);

assert.deepEqual(
  runActiveEditorDiagnosticsReadoutWithCallbacks({
    enabled: true,
    defaultEnabled: false,
    createReadout: () => ({ ok: true, editorFound: true }),
  }),
  {
    ok: true,
    stage: '2C-active-editor-snapshot-readout',
    enabled: true,
    defaultEnabled: false,
    consoleOnly: true,
    localOnly: true,
    redacted: true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    writesDom: false,
    networkAccess: false,
    activeEditor: { ok: true, editorFound: true },
  }
);

assert.deepEqual(
  runActiveEditorDiagnosticsReadoutWithCallbacks({ missingReadout: missingActiveEditorReadoutPayload }).activeEditor,
  {
    ok: false,
    stage: '2C-active-editor-snapshot-readout',
    localOnly: true,
    redacted: true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    consoleOnly: true,
    writesDom: false,
    networkAccess: false,
    editorFound: false,
    warning: 'missing-active-editor-readout-module',
  }
);

console.log('diagnostics fast-lane helpers tests passed');
