// Builds the real settings panel (createSettingsPanelRuntime and everything under
// src/ui/settings/) on the DOM stand-in, with the diagnostics and provider markup replaced by
// small counted builders. Shared by the settings panel shell tests.

import { createSettingsPanelRuntime } from '../../src/ui/settingsPanelRuntime.js';
import { appendSettingsChildren, clampSettingsPosition, clampSettingsSize, createSettingsElement, settingsTitle } from '../../src/ui/settingsPanel.js';
import { cloneDefaultSettings, DEFAULT_SETTINGS } from '../../src/core/settings.js';
import { STYLE_SYNTAX_PRESETS, STYLE_TEXT_SIZE_PRESETS, syntaxThemeOptions, syntaxThemePalette } from '../../src/ui/settingsStyle.js';
import { createFakeDom, flushObservers } from './settings_panel_dom_fake.mjs';

export { flushObservers };

export function createPanelHarness({ activeTab = '', settings = {}, withObserver = true, overrides = {} } = {}) {
  const { document, MutationObserver, observerCount } = createFakeDom();
  const el = (tag, options = {}, children = []) => createSettingsElement(tag, options, children, document);
  const calls = [];
  const builds = { diagnostics: 0, context: 0, quality: 0, providers: 0 };
  const feedback = [];
  const clipboard = [];
  const stored = new Map();
  if (activeTab) stored.set('nostrodomus.settings.activeCategory', activeTab);

  const state = {
    settings: { ...cloneDefaultSettings(), ...settings },
    context: null,
    items: [],
    selected: 0,
    suggestionQuality: null,
    settingsPanel: null,
    settingsPortalHost: null,
    settingsReturnFocus: null,
    diagnosticsPendingReasons: new Set(),
    activeEditorCache: { editor: null },
  };
  const W = {
    innerWidth: 1200,
    innerHeight: 900,
    confirm: () => true,
    __nostrodomus: { installed: true },
  };
  if (withObserver) W.MutationObserver = MutationObserver;
  const note = name => (...args) => { calls.push([name, ...args]); };

  const ctx = {
    window: W,
    document,
    navigator: { clipboard: { writeText: async (text) => { clipboard.push(text); } } },
    settingsStorage: {
      getItem: key => (stored.has(key) ? stored.get(key) : null),
      setItem: (key, value) => { stored.set(key, String(value)); },
      removeItem: key => { stored.delete(key); },
    },
    W,
    state,
    DEFAULT_SETTINGS,
    SETTINGS_WRITE_KEY: 'nostrodomus.settings',
    STYLE_SYNTAX_PRESETS,
    STYLE_TEXT_SIZE_PRESETS,
    VERSION: 'test',
    // Same order as the real one: the change, the save, then the caller's follow-up.
    applySettingChangePreservingInteraction: (reason, mutator, after) => {
      const result = mutator?.();
      calls.push(['setting-change', reason]);
      after?.(result);
      return result;
    },
    applyStyleRangeMutation: note('applyStyleRangeMutation'),
    cancelStyleRangeCommitReapply: note('cancelStyleRangeCommitReapply'),
    changelogSummaryText: () => '',
    clampNumber: (value, min, max, fallback) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback),
    clearSettingsFeedbackTimers: note('clearSettingsFeedbackTimers'),
    clearSettingsInteractionRestoreTimers: note('clearSettingsInteractionRestoreTimers'),
    cloneDefaultSettings,
    clearCompletionCache: note('clearCompletionCache'),
    contextInspectorMarkup: () => {
      builds.context += 1;
      return [
        el('div', { className: 'nostrodomus-diagnostic-card', text: `context build ${builds.context}`, dataset: { contextInspectorLive: 'true' } }),
        el('button', { className: 'nostrodomus-pill', text: 'Copy inspector', dataset: { contextCopyInspector: '' } }),
      ];
    },
    contextInspectorPayload: () => ({ yamlPathText: 'root' }),
    copyDiagnosticsToClipboard: async () => { calls.push(['copyDiagnosticsToClipboard']); return true; },
    diagnosticsMarkup: () => {
      builds.diagnostics += 1;
      const debug = el('input', { attrs: { type: 'checkbox', 'aria-label': 'Debug console messages' }, dataset: { k: 'debugMode' } });
      debug.checked = !!state.settings.debugMode;
      return [
        el('div', { text: 'Diagnostics' }),
        el('div', { className: 'nostrodomus-diagnostics-grid' }, [
          el('section', { className: 'nostrodomus-diagnostic-card', text: `diagnostics build ${builds.diagnostics}` }),
        ]),
        el('div', { className: 'nostrodomus-action-row' }, [
          el('button', { className: 'nostrodomus-pill', text: 'Refresh', dataset: { diagRefresh: '' } }),
          el('button', { className: 'nostrodomus-pill', text: 'Copy full report', dataset: { diagCopy: '' } }),
          el('button', { className: 'nostrodomus-pill', text: 'Copy context', dataset: { diagCopyContext: '' } }),
          el('button', { className: 'nostrodomus-pill', text: 'Log health', dataset: { diagHealth: '' } }),
        ]),
        el('label', {}, [debug]),
      ];
    },
    ensureProviderSettings: () => state.settings.providers,
    health: () => ({ ok: true }),
    hueLabel: value => `${value}°`,
    logDebug: note('logDebug'),
    logInfoOnce: note('logInfoOnce'),
    percentLabel: value => `${Math.round(value * 100)}%`,
    preserveSettingsInteractionDuring: (fn, after) => { const result = fn?.(); after?.(result); return result; },
    providerControlsMarkup: () => {
      builds.providers += 1;
      const input = el('input', { attrs: { type: 'checkbox', 'aria-label': 'Enabled' }, dataset: { provider: 'snippets' } });
      input.checked = state.settings.providers?.snippets?.enabled !== false;
      return el('div', { className: 'nostrodomus-provider-control-list' }, [input]);
    },
    pruneStyleRootObservers: note('pruneStyleRootObservers'),
    recordPerformanceEvent: note('recordPerformanceEvent'),
    recordRuntimeErrorOnce: note('recordRuntimeErrorOnce'),
    refreshContextInspectorPanel: note('refreshContextInspectorPanel'),
    refreshSuggestionQualityPanel: note('refreshSuggestionQualityPanel'),
    safeContextSummary: () => ({}),
    scheduleCodeboxStyleReapply: note('scheduleCodeboxStyleReapply'),
    scheduleDiagnosticsRefresh: note('scheduleDiagnosticsRefresh'),
    scheduleSettingsFeedbackReset: (fn, delay, reason) => { feedback.push({ fn, delay, reason }); },
    scheduleSettingsSave: note('scheduleSettingsSave'),
    scheduleSourceClassSyntaxRefresh: note('scheduleSourceClassSyntaxRefresh'),
    scheduleStyleRangeCommitReapply: note('scheduleStyleRangeCommitReapply'),
    scheduleStyleRangeLivePreview: note('scheduleStyleRangeLivePreview'),
    scheduleStyleRangeLiveSave: note('scheduleStyleRangeLiveSave'),
    scheduleStyleRangeValueLabelUpdate: note('scheduleStyleRangeValueLabelUpdate'),
    settingsPortalRoot: () => document.body,
    sliderNumberLabel: value => String(value),
    startContextInspectorHeartbeat: note('startContextInspectorHeartbeat'),
    stopContextInspectorHeartbeat: note('stopContextInspectorHeartbeat'),
    suggestionQualityCard: () => {
      builds.quality += 1;
      return el('div', { className: 'nostrodomus-quality-card', text: `quality build ${builds.quality}` });
    },
    suggestionQualityPayload: () => ({ suggestionCount: 0 }),
    syntaxThemeOptions,
    syntaxThemePalette,
    updateProviderControlCard: note('updateProviderControlCard'),
    updateStyleRangeValueLabel: note('updateStyleRangeValueLabel'),
    appendSettingsChildren,
    clampSettingsPosition,
    clampSettingsSize,
    createSettingsElement,
    settingsTitle,
    glowSizeLabel: value => String(value),
    languageLabel: lang => String(lang),
    ...overrides,
  };

  const runtime = createSettingsPanelRuntime(ctx);
  const open = () => { runtime.openSettings(); return state.settingsPanel; };
  const section = name => state.settingsPanel.querySelector(`[data-section="${name}"]`);
  const tab = name => state.settingsPanel.querySelector(`[data-settings-tab="${name}"]`);
  const showTab = async (name) => { tab(name).click(); await flushObservers(); return section(name); };
  const named = name => calls.filter(call => call[0] === name);

  return { W, document, state, runtime, calls, builds, feedback, clipboard, stored, observerCount, open, section, tab, showTab, named, el };
}
