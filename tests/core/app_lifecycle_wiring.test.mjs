import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// app.js is a side-effect composition root that cannot be re-run per test, so these are
// source-shape assertions (precedent: tests/core/app_picker_listener_wiring.test.mjs).
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const source = read('../../src/app.js');

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

// The selector self-check runs on a timer set when an editor is found. A run still pending at
// uninstall would walk the page and write to the runtime state after the runtime is gone.
test('uninstall cancels a pending selector self-check', () => {
  const block = source.slice(source.indexOf('    lifecycle: {'), source.indexOf('  // Boot-cost probe: split the main-thread cost'));
  const settle = block.slice(block.indexOf('settlePendingTimers: () => {'), block.indexOf('companionScrollbarTeardown:'));
  assert.match(settle, /\n\s+selectorSeamProbeRuntime\.cancel\(\);/);
  assert.ok(source.indexOf('const selectorSeamProbeRuntime = createSelectorSeamProbe({') < source.indexOf('const publicApiRuntime = createPublicApiRuntime({'), 'the probe exists before the uninstall hooks are built');
});

// These callbacks style the editor again when they run: the end of a typing session (150 ms after
// the last edit) schedules a syntax pass, a pending source-class refresh repaints the open editors,
// and a pending refit after a window resize writes the codebox height.
test('uninstall drops the pending callbacks that would style the editor again', () => {
  const block = source.slice(source.indexOf('    lifecycle: {'), source.indexOf('  // Boot-cost probe: split the main-thread cost'));
  const settle = block.slice(block.indexOf('settlePendingTimers: () => {'), block.indexOf('companionScrollbarTeardown:'));
  assert.match(settle, /clearTimeout\(state\.typingSessionExitTimer\);\s+state\.typingSessionExitTimer = 0;/);
  assert.match(settle, /cancelAnimationFrame\(state\.sourceClassSyntaxRefreshRaf\);[^\n]*\n\s+state\.sourceClassSyntaxRefreshRaf = 0;/);
  assert.match(settle, /W\.cancelAnimationFrame\?\.\(codeboxRefitResizeFrame\)/);
  assert.match(settle, /codeboxRefitResizeFrame = 0;/);
});

// A reset in another tab removes the stored settings, so its storage event has newValue null.
// This tab then loads the defaults; its next save does not write the old settings back.
test('a settings reset in another tab is loaded like a change', () => {
  const handler = source.slice(source.indexOf('function onSettingsStorage(event) {'), source.indexOf('function openSettings() {'));
  assert.doesNotMatch(handler, /typeof event\.newValue !== "string"/, 'a removed key is not ignored');
  assert.match(handler, /const stored = typeof event\.newValue === "string" \? event\.newValue : "";/);
  assert.match(handler, /if \(stored && stored === state\.settingsLastSerialized\) return;/);
  assert.match(handler, /state\.settings = loadSettings\(\);\s+state\.settingsLastSerialized = stored;/);
});

// The storage handler of main, run with stand-ins for what it reads from the composition root.
function settingsStorageHandler({ state, stored, companionLayer }) {
  const start = source.indexOf('  function onSettingsStorage(event) {');
  const end = source.indexOf('function openSettings() {', start);
  assert.ok(start > 0 && end > start, 'the storage handler is found in app.js');
  const calls = [];
  const onSettingsStorage = new Function(
    'loggingRuntime', 'SETTINGS_WRITE_KEY', 'state', 'loadSettings', 'scheduleCodeboxStyleReapply', 'applyCompanionEditorLayer', 'recordRuntimeErrorOnce', 'closeSettings', 'openSettings',
    `${source.slice(start, end)}\n  return onSettingsStorage;`,
  )(
    { refreshStorageFlags: () => {} },
    'settings-key',
    state,
    () => JSON.parse(stored),
    (reason) => calls.push(['restyle', reason]),
    companionLayer || ((target) => calls.push(['companion', target, { ...state.settings.style }])),
    (scope, err, detail) => calls.push(['error', scope, err.message, detail]),
    () => calls.push(['close']),
    () => calls.push(['open']),
  );
  return { onSettingsStorage, calls };
}

// "Hide editor warnings" and "Glass editor dialog" belong to the companion layer, which the style
// reapply does not run. Settings changed or reset in another tab re-apply it in this tab too.
test('settings loaded from another tab re-apply the companion layer', () => {
  const editor = { id: 'active-editor' };
  const changed = JSON.stringify({ style: { hideEditorWarnings: true, glassDialog: false } });
  const state = { settings: { style: { hideEditorWarnings: false, glassDialog: true } }, settingsLastSerialized: '', activeEditorCache: { editor } };
  const change = settingsStorageHandler({ state, stored: changed });
  change.onSettingsStorage({ key: 'settings-key', newValue: changed });
  assert.deepEqual(change.calls, [
    ['restyle', 'settings-storage-sync'],
    ['companion', editor, { hideEditorWarnings: true, glassDialog: false }],
  ]);

  // A reset in the other tab removes the key: this tab loads the defaults and applies them.
  const reset = settingsStorageHandler({ state, stored: JSON.stringify({ style: { hideEditorWarnings: false, glassDialog: true } }) });
  reset.onSettingsStorage({ key: 'settings-key', newValue: null });
  assert.deepEqual(reset.calls, [
    ['restyle', 'settings-storage-sync'],
    ['companion', editor, { hideEditorWarnings: false, glassDialog: true }],
  ]);

  // Another key, or the text this tab saved itself, changes nothing.
  const same = settingsStorageHandler({ state: { ...state, settingsLastSerialized: changed }, stored: changed });
  same.onSettingsStorage({ key: 'other-key', newValue: changed });
  same.onSettingsStorage({ key: 'settings-key', newValue: changed });
  assert.deepEqual(same.calls, []);
});

test('a companion layer that throws on a storage change is recorded and the open panel still reopens', () => {
  const stored = JSON.stringify({ style: { glassDialog: false } });
  const state = { settings: { style: {} }, settingsLastSerialized: '', settingsPanel: { isConnected: true }, activeEditorCache: { editor: null } };
  const h = settingsStorageHandler({ state, stored, companionLayer: () => { throw new Error('no editor'); } });
  h.onSettingsStorage({ key: 'settings-key', newValue: stored });
  assert.deepEqual(h.calls, [
    ['restyle', 'settings-storage-sync'],
    ['error', 'settings:storage-sync-companion-layer', 'no editor', { phase: 'onSettingsStorage' }],
    ['close'],
    ['open'],
  ]);
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
  const group = source.slice(source.indexOf('} = createAppCompletionRuntimeGroup({'), source.indexOf('scoring: {'));
  assert.match(group, /\n\s+payloadWanted: \(\) => !!state\.settingsPanel\?\.isConnected,/);
  const factory = read('../../src/composition/appCompletionRuntimeFactory.js');
  assert.match(factory, /\n\s+payloadWanted: suggestionQuality\.payloadWanted,/);
});

test('resetSettings is given the codebox restyle and the companion layer', () => {
  const block = callBlock(source, 'const settingsRuntime = createSettingsRuntime({');
  assert.match(block, /\n\s+scheduleCodeboxStyleReapply: reason => scheduleCodeboxStyleReapply\(reason\),/);
  assert.ok(source.indexOf('scheduleCodeboxStyleReapply, activeCodeboxStyleEditor') < source.indexOf('const settingsRuntime = createSettingsRuntime({'), 'the delegate exists before the settings runtime is built');
  // The companion layer is defined after the settings runtime is built, so it is read at call time.
  assert.match(block, /\n\s+applyCompanionEditorLayer: editor => applyCompanionEditorLayer\(editor\),/);
  assert.match(block, /\n\s+recordRuntimeErrorOnce,/);
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
  assert.match(callBlock(source, 'settingsPanelRuntime = createAppSettingsPanelRuntime({'), /globals: \{ window, document, navigator, settingsStorage, W \},/);
  assert.match(callBlock(source, 'diagnosticsRuntime = createDiagnosticsRuntime({'), /\n\s+localStorage: settingsStorage,/);
});
