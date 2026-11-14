import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsInteractionRuntime } from '../../src/ui/settingsInteractionRuntime.js';

function makeRuntime(overrides = {}) {
  const events = [];
  const state = {
    settings: { style: {} },
    settingsFeedbackTimers: new Set(),
    settingsInteractionRestoreTimers: new Set(),
    preservedScrollRestoreTimers: new Set(),
    settingsRangeLivePreviewReasons: new Set(),
    settingsRangeLivePreviewTokenTargets: [],
  };
  const timers = [];
  const rafs = [];
  const runtime = createSettingsInteractionRuntime({
    state,
    documentRef: { documentElement: null, body: null, scrollingElement: null },
    windowRef: { scrollX: 0, scrollY: 0, scrollTo() {} },
    setTimeout(fn, delay) { const timer = { fn, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) { timer.cleared = true; },
    requestAnimationFrame(fn) { const raf = { fn }; rafs.push(raf); return raf; },
    cancelAnimationFrame(raf) { raf.cancelled = true; },
    recordPerformanceEvent(name, duration, detail) { events.push({ name, duration, detail }); },
    recordRuntimeErrorOnce(scope, err, detail) { events.push({ scope, err, detail }); },
    saveSettings(reason) { state.savedReason = reason; },
    requestLiveUpdate(reason) { state.liveUpdateReason = reason; },
    ...overrides,
  });
  return { runtime, state, timers, rafs, events };
}

test('settings interaction owner mutates nested setting paths and syntax tint custom state', () => {
  const { runtime, state } = makeRuntime();

  assert.equal(runtime.setSettingsPathValue('style.codeboxGlowOpacity', 0.42), true);
  assert.equal(state.settings.style.codeboxGlowOpacity, 0.42);

  assert.equal(runtime.applyStyleRangeMutation('style.syntaxTintHue', 210), true);
  assert.equal(state.settings.style.syntaxTintHue, 210);
  assert.equal(state.settings.style.syntaxTintPreset, 'custom');
  assert.equal(state.settings.style.syntaxTintEnabled, true);
});

test('settings interaction owner tracks feedback, interaction, and preserved-scroll timers', () => {
  const { runtime, state, timers } = makeRuntime();

  const feedback = runtime.scheduleSettingsFeedbackReset(() => {}, 120, 'feedback');
  const interaction = runtime.scheduleSettingsInteractionRestore(() => {}, 50, 'interaction');
  const scroll = runtime.schedulePreservedScrollRestore(() => {}, 50, 'scroll');

  assert.equal(state.settingsFeedbackTimers.has(feedback), true);
  assert.equal(state.settingsInteractionRestoreTimers.has(interaction), true);
  assert.equal(state.preservedScrollRestoreTimers.has(scroll), true);

  assert.equal(runtime.clearSettingsFeedbackTimers('clear-feedback'), 1);
  assert.equal(runtime.clearSettingsInteractionRestoreTimers('clear-interaction'), 1);
  assert.equal(runtime.clearPreservedScrollRestoreTimers('clear-scroll'), 1);
  assert.equal(timers.every(timer => timer.cleared), true);
});

test('settings interaction owner coalesces style range label updates through animation frame', () => {
  const label = { textContent: '' };
  const panel = { querySelector: selector => selector === '[data-range-value-for="style.syntaxTintHue"]' ? label : null };
  const input = { isConnected: true, dataset: { rangeFormat: 'hue' } };
  const { runtime, state, rafs } = makeRuntime();

  assert.equal(runtime.scheduleStyleRangeValueLabelUpdate(panel, input, 'style.syntaxTintHue', 184.5), true);
  assert.equal(state.settingsRangeValueLabelRaf, rafs[0]);
  rafs[0].fn();

  assert.equal(label.textContent, '185°');
  assert.equal(state.settingsRangeValueLabelFrameCount, 1);
  assert.equal(state.settingsRangeValueLabelFrameUpdates, 1);
});

test('settings interaction owner schedules live preview and live save without immediate full style apply', () => {
  const calls = [];
  const { runtime, state, rafs } = makeRuntime({
    applyCodeboxStyleTokensToElement() { calls.push('token'); return true; },
    activeCodeboxStyleEditor() { return { style: {}, dataset: {}, querySelector: () => null, getRootNode: () => null }; },
    codeboxEditorCacheKey: () => 'editor-1',
    effectiveStyleSettings: () => ({ codeTextSize: 'normal', codeboxFrameEnabled: true }),
    codeboxStyleTokensFromSettings: () => ({ scrollbarThumb: '#fff', scrollbarTrack: '#000', frameBorder: '#111', frameGlow: '#222', frameGlowSoft: '#333', frameGlowInner: '#444', frameGlowInnerSoft: '#555', frameGlowOuter: '#666', frameGlowOuterSoft: '#777', editorSurface: '#888', thumbBorder: '#999' }),
    resolveSyntaxTintSettings: () => ({ active: true, hue: 210, filterBase: 184, saturation: 1.2 }),
    measurePerformanceEvent(name, detail, fn) { return fn(); },
  });

  assert.equal(runtime.scheduleStyleRangeLivePreview('style.syntaxTintHue'), true);
  assert.equal(runtime.scheduleStyleRangeLiveSave('style-range-live'), true);
  rafs[0].fn();

  assert.equal(state.settingsRangeLivePreviewFastCount, 1);
  assert.equal(state.lastStyleLivePreview.touchesSyntax, true);
  assert.equal(state.settingsRangeLiveSaveSchedules, 1);
});
