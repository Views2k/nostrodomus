import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// main.legacy.js is a side-effect composition root that cannot be re-run per test, so these are
// source-shape assertions (precedent: tests/core/main_legacy_picker_listener_wiring.test.mjs).
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const source = read('../../src/main.legacy.js');

function callBlock(text, opener) {
  const start = text.indexOf(opener);
  assert.ok(start >= 0, `${opener} must exist`);
  const end = text.indexOf('\n  });', start);
  assert.ok(end > start, `${opener} must be closed`);
  return text.slice(start, end);
}

test('observer lifecycle runtime receives every dependency it destructures', () => {
  const moduleSource = read('../../src/diagnostics/observerLifecycleRuntime.js');
  const destructure = moduleSource.slice(moduleSource.indexOf('const {'), moduleSource.indexOf('} = ctx;'));
  const names = Array.from(destructure.matchAll(/^\s{4}([A-Za-z_$][\w$]*)(\s*=[^,]*)?,$/gm))
    .filter((match) => !match[2]) // names with a default may be omitted
    .map((match) => match[1]);
  assert.ok(names.includes('cleanupCodeboxSlotUnclip'));
  const block = callBlock(source, 'observerLifecycleRuntime = createObserverLifecycleRuntime({');
  for (const name of names) {
    assert.match(block, new RegExp(`\\n\\s+${name}[,:]`), `createObserverLifecycleRuntime must be given ${name}`);
  }
});

test('startup badge is wired to the required-checks health reader, not the full report', () => {
  const block = callBlock(source, 'const loggingRuntime = createLoggingRuntime({');
  assert.match(block, /\n\s+health: startupHealth,/);
  assert.doesNotMatch(block, /\n\s+health,/);
  const reader = source.slice(source.indexOf('const startupHealth = '), source.indexOf('const loggingRuntime = createLoggingRuntime({'));
  assert.match(reader, /diagnosticsHealth\.health\(state, \{/);
  assert.doesNotMatch(reader, /performanceStatsSnapshot|performanceTelemetrySnapshot|clientCapabilitySnapshot/);
});

test('the debugMode setting is wired into the logger', () => {
  const block = callBlock(source, 'const loggingRuntime = createLoggingRuntime({');
  assert.match(block, /debugModeEnabled: \(\) => \{ try \{ return state\.settings\?\.debugMode === true; \} catch \{ return false; \} \},/);
});

test('a pending settings save is flushed on pagehide through the persistent-listener registry', () => {
  assert.ok(source.includes('const flushPendingSettingsSave = () => { if (state.settingsSaveTimer) flushSettingsSave("page-hide"); };'));
  assert.ok(source.includes('addPersistentListener(W, "pagehide", flushPendingSettingsSave, { passive: true }, "settings-save-pagehide-flush")'));
  const attach = source.indexOf('"settings-save-pagehide-flush"');
  assert.ok(source.indexOf('persistentListenersRuntime = createPersistentListenersRuntime(') < attach, 'registry must exist first');
  assert.ok(source.indexOf('W.__nostrodomus?.installed') < attach, 'a duplicate load must bail before attaching');
});

test('an open settings panel is re-clamped on window resize', () => {
  assert.ok(source.includes('addPersistentListener(W, "resize", reclampSettingsPanelOnResize, { passive: true }, "settings-panel-resize-reclamp")'));
  const handler = source.slice(source.indexOf('const reclampSettingsPanelOnResize = '), source.indexOf('"settings-panel-resize-reclamp"'));
  assert.match(handler, /if \(!panel\?\.isConnected\) return;/);
  assert.match(handler, /applySettingsPanelViewportPosition\(panel, \{ x: rect\.left, y: rect\.top \}\);/);
  assert.doesNotMatch(handler, /saveSettingsPosition/, 'the stored position is not rewritten by a resize');
});

test('diagnostics reads the loaded settings key through a getter', () => {
  const block = callBlock(source, 'diagnosticsRuntime = createDiagnosticsRuntime({');
  assert.match(block, /\n\s+loadedSettingsStorageKey: \(\) => loadedSettingsStorageKey,/);
});

test('uninstall is given a hook that settles pending timers', () => {
  const block = source.slice(source.indexOf('    lifecycle: {'), source.indexOf('  // Boot-cost probe: split the main-thread cost'));
  assert.match(block, /settlePendingTimers: \(\) => \{\s+flushPendingSettingsSave\(\);\s+clearTimeout\(state\.completionRepeatPressureLiveUpdateTimer\);/);
});

test('the storage event refreshes the cached debug and perf flags before the settings key check', () => {
  const handler = source.slice(source.indexOf('function onSettingsStorage(event) {'), source.indexOf('function openSettings() {'));
  const refresh = handler.indexOf('loggingRuntime.refreshStorageFlags(event);');
  assert.ok(refresh > 0, 'onSettingsStorage must pass the event to the logger');
  assert.ok(refresh < handler.indexOf('event.key !== SETTINGS_WRITE_KEY'), 'before the early return for other keys');
  const api = read('../../src/core/publicApiRuntime.js');
  assert.ok(api.includes("lifecycle.addPersistentListener?.(W, 'storage', apiMethods.onSettingsStorage, false, 'window-storage');"));
});

test('per-keystroke diagnostics are tied to a reader: dispatch breadcrumbs and the suggestion quality payload', () => {
  const dispatch = callBlock(source, 'editorDispatchRuntime = createEditorDispatchRuntime({');
  assert.match(dispatch, /\n\s+diagnosticsRecording: \(\) => shouldRecordPerformanceTelemetry\("editor-dispatch"\),/);
  const group = source.slice(source.indexOf('} = createMainLegacyCompletionRuntimeGroup({'), source.indexOf('scoring: {'));
  assert.match(group, /\n\s+payloadWanted: \(\) => !!state\.settingsPanel\?\.isConnected,/);
  const factory = read('../../src/composition/mainLegacyCompletionRuntimeFactory.js');
  assert.match(factory, /\n\s+payloadWanted: suggestionQuality\.payloadWanted,/);
});

test('resetSettings is given the codebox restyle', () => {
  const block = callBlock(source, 'const settingsRuntime = createSettingsRuntime({');
  assert.match(block, /\n\s+scheduleCodeboxStyleReapply: reason => scheduleCodeboxStyleReapply\(reason\),/);
  assert.ok(source.indexOf('scheduleCodeboxStyleReapply, activeCodeboxStyleEditor') < source.indexOf('const settingsRuntime = createSettingsRuntime({'), 'the delegate exists before the settings runtime is built');
});

// window.localStorage is a getter that throws when the browser blocks site data for the page.
// Three reads of it during install were unguarded, so the install stopped there.
test('the settings store is read once, guarded, and every boot-time user is given that value', () => {
  const guarded = source.indexOf('try { settingsStorage = W?.["local" + "Storage"] || null; } catch { settingsStorage = null; }');
  assert.ok(guarded > 0, 'the guarded read exists');
  assert.ok(guarded < source.indexOf('const loggingRuntime = createLoggingRuntime({'), 'before anything is built with it');
  const reads = source.split('\n').filter(line => line.includes('["local" + "Storage"]'));
  assert.equal(reads.length, 2, 'the only other read is the guarded one for the accept store');
  assert.ok(reads.every(line => /try \{.*\} catch/.test(line)), 'both reads are inside a try');

  assert.match(callBlock(source, 'const settingsRuntime = createSettingsRuntime({'), /\n\s+storage: settingsStorage,/);
  assert.match(callBlock(source, 'settingsPanelRuntime = createMainLegacySettingsPanelRuntime({'), /globals: \{ window, document, navigator, settingsStorage, W \},/);
  assert.match(callBlock(source, 'diagnosticsRuntime = createDiagnosticsRuntime({'), /\n\s+localStorage: settingsStorage,/);
});
