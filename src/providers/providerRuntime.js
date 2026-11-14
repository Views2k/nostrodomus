// Nostrodomus provider runtime owner.
// Owns active provider settings, provider registration, runtime provider factories,
// registry deps, and index wiring for the browser bundle. Keep this layer free of
// popup/settings/syntax/style behavior; those remain owned by their dedicated runtimes.

import {
  WORD_FALLBACK_PROVIDER_ID,
  HA_VALUE_PROVIDER_ID,
  LOVELACE_CONTEXT_PROVIDER_ID,
  SECURITY_LIMITS,
  SNIPPET_PROVIDER_ID,
  STATIC_PROVIDER_ID,
} from '../core/runtimeConstants.js';
import * as registry from './providerRegistry.js';
import * as staticLibrary from './staticLibraryProvider.js';
import * as haRuntime from './haRuntimeProvider.js';
import {
  isAutomationScriptContext,
  isDashboardActionContext,
  isScalarConfigContext,
  isScalarValueKind,
  yamlBlockValueKeyKind,
  yamlFocusKind,
  yamlPathIncludes,
  yamlPathParts,
  yamlScalarValueKind,
  yamlValueKind,
} from './haRuntimeProvider.js';
import * as lovelace from './lovelaceContextProvider.js';
import * as snippets from './snippetProvider.js';
import { legacySnippetRow, yamlPathHas } from './snippetProvider.js';
import * as documentWords from './documentWordProvider.js';

export const PROVIDER_SETTINGS_META = Object.freeze({
  [STATIC_PROVIDER_ID]: { label: 'Static YAML/library keys', description: 'Local bundled library rows for YAML, CSS, JS, Jinja, HTML, and Python.' },
  [SNIPPET_PROVIDER_ID]: { label: 'Context snippets', description: 'Larger context-routed templates such as actions, triggers, conditions, and card blocks.' },
  [LOVELACE_CONTEXT_PROVIDER_ID]: { label: 'Lovelace context rows', description: 'Focused dashboard rows based on the active YAML path, such as action/card child keys.' },
  [HA_VALUE_PROVIDER_ID]: { label: 'Home Assistant runtime values', description: 'Entities, services, themes, cards, icons, and actions from the local HA runtime. Entity/service sub-toggles require a future provider split.' },
  [WORD_FALLBACK_PROVIDER_ID]: { label: 'Word fallback', description: 'Lowest-priority fallback words from the current editor buffer when real providers have too few matches.' },
});

function fallbackRecordRuntimeError() { return null; }
function fallbackLogIndexed() { return null; }
function fallbackNow() { return Date.now(); }

function runtimeNowMs(windowRef = null) {
  try {
    const perf = windowRef?.performance || (typeof performance !== 'undefined' ? performance : null);
    if (perf && typeof perf.now === 'function') return perf.now();
  } catch {
    // Timing must never become a host-facing failure.
  }
  return Date.now();
}

export function createProviderRuntime(options = {}) {
  const state = options.state || {};
  const windowRef = options.window || options.windowRef || globalThis;
  const documentRef = options.document || options.documentRef || null;
  const limits = options.limits || SECURITY_LIMITS;
  const recordRuntimeError = options.recordRuntimeError || fallbackRecordRuntimeError;
  const recordRuntimeErrorOnce = options.recordRuntimeErrorOnce || recordRuntimeError;
  const logIndexed = options.logIndexed || fallbackLogIndexed;
  const now = typeof options.now === 'function' ? options.now : fallbackNow;

  const BUILT_IN_PROVIDER_IDS = [STATIC_PROVIDER_ID, SNIPPET_PROVIDER_ID, LOVELACE_CONTEXT_PROVIDER_ID, HA_VALUE_PROVIDER_ID, WORD_FALLBACK_PROVIDER_ID];
  // The ids of the registered providers, read again when the provider list changes.
  let registeredList = null;
  let registeredCount = -1;
  let registeredIds = [];

  function registeredProviderIds() {
    const list = Array.isArray(state.providers) ? state.providers : null;
    if (list !== registeredList || (list ? list.length : 0) !== registeredCount) {
      registeredList = list;
      registeredCount = list ? list.length : 0;
      // "__proto__" as a key would set the prototype of the settings object, not an entry.
      registeredIds = (list || []).map(provider => registry.providerDiagnosticId(provider)).filter(id => id !== '__proto__');
    }
    return registeredIds;
  }

  function ensureProviderSettings() {
    if (!state.settings) state.settings = {};
    if (!state.settings.providers || typeof state.settings.providers !== 'object') state.settings.providers = {};
    const providers = state.settings.providers;
    // Every registered provider gets an entry, not only the five built-in ids: the Settings
    // toggle changes an existing entry and does nothing without one, which left the catalog
    // provider and providers added through the public API without a working toggle.
    for (const providerId of [...BUILT_IN_PROVIDER_IDS, ...registeredProviderIds()]) {
      const entry = Object.prototype.hasOwnProperty.call(providers, providerId) ? providers[providerId] : null;
      if (!entry || typeof entry !== 'object') {
        providers[providerId] = { enabled: true };
      } else if (typeof entry.enabled !== 'boolean') {
        entry.enabled = true;
      }
    }
    return providers;
  }

  function providerEnabled(providerId) {
    return ensureProviderSettings()[providerId]?.enabled !== false;
  }

  function runtimeProviderRegistryLimits() {
    let defaultProviderTimeoutMs = limits.defaultProviderTimeoutMs;
    try {
      const configured = Number(windowRef?.localStorage?.getItem?.('nostrodomusProviderTimeoutMs'));
      if (Number.isFinite(configured) && configured > 0) {
        defaultProviderTimeoutMs = Math.max(1, Math.min(limits.maxProviderTimeoutMs, configured));
      }
    } catch {
      // Storage probing must never become a runtime failure.
    }
    return {
      maxRowsPerPack: limits.maxRowsPerPack,
      defaultProviderTimeoutMs,
      maxProviderTimeoutMs: limits.maxProviderTimeoutMs,
      maxProviderMalformedDiagnostics: limits.maxProviderMalformedDiagnostics,
    };
  }

  function runtimeProviderRegistryDeps() {
    return {
      providerEnabled: providerId => providerEnabled(providerId),
      recordRuntimeError,
      recordRuntimeErrorOnce,
      // The provider-timeout deadline must share the clock the caller injected, or
      // the injected `now` governs only the runtime cache while the timeout keeps
      // reading the real clock — a split clock that drops providers under host load
      // (and makes timing-controlled tests flaky). Production passes no `now`, so this
      // stays byte-identical: the fallback is the same runtimeNowMs(windowRef).
      now: typeof options.now === 'function' ? options.now : () => runtimeNowMs(windowRef),
      limits: runtimeProviderRegistryLimits(),
    };
  }

  function providerCandidates(ctx) {
    return registry.providerCandidates(ctx, state, runtimeProviderRegistryDeps());
  }

  function providerCandidatesLegacy(ctx) {
    return registry.providerCandidatesLegacy(ctx, state, runtimeProviderRegistryDeps());
  }

  function registerProvider(provider) {
    return registry.registerProvider(provider, state);
  }

  function sanitizeLibraryRow(raw, source = 'library') {
    return staticLibrary.sanitizeLibraryRow(raw, source, { limits });
  }

  function normalizeItem(raw, source = 'library') {
    return staticLibrary.normalizeItem(raw, source, { limits });
  }

  function clearCompletionCache() {
    return staticLibrary.clearCompletionCache(state);
  }

  function cacheSet(key, value) {
    return staticLibrary.cacheSet(state, key, value, { limits });
  }

  function staticLibraryProvider() {
    return staticLibrary.staticLibraryProvider({ state, providerId: STATIC_PROVIDER_ID });
  }

  function findHass() {
    return haRuntime.findHass({ windowRef, documentRef });
  }

  function runtimeData() {
    return haRuntime.runtimeData({
      state,
      limits,
      windowRef,
      findHass,
      now,
    });
  }

  function runtimeRowsForKind(kind) {
    return haRuntime.runtimeRowsForKind(kind, {
      runtimeData,
      normalizeItem,
      providerId: HA_VALUE_PROVIDER_ID,
      limits,
    });
  }

  function haRuntimeValueProvider() {
    return haRuntime.haRuntimeValueProvider({
      runtimeData,
      normalizeItem,
      providerId: HA_VALUE_PROVIDER_ID,
      limits,
    });
  }

  function lovelaceContextProviderDeps() {
    return {
      getDoc: options.getDoc,
      getPos: options.getPos,
      normalizeItem,
      providerId: LOVELACE_CONTEXT_PROVIDER_ID,
      yamlBranchState: options.yamlBranchState,
    };
  }

  function contextRow(id, type, label, insert, aliases = [], meta = {}) {
    return lovelace.contextRow(id, type, label, insert, aliases, meta, lovelaceContextProviderDeps());
  }

  function rowSet(rows) {
    return lovelace.rowSet(rows, lovelaceContextProviderDeps());
  }

  function yamlPathText(ctx) {
    return lovelace.yamlPathText(ctx);
  }

  function recentYamlText(ctx) {
    return lovelace.recentYamlText(ctx, lovelaceContextProviderDeps());
  }

  function looksLikeButtonCardContext(ctx) {
    return lovelace.looksLikeButtonCardContext(ctx, lovelaceContextProviderDeps());
  }

  function lovelaceContextRows(ctx) {
    return lovelace.lovelaceContextRows(ctx, lovelaceContextProviderDeps());
  }

  function lovelaceContextProvider() {
    return lovelace.lovelaceContextProvider(lovelaceContextProviderDeps());
  }

  function snippetRow(id, label, insert, aliases = [], meta = {}) {
    return legacySnippetRow(id, label, insert, aliases, meta, {
      normalizeItem,
      providerId: SNIPPET_PROVIDER_ID,
    });
  }

  function snippetRowsForContext(ctx) {
    if (isScalarConfigContext(ctx)) return [];
    return snippets.snippetRowsForContext(ctx);
  }

  function snippetProvider() {
    return snippets.snippetProvider();
  }

  function documentWordProvider() {
    return documentWords.documentWordProvider();
  }

  async function loadLibrary() {
    return staticLibrary.loadLibrary({ state, buildIndex });
  }

  function buildIndex() {
    return staticLibrary.buildIndex({
      state,
      limits,
      registerProvider,
      staticLibraryProvider,
      snippetProvider,
      lovelaceContextProvider,
      haRuntimeValueProvider,
      documentWordProvider,
      ensureProviderSettings,
      logIndexed,
    });
  }

  function providerDiagnosticId(provider) {
    return registry.providerDiagnosticId(provider);
  }

  function providerTimeoutBudgetMs(provider) {
    return registry.providerTimeoutBudgetMs(provider, runtimeProviderRegistryLimits());
  }

  function validateProviderRow(row, provider, index) {
    return registry.validateProviderRow(row, provider, index);
  }

  function validateProviderRows(provider, rows, stats) {
    return registry.validateProviderRows(provider, rows, stats, {
      limits: runtimeProviderRegistryLimits(),
      recordRuntimeError,
      recordRuntimeErrorOnce,
    });
  }

  return {
    PROVIDER_SETTINGS_META,
    cacheSet,
    clearCompletionCache,
    contextRow,
    ensureProviderSettings,
    findHass,
    haRuntimeValueProvider,
    isAutomationScriptContext: isAutomationScriptContext,
    isDashboardActionContext: isDashboardActionContext,
    isScalarConfigContext: isScalarConfigContext,
    isScalarValueKind: isScalarValueKind,
    loadLibrary,
    looksLikeButtonCardContext,
    lovelaceContextProvider,
    lovelaceContextRows,
    normalizeItem,
    providerCandidates,
    providerCandidatesLegacy,
    providerDiagnosticId,
    providerEnabled,
    providerTimeoutBudgetMs,
    recentYamlText,
    registerProvider,
    rowSet,
    runtimeData,
    runtimeProviderRegistryDeps,
    runtimeProviderRegistryLimits,
    runtimeRowsForKind,
    sanitizeLibraryRow,
    snippetProvider,
    snippetRow,
    snippetRowsForContext,
    staticLibraryProvider,
    validateProviderRow,
    validateProviderRows,
    yamlBlockValueKeyKind: yamlBlockValueKeyKind,
    yamlFocusKind: yamlFocusKind,
    yamlPathHas: yamlPathHas,
    yamlPathIncludes: yamlPathIncludes,
    yamlPathParts: yamlPathParts,
    yamlPathText,
    yamlScalarValueKind: yamlScalarValueKind,
    yamlValueKind: yamlValueKind,
    documentWordProvider,
    buildIndex,
  };
}
