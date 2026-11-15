// The settings panel: saving and closing, and the modules under src/ui/settings/ put together.
// The panel shell uses most of the injected context, so it gets all of it; each module lists the
// dependencies it reads at the top of its factory.

import { SETTINGS_SCHEMA_VERSION } from '../core/settingsStorageKeys.js';
import { createSettingsGeometry } from './settings/settingsGeometry.js';
import { createSettingsControls } from './settings/settingsControls.js';
import { createSettingsStylesheet } from './settings/settingsStylesheet.js';
import { createSettingsSections } from './settings/settingsSections.js';
import { createSettingsPanelShell } from './settings/settingsPanelShell.js';

const SETTINGS_SAVE_FAILED_TEXT = "Settings could not be saved in this browser (storage is full or blocked). Changes apply until the page is reloaded.";

export function createSettingsPanelRuntime(ctx = {}) {
  const {
    window = globalThis.window,
    document = globalThis.document,
    settingsStorage = globalThis?.["local" + "Storage"],
    DEFAULT_SETTINGS,
    SETTINGS_WRITE_KEY,
    STYLE_SYNTAX_PRESETS,
    clampNumber,
    clearCompletionCache,
    clearSettingsFeedbackTimers,
    clearSettingsInteractionRestoreTimers,
    hueLabel,
    percentLabel,
    pruneStyleRootObservers,
    recordPerformanceEvent,
    recordRuntimeErrorOnce,
    state,
    stopContextInspectorHeartbeat,
    syntaxThemeOptions,
    syntaxThemePalette,
  } = ctx;

  function currentStoredSchemaVersion() {
    // The schemaVersion already in storage, or 0 when there is none or it cannot be read. A
    // payload written by a newer build has a higher one, which loadSettings keeps; a save that
    // wrote ours instead would tag newer settings as ours, and the newer build would migrate them
    // a second time after the next upgrade.
    try {
      const raw = settingsStorage?.getItem?.(SETTINGS_WRITE_KEY);
      if (!raw) return 0;
      const v = Number(JSON.parse(raw)?.schemaVersion);
      return Number.isFinite(v) ? v : 0;
    } catch { return 0; }
  }

  // The header line of the open panel says when the browser refused the last save, which would
  // otherwise look applied and be gone after a reload. The line's normal text is kept in its data
  // attribute and comes back when a save succeeds.
  function updateSettingsSaveStatus() {
    const line = state.settingsPanel?.querySelector?.("[data-settings-save-status]");
    if (!line) return;
    const failed = !!state.settingsSaveStats?.lastWriteError;
    const text = failed ? SETTINGS_SAVE_FAILED_TEXT : (line.dataset?.settingsSaveStatus || "");
    if (line.textContent !== text) line.textContent = text;
    try { line.style.opacity = failed ? "1" : ".64"; } catch { /* detached node */ }
  }

  function saveSettings(reason = "settings-save") {
    // The stored payload carries a schemaVersion, so a later build can migrate it
    // (settingsRuntime.migrateSettings); state.settings itself never has one. The higher of ours
    // and the stored one is written.
    const stampVersion = Math.max(SETTINGS_SCHEMA_VERSION, currentStoredSchemaVersion());
    const serialized = JSON.stringify({ ...state.settings, schemaVersion: stampVersion });
    const stats = state.settingsSaveStats || (state.settingsSaveStats = { writes: 0, skippedUnchanged: 0, lastWriteAt: 0, lastSkipAt: 0, lastReason: "", lastSerializedLength: 0 });
    stats.lastReason = String(reason || "settings-save");
    stats.lastSerializedLength = serialized.length;

    if (state.settingsLastSerialized === serialized) {
      stats.skippedUnchanged = (stats.skippedUnchanged || 0) + 1;
      stats.lastSkipAt = Date.now();
      recordPerformanceEvent("settings-save-skipped-unchanged", 0, stats.lastReason);
      return false;
    }

    // A full or blocked store (private mode) does not throw out of a settings change: the error
    // is recorded once and shown in the panel header, and settingsLastSerialized stays as it was,
    // so the next save tries again.
    try {
      settingsStorage.setItem(SETTINGS_WRITE_KEY, serialized);
    } catch (err) {
      recordRuntimeErrorOnce("settings:save-write", err, { phase: "saveSettings", reason: stats.lastReason });
      stats.lastReason = `${stats.lastReason}-write-failed`;
      stats.lastWriteError = String(err?.message || err || "write failed").slice(0, 64);
      updateSettingsSaveStatus();
      return false;
    }
    if (stats.lastWriteError) {
      stats.lastWriteError = "";
      updateSettingsSaveStatus();
    }
    state.settingsLastSerialized = serialized;
    stats.writes = (stats.writes || 0) + 1;
    stats.lastWriteAt = Date.now();
    recordPerformanceEvent("settings-save-write", 0, stats.lastReason);
    clearCompletionCache();
    return true;
  }

  function closeSettings(resetPosition = false) {
    stopContextInspectorHeartbeat("settings-close");
    if (state.diagnosticsRefreshRaf) {
      try { cancelAnimationFrame(state.diagnosticsRefreshRaf); } catch (err) { recordRuntimeErrorOnce("settings:diagnostics-raf-cancel", err, { phase: "closeSettings" }); }
      state.diagnosticsRefreshRaf = 0;
    }
    try { state.diagnosticsPendingReasons?.clear?.(); } catch (err) { recordRuntimeErrorOnce("settings:diagnostics-pending-clear", err, { phase: "closeSettings" }); }
    clearSettingsFeedbackTimers("settings-close");
    clearSettingsInteractionRestoreTimers("settings-close");
    try {
      if (state.settingsPanel?.matches?.(":popover-open") && typeof state.settingsPanel.hidePopover === "function") {
        state.settingsPanel.hidePopover();
      }
    } catch (err) {
      recordRuntimeErrorOnce("settings:popover-hide", err, { phase: "closeSettings" });
    }
    const hadPanel = !!state.settingsPanel;
    state.settingsPanel?.remove?.();
    state.settingsPanel = null;
    // Telemetry is recorded while the Diagnostics or Context tab is shown; this call lets the
    // recorder see that the panel is gone now, instead of at the next unrelated event.
    if (hadPanel) recordPerformanceEvent("settings-panel-close", 0, resetPosition ? "reset-position" : "close");
    try { state.settingsPortalHost?.remove?.(); } catch (err) { recordRuntimeErrorOnce("settings:portal-host-remove", err, { phase: "closeSettings" }); }
    state.settingsPortalHost = null;
    pruneStyleRootObservers("settings-close");

    // Focus goes back to where it was when the panel opened (the gear button or the editor), so
    // keyboard and screen reader users are not left at the document root. Skipped when that
    // element is gone.
    const returnFocus = state.settingsReturnFocus;
    state.settingsReturnFocus = null;
    try {
      if (returnFocus && typeof returnFocus.focus === "function" && returnFocus.isConnected !== false) {
        returnFocus.focus({ preventScroll: true });
      }
    } catch (err) { recordRuntimeErrorOnce("settings:focus-restore", err, { phase: "closeSettings" }); }

    if (resetPosition) {
      state.settings.settingsPos = null;
      saveSettings("settings-position-reset");
    }
  }

  function languageLabel(lang) {
    return ctx.languageLabel(lang);
  }

  const geometry = createSettingsGeometry({
    window,
    state,
    clampSettingsPosition: ctx.clampSettingsPosition,
    clampSettingsSize: ctx.clampSettingsSize,
    saveSettings,
  });

  const controls = createSettingsControls({
    document,
    state,
    DEFAULT_SETTINGS,
    STYLE_SYNTAX_PRESETS,
    clampNumber,
    hueLabel,
    percentLabel,
    syntaxThemeOptions,
    syntaxThemePalette,
    createSettingsElement: ctx.createSettingsElement,
    appendSettingsChildren: ctx.appendSettingsChildren,
    glowSizeLabel: ctx.glowSizeLabel,
    settingsTitle: ctx.settingsTitle,
  });

  const stylesheet = createSettingsStylesheet({ createSettingsElement: controls.createSettingsElement });

  const sections = createSettingsSections({
    createSettingsElement: controls.createSettingsElement,
    settingsCard: controls.settingsCard,
    recordRuntimeErrorOnce,
  });

  const shell = createSettingsPanelShell({
    ...ctx,
    ...geometry,
    ...controls,
    ...sections,
    ...stylesheet,
    saveSettings,
    closeSettings,
    languageLabel,
    updateSettingsSaveStatus,
  });

  return {
    ...geometry,
    ...controls,
    makeSettingsStyle: stylesheet.makeSettingsStyle,
    sectionPanel: sections.sectionPanel,
    helpCard: sections.helpCard,
    openSettings: shell.openSettings,
    saveSettings,
    closeSettings,
    languageLabel,
  };
}
