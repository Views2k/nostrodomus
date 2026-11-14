import { syntaxHue } from '../core/format.js';
import { readRuntimeCoordinatorSnapshot } from '../core/runtimeCoordinator.js';
import { companionLayerStatus } from '../companion/coordinatorRuntime.js';
import { codeboxReadableStyleTokens, codeboxStyleSignature, codeboxStyleTokensFromSettings } from '../ui/codeboxStyle.js';
import { evaluatePerformanceBudgets } from '../diagnostics/performanceMetrics.js';
import * as codeMirrorBridge from '../editor/codeMirrorBridge.js';
import {
  ensureCompletionOverlay,
  closeCompletionPopup,
  completionPopupIsOpen,
  placeCompletionPopupAtCursor,
  removeCompletionOverlay,
} from '../completion/popupRuntime.js';
import {
  appendSettingsChildren,
  createSettingsElement,
  settingsTitle,
} from '../ui/settingsPanel.js';
import {
  effectiveStyleSettings,
  resolveSyntaxTintSettings,
  STYLE_SYNTAX_PRESETS,
  stylePresetValue,
  syntaxColorWithOpacity,
  syntaxThemeOptions,
  syntaxThemePalette,
} from '../ui/settingsStyle.js';

/** @param {Record<string, any>} [deps] */
export function createMainLegacySettingsAdapters({
  defaultSettings,
  getState,
  settingsRuntime,
} = {}) {
  const defaultStyle = defaultSettings?.style || {};
  return {
    cloneDefaultSettings() {
      return settingsRuntime.cloneDefaultSettings();
    },
    deepMerge(base, patch) {
      return settingsRuntime.deepMerge(base, patch);
    },
    effectiveStyleSettings() {
      return effectiveStyleSettings(defaultStyle, getState()?.settings?.style);
    },
    stylePresetValue(map, key, fallback) {
      return stylePresetValue(map, key, fallback);
    },
    syntaxHue(hue) {
      return syntaxHue(hue);
    },
    syntaxThemeOptions() {
      return syntaxThemeOptions();
    },
    syntaxThemePalette(theme, saturationMultiplier = 1) {
      return syntaxThemePalette(theme, saturationMultiplier);
    },
    resolveSyntaxTintSettings(settings) {
      return resolveSyntaxTintSettings(settings, defaultStyle);
    },
    syntaxColorWithOpacity(color, opacity = 1) {
      return syntaxColorWithOpacity(color, opacity);
    },
    // The codebox tokens, adjusted so the code stays readable on a light Home Assistant theme and
    // with a dark-text syntax preset. The theme brightness is measured by the codebox style runtime
    // when it applies the style to an editor (state.codeboxThemeIsLight).
    codeboxStyleTokensFromSettings(settings) {
      const tokens = codeboxStyleTokensFromSettings(settings, { defaultStyle });
      const presetKey = settings?.syntaxTintPreset || defaultStyle.syntaxTintPreset || "vscodeDarkPlus";
      const preset = STYLE_SYNTAX_PRESETS[presetKey] || STYLE_SYNTAX_PRESETS.vscodeDarkPlus;
      return codeboxReadableStyleTokens(settings, tokens, {
        themeIsLight: getState()?.codeboxThemeIsLight === true,
        // The same rule syntaxThemePalette uses to paint a preset's tokens darker instead of lighter.
        textIsDark: (preset.lightness ?? 64) < 50,
        textColor: preset.fg,
      });
    },
    codeboxStyleLivePreviewSignatureForDiagnostics(settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax) {
      return codeboxStyleSignature({ settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax });
    },
  };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacyDiagnosticsAdapters({
  W,
  performanceTelemetrySnapshot,
} = {}) {
  return {
    runtimeCoordinatorReadout() {
      try { return readRuntimeCoordinatorSnapshot(W); } catch { return { available: false }; }
    },
    companionLayerReadout() {
      // Diagnostics companion-layer row: internal | external | dormant(forced).
      try { return companionLayerStatus({ globalRef: W }); } catch { return "internal"; }
    },
    incrementMapCounter(map, key) {
      if (!map || !key) return;
      const normalized = String(key || "unknown").slice(0, 80);
      map[normalized] = (map[normalized] || 0) + 1;
    },
    evaluatePerformanceBudgets(snapshot = performanceTelemetrySnapshot()) {
      return evaluatePerformanceBudgets(snapshot);
    },
  };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacyProviderAdapters({
  getProviderRuntime,
  recordRuntimeErrorOnce,
} = {}) {
  return {
    providerCandidates(ctx) {
      const providerRuntime = getProviderRuntime?.();
      try {
        return providerRuntime.providerCandidates(ctx);
      } catch (err) {
        recordRuntimeErrorOnce("provider-registry:runtime-module", err, { phase: "providerCandidates" });
        return providerRuntime.providerCandidatesLegacy(ctx);
      }
    },
  };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacyCompletionPopupAdapters({
  state,
  documentRef,
  windowRef,
  overlayRoot,
  getPos,
  getEditorDispatchRuntime,
  clearPreservedScrollRestoreTimers,
  recordRuntimeErrorOnce,
} = {}) {
  function removeOverlay() {
    return removeCompletionOverlay(state, { clearPreservedScrollRestoreTimers });
  }

  function ensureOverlay() {
    return ensureCompletionOverlay(state, {
      documentRef,
      overlayRoot,
      removeOverlay,
    });
  }

  function isOpen() {
    return completionPopupIsOpen(state);
  }

  function close() {
    return closeCompletionPopup(state);
  }

  function placeAtCursor() {
    return placeCompletionPopupAtCursor(state, {
      ensureOverlay,
      getPos,
      windowRef,
    });
  }

  function getDocLength(view = state.view) {
    try {
      return getEditorDispatchRuntime?.()?.getDocLength(view) ?? codeMirrorBridge.getDocLength(view);
    } catch (err) {
      recordRuntimeErrorOnce("editor:get-doc-length", err, { phase: "getDocLength" });
      return 0;
    }
  }

  return { removeOverlay, ensureOverlay, isOpen, close, placeAtCursor, getDocLength };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacySettingsElementAdapters({ documentRef } = {}) {
  return {
    createSettingsElement(tag, options = {}, children = []) {
      return createSettingsElement(tag, options, children, documentRef);
    },
    appendChildren(parent, children) {
      return appendSettingsChildren(parent, children, documentRef);
    },
    settingsTitle(text) {
      return settingsTitle(text, documentRef);
    },
  };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacyRuntimeErrorAdapters({
  getRuntimeErrorRuntime,
  debugLoggingEnabled,
} = {}) {
  return {
    clearRuntimeErrors() {
      const readout = getRuntimeErrorRuntime?.()?.clearRuntimeErrors?.() || { count: 0, errors: [] };
      return { ...readout, debugEnabled: debugLoggingEnabled?.() };
    },
  };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacySettingsPersistenceAdapters({
  getSettingsRuntime,
  setLoadedSettingsStorageKey,
} = {}) {
  function syncLoadedStorageKey(runtime) {
    setLoadedSettingsStorageKey?.(runtime?.loadedSettingsKey?.() || '');
  }

  return {
    loadSettings() {
      const runtime = getSettingsRuntime?.();
      const settings = runtime.loadSettings();
      syncLoadedStorageKey(runtime);
      return settings;
    },
    resetSettings() {
      const runtime = getSettingsRuntime?.();
      const settings = runtime.resetSettings();
      syncLoadedStorageKey(runtime);
      return settings;
    },
  };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacyCompanionAdapters({ getCompanionReadyRuntime } = {}) {
  return {
    notifyEditorReadyFromCompanion(detail = {}) {
      return getCompanionReadyRuntime?.()?.notifyEditorReadyFromCompanion?.(detail) || false;
    },
  };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacySyntaxPresetAdapters({
  getSyntaxRuntime,
  installCodeMirrorSourceClassSyntax,
} = {}) {
  return {
    applyTextColorPreset(editor, settings) {
      const source = installCodeMirrorSourceClassSyntax?.(editor, settings, 'apply-text-color-preset');
      if (source?.installed) return source;
      return getSyntaxRuntime?.()?.applyDarkPlusSyntaxColoring?.(editor, settings);
    },
  };
}

/** @param {Record<string, any>} [deps] */
export function createMainLegacyDiagnosticsSchedulerAdapters({
  getState,
  getSyntaxRuntime,
  getDiagnosticsRuntime,
} = {}) {
  return {
    scheduleDiagnosticsRefresh(reason = 'diagnostics-refresh') {
      const cleanReason = String(reason || 'diagnostics-refresh');
      const state = getState?.();
      const syntaxRuntime = getSyntaxRuntime?.();
      if (state?.typingSessionActive && cleanReason.startsWith('editor-dispatch')) {
        syntaxRuntime?.noteTypingSessionSuppressed?.('diagnostics-refresh', cleanReason);
        return false;
      }
      return getDiagnosticsRuntime?.()?.scheduleDiagnosticsRefresh?.(reason) || false;
    },
  };
}

