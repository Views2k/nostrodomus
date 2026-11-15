// The real diagnostics runtime (src/diagnostics/diagnosticsRuntime.js) on the settings panel DOM
// stand-in, for tests of the Diagnostics and Context tab markup and their refresh.

import { createDiagnosticsRuntime } from '../../src/diagnostics/diagnosticsRuntime.js';
import { safeContextSummary, diagnosticsReadoutBundle } from '../../src/diagnostics/diagnosticsCore.js';
import * as diagnosticsHealth from '../../src/diagnostics/diagnosticsHealth.js';
import { formatPerformanceEventMetric } from '../../src/diagnostics/diagnosticsReadoutHelpers.js';
import { createEmbeddedLanguageDiagnostics } from '../../src/languages/embeddedLanguageDiagnostics.js';
import { createSuggestionQualityRuntime } from '../../src/completion/suggestionQualityRuntime.js';
import { itemDetail, itemDocumentation, itemSourceLabel, completionVisualKind } from '../../src/ui/suggestionPopup.js';
import { createSettingsElement } from '../../src/ui/settingsPanel.js';
import { createFakeDom } from '../ui/settings_panel_dom_fake.mjs';

export function createTelemetryHarness(overrides = {}) {
  const { document } = createFakeDom();
  const el = (tag, options = {}, children = []) => createSettingsElement(tag, options, children, document);
  const calls = [];
  const stored = new Map();
  const state = {
    installed: true,
    enabled: true,
    installedAt: Date.parse('2026-01-01T00:00:00.000Z'),
    view: null,
    items: [],
    selected: 0,
    context: null,
    providers: [],
    providerStats: {},
    settings: { enabledLangs: { yaml: true }, style: {}, providers: {}, maxItems: 12, debugMode: false },
    completionCache: new Map(),
    library: { sources: [] },
    index: { byLang: {} },
    lastError: null,
    suggestionQuality: null,
    settingsPanel: null,
    settingsSaveStats: { writes: 0, skippedUnchanged: 0, lastWriteAt: 0, lastSkipAt: 0, lastReason: '', lastSerializedLength: 0 },
    contextInspectorTimer: 0,
    diagnosticsHeartbeatMs: 1200,
    diagnosticsStats: { skippedHidden: 0, skippedClean: 0, refreshes: 0, lastSkipReason: '' },
    diagnosticsPendingReasons: new Set(),
    ...overrides.state,
  };
  const W = { __nostrodomus: { installed: true, contextDiagnostics: { stage: 'test-stage', readActiveEditor: () => ({ ok: true, editorFound: false, warning: 'none' }) } } };
  const quality = createSuggestionQualityRuntime({ state, itemDetail, providerSummary: () => [], contextRouteLabel: () => 'route' });
  const runtime = createDiagnosticsRuntime({
    CHANGELOG_SUMMARY: {},
    DEFAULT_SETTINGS: { style: {} },
    PRODUCT_NAME: 'Nostrodomus',
    PROJECT_RELEASE_STATE: 'beta',
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
    compactGpuRendererLabel: value => String(value),
    completionVisualKind,
    composedContains: () => false,
    compute: (triggerKind) => { calls.push(['compute', triggerKind]); },
    createEmbeddedLanguageDiagnostics,
    createSettingsElement: el,
    debugLoggingEnabled: () => false,
    diagnosticsReadoutBundle,
    diagnosticsReasonIsInteractive: () => false,
    diagnosticsRuntimeErrorFallback: (_scope, err) => ({ ok: false, error: String(err?.message || err) }),
    displayBrowserLabel: () => 'browser',
    displayMemoryLabel: () => 'memory',
    displayViewportLabel: () => 'viewport',
    document,
    ensureProviderSettings: () => state.settings.providers,
    formatPerformanceEventMetric,
    getDocLength: view => view?.state?.doc?.length || 0,
    health: diagnosticsHealth.health,
    incrementMapCounter: () => {},
    isOpen: () => false,
    isViewAllowed: view => !!view,
    itemDetail,
    itemDocumentation,
    itemSourceLabel,
    loadedSettingsStorageKey: 'nostrodomus.settings',
    localStorage: {
      getItem: key => (stored.has(key) ? stored.get(key) : null),
      setItem: (key, value) => { stored.set(key, String(value)); },
      removeItem: key => { stored.delete(key); },
    },
    logInfoOnce: () => {},
    looksLikeView: view => !!view,
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
    recordPerformanceEvent: (name, _ms, detail) => { calls.push(['perf', name, detail]); },
    recordRuntimeError: () => {},
    recordRuntimeErrorOnce: (...args) => { calls.push(['error', ...args]); },
    runtimeErrorReadout: () => ({ items: [] }),
    runtimeSummary: diagnosticsHealth.runtimeSummary,
    safeContextSummary,
    settingDesc: text => el('div', { className: 'nostrodomus-setting-desc', text }),
    settingsCheckbox: (label, key, checked) => {
      const input = el('input', { attrs: { type: 'checkbox', 'aria-label': label }, dataset: { k: key } });
      input.checked = !!checked;
      return el('label', { className: 'nostrodomus-checkbox-row' }, [input, el('span', { text: label })]);
    },
    settingsPortalRoot: () => document.body,
    state,
    suggestionQualityPayload: quality.suggestionQualityPayload,
    ...overrides.deps,
  });

  // The rows of a diagnostics card as { label: value }.
  const rows = (card) => Object.fromEntries(card.querySelectorAll('.nostrodomus-diagnostic-row').map(row => [row.children[0].textContent, row.children[1].textContent]));

  // A connected panel with the Context section active, holding the real Context tab markup.
  const mountContextTab = () => {
    const panel = el('div', { id: 'nostrodomus-settings-root' });
    const section = el('section', { className: 'nostrodomus-section active', dataset: { section: 'context' } }, [
      ...runtime.contextInspectorMarkup(),
      runtime.suggestionQualityCard(),
    ]);
    panel.appendChild(section);
    document.body.appendChild(panel);
    state.settingsPanel = panel;
    return { panel, section };
  };

  return { document, el, state, W, calls, stored, runtime, rows, mountContextTab };
}
