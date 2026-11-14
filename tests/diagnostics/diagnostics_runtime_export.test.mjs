import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiagnosticsRuntime } from '../../src/diagnostics/telemetryRuntime.js';
import { safeContextSummary, diagnosticsReadoutBundle } from '../../src/diagnostics/diagnosticsCore.js';
import * as diagnosticsHealth from '../../src/diagnostics/diagnosticsHealth.js';
import { activeEditorDiagnosticsReadoutEnvelopePayload } from '../../src/diagnostics/diagnosticsFastLaneHelpers.js';
import { createEmbeddedLanguageDiagnostics } from '../../src/languages/embeddedLanguageDiagnostics.js';
import { createSuggestionQualityRuntime } from '../../src/completion/suggestionQualityRuntime.js';
import { collectContextSnapshotDryRun } from '../../src/context/contextSnapshotRuntimeAdapter.js';
import { activeEditorReadoutLinePosition, activeEditorReadoutRedactSnapshot } from '../../src/editor/activeEditor.js';
import { itemDetail, itemDocumentation, itemSourceLabel, completionVisualKind } from '../../src/ui/suggestionPopup.js';
import { HA_VALUE_PROVIDER_ID } from '../../src/core/runtimeConstants.js';

const SECRET_LINE = '    webhook_id: hunter2-private-token';
const DOC = `type: button\ntap_action:\n${SECRET_LINE}\n`;
const POS = DOC.indexOf('hunter2') + 'hunter2-private-token'.length;

// The readout window.__nostrodomus.contextDiagnostics.readActiveEditor() returns, built with the
// same helpers createActiveEditorContextSnapshotReadout uses.
function activeEditorReadout() {
  const cursor = activeEditorReadoutLinePosition(DOC, POS);
  const snapshot = activeEditorReadoutRedactSnapshot(collectContextSnapshotDryRun({ doc: DOC, pos: POS }), cursor);
  return activeEditorDiagnosticsReadoutEnvelopePayload({
    activeReadout: {
      ok: true,
      redacted: true,
      editorFound: true,
      editor: { docLength: DOC.length, cursorOffset: POS, lineNumber: cursor.lineNumber, column: cursor.column, linePreview: cursor.linePreview },
      snapshot,
    },
  });
}

function createHarness(overrides = {}) {
  const entity = {
    label: 'lock.front_door',
    insert: 'lock.front_door',
    type: 'entity',
    source: HA_VALUE_PROVIDER_ID,
    score: 90,
    meta: { friendly: 'Front Door Deadbolt', domain: 'lock' },
  };
  const state = {
    installed: true,
    enabled: true,
    installedAt: '2026-01-01T00:00:00.000Z',
    view: null,
    items: [entity],
    selected: 0,
    context: { lang: 'yaml', yamlPath: ['tap_action'], yamlRole: 'value', yamlKey: 'entity', prefix: 'lock.fr', line: SECRET_LINE, shouldSuggest: true },
    providers: [],
    providerStats: {},
    settings: { enabledLangs: { yaml: true }, style: {}, providers: {}, maxItems: 12 },
    completionCache: new Map(),
    library: null,
    index: null,
    lastError: null,
    suggestionQuality: null,
    settingsPanel: null,
    contextInspectorTimer: 0,
    diagnosticsHeartbeatMs: 1200,
    diagnosticsStats: { skippedHidden: 0, skippedClean: 0, refreshes: 0, lastSkipReason: '' },
    diagnosticsPendingReasons: new Set(),
    ...overrides.state,
  };
  const calls = [];
  const W = { __nostrodomus: { installed: true, contextDiagnostics: { readActiveEditor: activeEditorReadout } } };
  const quality = createSuggestionQualityRuntime({ state, itemDetail, providerSummary: () => [], contextRouteLabel: () => 'route' });
  const runtime = createDiagnosticsRuntime({
    CHANGELOG_SUMMARY: {},
    DEFAULT_SETTINGS: { style: {} },
    LIVE_COMPANION_EDITOR_VERSION: 'test',
    PRODUCT_NAME: 'Nostrodomus',
    PROJECT_RELEASE_STATE: 'test',
    PROJECT_VERSION: '0.0.0',
    PROVIDER_SETTINGS_META: {},
    SECURITY_LIMITS: { maxCacheEntries: 100 },
    SETTINGS_MIGRATION_LEGACY_KEYS: [],
    SETTINGS_SCHEMA_VERSION: 2,
    SETTINGS_WRITE_KEY: 'nostrodomus.settings',
    VERSION: 'nostrodomus-test',
    W,
    activeCodeboxStyleEditor: () => null,
    activeEditDialog: () => null,
    clientCapabilitySnapshot: () => ({}),
    completionVisualKind,
    composedContains: () => false,
    compute: (triggerKind) => calls.push(['compute', triggerKind]),
    createEmbeddedLanguageDiagnostics,
    debugLoggingEnabled: () => false,
    diagnosticsReadoutBundle,
    diagnosticsReasonIsInteractive: () => false,
    diagnosticsRuntimeErrorFallback: (_scope, err) => ({ ok: false, error: String(err?.message || err) }),
    ensureProviderSettings: () => state.settings.providers,
    getDocLength: () => 0,
    health: diagnosticsHealth.health,
    incrementMapCounter: () => {},
    isOpen: () => false,
    isViewAllowed: () => false,
    itemDetail,
    itemDocumentation,
    itemSourceLabel,
    loadedSettingsStorageKey: 'nostrodomus.settings',
    logInfoOnce: () => {},
    looksLikeView: () => false,
    measurePerformanceEvent: (_name, _detail, fn) => fn(),
    navigator: {},
    observerLifecycleCloseBindingReadiness: () => ({}),
    observerLifecycleCloseDryRunListenerReadout: () => ({}),
    observerLifecycleCloseDryRunReadout: () => ({}),
    observerLifecycleReadout: () => ({}),
    performanceStatsSnapshot: () => ({}),
    performanceTelemetrySnapshot: () => ({}),
    providerEnabled: () => true,
    providerSummary: () => [],
    recordPerformanceEvent: (name, _ms, detail) => calls.push(['perf', name, detail]),
    recordRuntimeError: () => {},
    recordRuntimeErrorOnce: () => {},
    runtimeErrorReadout: () => ({ items: [] }),
    runtimeSummary: diagnosticsHealth.runtimeSummary,
    safeContextSummary,
    state,
    styleCssModuleStatus: () => ({}),
    suggestionQualityPayload: quality.suggestionQualityPayload,
    ...overrides.deps,
  });
  return { state, calls, runtime, W };
}

test('redacted export carries no editor line text, typed prefix, entity id or friendly name', () => {
  const { runtime } = createHarness();
  const json = JSON.stringify(runtime.exportDiagnostics({ redact: true }));

  assert.equal(json.includes('hunter2'), false, 'cursor line text must not be exported');
  assert.equal(json.includes('webhook_id: '), false, 'cursor line text must not be exported');
  assert.equal(json.includes('lock.front_door'), false, 'suggestion label (entity id) must not be exported');
  assert.equal(json.includes('Front Door Deadbolt'), false, 'entity friendly name must not be exported');

  const data = runtime.exportDiagnostics();
  assert.equal(data.redacted, true);
  assert.equal(data.contextDiagnostics.activeEditor.activeEditor.editor.linePreviewLength, SECRET_LINE.length);
  assert.equal(data.suggestionQuality.topSuggestion.labelLength, 'lock.front_door'.length);
  assert.equal(data.suggestionQuality.suggestionCount, 1);
  assert.equal(data.selectedItem.type, 'entity');
});

test('unredacted export still returns the raw context and selected item', () => {
  const { runtime } = createHarness();
  const data = runtime.exportDiagnostics({ redact: false });

  assert.equal(data.redacted, false);
  assert.equal(data.rawContext.line, SECRET_LINE);
  assert.equal(data.selectedRawItem.label, 'lock.front_door');
  assert.equal(data.suggestionQuality.topSuggestion.label, 'lock.front_door');
});

// A failed insert records the suggestion it was inserting: its label, which for an entity
// suggestion is the entity id. The record is in the report twice, in runtimeErrors and lastError.
test('redacted export carries no suggestion label from a recorded runtime error', async () => {
  const { createRuntimeErrorRuntime } = await import('../../src/diagnostics/runtimeErrorRuntime.js');
  const errorState = {};
  const errors = createRuntimeErrorRuntime({ state: errorState });
  errors.recordRuntimeError('completion:insert-dispatch', new Error('dispatch failed'), {
    phase: 'insertItem', label: 'lock.front_door', type: 'entity', source: 'ha-values',
  });
  // No suggestions and no context: the error record is the only place the entity id can come from.
  const { runtime } = createHarness({
    state: { items: [], context: null, lastError: errorState.lastError },
    deps: { runtimeErrorReadout: errors.runtimeErrorReadout },
  });

  const redacted = runtime.exportDiagnostics({ redact: true });
  assert.equal(JSON.stringify(redacted).includes('lock.front_door'), false, 'the entity id must not be exported');
  assert.deepEqual(redacted.runtimeErrors.items[0].detail, { phase: 'insertItem', labelLength: 15, type: 'entity', source: 'ha-values' });
  assert.equal(redacted.runtimeErrors.items[0].scope, 'completion:insert-dispatch');
  assert.equal(redacted.runtimeErrors.items[0].message, 'dispatch failed');
  assert.equal(redacted.runtimeErrors.stats.total, 1);
  assert.deepEqual(redacted.lastError.detail, { phase: 'insertItem', labelLength: 15, type: 'entity', source: 'ha-values' });
  assert.equal(redacted.lastError.message, 'dispatch failed');
  assert.equal(errorState.runtimeErrors[0].detail.label, 'lock.front_door', 'the recorded error itself is not modified');

  const raw = runtime.exportDiagnostics({ redact: false });
  assert.equal(raw.runtimeErrors.items[0].detail.label, 'lock.front_door', 'the unredacted export keeps it');
  assert.equal(raw.lastError.detail.label, 'lock.front_door');
});

test('settings storage source follows the live loaded key after a reset', () => {
  let loadedKey = 'nostrodomus.settings';
  const { runtime } = createHarness({ deps: { loadedSettingsStorageKey: () => loadedKey } });

  assert.equal(runtime.exportDiagnostics().settingsStorage.loadedFrom, 'nostrodomus.settings');
  loadedKey = '';
  assert.equal(runtime.exportDiagnostics().settingsStorage.loadedFrom, 'defaults');
});

function contextPanel() {
  const section = { classList: { contains: (name) => name === 'active' }, querySelector: () => null };
  return { isConnected: true, querySelector: (selector) => (selector === '[data-section="context"]' ? section : null) };
}

test('context tab refresh leaves an open popup list alone', () => {
  let popupOpen = true;
  const { calls, runtime } = createHarness({
    state: { settingsPanel: contextPanel() },
    deps: { isViewAllowed: () => true, isOpen: () => popupOpen },
  });

  runtime.refreshContextInspectorPanel('context-inspector-live');
  runtime.refreshSuggestionQualityPanel('suggestion-quality-live');
  assert.deepEqual(calls.filter((call) => call[0] === 'compute'), [], 'no recompute while the popup is open');

  popupOpen = false;
  runtime.refreshContextInspectorPanel('context-inspector-live');
  assert.deepEqual(calls.filter((call) => call[0] === 'compute'), [['compute', 'context-inspector-live']]);
});

test('context inspector heartbeat stops itself when the panel is detached', () => {
  const panel = contextPanel();
  const { state, runtime } = createHarness({ state: { settingsPanel: panel } });
  const original = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, requestAnimationFrame: globalThis.requestAnimationFrame };
  let tick = null;
  const cleared = [];
  globalThis.setInterval = (fn) => { tick = fn; return 77; };
  globalThis.clearInterval = (id) => cleared.push(id);
  globalThis.requestAnimationFrame = () => 1;
  try {
    assert.equal(runtime.startContextInspectorHeartbeat('settings-open'), true);
    assert.equal(state.contextInspectorTimer, 77);

    tick();
    assert.deepEqual(cleared, [], 'a connected panel keeps the heartbeat');

    panel.isConnected = false; // Home Assistant removed the dialog that hosts the panel
    tick();
    assert.deepEqual(cleared, [77]);
    assert.equal(state.contextInspectorTimer, 0);
  } finally {
    globalThis.setInterval = original.setInterval;
    globalThis.clearInterval = original.clearInterval;
    globalThis.requestAnimationFrame = original.requestAnimationFrame;
  }
});

test('redactDiagnosticsUserText replaces user text with lengths and keeps structure', async () => {
  const diagnosticsCore = await import('../../src/diagnostics/diagnosticsCore.js');
  const input = Object.freeze({
    editor: { lineNumber: 3, linePreview: 'token: abc', column: 4 },
    cursor: { beforeCursorPreview: 'token: a', afterCursorPreview: 'bc' },
    suggestion: { prefix: 'abc', from: 7 },
    items: [{ label: 'light.kitchen', detail: 'Kitchen', documentation: 'Kitchen - light.kitchen', score: 3, type: 'entity' }],
    label: 7,
    nothing: null,
  });
  const out = diagnosticsCore.redactDiagnosticsUserText(input);

  assert.deepEqual(out, {
    editor: { lineNumber: 3, linePreviewLength: 10, column: 4 },
    cursor: { beforeCursorPreviewLength: 8, afterCursorPreviewLength: 2 },
    suggestion: { prefixLength: 3, from: 7 },
    items: [{ labelLength: 13, detailLength: 7, documentationLength: 23, score: 3, type: 'entity' }],
    label: 7,
    nothing: null,
  });
  assert.equal(input.editor.linePreview, 'token: abc', 'the input is not modified');
  assert.equal(diagnosticsCore.redactDiagnosticsUserText(null), null);
  assert.equal(diagnosticsCore.redactDiagnosticsUserText('text'), 'text');
});

test('redactDiagnosticsUserText replaces user text with lengths and keeps structure', async () => {
  const diagnosticsCore = await import('../../src/diagnostics/diagnosticsCore.js');
  const input = Object.freeze({
    editor: { lineNumber: 3, linePreview: 'token: abc', column: 4 },
    cursor: { beforeCursorPreview: 'token: a', afterCursorPreview: 'bc' },
    suggestion: { prefix: 'abc', from: 7 },
    items: [{ label: 'light.kitchen', detail: 'Kitchen', documentation: 'Kitchen - light.kitchen', score: 3, type: 'entity' }],
    label: 7,
    nothing: null,
  });
  const out = diagnosticsCore.redactDiagnosticsUserText(input);

  assert.deepEqual(out, {
    editor: { lineNumber: 3, linePreviewLength: 10, column: 4 },
    cursor: { beforeCursorPreviewLength: 8, afterCursorPreviewLength: 2 },
    suggestion: { prefixLength: 3, from: 7 },
    items: [{ labelLength: 13, detailLength: 7, documentationLength: 23, score: 3, type: 'entity' }],
    label: 7,
    nothing: null,
  });
  assert.equal(input.editor.linePreview, 'token: abc', 'the input is not modified');
  assert.equal(diagnosticsCore.redactDiagnosticsUserText(null), null);
  assert.equal(diagnosticsCore.redactDiagnosticsUserText('text'), 'text');
});
