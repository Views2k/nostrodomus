// UI_DECOMP P0a — settings panel runtime API parity contract.
//
// Frozen snapshot of createSettingsPanelRuntime's public return surface, captured
// against the pre-decomposition runtime (v0.1.71). The decomposition order
// (UI_DECOMP) must keep this exact surface: same keys, same typeof per key.
// This test must not be modified during the UI_DECOMP order.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsPanelRuntime } from '../../src/ui/settingsPanelRuntime.js';
import { appendSettingsChildren, clampSettingsPosition, clampSettingsSize, createSettingsElement, settingsTitle } from '../../src/ui/settingsPanel.js';

const EXPECTED_SURFACE = Object.freeze([
  'appendChildren',
  'applySettingsPanelViewportPosition',
  'clampSettingsPosition',
  'clampSettingsSize',
  'closeSettings',
  'colorOptionButton',
  'createSettingsElement',
  'glowSizeLabel',
  'helpCard',
  'languageLabel',
  'makeSettingsStyle',
  'openSettings',
  'optionButton',
  'saveSettings',
  'saveSettingsPosition',
  'saveSettingsSize',
  'sectionPanel',
  'settingDesc',
  'settingsCard',
  'settingsCheckbox',
  'settingsGrid',
  'settingsPortalViewportRect',
  'settingsTitle',
  'settingsViewportToPortalPosition',
  'styleColorBarControl',
  'styleRangeControl',
  'styleToggle',
  'syntaxThemeSelect',
]);

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

function stubCtx() {
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
    state: { settings: { style: {} } },
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

test('settings panel runtime exposes the exact frozen public surface', () => {
  const runtime = createSettingsPanelRuntime(stubCtx());
  assert.deepEqual(Object.keys(runtime).sort(), [...EXPECTED_SURFACE]);
});

test('every settings panel runtime surface key keeps its typeof (function)', () => {
  const runtime = createSettingsPanelRuntime(stubCtx());
  for (const key of EXPECTED_SURFACE) {
    assert.equal(typeof runtime[key], 'function', `runtime.${key} must remain a function`);
  }
});
