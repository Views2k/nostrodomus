import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const runtime = readFileSync(join(root, 'src/main.legacy.js'), 'utf8');
const dist = readFileSync(join(root, 'dist/nostrodomus.js'), 'utf8');
const providerRegistry = readFileSync(join(root, 'src/providers/providerRegistry.js'), 'utf8');
const providerRuntime = readFileSync(join(root, 'src/providers/providerRuntime.js'), 'utf8');
const telemetryRuntime = readFileSync(join(root, 'src/diagnostics/telemetryRuntime.js'), 'utf8');
const runtimeErrorRuntime = readFileSync(join(root, 'src/diagnostics/runtimeErrorRuntime.js'), 'utf8');
const publicApiRuntime = readFileSync(join(root, 'src/core/publicApiRuntime.js'), 'utf8');
// The settings panel runtime is a composer over src/ui/settings/ modules
// (UI_DECOMP P1); the settings-owned error-routing surface spans both.
const settingsPanelRuntime = [
  'src/ui/settingsPanelRuntime.js',
  'src/ui/settings/settingsGeometry.js',
  'src/ui/settings/settingsControls.js',
  'src/ui/settings/settingsStylesheet.js',
  'src/ui/settings/settingsSections.js',
  'src/ui/settings/settingsPanelShell.js',
].map((path) => readFileSync(join(root, path), 'utf8')).join('\n');
const settingsPortalRuntime = readFileSync(join(root, 'src/ui/settingsPortalRuntime.js'), 'utf8');
const settingsInteractionRuntime = readFileSync(join(root, 'src/ui/settingsInteractionRuntime.js'), 'utf8');
const activeEditor = readFileSync(join(root, 'src/editor/activeEditor.js'), 'utf8');
const contextDiagnosticsRuntime = readFileSync(join(root, 'src/diagnostics/contextDiagnosticsRuntime.js'), 'utf8');
const completionInsertion = readFileSync(join(root, 'src/completion/insertion.js'), 'utf8');
const completionInsertionRuntime = readFileSync(join(root, 'src/completion/insertionRuntime.js'), 'utf8');
const completionRuntime = readFileSync(join(root, 'src/completion/completionRuntime.js'), 'utf8');
const editorLifecycleSentinel = readFileSync(join(root, 'src/editor/editorLifecycleSentinel.js'), 'utf8');
const editorDispatchRuntime = readFileSync(join(root, 'src/editor/editorDispatchRuntime.js'), 'utf8');
const mainLegacyAdapters = readFileSync(join(root, 'src/composition/mainLegacyAdapters.js'), 'utf8');
const diagnosticsOwner = `${runtime}\n${runtimeErrorRuntime}\n${publicApiRuntime}\n${providerRuntime}\n${telemetryRuntime}\n${settingsPanelRuntime}\n${settingsPortalRuntime}\n${settingsInteractionRuntime}\n${activeEditor}\n${contextDiagnosticsRuntime}\n${completionInsertion}\n${completionInsertionRuntime}\n${completionRuntime}\n${editorLifecycleSentinel}\n${editorDispatchRuntime}\n${mainLegacyAdapters}`;

test('runtime error recorder is present in owner module and dist', () => {
  for (const text of [runtimeErrorRuntime, dist]) {
    assert.match(text, /function recordRuntimeError\(scope,\s*err,\s*detail\s*=\s*null\)/);
    assert.match(text, /function recordRuntimeErrorOnce\(scope,\s*err,\s*detail\s*=\s*null\)/);
    assert.match(text, /function runtimeErrorReadout\(/);
    assert.match(text, /function clearRuntimeErrors\(\)/);
    assert.match(text, /diagnosticsRuntimeErrorFallback/);
  }
  assert.match(runtime, /runtimeErrorRuntime = createRuntimeErrorRuntime/);
  assert.match(publicApiRuntime, /runtimeErrors: apiMethods\.runtimeErrorReadout/);
  assert.match(dist, /runtimeErrors:\s*(apiMethods\.)?runtimeErrorReadout/);
});

test('provider boundary records consequential provider failures', () => {
  for (const text of [providerRegistry, dist]) {
    assert.match(text, /provider:\$\{providerId\}:canHandle/);
    assert.match(text, /provider:\$\{providerId\}:provide/);
    assert.match(text, /provider:\$\{providerId\}:timeout/);
  }
  assert.match(providerRuntime, /registry\.providerCandidatesLegacy\(ctx, state, runtimeProviderRegistryDeps\(\)\)/);
  assert.match(runtime, /createMainLegacyProviderAdapters\(\{/);
  assert.match(mainLegacyAdapters, /return providerRuntime\.providerCandidatesLegacy\(ctx\);/);
});

test('diagnostics export and debug snapshot include runtime error readout', () => {
  const occurrences = (diagnosticsOwner.match(/runtimeErrors: runtimeErrorReadout\(\)|runtimeErrors: apiMethods\.runtimeErrorReadout/g) || []).length;
  assert.ok(occurrences >= 2, `expected runtimeErrors readout in export/debug/public API, found ${occurrences}`);
});


test('diagnostics catch batch routes readout fallbacks through runtime error recorder', () => {
  const requiredScopes = [
    'diagnostics:export-active-editor',
  ];
  for (const text of [diagnosticsOwner, dist]) {
    assert.match(diagnosticsOwner, /function diagnosticsRuntimeErrorFallback\(scope, err, detail = null, extra = null\)/);
    for (const scope of requiredScopes) {
      assert.ok(text.includes(scope), `missing ${scope}`);
    }
  }
});


test('storage and clipboard diagnostic catches use one-shot runtime error recording', () => {
  const requiredScopes = [
    'diagnostics:clipboard-write',
    'settings:storage-status',
  ];
  for (const text of [diagnosticsOwner, dist]) {
    assert.match(diagnosticsOwner, /function recordRuntimeErrorOnce\(scope, err, detail = null\)/);
    assert.match(diagnosticsOwner, /runtimeErrorOnceKeys\.clear\(\)/);
    for (const scope of requiredScopes) {
      assert.ok(text.includes(scope), `missing ${scope}`);
    }
  }
});

test('editor and completion catches route consequential failures to runtime diagnostics', () => {
  const requiredScopes = [
    'editor:dispatch-hook-post',
    'editor:unhook-dispatch',
    'editor:walk-open-root-callback',
    'editor:walk-open-root-query',
    'editor:active-root-query',
    'editor:overlay-host-query',
    'editor:get-doc-length',
    'editor-sentinel:observe',
    'editor:codemirror-internals-check',
    'editor:target-contains-codemirror',
    'completion:compute',
    'completion:compute-context-panel',
    'completion:compute-quality-panel',
    'completion:snippet-placeholder-select',
    'completion:snippet-placeholder-exit',
    'completion:snippet-session-update',
    'completion:insert-dispatch',
    'completion:insert-snippet-session',
    'completion:continuation-open',
    'diagnostics:suggestion-quality-clipboard-write',
  ];
  for (const text of [diagnosticsOwner, dist]) {
    for (const scope of requiredScopes) {
      assert.ok(text.includes(scope), `missing ${scope}`);
    }
  }
  assert.match(completionRuntime, /catch \(err\) \{\s*state\.lastError = err instanceof Error \? err : new Error\(String\(err \|\| 'completion compute failed'\)\);\s*recordRuntimeError\('completion:compute'/s);
  assert.match(completionInsertionRuntime, /catch \(err\) \{[\s\S]*?recordRuntimeError\('completion:snippet-session-update'/);
  assert.match(completionInsertion, /catch \(err\) \{\s*runtimeState\.lastError = err instanceof Error \? err : new Error\(String\(err \|\| 'completion insert failed'\)\);\s*runtimeErrorRecorder\?\.\('completion:insert-dispatch'/s);
});


test('settings portal and settings-panel catches route fallbacks to runtime diagnostics', () => {
  const requiredScopes = [
    'settings:top-layer-dialog-query',
    'settings:top-layer-dialog-modal-check',
    'settings:top-layer-dialog-shadow-query',
    'settings:portal-host-query',
    'settings:portal-host-append',
    'settings:portal-host-fallback-append',
    'settings:scroll-snapshot-capture',
    'settings:deferred-save-timer-clear',
    'settings:diagnostics-raf-cancel',
    'settings:diagnostics-pending-clear',
    'settings:popover-hide',
    'settings:active-tab-storage-read',
    'settings:active-tab-storage-write',
    'settings:resize-pointer-capture',
    'settings:drag-pointer-capture',
    'settings:panel-popover-setup',
    'diagnostics:context-clipboard-write',
    'diagnostics:context-inspector-clipboard-write',
    'diagnostics:console-command-clipboard-write',
    'diagnostics:pending-reasons-clear',
    'diagnostics:pending-reasons-add',
  ];
  for (const text of [diagnosticsOwner, dist]) {
    for (const scope of requiredScopes) {
      assert.ok(text.includes(scope), `missing ${scope}`);
    }
  }

  // Exact catch formatting is source-level structure. After Priority 7 begins, dist is
  // an esbuild bundle and may rewrite catch block formatting while preserving scopes.
  assert.match(settingsPortalRuntime, /catch \(err\) \{\s*recordRuntimeErrorOnce\("settings:portal-host-query"/s);
  assert.match(settingsPortalRuntime, /catch \(fallbackErr\) \{\s*recordRuntimeErrorOnce\("settings:portal-host-fallback-append"/s);
  assert.match(settingsPanelRuntime, /catch \(err\) \{ recordRuntimeErrorOnce\("diagnostics:context-clipboard-write"/);
});

test('external diagnostics stages use the public runtime-error bridge', () => {
  for (const text of [contextDiagnosticsRuntime, dist]) {
    assert.ok(text.includes('nostrodomusRecordRuntimeError'), 'missing external diagnostics bridge');
    assert.ok(text.includes('nostrodomusRecordRuntimeErrorOnce'), 'missing external diagnostics once bridge');
    assert.ok(text.includes('diagnostics:readout-storage-read'));
  }

  assert.ok(contextDiagnosticsRuntime.includes('export function installContextDiagnosticsRuntime'), 'missing external diagnostics runtime owner');
  assert.doesNotMatch(contextDiagnosticsRuntime, /[^.]\brecordRuntimeError\("diagnostics:/);
  assert.doesNotMatch(contextDiagnosticsRuntime, /[^.]\brecordRuntimeErrorOnce\("diagnostics:/);
});
