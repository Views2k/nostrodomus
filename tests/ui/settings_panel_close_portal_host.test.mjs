import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsPanelRuntime } from '../../src/ui/settingsPanelRuntime.js';
import { appendSettingsChildren, clampSettingsPosition, clampSettingsSize, createSettingsElement, settingsTitle } from '../../src/ui/settingsPanel.js';

// Tier A finding A3, teardown half: closeSettings removed only the panel, so the
// full-viewport portal host it mounts into was never removed by anything. The stub ctx
// mirrors the frozen parity test's pattern (which itself must never be modified).
function fakeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        className: '',
        id: '',
        textContent: '',
        dataset: {},
        style: { cssText: '' },
        attrs: {},
        children: [],
        setAttribute(name, value) { this.attrs[name] = value; },
        appendChild(child) { this.children.push(child); return child; },
        append(...nodes) { for (const node of nodes) this.children.push(node); },
      };
    },
    createTextNode(text) { return { nodeType: 3, textContent: String(text) }; },
  };
}

function stubCtx(state) {
  const noop = () => {};
  return {
    window: { innerWidth: 1200, innerHeight: 900 },
    document: fakeDocument(),
    navigator: {},
    settingsStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    DEFAULT_SETTINGS: { style: {} },
    SETTINGS_WRITE_KEY: 'nostrodomus-test-settings',
    STYLE_SYNTAX_PRESETS: {},
    STYLE_TEXT_SIZE_PRESETS: {},
    VERSION: 'test',
    W: {},
    applySettingChangePreservingInteraction: noop,
    applyStyleRangeMutation: noop,
    cancelStyleRangeCommitReapply: noop,
    changelogSummaryText: () => '',
    clampNumber: (value, min, max, fallback) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback),
    clearSettingsFeedbackTimers: noop,
    clearSettingsInteractionRestoreTimers: noop,
    cloneDefaultSettings: () => ({ style: {} }),
    clearCompletionCache: noop,
    contextInspectorMarkup: () => null,
    contextInspectorPayload: () => ({}),
    copyDiagnosticsToClipboard: noop,
    diagnosticsMarkup: () => null,
    ensureProviderSettings: noop,
    health: () => ({}),
    hueLabel: (value) => `${value}°`,
    logDebug: noop,
    logInfoOnce: noop,
    percentLabel: (value) => `${Math.round(value * 100)}%`,
    preserveSettingsInteractionDuring: (label, fn) => fn?.(),
    providerControlsMarkup: () => null,
    pruneStyleRootObservers: noop,
    recordPerformanceEvent: noop,
    recordRuntimeErrorOnce: noop,
    refreshContextInspectorPanel: noop,
    refreshSuggestionQualityPanel: noop,
    safeContextSummary: () => ({}),
    scheduleCodeboxStyleReapply: noop,
    scheduleDiagnosticsRefresh: noop,
    scheduleSettingsFeedbackReset: noop,
    scheduleSettingsSave: noop,
    scheduleSourceClassSyntaxRefresh: noop,
    scheduleStyleRangeCommitReapply: noop,
    scheduleStyleRangeLivePreview: noop,
    scheduleStyleRangeLiveSave: noop,
    scheduleStyleRangeValueLabelUpdate: noop,
    settingsPortalRoot: () => null,
    sliderNumberLabel: (value) => String(value),
    startContextInspectorHeartbeat: noop,
    state,
    stopContextInspectorHeartbeat: noop,
    suggestionQualityCard: () => null,
    suggestionQualityPayload: () => ({}),
    syntaxThemeOptions: () => [],
    syntaxThemePalette: () => ({}),
    updateProviderControlCard: noop,
    updateStyleRangeValueLabel: noop,
    appendSettingsChildren,
    clampSettingsPosition,
    clampSettingsSize,
    createSettingsElement,
    settingsTitle,
    glowSizeLabel: () => '',
    languageLabel: (lang) => String(lang),
  };
}

test('closeSettings removes the portal host along with the panel', () => {
  const fakePanel = { remove() { this.removed = true; } };
  const fakeHost = { remove() { this.removed = true; } };
  const state = { settings: { style: {} }, settingsPanel: fakePanel, settingsPortalHost: fakeHost };
  const runtime = createSettingsPanelRuntime(stubCtx(state));

  runtime.closeSettings(false);

  assert.equal(state.settingsPanel, null);
  assert.equal(fakeHost.removed, true, 'closeSettings must remove the portal host');
  assert.equal(state.settingsPortalHost, null, 'the host reference must be cleared');
});
